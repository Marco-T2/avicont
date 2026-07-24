import { Inject, Injectable } from '@nestjs/common';
import type { EstadoComprobante, MatchConciliacion, Prisma } from '@prisma/client';

import {
  LineaCuentaRow,
  LineasCuentaReaderPort,
  LINEAS_CUENTA_READER_PORT,
} from '@/comprobantes/ports/lineas-cuenta-reader.port';
import { PrismaService } from '@/common/prisma.service';

import {
  LineaNoConciliableError,
  LineaYaConciliadaError,
  MatchConciliacionNoEncontradoError,
  MotivoLineaNoConciliable,
  MovimientoBancarioNoEncontradoError,
  MovimientoYaTieneMatchError,
} from './domain/conciliacion-errors';
import { MotivoVinculoRoto, verificarAnclas } from './domain/verificar-anclas';
import { aLineaContableActual, aSnapshot, ladoYMonto } from './mapeo-linea-contable';
import {
  CuentaBancariaRepositoryPort,
  CUENTA_BANCARIA_REPOSITORY_PORT,
} from './ports/cuenta-bancaria.repository.port';
import {
  MatchConciliacionRepositoryPort,
  MATCH_CONCILIACION_REPOSITORY_PORT,
} from './ports/match-conciliacion.repository.port';
import {
  MovimientoBancarioRepositoryPort,
  MOVIMIENTO_BANCARIO_REPOSITORY_PORT,
} from './ports/movimiento-bancario.repository.port';

const ESTADOS_CONCILIABLES: readonly EstadoComprobante[] = ['CONTABILIZADO', 'BLOQUEADO'];

export interface CrearMatchInput {
  movimientoBancarioId: string;
  comprobanteId: string;
  orden: number;
  /** `'ALTA'|'MEDIA'|'BAJA'` si viene de una sugerencia; ausente/`null` si es manual. */
  confianzaSugerida?: string | null;
}

/** Resultado de verificar el vínculo de UN movimiento puntual. */
export interface VinculoDeMovimiento {
  match: MatchConciliacion;
  roto: MotivoVinculoRoto | null;
}

/**
 * Confirmar y deshacer matches de conciliación — REQ-CB-17, **la acción
 * central del producto**. El motor de sugerencias solo ranquea; acá es donde
 * el usuario decide (decisión 2: el sistema NUNCA auto-confirma).
 *
 * A diferencia del workspace (que es lectura pura), este service SÍ escribe:
 * crea/borra `MatchConciliacion` y mantiene la proyección cacheada
 * `MovimientoBancario.estado` (design §2.3). Borrar un match roto para
 * reemplazarlo NO contradice "una lectura nunca escribe" — es una escritura
 * disparada explícitamente por el usuario (design §2.4).
 */
@Injectable()
export class MatchConciliacionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CUENTA_BANCARIA_REPOSITORY_PORT)
    private readonly cuentasBancarias: CuentaBancariaRepositoryPort,
    @Inject(MOVIMIENTO_BANCARIO_REPOSITORY_PORT)
    private readonly movimientos: MovimientoBancarioRepositoryPort,
    @Inject(MATCH_CONCILIACION_REPOSITORY_PORT)
    private readonly matches: MatchConciliacionRepositoryPort,
    @Inject(LINEAS_CUENTA_READER_PORT)
    private readonly lineasCuenta: LineasCuentaReaderPort,
  ) {}

  /**
   * Confirma el par (movimiento bancario ↔ línea contable) creando el
   * `MatchConciliacion` con el snapshot de 5 campos de la línea EN ESE
   * INSTANTE, y dejando `MovimientoBancario.estado = CONCILIADO`.
   *
   * Compuertas, en orden:
   *  1. El movimiento existe y es del tenant (REQ-CB-13) — si no, 404.
   *  2. El movimiento no tiene ya un match (1↔1) — si lo tiene, 409.
   *  3. La línea existe, es de la cuenta del plan vinculada, está
   *     contabilizada y no anulada — si no, 422.
   *  4. Si otro match ya reclama esa línea: vínculo SANO ⇒ 409; vínculo ROTO
   *     ⇒ se reemplaza (design §2.4).
   */
  async crearMatch(
    tenantId: string,
    userId: string,
    input: CrearMatchInput,
  ): Promise<MatchConciliacion> {
    const movimiento = await this.movimientos.findById(tenantId, input.movimientoBancarioId);
    if (movimiento === null) {
      throw new MovimientoBancarioNoEncontradoError(input.movimientoBancarioId);
    }

    const matchDelMovimiento = await this.matches.findByMovimiento(tenantId, movimiento.id);
    if (matchDelMovimiento !== null) {
      throw new MovimientoYaTieneMatchError(movimiento.id);
    }

    const cuentaBancaria = await this.cuentasBancarias.findById(
      tenantId,
      movimiento.cuentaBancariaId,
    );
    if (cuentaBancaria === null) {
      // La FK garantiza que existe; si no aparece es un problema de tenant.
      throw new MovimientoBancarioNoEncontradoError(input.movimientoBancarioId);
    }

    const linea = await this.obtenerLineaConciliable(
      tenantId,
      input.comprobanteId,
      input.orden,
      cuentaBancaria.cuentaId,
    );

    // La línea puede estar reclamada por otro match: sano ⇒ 409, roto ⇒ reemplazo.
    const matchDeLaLinea = await this.matches.findByAncla(
      tenantId,
      input.comprobanteId,
      input.orden,
    );
    if (matchDeLaLinea !== null) {
      const { motivo } = verificarAnclas(aSnapshot(matchDeLaLinea), aLineaContableActual(linea));
      if (motivo === null) {
        throw new LineaYaConciliadaError(input.comprobanteId, input.orden);
      }
    }

    const { tipo, monto } = ladoYMonto(linea);

    return this.prisma.$transaction(async (tx) => {
      if (matchDeLaLinea !== null) {
        // Reemplazo del match roto (design §2.4). Devolver su movimiento a
        // PENDIENTE es obligatorio: sin eso quedaría con `estado=CONCILIADO`
        // y sin match, rompiendo la invariante de §2.3.
        await this.matches.eliminar(tenantId, matchDeLaLinea.id, tx);
        await this.movimientos.actualizarEstado(
          tenantId,
          matchDeLaLinea.movimientoBancarioId,
          'PENDIENTE',
          tx,
        );
      }

      const match = await this.matches.crear(
        tenantId,
        {
          movimientoBancarioId: movimiento.id,
          comprobanteId: input.comprobanteId,
          orden: input.orden,
          snapshotCuentaId: linea.cuentaId,
          snapshotMonto: monto.toPrismaDecimal(),
          snapshotTipo: tipo,
          snapshotMoneda: linea.moneda,
          snapshotFecha: linea.fechaContable,
          confianzaSugerida: input.confianzaSugerida ?? null,
          conciliadoPorUserId: userId,
        },
        tx,
      );

      await this.movimientos.actualizarEstado(tenantId, movimiento.id, 'CONCILIADO', tx);
      return match;
    });
  }

  /**
   * Deshace un match: borra el `MatchConciliacion` y devuelve el movimiento a
   * `PENDIENTE`. NUNCA toca el comprobante ni sus líneas (decisión 3 /
   * REQ-CB-15) — es una operación exclusiva de la tabla de conciliación.
   */
  async borrarMatch(tenantId: string, id: string): Promise<void> {
    const match = await this.matches.findById(tenantId, id);
    if (match === null) throw new MatchConciliacionNoEncontradoError(id);

    await this.prisma.$transaction(async (tx) => {
      await this.matches.eliminar(tenantId, match.id, tx);
      await this.movimientos.actualizarEstado(
        tenantId,
        match.movimientoBancarioId,
        'PENDIENTE',
        tx,
      );
    });
  }

  /**
   * Verifica el vínculo de UN movimiento puntual contra su snapshot.
   * Devuelve `null` si el movimiento no tiene match. Lo consume
   * `MovimientosBancariosService` para REQ-CB-18 (un movimiento con vínculo
   * SANO no puede ignorarse). Es LECTURA pura: no escribe nada.
   */
  async verificarVinculoDeMovimiento(
    tenantId: string,
    movimientoBancarioId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<VinculoDeMovimiento | null> {
    const match = await this.matches.findByMovimiento(tenantId, movimientoBancarioId, tx);
    if (match === null) return null;

    const filas = await this.lineasCuenta.listarPorAnclas(tenantId, [
      { comprobanteId: match.comprobanteId, orden: match.orden },
    ]);
    const fila = filas[0];
    const { motivo } = verificarAnclas(
      aSnapshot(match),
      fila === undefined ? null : aLineaContableActual(fila),
    );
    return { match, roto: motivo };
  }

  // ============================================================
  // Helpers privados
  // ============================================================

  /**
   * Resuelve la línea del ancla y valida que sea conciliable. Usa
   * `listarPorAnclas` (que NO filtra estado/anulado) para poder dar el motivo
   * exacto del rechazo en vez de un genérico "no existe".
   */
  private async obtenerLineaConciliable(
    tenantId: string,
    comprobanteId: string,
    orden: number,
    cuentaEsperadaId: string,
  ): Promise<LineaCuentaRow> {
    const filas = await this.lineasCuenta.listarPorAnclas(tenantId, [{ comprobanteId, orden }]);
    const linea = filas[0];
    if (linea === undefined) {
      throw new LineaNoConciliableError(comprobanteId, orden, 'LINEA_INEXISTENTE');
    }

    const motivo = motivoNoConciliable(linea, cuentaEsperadaId);
    if (motivo !== null) throw new LineaNoConciliableError(comprobanteId, orden, motivo);

    return linea;
  }
}

function motivoNoConciliable(
  linea: LineaCuentaRow,
  cuentaEsperadaId: string,
): MotivoLineaNoConciliable | null {
  if (linea.anulado) return 'COMPROBANTE_ANULADO';
  if (!ESTADOS_CONCILIABLES.includes(linea.estado)) return 'COMPROBANTE_NO_CONTABILIZADO';
  if (linea.cuentaId !== cuentaEsperadaId) return 'CUENTA_DISTINTA';
  return null;
}
