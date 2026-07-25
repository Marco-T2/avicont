import { Inject, Injectable } from '@nestjs/common';
import type { CuentaBancaria, MatchConciliacion, Moneda, MovimientoBancario } from '@prisma/client';

import {
  LineaCuentaRow,
  LineasCuentaReaderPort,
  LINEAS_CUENTA_READER_PORT,
} from '@/comprobantes/ports/lineas-cuenta-reader.port';
import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';

import { CuentasBancariasService } from './cuentas-bancarias.service';
import {
  armarInforme,
  InformeConciliacion,
  LineaParaInforme,
  MovimientoParaInforme,
} from './domain/armar-informe';
import {
  derivarEstadoEfectivoLinea,
  derivarEstadoEfectivoMovimiento,
} from './domain/estado-efectivo';
import { ConciliacionMonedaNoSoportadaError } from './domain/informe-errors';
import { verificarAnclas } from './domain/verificar-anclas';
import { aLineaContableActual, aSnapshot, claveAncla, ladoYMonto } from './mapeo-linea-contable';
import {
  ArranqueConciliadoRepositoryPort,
  ARRANQUE_CONCILIADO_REPOSITORY_PORT,
} from './ports/arranque-conciliado.repository.port';
import {
  MatchConciliacionRepositoryPort,
  MATCH_CONCILIACION_REPOSITORY_PORT,
} from './ports/match-conciliacion.repository.port';
import {
  MovimientoBancarioRepositoryPort,
  MOVIMIENTO_BANCARIO_REPOSITORY_PORT,
} from './ports/movimiento-bancario.repository.port';

// ============================================================
// Consulta y resultado — dominio en Money/FechaContable; el DTO
// de borde (montos STRING §4.5) vive en `dto/` (task 3.7/3.8)
// ============================================================

export interface ConsultaInforme {
  cuentaBancariaId: string;
  /** Fecha de corte, `@db.Date`-like (medianoche UTC, §4.6). */
  corte: Date;
}

export interface CuentaBancariaInformeView {
  id: string;
  alias: string;
  cuentaId: string;
  moneda: Moneda;
  numeroCuenta: string | null;
}

/** La declaración de arranque que APLICA al corte (REQ-ICB-04): acto atribuido. */
export interface ArranqueAplicadoView {
  id: string;
  fecha: FechaContable;
  saldoExtracto: Money;
  saldoLibros: Money;
  /** DECLARADA por el usuario — jamás calculada (ver `ArranqueParaInforme`). */
  diferenciaResidual: Money;
  nota: string | null;
  declaradoPorUserId: string;
  declaradoEl: Date;
}

export interface InformeConciliacionResultado {
  cuentaBancaria: CuentaBancariaInformeView;
  corte: FechaContable;
  /** `null` honesto: ningún movimiento ≤ corte publica saldo (REQ-ICB-03). */
  saldoExtracto: Money | null;
  saldoLibros: Money;
  /** `null` ⇔ sin arranque declarado: el informe se emite ABSTENIDO (REQ-ICB-04). */
  arranque: ArranqueAplicadoView | null;
  /** `null` cuando no hay arranque: sin punto de partida no hay identidad. */
  partidas: InformeConciliacion['partidas'] | null;
  /** `null` sin arranque o sin saldo de extracto: sin dato no hay veredicto. */
  residuo: Money | null;
}

/** Vínculo verificado de un match: la línea ACTUAL resuelta + motivo de rotura. */
interface VinculoVerificado {
  match: MatchConciliacion;
  lineaActual: LineaCuentaRow | null;
  roto: ReturnType<typeof verificarAnclas>['motivo'];
}

/**
 * El informe de conciliación (REQ-ICB-01..08): arma los insumos de
 * `armarInforme` — la identidad vive ENTERA en el dominio puro, acá solo se
 * cargan y clasifican datos.
 *
 * - Lado banco: `saldosVigentes` (REQ-VMB-08/09) filtrado a la cuenta (D2).
 * - Lado libros: `arranque.saldoLibros` + el agregado de la ventana
 *   `arranque.fecha < fechaContable ≤ corte` (D1/D3) — todo lo anterior al
 *   arranque ya está absorbido en el saldo declarado.
 * - Estados: `domain/estado-efectivo.ts`, el MISMO código que el workspace
 *   (D4) — un match roto se interpreta igual en ambas superficies.
 *
 * **Una lectura NUNCA escribe** (REQ-ICB-04): consultar el informe jamás crea,
 * modifica ni infiere un arranque. Sin arranque declarado el informe se emite
 * ABSTENIDO — con los saldos, sin identidad — porque lo que se retiene es la
 * conclusión, nunca el dato (REQ-ICB-05).
 */
@Injectable()
export class InformeConciliacionService {
  constructor(
    private readonly cuentasBancarias: CuentasBancariasService,
    @Inject(ARRANQUE_CONCILIADO_REPOSITORY_PORT)
    private readonly arranques: ArranqueConciliadoRepositoryPort,
    @Inject(MOVIMIENTO_BANCARIO_REPOSITORY_PORT)
    private readonly movimientos: MovimientoBancarioRepositoryPort,
    @Inject(MATCH_CONCILIACION_REPOSITORY_PORT)
    private readonly matches: MatchConciliacionRepositoryPort,
    @Inject(LINEAS_CUENTA_READER_PORT)
    private readonly lineasCuenta: LineasCuentaReaderPort,
  ) {}

  async obtenerInforme(
    tenantId: string,
    consulta: ConsultaInforme,
  ): Promise<InformeConciliacionResultado> {
    // 404 si la cuenta no existe o es de otro tenant (REQ-ICB-09).
    const cuentaBancaria = await this.cuentasBancarias.findById(
      tenantId,
      consulta.cuentaBancariaId,
    );
    this.exigirMonedaSoportada(cuentaBancaria);

    const corte = FechaContable.fromDbDate(consulta.corte);
    const vista = aCuentaView(cuentaBancaria);

    const [arranqueRow, saldos] = await Promise.all([
      this.arranques.vigenteA(tenantId, cuentaBancaria.id, consulta.corte),
      this.movimientos.saldosVigentes(tenantId, consulta.corte),
    ]);
    const filaSaldo = saldos.find((s) => s.cuentaBancariaId === cuentaBancaria.id);
    const saldoExtracto =
      filaSaldo === undefined || filaSaldo.saldo === null ? null : Money.of(filaSaldo.saldo);

    if (arranqueRow === null) {
      // ABSTENIDO (REQ-ICB-04): sin punto de arranque no hay identidad, pero
      // el informe se emite igual con ambos saldos. Sin ventana acotada
      // tampoco se acarrean movimientos ni líneas (D3) — el agregado es una
      // sola fila en Postgres.
      const suma = await this.lineasCuenta.sumarPorCuentaHasta(tenantId, {
        cuentaId: cuentaBancaria.cuentaId,
        hasta: consulta.corte,
      });
      return {
        cuentaBancaria: vista,
        corte,
        saldoExtracto,
        saldoLibros: Money.of(suma.totalDebito).minus(suma.totalCredito),
        arranque: null,
        partidas: null,
        residuo: null,
      };
    }

    const arranqueFecha = FechaContable.fromDbDate(arranqueRow.fecha);
    // Ventana D3: `arranque.fecha < fecha ≤ corte`. Los listados por rango son
    // inclusivos ⇒ arrancan el día SIGUIENTE al arranque.
    const desdeVentana = arranqueFecha.sumarDias(1).toDbDate();

    const [movs, lineas, suma] = await Promise.all([
      this.movimientos.listarPorCuentaBancariaEnRango(tenantId, cuentaBancaria.id, {
        fechaDesde: desdeVentana,
        fechaHasta: consulta.corte,
      }),
      this.lineasCuenta.listarPorCuentaEnRango(tenantId, {
        cuentaId: cuentaBancaria.cuentaId,
        fechaDesde: desdeVentana,
        fechaHasta: consulta.corte,
      }),
      this.lineasCuenta.sumarPorCuentaHasta(tenantId, {
        cuentaId: cuentaBancaria.cuentaId,
        hasta: consulta.corte,
        desde: arranqueRow.fecha,
      }),
    ]);

    const vinculos = await this.verificarVinculos(tenantId, movs, lineas);
    const reclamos = await this.resolverReclamosDeLineas(tenantId, movs, vinculos);

    const informe = armarInforme({
      corte,
      arranque: {
        fecha: arranqueFecha,
        diferenciaResidual: Money.of(arranqueRow.diferenciaResidual),
      },
      saldoExtracto,
      // El saldo declarado es la base; la ventana aporta el delta (D1/D3).
      saldoLibros: Money.of(arranqueRow.saldoLibros)
        .plus(suma.totalDebito)
        .minus(suma.totalCredito),
      movimientos: movs.map((mov) => aMovimientoParaInforme(mov, vinculos.get(mov.id) ?? null)),
      lineas: lineas.map((fila) => aLineaParaInforme(fila, reclamos)),
    });

    return {
      cuentaBancaria: vista,
      corte,
      saldoExtracto: informe.saldoExtracto,
      saldoLibros: informe.saldoLibros,
      arranque: {
        id: arranqueRow.id,
        fecha: arranqueFecha,
        saldoExtracto: Money.of(arranqueRow.saldoExtracto),
        saldoLibros: Money.of(arranqueRow.saldoLibros),
        diferenciaResidual: Money.of(arranqueRow.diferenciaResidual),
        nota: arranqueRow.nota,
        declaradoPorUserId: arranqueRow.declaradoPorUserId,
        declaradoEl: arranqueRow.createdAt,
      },
      partidas: informe.partidas,
      residuo: informe.residuo,
    };
  }

  // ============================================================
  // Verificación de vínculos — el MISMO criterio que el workspace
  // ============================================================

  /**
   * Junta los matches por AMBAS patas — por movimiento (los de la ventana) y
   * por ancla (los que reclaman líneas de la ventana desde un movimiento
   * fuera de ella) — y verifica cada uno contra su snapshot resolviendo la
   * línea ACTUAL: primero en la ventana, y las huérfanas con una consulta
   * batch de diagnóstico (mismo techo que el workspace: 1 query extra).
   */
  private async verificarVinculos(
    tenantId: string,
    movs: readonly MovimientoBancario[],
    lineas: readonly LineaCuentaRow[],
  ): Promise<Map<string, VinculoVerificado>> {
    const [porMovimiento, porAnclaVentana] = await Promise.all([
      this.matches.listarPorMovimientos(
        tenantId,
        movs.map((m) => m.id),
      ),
      this.matches.listarPorAnclas(
        tenantId,
        lineas.map((l) => ({ comprobanteId: l.comprobanteId, orden: l.orden })),
      ),
    ]);
    const matchesUnicos = new Map<string, MatchConciliacion>();
    for (const match of [...porMovimiento, ...porAnclaVentana]) {
      matchesUnicos.set(match.id, match);
    }

    const porAncla = new Map<string, LineaCuentaRow>();
    for (const linea of lineas) {
      porAncla.set(claveAncla(linea.comprobanteId, linea.orden), linea);
    }
    const huerfanas = [...matchesUnicos.values()]
      .filter((m) => !porAncla.has(claveAncla(m.comprobanteId, m.orden)))
      .map((m) => ({ comprobanteId: m.comprobanteId, orden: m.orden }));
    if (huerfanas.length > 0) {
      const diagnostico = await this.lineasCuenta.listarPorAnclas(tenantId, huerfanas);
      for (const linea of diagnostico) {
        porAncla.set(claveAncla(linea.comprobanteId, linea.orden), linea);
      }
    }

    const resultado = new Map<string, VinculoVerificado>();
    for (const match of matchesUnicos.values()) {
      const lineaActual = porAncla.get(claveAncla(match.comprobanteId, match.orden)) ?? null;
      const { motivo } = verificarAnclas(
        aSnapshot(match),
        lineaActual === null ? null : aLineaContableActual(lineaActual),
      );
      resultado.set(match.movimientoBancarioId, { match, lineaActual, roto: motivo });
    }
    return resultado;
  }

  /**
   * Para cada línea de la ventana reclamada por un vínculo VÁLIDO, resuelve la
   * fecha del movimiento bancario que la reclama (`fechaMovimientoVinculado`,
   * REQ-ICB-07 simétrico). Los movimientos fuera de la ventana se hidratan por
   * id — lista ACOTADA a los matches válidos de la ventana.
   */
  private async resolverReclamosDeLineas(
    tenantId: string,
    movs: readonly MovimientoBancario[],
    vinculos: ReadonlyMap<string, VinculoVerificado>,
  ): Promise<Map<string, FechaContable>> {
    const validos = [...vinculos.values()].filter((v) => v.roto === null);

    const fechaPorMovimiento = new Map<string, Date>();
    for (const mov of movs) {
      fechaPorMovimiento.set(mov.id, mov.fecha);
    }
    const faltantes = validos
      .map((v) => v.match.movimientoBancarioId)
      .filter((id) => !fechaPorMovimiento.has(id));
    if (faltantes.length > 0) {
      const hidratados = await this.movimientos.listarPorIds(tenantId, faltantes);
      for (const mov of hidratados) {
        fechaPorMovimiento.set(mov.id, mov.fecha);
      }
    }

    const reclamos = new Map<string, FechaContable>();
    for (const v of validos) {
      const fechaMov = fechaPorMovimiento.get(v.match.movimientoBancarioId);
      // Sin el movimiento (inconsistencia que la FK hace imposible) no se
      // afirma el reclamo: la línea queda EN_TRANSITO, el estado honesto.
      if (fechaMov === undefined) continue;
      reclamos.set(
        claveAncla(v.match.comprobanteId, v.match.orden),
        FechaContable.fromDbDate(fechaMov),
      );
    }
    return reclamos;
  }

  private exigirMonedaSoportada(cuentaBancaria: CuentaBancaria): void {
    if (cuentaBancaria.moneda !== 'BOB') {
      throw new ConciliacionMonedaNoSoportadaError(cuentaBancaria.id, cuentaBancaria.moneda);
    }
  }
}

// ============================================================
// Mapeos de boundary → insumos del dominio
// ============================================================

function aCuentaView(cuentaBancaria: CuentaBancaria): CuentaBancariaInformeView {
  return {
    id: cuentaBancaria.id,
    alias: cuentaBancaria.alias,
    cuentaId: cuentaBancaria.cuentaId,
    moneda: cuentaBancaria.moneda,
    numeroCuenta: cuentaBancaria.numeroCuenta,
  };
}

function aMovimientoParaInforme(
  mov: MovimientoBancario,
  vinculo: VinculoVerificado | null,
): MovimientoParaInforme {
  const estadoEfectivo = derivarEstadoEfectivoMovimiento(
    mov.estado,
    vinculo === null ? null : { roto: vinculo.roto },
  );
  const base = {
    id: mov.id,
    fecha: FechaContable.fromDbDate(mov.fecha),
    monto: Money.of(mov.monto),
    tipo: mov.tipo,
  };
  if (estadoEfectivo === 'CONCILIADO') {
    // CONCILIADO ⇒ vínculo válido ⇒ la línea actual existe y verificó contra
    // el snapshot: su `fechaContable` es la fecha del asiento (REQ-ICB-07).
    if (vinculo === null || vinculo.lineaActual === null) {
      throw new Error(`Informe: movimiento ${mov.id} CONCILIADO sin línea verificada`);
    }
    return {
      ...base,
      estadoEfectivo,
      fechaAsientoVinculado: FechaContable.fromDbDate(vinculo.lineaActual.fechaContable),
    };
  }
  return { ...base, estadoEfectivo };
}

function aLineaParaInforme(
  fila: LineaCuentaRow,
  reclamos: ReadonlyMap<string, FechaContable>,
): LineaParaInforme {
  const { tipo, monto } = ladoYMonto(fila);
  const fechaMovimientoVinculado = reclamos.get(claveAncla(fila.comprobanteId, fila.orden)) ?? null;
  const estadoEfectivo = derivarEstadoEfectivoLinea(fechaMovimientoVinculado !== null);
  const base = {
    comprobanteId: fila.comprobanteId,
    orden: fila.orden,
    fecha: FechaContable.fromDbDate(fila.fechaContable),
    monto,
    tipo,
  };
  return estadoEfectivo === 'CONCILIADO' && fechaMovimientoVinculado !== null
    ? { ...base, estadoEfectivo, fechaMovimientoVinculado }
    : { ...base, estadoEfectivo: 'EN_TRANSITO' };
}
