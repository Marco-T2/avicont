import { Inject, Injectable } from '@nestjs/common';
import type {
  EstadoMovimientoBancario,
  MatchConciliacion,
  Moneda,
  MovimientoBancario,
} from '@prisma/client';

import {
  LineasCuentaReaderPort,
  LINEAS_CUENTA_READER_PORT,
} from '@/comprobantes/ports/lineas-cuenta-reader.port';
import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';

import type { MovimientoConciliacionView, VinculoView } from './conciliacion.service';
import {
  ListadoMovimientosRangoInvalidoError,
  MovimientoBancarioNoEncontradoError,
  MovimientoYaConciliadoError,
} from './domain/conciliacion-errors';
import { normalizarDescripcion } from './domain/normalizar-descripcion';
import type { MotivoVinculoRoto } from './domain/verificar-anclas';
import { verificarAnclas } from './domain/verificar-anclas';
import { aLineaContableActual, aSnapshot, claveAncla } from './mapeo-linea-contable';
import { MatchConciliacionService } from './match-conciliacion.service';
import {
  CuentaBancariaRepositoryPort,
  CUENTA_BANCARIA_REPOSITORY_PORT,
} from './ports/cuenta-bancaria.repository.port';
import {
  MatchConciliacionRepositoryPort,
  MATCH_CONCILIACION_REPOSITORY_PORT,
} from './ports/match-conciliacion.repository.port';
import type {
  FiltrosListadoMovimientos,
  SaldoVigenteRow,
  TotalMonedaRow,
} from './ports/movimiento-bancario.repository.port';
import {
  MovimientoBancarioRepositoryPort,
  MOVIMIENTO_BANCARIO_REPOSITORY_PORT,
} from './ports/movimiento-bancario.repository.port';

/**
 * Estados que el USUARIO puede fijar a mano (REQ-CB-18). `CONCILIADO` no está:
 * esa transición es exclusiva de `MatchConciliacionService.crearMatch`, que es
 * el único camino que mantiene la invariante
 * `estado === 'CONCILIADO' ⟺ existe MatchConciliacion` (design §2.3).
 */
export type EstadoMovimientoManual = 'IGNORADO' | 'PENDIENTE';

// ============================================================
// Vistas del verificador (REQ-VMB) — montos STRING (§4.5)
// ============================================================

export interface ConsultaListadoMovimientos {
  desde: Date;
  hasta: Date;
  page: number;
  limit: number;
  cuentaBancariaId?: string;
  estado?: EstadoMovimientoBancario;
  /** String decimal (§4.5) — se convierte a Decimal en el boundary del port. */
  montoDesde?: string;
  montoHasta?: string;
  /** Texto crudo del usuario — se normaliza acá con `normalizarDescripcion` (D4). */
  glosa?: string;
}

export interface MovimientoVerificadorView extends MovimientoConciliacionView {
  cuentaBancariaId: string;
  ordenFisico: number | null;
}

export interface TotalMonedaView {
  moneda: Moneda;
  totalDebitos: string;
  totalCreditos: string;
  cantidad: number;
}

export interface SaldoCuentaView {
  cuentaBancariaId: string;
  alias: string;
  moneda: Moneda;
  saldo: string | null;
  fechaUltimoMovimiento: string | null;
}

export interface VinculoRotoView {
  movimientoBancarioId: string;
  cuentaBancariaId: string;
  fecha: string;
  monto: string;
  moneda: Moneda;
  descripcion: string;
  motivo: MotivoVinculoRoto;
}

export interface AuditoriaVinculosView {
  aplicada: boolean;
  total: number;
  rotos: VinculoRotoView[];
}

export interface ListadoMovimientosBancarios {
  desde: string;
  hasta: string;
  page: number;
  limit: number;
  total: number;
  movimientos: MovimientoVerificadorView[];
  totales: TotalMonedaView[];
  saldos: SaldoCuentaView[];
  auditoriaVinculos: AuditoriaVinculosView;
}

/** Techo de la franja de rotos (REQ-VMB-07). El `total` sigue siendo el real. */
const CAP_ROTOS = 100;
/** Chunk para `listarPorMovimientos` — ids livianos, techo defensivo. */
const CHUNK_MOVIMIENTOS = 1000;
/** Chunk para `listarPorAnclas` — el OR pega contra `@@unique([comprobanteId, orden])`. */
const CHUNK_ANCLAS = 200;
/** El merge de saldos necesita TODAS las cuentas del tenant (REQ-VMB-08). */
const LIMITE_CUENTAS_SALDOS = 1000;

/**
 * Movimientos bancarios: ignorar/des-ignorar (REQ-CB-18) y el listado
 * cross-cuenta del verificador (REQ-VMB-01..09/11/13). El listado es LECTURA
 * PURA: deriva `estadoEfectivo` por página y NUNCA escribe (design §2.3).
 */
@Injectable()
export class MovimientosBancariosService {
  constructor(
    @Inject(MOVIMIENTO_BANCARIO_REPOSITORY_PORT)
    private readonly movimientos: MovimientoBancarioRepositoryPort,
    private readonly matchService: MatchConciliacionService,
    @Inject(MATCH_CONCILIACION_REPOSITORY_PORT)
    private readonly matches: MatchConciliacionRepositoryPort,
    @Inject(LINEAS_CUENTA_READER_PORT)
    private readonly lineasCuenta: LineasCuentaReaderPort,
    @Inject(CUENTA_BANCARIA_REPOSITORY_PORT)
    private readonly cuentasBancarias: CuentaBancariaRepositoryPort,
  ) {}

  /**
   * Cambia el estado del movimiento a `IGNORADO` (ignorar) o `PENDIENTE`
   * (des-ignorar). NUNCA borra el movimiento, y NUNCA crea ni borra un
   * `MatchConciliacion` (REQ-CB-18).
   *
   * Un movimiento con un match de vínculo SANO no puede cambiar de estado por
   * esta vía: hay que deshacer el match primero (REQ-CB-17), para que nunca
   * quede simultáneamente "conciliado" e "ignorado".
   *
   * Con el vínculo ROTO sí se permite: ese movimiento ya se muestra
   * `PENDIENTE` en el workspace (design §2.3), así que ignorarlo es coherente.
   * El match roto queda intacto a propósito — si más adelante alguien
   * confirma otro match contra esa misma línea, `crearMatch` lo reemplaza
   * (design §2.4), así que no bloquea nada.
   */
  async cambiarEstado(
    tenantId: string,
    id: string,
    estado: EstadoMovimientoManual,
  ): Promise<MovimientoBancario> {
    const movimiento = await this.movimientos.findById(tenantId, id);
    if (movimiento === null) throw new MovimientoBancarioNoEncontradoError(id);

    if (movimiento.estado === estado) return movimiento; // idempotente

    const vinculo = await this.matchService.verificarVinculoDeMovimiento(tenantId, id);
    if (vinculo !== null && vinculo.roto === null) {
      throw new MovimientoYaConciliadoError(id);
    }

    return this.movimientos.actualizarEstado(tenantId, id, estado);
  }

  /**
   * Mayor unificado cross-cuenta (REQ-VMB-01): página + total + totales por
   * moneda + saldos vigentes por cuenta + auditoría de vínculos (solo con
   * filtro `estado`, D5). `estadoEfectivo` se deriva verificando anclas EN
   * MEMORIA, acotado a la página — la columna cacheada nunca es la verdad de
   * display (REQ-VMB-06) y la lectura no escribe nada.
   */
  async listar(
    tenantId: string,
    consulta: ConsultaListadoMovimientos,
  ): Promise<ListadoMovimientosBancarios> {
    const desde = FechaContable.fromDbDate(consulta.desde);
    const hasta = FechaContable.fromDbDate(consulta.hasta);
    if (desde.isAfter(hasta)) {
      throw new ListadoMovimientosRangoInvalidoError(desde.toIso(), hasta.toIso());
    }

    const filtros = this.construirFiltros(consulta);
    const skip = (consulta.page - 1) * consulta.limit;

    const [pagina, total, totalesCrudos, saldosVigentes, cuentas] = await Promise.all([
      this.movimientos.listarCrossCuenta(tenantId, filtros, { skip, take: consulta.limit }),
      this.movimientos.contarCrossCuenta(tenantId, filtros),
      this.movimientos.totalesPorMoneda(tenantId, filtros),
      this.movimientos.saldosVigentes(tenantId, consulta.hasta),
      this.cuentasBancarias.listar(
        tenantId,
        { activa: 'all' },
        { page: 1, limit: LIMITE_CUENTAS_SALDOS },
      ),
    ]);

    const matchesPagina = await this.listarMatchesPorChunks(
      tenantId,
      pagina.map((m) => m.id),
    );
    const verificaciones = await this.verificarMatches(tenantId, matchesPagina);
    const movimientosView = pagina.map((mov) =>
      this.aMovimientoVerificadorView(mov, verificaciones.get(mov.id) ?? null),
    );

    const auditoriaVinculos =
      consulta.estado !== undefined
        ? await this.auditarVinculos(tenantId, filtros)
        : { aplicada: false, total: 0, rotos: [] };

    return {
      desde: desde.toIso(),
      hasta: hasta.toIso(),
      page: consulta.page,
      limit: consulta.limit,
      total,
      movimientos: movimientosView,
      totales: agruparTotalesPorMoneda(totalesCrudos),
      saldos: mergeSaldos(cuentas.items, saldosVigentes),
      auditoriaVinculos,
    };
  }

  private construirFiltros(consulta: ConsultaListadoMovimientos): FiltrosListadoMovimientos {
    return {
      fechaDesde: consulta.desde,
      fechaHasta: consulta.hasta,
      ...(consulta.cuentaBancariaId !== undefined
        ? { cuentaBancariaId: consulta.cuentaBancariaId }
        : {}),
      ...(consulta.estado !== undefined ? { estado: consulta.estado } : {}),
      ...(consulta.montoDesde !== undefined
        ? { montoDesde: Money.of(consulta.montoDesde).toPrismaDecimal() }
        : {}),
      ...(consulta.montoHasta !== undefined
        ? { montoHasta: Money.of(consulta.montoHasta).toPrismaDecimal() }
        : {}),
      ...(consulta.glosa !== undefined
        ? { glosaNormalizada: normalizarDescripcion(consulta.glosa) }
        : {}),
    };
  }

  /**
   * Auditoría de vínculos rotos (REQ-VMB-07): verifica TODOS los movimientos
   * con match del rango — aplicando los demás filtros pero SIN el de estado,
   * porque justamente ese filtro es el que puede esconder un pendiente real.
   * Franja SEPARADA de la paginación: cap `CAP_ROTOS` + total real.
   */
  private async auditarVinculos(
    tenantId: string,
    filtros: FiltrosListadoMovimientos,
  ): Promise<AuditoriaVinculosView> {
    const { estado: _estado, ...sinEstado } = filtros;
    const ids = await this.movimientos.listarIdsConMatch(tenantId, sinEstado);

    const matches = await this.listarMatchesPorChunks(
      tenantId,
      ids.map((i) => i.id),
    );
    const verificaciones = await this.verificarMatches(tenantId, matches);

    const rotos = [...verificaciones.entries()].filter(([, v]) => v.roto !== null);
    const capados = rotos.slice(0, CAP_ROTOS);

    const detalles = await this.movimientos.listarPorIds(
      tenantId,
      capados.map(([movimientoId]) => movimientoId),
    );
    const porId = new Map(detalles.map((m) => [m.id, m]));

    const rotosView = capados.flatMap(([movimientoId, vinculo]): VinculoRotoView[] => {
      const mov = porId.get(movimientoId);
      // Carrera benigna: el movimiento desapareció entre las dos queries.
      if (mov === undefined || vinculo.roto === null) return [];
      return [
        {
          movimientoBancarioId: movimientoId,
          cuentaBancariaId: mov.cuentaBancariaId,
          fecha: FechaContable.fromDbDate(mov.fecha).toIso(),
          monto: Money.of(mov.monto).toBob(),
          moneda: mov.moneda,
          descripcion: mov.descripcion,
          motivo: vinculo.roto,
        },
      ];
    });

    return { aplicada: true, total: rotos.length, rotos: rotosView };
  }

  private async listarMatchesPorChunks(
    tenantId: string,
    movimientoIds: readonly string[],
  ): Promise<MatchConciliacion[]> {
    if (movimientoIds.length === 0) return [];
    const bloques = partirEnBloques(movimientoIds, CHUNK_MOVIMIENTOS);
    const porBloque = await Promise.all(
      bloques.map((bloque) => this.matches.listarPorMovimientos(tenantId, bloque)),
    );
    return porBloque.flat();
  }

  /**
   * Verifica cada match contra su snapshot resolviendo las anclas vía
   * `listarPorAnclas` (misma regla que el workspace — REQ-CB-10). Lectura
   * pura: ningún UPDATE, ni siquiera para "curar" un vínculo roto.
   */
  private async verificarMatches(
    tenantId: string,
    matches: readonly MatchConciliacion[],
  ): Promise<Map<string, VinculoView>> {
    if (matches.length === 0) return new Map();

    const anclas = matches.map((m) => ({ comprobanteId: m.comprobanteId, orden: m.orden }));
    const porBloque = await Promise.all(
      partirEnBloques(anclas, CHUNK_ANCLAS).map((bloque) =>
        this.lineasCuenta.listarPorAnclas(tenantId, bloque),
      ),
    );
    const porAncla = new Map(
      porBloque.flat().map((linea) => [claveAncla(linea.comprobanteId, linea.orden), linea]),
    );

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

  private aMovimientoVerificadorView(
    mov: MovimientoBancario,
    vinculo: VinculoView | null,
  ): MovimientoVerificadorView {
    // Misma regla que el workspace (REQ-VMB-06): un vínculo VÁLIDO manda; roto
    // o sin match ⇒ IGNORADO si la columna lo dice, si no PENDIENTE.
    const estadoEfectivo =
      vinculo !== null && vinculo.roto === null
        ? ('CONCILIADO' as const)
        : mov.estado === 'IGNORADO'
          ? ('IGNORADO' as const)
          : ('PENDIENTE' as const);

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
      cuentaBancariaId: mov.cuentaBancariaId,
      ordenFisico: mov.ordenFisico,
    };
  }
}

function partirEnBloques<T>(items: readonly T[], tamanio: number): T[][] {
  const bloques: T[][] = [];
  for (let i = 0; i < items.length; i += tamanio) {
    bloques.push(items.slice(i, i + tamanio));
  }
  return bloques;
}

/**
 * REQ-VMB-11: una entrada por moneda, débitos y créditos separados. SIN
 * conversión a BOB — mezclar monedas sería inventar un tipo de cambio.
 */
function agruparTotalesPorMoneda(rows: readonly TotalMonedaRow[]): TotalMonedaView[] {
  const porMoneda = new Map<Moneda, { debitos: Money; creditos: Money; cantidad: number }>();
  for (const row of rows) {
    const acumulado = porMoneda.get(row.moneda) ?? {
      debitos: Money.ZERO,
      creditos: Money.ZERO,
      cantidad: 0,
    };
    porMoneda.set(row.moneda, {
      debitos: row.tipo === 'DEBITO' ? acumulado.debitos.plus(row.total) : acumulado.debitos,
      creditos: row.tipo === 'CREDITO' ? acumulado.creditos.plus(row.total) : acumulado.creditos,
      cantidad: acumulado.cantidad + row.cantidad,
    });
  }
  return [...porMoneda.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([moneda, acumulado]) => ({
      moneda,
      totalDebitos: acumulado.debitos.toBob(),
      totalCreditos: acumulado.creditos.toBob(),
      cantidad: acumulado.cantidad,
    }));
}

/**
 * REQ-VMB-08: una entrada por CADA cuenta bancaria del tenant. Cuenta sin
 * movimientos hasta el corte ⇒ null/null — nunca 0 (REQ-VMB-09: no inventar).
 */
function mergeSaldos(
  cuentas: readonly { id: string; alias: string; moneda: Moneda }[],
  saldos: readonly SaldoVigenteRow[],
): SaldoCuentaView[] {
  const porCuenta = new Map(saldos.map((s) => [s.cuentaBancariaId, s]));
  return cuentas.map((cuenta) => {
    const vigente = porCuenta.get(cuenta.id);
    return {
      cuentaBancariaId: cuenta.id,
      alias: cuenta.alias,
      moneda: cuenta.moneda,
      saldo:
        vigente === undefined || vigente.saldo === null ? null : Money.of(vigente.saldo).toBob(),
      fechaUltimoMovimiento:
        vigente === undefined ? null : FechaContable.fromDbDate(vigente.fecha).toIso(),
    };
  });
}
