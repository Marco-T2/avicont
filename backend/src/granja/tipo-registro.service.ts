import { Inject, Injectable } from '@nestjs/common';

import { NaturalezaRegistro } from './domain/enums';
import {
  TipoRegistroEnUsoError,
  TipoRegistroNoEncontradoError,
  TipoRegistroNombreDuplicadoError,
} from './domain/granja-errors';
import {
  validarEdicionTipoRegistro,
  validarEliminacionTipoRegistro,
} from './domain/tipo-registro-validator';
import {
  TIPO_REGISTRO_REPOSITORY_PORT,
  TipoRegistroCreateData,
  TipoRegistroRepositoryPort,
  TipoRegistroRow,
  TipoRegistroUpdateData,
} from './ports/tipo-registro.repository.port';

export interface CrearTipoRegistroInput {
  nombre: string;
  naturaleza: NaturalezaRegistro;
}

export interface ActualizarTipoRegistroInput {
  nombre?: string;
  activo?: boolean;
}

export interface ListarTipoRegistroFiltros {
  naturaleza?: NaturalezaRegistro;
  activo?: boolean | 'all';
}

/**
 * Service CRUD de TipoRegistro. Delega los invariantes de dominio puro al
 * TipoRegistroValidator (patrón comprobante-validator). El service mantiene
 * las validaciones que requieren el repo:
 *   - Unicidad de nombre por org: pre-check + UNIQUE en BD (cicatriz F-01)
 *   - No eliminar si tiene movimientos (countMovimientos > 0)
 *
 * Defense in depth (CLAUDE.md §4.2): pasa organizationId a CADA llamada al repo.
 */
@Injectable()
export class TipoRegistroService {
  constructor(
    @Inject(TIPO_REGISTRO_REPOSITORY_PORT)
    private readonly repo: TipoRegistroRepositoryPort,
  ) {}

  /**
   * Crea un tipo de registro propio (esSistema=false).
   * Pre-valida unicidad de nombre (cicatriz F-01).
   */
  async create(organizationId: string, input: CrearTipoRegistroInput): Promise<TipoRegistroRow> {
    const existente = await this.repo.findByNombre(organizationId, input.nombre);
    if (existente) {
      throw new TipoRegistroNombreDuplicadoError(input.nombre);
    }

    const data: TipoRegistroCreateData = {
      nombre: input.nombre,
      naturaleza: input.naturaleza,
      esSistema: false,
    };

    return this.repo.create(organizationId, data);
  }

  async findById(organizationId: string, id: string): Promise<TipoRegistroRow> {
    const tipo = await this.repo.findById(organizationId, id);
    if (!tipo) throw new TipoRegistroNoEncontradoError(id);
    return tipo;
  }

  async listar(
    organizationId: string,
    filtros: ListarTipoRegistroFiltros,
  ): Promise<TipoRegistroRow[]> {
    return this.repo.listar(organizationId, filtros);
  }

  /**
   * PATCH sobre el tipo. Delega invariantes al TipoRegistroValidator:
   *   - naturaleza es siempre inmutable → lanza TipoRegistroNaturalezaInmutableError
   *   - tipo sistema: nombre es inmutable → lanza TipoRegistroSistemaNoEditableError
   *   - activo: editable para todos (sistema o propio)
   *
   * Defense in depth: busca primero por (organizationId, id).
   */
  async update(
    organizationId: string,
    id: string,
    input: ActualizarTipoRegistroInput & Record<string, unknown>,
  ): Promise<TipoRegistroRow> {
    const tipo = await this.repo.findById(organizationId, id);
    if (!tipo) throw new TipoRegistroNoEncontradoError(id);

    validarEdicionTipoRegistro(tipo, input);

    const data: TipoRegistroUpdateData = {
      ...(input.nombre !== undefined ? { nombre: input.nombre as string } : {}),
      ...(input.activo !== undefined ? { activo: input.activo as boolean } : {}),
    };

    return this.repo.update(organizationId, id, data);
  }

  /**
   * Elimina físicamente un tipo propio sin movimientos.
   * Delega la regla pura al TipoRegistroValidator:
   *   - esSistema → lanza TipoRegistroSistemaNoEliminableError (409)
   * Mantiene en el service la regla que requiere el repo:
   *   - countMovimientos > 0 → lanza TipoRegistroEnUsoError (409)
   */
  async eliminar(organizationId: string, id: string): Promise<void> {
    const tipo = await this.repo.findById(organizationId, id);
    if (!tipo) throw new TipoRegistroNoEncontradoError(id);

    validarEliminacionTipoRegistro(tipo);

    const count = await this.repo.countMovimientos(organizationId, id);
    if (count > 0) {
      throw new TipoRegistroEnUsoError(id);
    }

    await this.repo.eliminar(organizationId, id);
  }
}
