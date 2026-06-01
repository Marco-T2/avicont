/**
 * Service de Movimientos de Granja.
 *
 * Orquesta: buscar → validar → persistir.
 * - registrarInversion: sin TX (sumar costo no tiene invariante de tope)
 * - registrarCantidad: TX + SELECT FOR UPDATE sobre el lote (invariante avesVivas >= 0)
 *
 * Diseño §7 (design.md): el lock pesimista serializa las TX concurrentes sobre la
 * misma fila `lote`, garantizando que avesVivas nunca queda negativo.
 *
 * Defense in depth (CLAUDE.md §4.2): pasa organizationId a CADA llamada al repo.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { EstadoLote } from './domain/enums';
import {
  LoteCerradoError,
  LoteNoEncontradoError,
  MovimientoCantidadExcedeVivasError,
  MovimientoNoEncontradoError,
  TipoRegistroNoEncontradoError,
} from './domain/granja-errors';
import { validarRegistroCantidad, validarRegistroInversion } from './domain/movimiento-validator';
import { LOTE_REPOSITORY_PORT, LoteRepositoryPort } from './ports/lote.repository.port';
import {
  MOVIMIENTO_REPOSITORY_PORT,
  MovimientoCantidadCreateData,
  MovimientoCantidadRow,
  MovimientoInversionCreateData,
  MovimientoInversionRow,
  MovimientoRepositoryPort,
} from './ports/movimiento.repository.port';
import {
  TIPO_REGISTRO_REPOSITORY_PORT,
  TipoRegistroRepositoryPort,
} from './ports/tipo-registro.repository.port';

export interface RegistrarInversionInput {
  tipoRegistroId: string;
  monto: string;
  fecha: Date;
  detalle: string | null;
}

export interface RegistrarCantidadInput {
  tipoRegistroId: string;
  cantidad: number;
  fecha: Date;
  detalle: string | null;
}

@Injectable()
export class MovimientoService {
  constructor(
    @Inject(LOTE_REPOSITORY_PORT)
    private readonly loteRepo: LoteRepositoryPort,
    @Inject(TIPO_REGISTRO_REPOSITORY_PORT)
    private readonly tipoRepo: TipoRegistroRepositoryPort,
    @Inject(MOVIMIENTO_REPOSITORY_PORT)
    private readonly movimientoRepo: MovimientoRepositoryPort,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Registra un movimiento de inversión (costo) en un lote ACTIVO.
   * Sin TX: sumar costo no tiene invariante de tope (no puede haber "demasiada inversión").
   *
   * Orden de validaciones:
   *   1. Lote existe + ACTIVO
   *   2. TipoRegistro existe + naturaleza INVERSION + activo
   *   3. Monto > 0
   *   4. Detalle ≤ 500 chars
   */
  async registrarInversion(
    organizationId: string,
    loteId: string,
    input: RegistrarInversionInput,
  ): Promise<MovimientoInversionRow> {
    // 1. Verificar lote existe y está ACTIVO
    const lote = await this.loteRepo.findById(organizationId, loteId);
    if (!lote) throw new LoteNoEncontradoError(loteId);
    if (lote.estado === EstadoLote.CERRADO) throw new LoteCerradoError(loteId);

    // 2. Verificar tipo existe
    const tipo = await this.tipoRepo.findById(organizationId, input.tipoRegistroId);
    if (!tipo) throw new TipoRegistroNoEncontradoError(input.tipoRegistroId);

    // 3. Validar naturaleza + activo + monto + detalle (validator puro)
    validarRegistroInversion({ monto: input.monto, detalle: input.detalle }, tipo);

    // 4. Persistir
    const data: MovimientoInversionCreateData = {
      loteId,
      tipoRegistroId: input.tipoRegistroId,
      monto: new Prisma.Decimal(input.monto),
      detalle: input.detalle,
      fecha: input.fecha,
    };

    return this.movimientoRepo.createInversion(organizationId, data);
  }

  /**
   * Registra un movimiento de cantidad (mortalidad) en un lote ACTIVO.
   * CORRE EN TX con SELECT FOR UPDATE sobre el lote para serializar concurrencia
   * y garantizar avesVivas >= 0 (invariante §4 design.md / P6).
   *
   * Flujo dentro de la TX:
   *   1. findByIdForUpdate (bloquea la fila del lote)
   *   2. Verificar ACTIVO
   *   3. Verificar tipo
   *   4. Validar cantidad > 0 + naturaleza CANTIDAD
   *   5. sumCantidadByLote (dentro de la TX, lee muertes ya persistidas)
   *   6. avesVivas = cantidadInicial - muertesActuales; si cantidad > avesVivas → rechaza
   *   7. Crear movimiento dentro de la misma TX
   */
  async registrarCantidad(
    organizationId: string,
    loteId: string,
    input: RegistrarCantidadInput,
  ): Promise<MovimientoCantidadRow> {
    return this.prisma.$transaction(async (tx) => {
      // 1. FOR UPDATE: bloquea la fila del lote (serializa concurrentes)
      const lote = await this.loteRepo.findByIdForUpdate(organizationId, loteId, tx);
      if (!lote) throw new LoteNoEncontradoError(loteId);

      // 2. Verificar ACTIVO
      if (lote.estado === EstadoLote.CERRADO) throw new LoteCerradoError(loteId);

      // 3. Verificar tipo
      const tipo = await this.tipoRepo.findById(organizationId, input.tipoRegistroId, tx);
      if (!tipo) throw new TipoRegistroNoEncontradoError(input.tipoRegistroId);

      // 4. Validar cantidad > 0 + naturaleza CANTIDAD + detalle (validator puro)
      validarRegistroCantidad({ cantidad: input.cantidad, detalle: input.detalle }, tipo);

      // 5. Leer muertes acumuladas DENTRO de la TX (luego del lock)
      const muertesActuales = await this.movimientoRepo.sumCantidadByLote(
        organizationId,
        loteId,
        tx,
      );

      // 6. Invariante: avesVivas >= 0 tras el nuevo movimiento
      const avesVivas = lote.cantidadInicial - muertesActuales;
      if (input.cantidad > avesVivas) {
        throw new MovimientoCantidadExcedeVivasError(loteId);
      }

      // 7. Persistir dentro de la TX
      const data: MovimientoCantidadCreateData = {
        loteId,
        tipoRegistroId: input.tipoRegistroId,
        cantidad: input.cantidad,
        detalle: input.detalle,
        fecha: input.fecha,
      };

      return this.movimientoRepo.createCantidad(organizationId, data, tx);
    });
  }

  /**
   * Elimina un movimiento de inversión.
   * El lote DEBE estar ACTIVO (spec: no borrar movimientos en lote cerrado).
   */
  async eliminarInversion(
    organizationId: string,
    loteId: string,
    movimientoId: string,
  ): Promise<void> {
    const lote = await this.loteRepo.findById(organizationId, loteId);
    if (!lote) throw new LoteNoEncontradoError(loteId);
    if (lote.estado === EstadoLote.CERRADO) throw new LoteCerradoError(loteId);

    const movimiento = await this.movimientoRepo.findInversionById(organizationId, movimientoId);
    if (!movimiento) throw new MovimientoNoEncontradoError(movimientoId);

    await this.movimientoRepo.eliminarInversion(organizationId, movimientoId);
  }

  /**
   * Elimina un movimiento de cantidad.
   * El lote DEBE estar ACTIVO.
   */
  async eliminarCantidad(
    organizationId: string,
    loteId: string,
    movimientoId: string,
  ): Promise<void> {
    const lote = await this.loteRepo.findById(organizationId, loteId);
    if (!lote) throw new LoteNoEncontradoError(loteId);
    if (lote.estado === EstadoLote.CERRADO) throw new LoteCerradoError(loteId);

    const movimiento = await this.movimientoRepo.findCantidadById(organizationId, movimientoId);
    if (!movimiento) throw new MovimientoNoEncontradoError(movimientoId);

    await this.movimientoRepo.eliminarCantidad(organizationId, movimientoId);
  }

  /**
   * Lista los movimientos de inversión de un lote.
   */
  async listarInversiones(
    organizationId: string,
    loteId: string,
  ): Promise<MovimientoInversionRow[]> {
    const lote = await this.loteRepo.findById(organizationId, loteId);
    if (!lote) throw new LoteNoEncontradoError(loteId);
    return this.movimientoRepo.listarInversiones(organizationId, loteId);
  }

  /**
   * Lista los movimientos de cantidad de un lote.
   */
  async listarCantidades(organizationId: string, loteId: string): Promise<MovimientoCantidadRow[]> {
    const lote = await this.loteRepo.findById(organizationId, loteId);
    if (!lote) throw new LoteNoEncontradoError(loteId);
    return this.movimientoRepo.listarCantidades(organizationId, loteId);
  }
}
