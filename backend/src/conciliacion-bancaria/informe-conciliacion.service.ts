import { Inject, Injectable } from '@nestjs/common';
import type {
  ArranqueConciliado,
  CuentaBancaria,
  EstadoVerificacionExtracto,
  MatchConciliacion,
  Moneda,
  MovimientoBancario,
} from '@prisma/client';

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
import { detectarHuecos } from './domain/cobertura-extracto';
import { detectarDiscontinuidades } from './domain/continuidad-extractos';
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
  CoberturaImportacionRow,
  ImportacionExtractoRepositoryPort,
  IMPORTACION_EXTRACTO_REPOSITORY_PORT,
} from './ports/importacion-extracto.repository.port';
import {
  MatchConciliacionRepositoryPort,
  MATCH_CONCILIACION_REPOSITORY_PORT,
} from './ports/match-conciliacion.repository.port';
import {
  MovimientoBancarioRepositoryPort,
  MOVIMIENTO_BANCARIO_REPOSITORY_PORT,
  SaldoVigenteRow,
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

/**
 * Motivos por los que el informe NO afirma "conciliado" (REQ-ICB-04/05/06).
 * La confiabilidad CALIFICA el resultado, nunca lo suprime: el informe se
 * emite siempre — lo que se retiene es la conclusión.
 */
export type MotivoNoConciliado =
  | { tipo: 'SIN_ARRANQUE' }
  | { tipo: 'SIN_SALDO_EXTRACTO' }
  /**
   * El `saldoExtracto` DECLARADO en el arranque vigente no coincide con el
   * saldo REAL del extracto a la fecha del arranque (misma tolerancia que la
   * continuidad entre extractos). Puede convivir con residuo 0.00: un residual
   * "correcto" cierra la identidad aunque el saldo declarado sea basura — por
   * eso se contrasta aparte. `diferencia` siempre positiva (|declarado − real|).
   */
  | {
      tipo: 'ARRANQUE_EXTRACTO_NO_COINCIDE';
      fecha: FechaContable;
      declarado: Money;
      real: Money;
      diferencia: Money;
    }
  /**
   * Simétrico del anterior sobre el lado LIBROS: el `saldoLibros` DECLARADO en
   * el arranque no coincide con el agregado real del mayor a esa fecha. El
   * residual que el usuario declaró se apoya en ese saldo — si el saldo es
   * otro, el residual razona sobre una premisa falsa. A diferencia del
   * extracto, el mayor SIEMPRE tiene valor (sin líneas agrega cero), así que
   * `real` nunca es nulo: cuando la organización arranca sin asiento de
   * apertura, este motivo es precisamente el que lo dice.
   */
  | {
      tipo: 'ARRANQUE_LIBROS_NO_COINCIDE';
      fecha: FechaContable;
      declarado: Money;
      real: Money;
      diferencia: Money;
    }
  | { tipo: 'DESCUADRE'; importacionId: string }
  | { tipo: 'HUECO'; desde: FechaContable; hasta: FechaContable }
  | { tipo: 'DISCONTINUIDAD'; anteriorId: string; siguienteId: string; diferencia: Money }
  | { tipo: 'RESIDUO_NO_EXPLICADO'; importe: Money };

export interface ConfiabilidadInforme {
  /** true solo con arranque, saldo publicado, insumos sanos y residuo CERO exacto. */
  conciliado: boolean;
  motivos: MotivoNoConciliado[];
}

/** Trazabilidad de un insumo (REQ-ICB-08): con qué se calculó el informe. */
export interface ImportacionInsumoView {
  id: string;
  fechaDesde: FechaContable;
  fechaHasta: FechaContable;
  estadoVerificacion: EstadoVerificacionExtracto;
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
  confiabilidad: ConfiabilidadInforme;
  /** REQ-ICB-08: importaciones que cubren el rango, con su estado de verificación. */
  insumos: { importaciones: ImportacionInsumoView[] };
}

/** Los CUATRO datos del arranque, DECLARADOS por el usuario (REQ-ICB-04). */
export interface DeclaracionArranque {
  cuentaBancariaId: string;
  /** Corte del arranque — `@db.Date`-like (medianoche UTC, §4.6). */
  fecha: Date;
  saldoExtracto: Money;
  saldoLibros: Money;
  /**
   * DECLARADA, jamás derivada: positiva cuando el extracto queda por encima
   * de los libros (convención fijada en `ArranqueParaInforme`).
   */
  diferenciaResidual: Money;
  nota: string | null;
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
 * - Lado libros: el agregado REAL del mayor acumulado al corte (D1) — nunca
 *   el saldo declarado en el arranque. El declarado se usa SOLO para
 *   contrastarlo contra el mayor a su fecha (`ARRANQUE_LIBROS_NO_COINCIDE`),
 *   simétrico al contraste del lado banco.
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
    @Inject(IMPORTACION_EXTRACTO_REPOSITORY_PORT)
    private readonly importaciones: ImportacionExtractoRepositoryPort,
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

    const [arranqueRow, saldos, cobertura] = await Promise.all([
      this.arranques.vigenteA(tenantId, cuentaBancaria.id, consulta.corte),
      this.movimientos.saldosVigentes(tenantId, consulta.corte),
      this.importaciones.listarCoberturaPorCuentaBancaria(tenantId, cuentaBancaria.id),
    ]);
    const saldoExtracto = saldoDeCuenta(saldos, cuentaBancaria.id);

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
        ...derivarConfiabilidad({
          corte,
          arranqueFecha: null,
          arranqueExtracto: null,
          arranqueLibros: null,
          saldoExtracto,
          residuo: null,
          cobertura,
        }),
      };
    }

    const arranqueFecha = FechaContable.fromDbDate(arranqueRow.fecha);
    // Ventana D3: `arranque.fecha < fecha ≤ corte`. Los listados por rango son
    // inclusivos ⇒ arrancan el día SIGUIENTE al arranque.
    const desdeVentana = arranqueFecha.sumarDias(1).toDbDate();

    const [movs, lineas, sumaAlCorte, sumaAlArranque, saldosAlArranque] = await Promise.all([
      this.movimientos.listarPorCuentaBancariaEnRango(tenantId, cuentaBancaria.id, {
        fechaDesde: desdeVentana,
        fechaHasta: consulta.corte,
      }),
      this.lineasCuenta.listarPorCuentaEnRango(tenantId, {
        cuentaId: cuentaBancaria.cuentaId,
        fechaDesde: desdeVentana,
        fechaHasta: consulta.corte,
      }),
      // El saldo según libros es el del MAYOR, acumulado desde el origen — NO
      // `arranque.saldoLibros + delta`. El informe existe para justificar el
      // saldo de Bancos ante un auditor (proposal §Intent) y un número
      // declarado no respalda un asiento. La cota de rendimiento del arranque
      // (D3) aplica al LISTADO del puente, no a este agregado: es una sola
      // fila de Postgres, la misma consulta que ya usa la rama abstenida.
      this.lineasCuenta.sumarPorCuentaHasta(tenantId, {
        cuentaId: cuentaBancaria.cuentaId,
        hasta: consulta.corte,
      }),
      // Contraste del lado libros: el mayor real A LA FECHA DEL ARRANQUE,
      // contra el `saldoLibros` DECLARADO.
      this.lineasCuenta.sumarPorCuentaHasta(tenantId, {
        cuentaId: cuentaBancaria.cuentaId,
        hasta: arranqueRow.fecha,
      }),
      // Contraste del arranque: el saldo REAL del extracto A LA FECHA DEL
      // ARRANQUE (no al corte) — la misma consulta `saldosVigentes` con otra
      // fecha. Contra él se valida el `saldoExtracto` DECLARADO.
      this.movimientos.saldosVigentes(tenantId, arranqueRow.fecha),
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
      saldoLibros: Money.of(sumaAlCorte.totalDebito).minus(sumaAlCorte.totalCredito),
      movimientos: movs.map((mov) => aMovimientoParaInforme(mov, vinculos.get(mov.id) ?? null)),
      lineas: lineas.map((fila) => aLineaParaInforme(fila, reclamos)),
    });

    return {
      cuentaBancaria: vista,
      corte,
      saldoExtracto: informe.saldoExtracto,
      saldoLibros: informe.saldoLibros,
      arranque: aArranqueAplicadoView(arranqueRow),
      partidas: informe.partidas,
      residuo: informe.residuo,
      ...derivarConfiabilidad({
        corte,
        arranqueFecha,
        arranqueExtracto: {
          declarado: Money.of(arranqueRow.saldoExtracto),
          real: saldoDeCuenta(saldosAlArranque, cuentaBancaria.id),
        },
        arranqueLibros: {
          declarado: Money.of(arranqueRow.saldoLibros),
          real: Money.of(sumaAlArranque.totalDebito).minus(sumaAlArranque.totalCredito),
        },
        saldoExtracto,
        residuo: informe.residuo,
        cobertura,
      }),
    };
  }

  /**
   * Declara un punto de arranque conciliado (REQ-ICB-04): comando EXPLÍCITO,
   * append-only, atribuido. Los CUATRO datos — fecha, ambos saldos y la
   * diferencia residual — vienen DECLARADOS por el usuario: la residual es la
   * parte que asume como inexplicable y JAMÁS se calcula como
   * `saldoExtracto − saldoLibros` (esa resta congelaría las partidas en
   * tránsito abiertas a esa fecha y las cobraría dos veces — ver
   * `ArranqueParaInforme`). Una declaración con fecha anterior a otra
   * existente se ACEPTA (D8): `vigenteA` decide cuál aplica y el historial
   * conserva todas.
   */
  async declararArranque(
    tenantId: string,
    userId: string,
    declaracion: DeclaracionArranque,
  ): Promise<ArranqueAplicadoView> {
    // 404 si la cuenta no existe o es de otro tenant (REQ-ICB-09).
    const cuentaBancaria = await this.cuentasBancarias.findById(
      tenantId,
      declaracion.cuentaBancariaId,
    );
    // Un arranque sobre una cuenta no conciliable fijaría un punto de partida
    // que ningún informe podrá usar (v1 = BOB).
    this.exigirMonedaSoportada(cuentaBancaria);

    const creado = await this.arranques.crear(tenantId, {
      cuentaBancariaId: cuentaBancaria.id,
      fecha: declaracion.fecha,
      saldoExtracto: declaracion.saldoExtracto.toPrismaDecimal(),
      saldoLibros: declaracion.saldoLibros.toPrismaDecimal(),
      diferenciaResidual: declaracion.diferenciaResidual.toPrismaDecimal(),
      nota: declaracion.nota,
      declaradoPorUserId: userId,
    });

    return aArranqueAplicadoView(creado);
  }

  /**
   * Historial COMPLETO de declaraciones de una cuenta bancaria (REQ-ICB-04,
   * D8): la UI muestra todas y señala cuál aplica a un corte — como el orden
   * del repo es `fecha DESC, createdAt DESC` (el MISMO desempate que
   * `vigenteA`), la vigente a un corte es la PRIMERA fila con `fecha <= corte`,
   * sin re-ordenar.
   *
   * Lectura pura: 404 si la cuenta no existe o es de otro tenant (REQ-ICB-09).
   * No exige moneda BOB — listar actos ya declarados no computa la identidad,
   * a diferencia del informe.
   */
  async listarHistorial(
    tenantId: string,
    cuentaBancariaId: string,
  ): Promise<ArranqueAplicadoView[]> {
    const cuentaBancaria = await this.cuentasBancarias.findById(tenantId, cuentaBancariaId);
    const filas = await this.arranques.listarHistorial(tenantId, cuentaBancaria.id);
    return filas.map(aArranqueAplicadoView);
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

/**
 * Saldo publicado para UNA cuenta dentro del resultado de `saldosVigentes`:
 * `null` honesto si la cuenta no tiene fila (sin movimientos ≤ fecha) o si el
 * último movimiento no publica saldo (REQ-VMB-09).
 */
function saldoDeCuenta(saldos: readonly SaldoVigenteRow[], cuentaBancariaId: string): Money | null {
  const fila = saldos.find((s) => s.cuentaBancariaId === cuentaBancariaId);
  return fila === undefined || fila.saldo === null ? null : Money.of(fila.saldo);
}

/** Fila persistida → view de dominio del acto declarado (Money/FechaContable). */
function aArranqueAplicadoView(row: ArranqueConciliado): ArranqueAplicadoView {
  return {
    id: row.id,
    fecha: FechaContable.fromDbDate(row.fecha),
    saldoExtracto: Money.of(row.saldoExtracto),
    saldoLibros: Money.of(row.saldoLibros),
    diferenciaResidual: Money.of(row.diferenciaResidual),
    nota: row.nota,
    declaradoPorUserId: row.declaradoPorUserId,
    declaradoEl: row.createdAt,
  };
}

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

// ============================================================
// Confiabilidad (task 3.7, REQ-ICB-05/06/08, D6)
// ============================================================

interface ParamsConfiabilidad {
  corte: FechaContable;
  /** `null` ⇔ sin arranque declarado. */
  arranqueFecha: FechaContable | null;
  /**
   * Contraste del arranque vigente: el `saldoExtracto` DECLARADO vs el saldo
   * REAL del extracto a la fecha del arranque. `null` sin arranque; `real`
   * `null` cuando no hay saldo publicado a esa fecha — sin dato no hay
   * veredicto (misma regla que `SIN_SALDO_EXTRACTO`).
   */
  arranqueExtracto: { declarado: Money; real: Money | null } | null;
  /**
   * Contraste del lado LIBROS: el `saldoLibros` declarado vs el agregado real
   * del mayor a la fecha del arranque. `null` sin arranque. `real` NUNCA es
   * nulo — el agregado devuelve cero sin líneas, y ese cero es información.
   */
  arranqueLibros: { declarado: Money; real: Money } | null;
  saldoExtracto: Money | null;
  residuo: Money | null;
  cobertura: readonly CoberturaImportacionRow[];
}

/**
 * Deriva la sección `confiabilidad` + la trazabilidad de insumos. La señal es
 * RELATIVA al rango del informe: lo TOTALMENTE anterior al arranque está
 * absorbido en los saldos declarados y no retiene la conclusión — pero un
 * hueco o una discontinuidad que toque la ventana sí, aunque nazca antes.
 * Por eso huecos y discontinuidades se detectan sobre la serie COMPLETA
 * (REQ-CB-09/23: son propiedades del conjunto) y recién después se filtran
 * al rango.
 */
function derivarConfiabilidad(p: ParamsConfiabilidad): {
  confiabilidad: ConfiabilidadInforme;
  insumos: { importaciones: ImportacionInsumoView[] };
} {
  const enRango = (desde: FechaContable, hasta: FechaContable): boolean =>
    !desde.isAfter(p.corte) && (p.arranqueFecha === null || hasta.isAfter(p.arranqueFecha));

  const filas = p.cobertura.map((f) => ({
    id: f.id,
    desde: FechaContable.fromDbDate(f.fechaDesde),
    hasta: FechaContable.fromDbDate(f.fechaHasta),
    saldoInicial: f.saldoInicial === null ? null : Money.of(f.saldoInicial),
    saldoFinal: f.saldoFinal === null ? null : Money.of(f.saldoFinal),
    estadoVerificacion: f.estadoVerificacion,
  }));
  const relevantes = filas.filter((f) => enRango(f.desde, f.hasta));
  const desdePorId = new Map(filas.map((f) => [f.id, f.desde]));

  const motivos: MotivoNoConciliado[] = [];
  if (p.arranqueFecha === null) motivos.push({ tipo: 'SIN_ARRANQUE' });
  if (p.saldoExtracto === null) motivos.push({ tipo: 'SIN_SALDO_EXTRACTO' });

  // El punto de partida DECLARADO debe coincidir con el extracto real a su
  // fecha (misma tolerancia que la continuidad entre extractos). Es un
  // contraste INDEPENDIENTE del residuo: un residual declarado "correcto"
  // puede cerrar la identidad en 0.00 con un saldo declarado basura — este
  // motivo existe precisamente para ese caso. Sin saldo real (`null`) no se
  // emite: un null nunca genera una acusación.
  if (
    p.arranqueFecha !== null &&
    p.arranqueExtracto !== null &&
    p.arranqueExtracto.real !== null &&
    !p.arranqueExtracto.declarado.igualaConTolerancia(p.arranqueExtracto.real)
  ) {
    motivos.push({
      tipo: 'ARRANQUE_EXTRACTO_NO_COINCIDE',
      fecha: p.arranqueFecha,
      declarado: p.arranqueExtracto.declarado,
      real: p.arranqueExtracto.real,
      diferencia: p.arranqueExtracto.declarado.minus(p.arranqueExtracto.real).abs(),
    });
  }

  // Simétrico sobre el lado libros. No hay caso `null`: el mayor siempre
  // agrega — sin líneas da cero, y un cero contra un saldo declarado de
  // Bs 1.000 es exactamente la organización que nunca cargó su asiento de
  // apertura. Nombrarlo vale más que callarlo.
  if (
    p.arranqueFecha !== null &&
    p.arranqueLibros !== null &&
    !p.arranqueLibros.declarado.igualaConTolerancia(p.arranqueLibros.real)
  ) {
    motivos.push({
      tipo: 'ARRANQUE_LIBROS_NO_COINCIDE',
      fecha: p.arranqueFecha,
      declarado: p.arranqueLibros.declarado,
      real: p.arranqueLibros.real,
      diferencia: p.arranqueLibros.declarado.minus(p.arranqueLibros.real).abs(),
    });
  }

  for (const f of relevantes) {
    if (f.estadoVerificacion === 'DESCUADRE') {
      motivos.push({ tipo: 'DESCUADRE', importacionId: f.id });
    }
  }

  for (const hueco of detectarHuecos(filas)) {
    if (enRango(hueco.desde, hueco.hasta)) {
      motivos.push({ tipo: 'HUECO', desde: hueco.desde, hasta: hueco.hasta });
    }
  }

  for (const d of detectarDiscontinuidades(filas)) {
    // El salto vive en la juntura: el día en que arranca la importación
    // siguiente. Relevante si esa juntura cae dentro del rango del informe.
    const juntura = desdePorId.get(d.siguienteId);
    if (juntura !== undefined && enRango(juntura, juntura)) {
      motivos.push({
        tipo: 'DISCONTINUIDAD',
        anteriorId: d.anteriorId,
        siguienteId: d.siguienteId,
        diferencia: d.diferencia,
      });
    }
  }

  // REQ-ICB-06: "conciliado" exige residuo CERO EXACTO — hasta el polvo de
  // Bs 0.01 de un match tolerado se nombra en vez de absorberse.
  if (p.residuo !== null && !p.residuo.isZero()) {
    motivos.push({ tipo: 'RESIDUO_NO_EXPLICADO', importe: p.residuo });
  }

  return {
    confiabilidad: { conciliado: motivos.length === 0, motivos },
    insumos: {
      importaciones: relevantes.map((f) => ({
        id: f.id,
        fechaDesde: f.desde,
        fechaHasta: f.hasta,
        estadoVerificacion: f.estadoVerificacion,
      })),
    },
  };
}
