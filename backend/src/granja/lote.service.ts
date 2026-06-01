import { Inject, Injectable } from '@nestjs/common';

import { CLOCK_PORT, ClockPort } from '@/common/clock/clock.port';
import { FechaContable } from '@/common/domain/fecha-contable';

import { EstadoLote } from './domain/enums';
import { LoteNoEncontradoError } from './domain/granja-errors';
import {
  validarCierreLote,
  validarCreacionLote,
  validarEdicionLote,
} from './domain/lote-validator';
import {
  LOTE_REPOSITORY_PORT,
  LoteCreateData,
  LoteRepositoryPort,
  LoteRow,
  LoteUpdateData,
} from './ports/lote.repository.port';

export interface LoteCreateInput {
  cantidadInicial: number;
  fechaIngreso: Date;
  nombre?: string | null;
  detalle?: string | null;
  galpon?: string | null;
  fechaEstimadaSaca?: Date | null;
}

export interface LoteUpdateInput {
  nombre?: string | null;
  detalle?: string | null;
  fechaIngreso?: Date;
  galpon?: string | null;
  fechaEstimadaSaca?: Date | null;
}

export interface ListarLotesFiltros {
  estado?: EstadoLote;
}

export interface ListarLotesPagination {
  page: number;
  limit: number;
}

/**
 * Service CRUD de Lote. Delega los invariantes de dominio puro al LoteValidator
 * (patrón comprobante-validator). El service orquesta: buscar → validar → persistir.
 *   - cantidadInicial es INMUTABLE post-create → lote-validator.validarEdicionLote
 *   - No editar ni cerrar un lote CERRADO → lote-validator.validarEdicionLote / validarCierreLote
 *   - Cierre usa ClockPort.currentDateLaPaz() — nunca new Date() (CLAUDE.md §4.6)
 *
 * Defense in depth (CLAUDE.md §4.2): pasa organizationId a CADA llamada al repo.
 */
@Injectable()
export class LoteService {
  constructor(
    @Inject(LOTE_REPOSITORY_PORT)
    private readonly repo: LoteRepositoryPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
  ) {}

  async create(organizationId: string, input: LoteCreateInput): Promise<LoteRow> {
    // Invariante: cantidadInicial > 0 y entero (CLAUDE.md §4.1 granja, lote-validator)
    validarCreacionLote({ cantidadInicial: input.cantidadInicial });

    const data: LoteCreateData = {
      cantidadInicial: input.cantidadInicial,
      fechaIngreso: input.fechaIngreso,
      ...(input.nombre !== undefined ? { nombre: input.nombre } : {}),
      ...(input.detalle !== undefined ? { detalle: input.detalle } : {}),
      ...(input.galpon !== undefined ? { galpon: input.galpon } : {}),
      ...(input.fechaEstimadaSaca !== undefined
        ? { fechaEstimadaSaca: input.fechaEstimadaSaca }
        : {}),
    };
    return this.repo.create(organizationId, data);
  }

  async findById(organizationId: string, id: string): Promise<LoteRow> {
    const lote = await this.repo.findById(organizationId, id);
    if (!lote) throw new LoteNoEncontradoError(id);
    return lote;
  }

  async listar(
    organizationId: string,
    filtros: ListarLotesFiltros,
    pagination: ListarLotesPagination,
  ): Promise<{ items: LoteRow[]; total: number }> {
    return this.repo.listar(organizationId, filtros, pagination);
  }

  /**
   * PATCH sobre el lote. Delega validación al LoteValidator:
   *   - cantidadInicial en el input → lanza LoteCantidadInicialInmutableError (400)
   *   - Lote CERRADO → lanza LoteCerradoError (422)
   *
   * Defense in depth: verifica estado después de buscar por (organizationId, id).
   */
  async update(
    organizationId: string,
    id: string,
    input: LoteUpdateInput & Record<string, unknown>,
  ): Promise<LoteRow> {
    const lote = await this.repo.findById(organizationId, id);
    if (!lote) throw new LoteNoEncontradoError(id);

    validarEdicionLote(lote, input);

    const data: LoteUpdateData = {
      ...(input.nombre !== undefined ? { nombre: input.nombre as string | null } : {}),
      ...(input.detalle !== undefined ? { detalle: input.detalle as string | null } : {}),
      ...(input.fechaIngreso !== undefined ? { fechaIngreso: input.fechaIngreso as Date } : {}),
      ...(input.galpon !== undefined ? { galpon: input.galpon as string | null } : {}),
      ...(input.fechaEstimadaSaca !== undefined
        ? { fechaEstimadaSaca: input.fechaEstimadaSaca as Date | null }
        : {}),
    };

    return this.repo.update(organizationId, id, data);
  }

  /**
   * Cierra el lote. Delega validación al LoteValidator:
   *   - Lote CERRADO → lanza LoteYaCerradoError (422)
   *   - No encontrado → lanza LoteNoEncontradoError (404)
   *   - Usa ClockPort.currentDateLaPaz() para la fecha de cierre (§4.6)
   */
  async cerrar(organizationId: string, id: string): Promise<LoteRow> {
    const lote = await this.repo.findById(organizationId, id);
    if (!lote) throw new LoteNoEncontradoError(id);

    validarCierreLote(lote);

    const fechaCierreFc = FechaContable.fromIso(this.clock.currentDateLaPaz());
    const fechaCierre = new Date(fechaCierreFc.toIso());

    return this.repo.cerrar(organizationId, id, fechaCierre);
  }
}
