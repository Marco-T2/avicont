import { Inject, Injectable } from '@nestjs/common';
import type { TipoDocumentoFisico } from '@prisma/client';

import {
  TipoDocumentoFisicoConDocumentosError,
  TipoDocumentoFisicoCodigoDuplicadoError,
  TipoDocumentoFisicoNoEncontradoError,
} from './domain/tipo-documento-fisico-errors';
import { TipoDocumentoFisicoCodigo } from './domain/tipo-documento-fisico-codigo';
import { TipoDocumentoFisicoNombre } from './domain/tipo-documento-fisico-nombre';
import {
  TIPO_DOCUMENTO_FISICO_REPOSITORY_PORT,
  TipoDocumentoFisicoRepositoryPort,
  TipoDocumentoFisicoCreateData,
  TipoDocumentoFisicoUpdateData,
} from './ports/tipo-documento-fisico.repository.port';

// ============================================================
// Inputs del service
// ============================================================

export interface CrearTipoDocumentoFisicoInput {
  nombre: string;
  codigo: string;
  esTributario: boolean;
  tiposComprobanteAplicables: TipoDocumentoFisicoCreateData['tiposComprobanteAplicables'];
  createdByUserId: string | null;
}

export interface ActualizarTipoDocumentoFisicoInput {
  nombre?: string;
  esTributario?: boolean;
  tiposComprobanteAplicables?: TipoDocumentoFisicoUpdateData['tiposComprobanteAplicables'];
}

export interface ListarTiposDocumentoFisicoFiltros {
  activo?: boolean | 'all';
  q?: string;
}

export interface ListarTiposDocumentoFisicoPagination {
  page: number;
  limit: number;
}

export interface ListarTiposDocumentoFisicoResult {
  items: TipoDocumentoFisico[];
  total: number;
}

// ============================================================
// Service
// ============================================================

@Injectable()
export class TiposDocumentoFisicoService {
  constructor(
    @Inject(TIPO_DOCUMENTO_FISICO_REPOSITORY_PORT)
    private readonly repo: TipoDocumentoFisicoRepositoryPort,
  ) {}

  /**
   * Crea un tipo de documento físico validando formato de código y nombre
   * mediante VOs, y verificando unicidad de código antes de persistir
   * (cicatriz F-01, CLAUDE.md §4.8). La unicidad del nombre se delega a la
   * BD vía UNIQUE constraint — el adapter mapea P2002 a DomainError.
   */
  async create(
    tenantId: string,
    input: CrearTipoDocumentoFisicoInput,
  ): Promise<TipoDocumentoFisico> {
    // Los VOs normalizan (trim/lowercase) y lanzan RangeError si el formato
    // es inválido — el caller no necesita pre-validar.
    const codigoVo = TipoDocumentoFisicoCodigo.of(input.codigo);
    const nombreVo = TipoDocumentoFisicoNombre.of(input.nombre);

    const codigoNormalizado = codigoVo.toString();

    // Pre-check amigable de unicidad de código (REQ-T-02 / cicatriz F-01):
    // produce un error descriptivo antes del UNIQUE de Postgres. Para el
    // nombre usamos la capa del adapter (P2002 → DomainError).
    const existente = await this.repo.findByCodigo(tenantId, codigoNormalizado);
    if (existente) {
      throw new TipoDocumentoFisicoCodigoDuplicadoError(codigoNormalizado);
    }

    return this.repo.create(tenantId, {
      nombre: nombreVo.toString(),
      codigo: codigoNormalizado,
      esTributario: input.esTributario,
      tiposComprobanteAplicables: input.tiposComprobanteAplicables,
      createdByUserId: input.createdByUserId,
    });
  }

  /**
   * Devuelve el tipo por id. Lanza `TipoDocumentoFisicoNoEncontradoError`
   * si no existe o pertenece a otro tenant (multi-tenancy defense in depth).
   */
  async findById(tenantId: string, id: string): Promise<TipoDocumentoFisico> {
    const tipo = await this.repo.findById(tenantId, id);
    if (!tipo) throw new TipoDocumentoFisicoNoEncontradoError(id);
    return tipo;
  }

  /**
   * Lista los tipos del tenant con filtros y paginación. El orden
   * `esTributario DESC, nombre ASC` (REQ-T-09) está definido en el adapter.
   */
  async listar(
    tenantId: string,
    filtros: ListarTiposDocumentoFisicoFiltros,
    pagination: ListarTiposDocumentoFisicoPagination,
  ): Promise<ListarTiposDocumentoFisicoResult> {
    return this.repo.listar(tenantId, filtros, pagination);
  }

  /**
   * PATCH sobre un tipo existente. El campo `codigo` es inmutable
   * post-create — no figura en `ActualizarTipoDocumentoFisicoInput` y
   * el service no lo pasa al repo (E-T-07).
   */
  async update(
    tenantId: string,
    id: string,
    input: ActualizarTipoDocumentoFisicoInput,
  ): Promise<TipoDocumentoFisico> {
    const existente = await this.repo.findById(tenantId, id);
    if (!existente) throw new TipoDocumentoFisicoNoEncontradoError(id);

    // exactOptionalPropertyTypes: spread condicional (CLAUDE.md §2.5.1).
    const data: TipoDocumentoFisicoUpdateData = {
      ...(input.nombre !== undefined ? { nombre: input.nombre } : {}),
      ...(input.esTributario !== undefined ? { esTributario: input.esTributario } : {}),
      ...(input.tiposComprobanteAplicables !== undefined
        ? { tiposComprobanteAplicables: input.tiposComprobanteAplicables }
        : {}),
    };

    return this.repo.update(tenantId, id, data);
  }

  /**
   * Cambia el flag `activo` del tipo. Idempotente: si el tipo ya tiene
   * el valor solicitado, devuelve el tipo sin llamar al repo.
   */
  async setActivo(tenantId: string, id: string, activo: boolean): Promise<TipoDocumentoFisico> {
    const tipo = await this.repo.findById(tenantId, id);
    if (!tipo) throw new TipoDocumentoFisicoNoEncontradoError(id);

    if (tipo.activo === activo) return tipo;

    return this.repo.setActivo(tenantId, id, activo);
  }

  /**
   * Elimina físicamente un tipo. Defense in depth (CLAUDE.md §4.8):
   * verifica que no haya documentos físicos asociados antes de intentar el
   * DELETE — si los hay, lanza `TipoDocumentoFisicoConDocumentosError` con
   * el count para un mensaje amigable. Si aparece un documento en la
   * ventana entre el count y el delete, el adapter lo captura vía FK
   * Restrict y relanza el mismo error sin count.
   */
  async eliminar(tenantId: string, id: string): Promise<void> {
    const tipo = await this.repo.findById(tenantId, id);
    if (!tipo) throw new TipoDocumentoFisicoNoEncontradoError(id);

    const count = await this.repo.countDocumentosFisicos(tenantId, id);
    if (count > 0) {
      throw new TipoDocumentoFisicoConDocumentosError(id, count);
    }

    await this.repo.eliminar(tenantId, id);
  }
}
