import { Inject, Injectable } from '@nestjs/common';
import type { MovimientoBancario } from '@prisma/client';

import {
  MovimientoBancarioNoEncontradoError,
  MovimientoYaConciliadoError,
} from './domain/conciliacion-errors';
import { MatchConciliacionService } from './match-conciliacion.service';
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

/**
 * Ignorar y des-ignorar un movimiento bancario — REQ-CB-18. `IGNORADO` es la
 * salida honesta para lo que v1 no puede conciliar 1↔1 (ej. un depósito
 * compuesto registrado en varias líneas) sin forzar un match incorrecto.
 */
@Injectable()
export class MovimientosBancariosService {
  constructor(
    @Inject(MOVIMIENTO_BANCARIO_REPOSITORY_PORT)
    private readonly movimientos: MovimientoBancarioRepositoryPort,
    private readonly matches: MatchConciliacionService,
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

    const vinculo = await this.matches.verificarVinculoDeMovimiento(tenantId, id);
    if (vinculo !== null && vinculo.roto === null) {
      throw new MovimientoYaConciliadoError(id);
    }

    return this.movimientos.actualizarEstado(tenantId, id, estado);
  }
}
