import { Inject, Injectable } from '@nestjs/common';
import type {
  CuentaBancaria,
  EstadoMovimientoBancario,
  LadoBancario,
  LadoContable,
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
import { RangoConciliacionInvalidoError } from './domain/conciliacion-errors';
import {
  derivarEstadoEfectivoLinea,
  derivarEstadoEfectivoMovimiento,
  esVinculoValido,
  EstadoEfectivoLinea,
  EstadoEfectivoMovimiento,
} from './domain/estado-efectivo';
import { sugerir, Sugerencia } from './domain/motor-sugerencias';
import { MotivoVinculoRoto, verificarAnclas } from './domain/verificar-anclas';
import { aLineaContableActual, aSnapshot, claveAncla, ladoYMonto } from './mapeo-linea-contable';
import {
  MatchConciliacionRepositoryPort,
  MATCH_CONCILIACION_REPOSITORY_PORT,
} from './ports/match-conciliacion.repository.port';
import {
  MovimientoBancarioRepositoryPort,
  MOVIMIENTO_BANCARIO_REPOSITORY_PORT,
} from './ports/movimiento-bancario.repository.port';

// ============================================================
// Vistas del workspace — todos los montos como STRING (§4.5 core)
// ============================================================

// La derivación (y sus tipos) vive en el dominio puro — se re-exporta para
// conservar la superficie pública original del service.
export type { EstadoEfectivoLinea, EstadoEfectivoMovimiento } from './domain/estado-efectivo';

export interface VinculoView {
  matchId: string;
  comprobanteId: string;
  orden: number;
  /** `null` ⇒ el vínculo es válido. Cualquier otro valor ⇒ roto, con el motivo. */
  roto: MotivoVinculoRoto | null;
}

export interface MovimientoConciliacionView {
  id: string;
  /** `YYYY-MM-DD` — calendario puro, sin UTC (§4.6). */
  fecha: string;
  hora: string | null;
  monto: string;
  tipo: LadoBancario;
  moneda: Moneda;
  descripcion: string;
  referencia: string | null;
  saldo: string | null;
  /** Columna PERSISTIDA (proyección cacheada). NO es lo que se muestra. */
  estado: EstadoMovimientoBancario;
  /** DERIVADO en cada lectura — esto es lo que se muestra (REQ-CB-10/11). */
  estadoEfectivo: EstadoEfectivoMovimiento;
  vinculo: VinculoView | null;
}

export interface LineaConciliacionView {
  comprobanteId: string;
  orden: number;
  fecha: string;
  numeroComprobante: string | null;
  glosa: string;
  glosaLinea: string | null;
  /** Monto en MONEDA ORIGINAL, siempre positivo. */
  monto: string;
  montoBob: string;
  tipo: LadoContable;
  moneda: Moneda;
  /** `EN_TRANSITO` es DERIVADO — no existe fila persistida con ese estado (REQ-CB-11). */
  estadoEfectivo: EstadoEfectivoLinea;
}

export interface ResumenConciliacion {
  movimientosPendientes: number;
  movimientosConciliados: number;
  movimientosIgnorados: number;
  lineasEnTransito: number;
}

export interface WorkspaceConciliacion {
  cuentaBancaria: {
    id: string;
    alias: string;
    cuentaId: string;
    moneda: Moneda;
    numeroCuenta: string | null;
  };
  desde: string;
  hasta: string;
  movimientos: MovimientoConciliacionView[];
  lineas: LineaConciliacionView[];
  sugerencias: Sugerencia[];
  resumen: ResumenConciliacion;
}

export interface ConsultaWorkspace {
  cuentaBancariaId: string;
  desde: Date;
  hasta: Date;
}

/**
 * Workspace de conciliación (design §10). Orquesta los tres conjuntos —
 * `A` movimientos propios, `B` líneas contables vía `LineasCuentaReaderPort`,
 * `M` matches — verifica cada ancla EN MEMORIA contra su snapshot y devuelve
 * estados DERIVADOS.
 *
 * **Una lectura NUNCA escribe** (design §2.3): ni auto-cura la columna
 * `MovimientoBancario.estado`, ni marca, ni borra matches rotos. Lo único que
 * cambia ante un vínculo roto es el `estadoEfectivo` de la respuesta.
 */
@Injectable()
export class ConciliacionService {
  constructor(
    private readonly cuentasBancarias: CuentasBancariasService,
    @Inject(MOVIMIENTO_BANCARIO_REPOSITORY_PORT)
    private readonly movimientos: MovimientoBancarioRepositoryPort,
    @Inject(MATCH_CONCILIACION_REPOSITORY_PORT)
    private readonly matches: MatchConciliacionRepositoryPort,
    @Inject(LINEAS_CUENTA_READER_PORT)
    private readonly lineasCuenta: LineasCuentaReaderPort,
  ) {}

  async obtenerWorkspace(
    tenantId: string,
    consulta: ConsultaWorkspace,
  ): Promise<WorkspaceConciliacion> {
    const desde = FechaContable.fromDbDate(consulta.desde);
    const hasta = FechaContable.fromDbDate(consulta.hasta);
    if (desde.isAfter(hasta)) {
      throw new RangoConciliacionInvalidoError(desde.toIso(), hasta.toIso());
    }

    // 404 si la cuenta bancaria no existe o es de otro tenant (REQ-CB-13).
    const cuentaBancaria = await this.cuentasBancarias.findById(
      tenantId,
      consulta.cuentaBancariaId,
    );

    // Las 3 queries del design §10, en paralelo.
    const [movimientos, lineas] = await Promise.all([
      this.movimientos.listarPorCuentaBancariaEnRango(tenantId, cuentaBancaria.id, {
        fechaDesde: consulta.desde,
        fechaHasta: consulta.hasta,
      }),
      this.lineasCuenta.listarPorCuentaEnRango(tenantId, {
        cuentaId: cuentaBancaria.cuentaId,
        fechaDesde: consulta.desde,
        fechaHasta: consulta.hasta,
      }),
    ]);
    const matches = await this.matches.listarPorMovimientos(
      tenantId,
      movimientos.map((m) => m.id),
    );

    const verificaciones = await this.verificarVinculos(tenantId, matches, lineas);

    return this.armarRespuesta(cuentaBancaria, desde, hasta, movimientos, lineas, verificaciones);
  }

  // ============================================================
  // Verificación de anclas — REQ-CB-10
  // ============================================================

  /**
   * Verifica cada match contra el snapshot, resolviendo el ancla en el Map de
   * `B`. Para las anclas que NO aparecen en `B` (línea borrada, comprobante
   * anulado, fecha movida fuera del rango, línea reasignada a otra cuenta)
   * hace UNA consulta batch acotada de diagnóstico — solo si hay huérfanas
   * (design §2.2). Techo: 1 query extra por request.
   */
  private async verificarVinculos(
    tenantId: string,
    matches: readonly MatchConciliacion[],
    lineas: readonly LineaCuentaRow[],
  ): Promise<Map<string, VinculoView>> {
    const porAncla = new Map<string, LineaCuentaRow>();
    for (const linea of lineas) {
      porAncla.set(claveAncla(linea.comprobanteId, linea.orden), linea);
    }

    const huerfanas = matches
      .filter((m) => !porAncla.has(claveAncla(m.comprobanteId, m.orden)))
      .map((m) => ({ comprobanteId: m.comprobanteId, orden: m.orden }));

    if (huerfanas.length > 0) {
      const diagnostico = await this.lineasCuenta.listarPorAnclas(tenantId, huerfanas);
      for (const linea of diagnostico) {
        porAncla.set(claveAncla(linea.comprobanteId, linea.orden), linea);
      }
    }

    const porMovimiento = new Map<string, VinculoView>();
    for (const match of matches) {
      const fila = porAncla.get(claveAncla(match.comprobanteId, match.orden)) ?? null;
      const { motivo } = verificarAnclas(
        aSnapshot(match),
        fila === null ? null : aLineaContableActual(fila),
      );
      porMovimiento.set(match.movimientoBancarioId, {
        matchId: match.id,
        comprobanteId: match.comprobanteId,
        orden: match.orden,
        roto: motivo,
      });
    }
    return porMovimiento;
  }

  // ============================================================
  // Armado de la respuesta — estados DERIVADOS
  // ============================================================

  private armarRespuesta(
    cuentaBancaria: CuentaBancaria,
    desde: FechaContable,
    hasta: FechaContable,
    movimientos: readonly MovimientoBancario[],
    lineas: readonly LineaCuentaRow[],
    verificaciones: ReadonlyMap<string, VinculoView>,
  ): WorkspaceConciliacion {
    const movimientosView = movimientos.map((mov) =>
      this.aMovimientoView(mov, verificaciones.get(mov.id) ?? null),
    );

    // Una línea deja de estar EN_TRANSITO solo si un vínculo VÁLIDO la reclama:
    // un match roto devuelve su línea al pool en la misma respuesta (design §2.3).
    const reclamadasPorVinculoValido = new Set(
      [...verificaciones.values()]
        .filter((v) => esVinculoValido(v))
        .map((v) => claveAncla(v.comprobanteId, v.orden)),
    );

    const lineasView = lineas.map((fila) =>
      this.aLineaView(
        fila,
        reclamadasPorVinculoValido.has(claveAncla(fila.comprobanteId, fila.orden)),
      ),
    );

    const pendientes = movimientosView.filter((m) => m.estadoEfectivo === 'PENDIENTE');
    const enTransito = lineasView.filter((l) => l.estadoEfectivo === 'EN_TRANSITO');

    const sugerencias = sugerir(
      pendientes.map((m) => ({
        id: m.id,
        fecha: FechaContable.fromIso(m.fecha),
        monto: Money.of(m.monto),
        tipo: m.tipo,
        moneda: m.moneda,
      })),
      enTransito.map((l) => ({
        comprobanteId: l.comprobanteId,
        orden: l.orden,
        fecha: FechaContable.fromIso(l.fecha),
        monto: Money.of(l.monto),
        tipo: l.tipo,
        moneda: l.moneda,
      })),
    );

    return {
      cuentaBancaria: {
        id: cuentaBancaria.id,
        alias: cuentaBancaria.alias,
        cuentaId: cuentaBancaria.cuentaId,
        moneda: cuentaBancaria.moneda,
        numeroCuenta: cuentaBancaria.numeroCuenta,
      },
      desde: desde.toIso(),
      hasta: hasta.toIso(),
      movimientos: movimientosView,
      lineas: lineasView,
      sugerencias,
      resumen: {
        movimientosPendientes: pendientes.length,
        movimientosConciliados: movimientosView.filter((m) => m.estadoEfectivo === 'CONCILIADO')
          .length,
        movimientosIgnorados: movimientosView.filter((m) => m.estadoEfectivo === 'IGNORADO').length,
        lineasEnTransito: enTransito.length,
      },
    };
  }

  private aMovimientoView(
    mov: MovimientoBancario,
    vinculo: VinculoView | null,
  ): MovimientoConciliacionView {
    // La regla vive en el dominio puro (`domain/estado-efectivo.ts`) para que
    // workspace e informe deriven el estado con el MISMO código (design D4).
    const estadoEfectivo: EstadoEfectivoMovimiento = derivarEstadoEfectivoMovimiento(
      mov.estado,
      vinculo,
    );

    return {
      id: mov.id,
      fecha: FechaContable.fromDbDate(mov.fecha).toIso(),
      hora: mov.hora,
      monto: Money.of(mov.monto).toBob(),
      tipo: mov.tipo,
      moneda: mov.moneda,
      descripcion: mov.descripcion,
      referencia: mov.referencia,
      saldo: mov.saldo === null ? null : Money.of(mov.saldo).toBob(),
      estado: mov.estado,
      estadoEfectivo,
      vinculo,
    };
  }

  private aLineaView(fila: LineaCuentaRow, conVinculoValido: boolean): LineaConciliacionView {
    const { tipo, monto, montoBob } = ladoYMonto(fila);
    return {
      comprobanteId: fila.comprobanteId,
      orden: fila.orden,
      fecha: FechaContable.fromDbDate(fila.fechaContable).toIso(),
      numeroComprobante: fila.numeroComprobante,
      glosa: fila.glosa,
      glosaLinea: fila.glosaLinea,
      monto: monto.toBob(),
      montoBob: montoBob.toBob(),
      tipo,
      moneda: fila.moneda,
      estadoEfectivo: derivarEstadoEfectivoLinea(conVinculoValido),
    };
  }
}
