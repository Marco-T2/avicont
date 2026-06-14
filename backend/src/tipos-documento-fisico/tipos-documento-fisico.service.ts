import { Inject, Injectable } from '@nestjs/common';
import type { TipoDocumentoFisico } from '@prisma/client';

import {
  TipoDocumentoFisicoConDocumentosError,
  TipoDocumentoFisicoCodigoDuplicadoError,
  TipoDocumentoFisicoNoEncontradoError,
  TipoDocumentoFisicoNumeracionAutoTributarioInvalidaError,
  TipoDocumentoFisicoNumeroInicialInmutableError,
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
  /** Omitir equivale a false (retrocompat). */
  numeracionAutomatica?: boolean;
  /**
   * Solo aplica cuando numeracionAutomatica=true. Omitir usa default 1.
   * Ignorado silenciosamente si numeracionAutomatica=false.
   */
  numeroInicial?: number;
}

export interface ActualizarTipoDocumentoFisicoInput {
  nombre?: string;
  esTributario?: boolean;
  tiposComprobanteAplicables?: TipoDocumentoFisicoUpdateData['tiposComprobanteAplicables'];
  /**
   * Defense-in-depth: aunque el DTO no expone estos campos, el service los
   * rechaza si llegan vía el input crudo (set-once invariant — spec E-TN-08/09/10).
   */
  numeracionAutomatica?: boolean;
  numeroInicial?: number;
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

    const numeracionAutomatica = input.numeracionAutomatica ?? false;

    // Los tipos tributarios (factura, NC, ND) tienen número asignado por el
    // emisor externo; el sistema no puede generar ese número (E-TN-05).
    if (numeracionAutomatica && input.esTributario) {
      throw new TipoDocumentoFisicoNumeracionAutoTributarioInvalidaError();
    }

    // Pre-check amigable de unicidad de código (REQ-T-02 / cicatriz F-01):
    // produce un error descriptivo antes del UNIQUE de Postgres. Para el
    // nombre usamos la capa del adapter (P2002 → DomainError).
    const existente = await this.repo.findByCodigo(tenantId, codigoNormalizado);
    if (existente) {
      throw new TipoDocumentoFisicoCodigoDuplicadoError(codigoNormalizado);
    }

    // Normalizar numeroInicial:
    // - Si auto y no viene → default 1 (E-TN-03).
    // - Si manual → null, ignorando silenciosamente lo que venga (E-TN-04).
    const numeroInicial: number | null = numeracionAutomatica ? (input.numeroInicial ?? 1) : null;

    return this.repo.create(tenantId, {
      nombre: nombreVo.toString(),
      codigo: codigoNormalizado,
      esTributario: input.esTributario,
      tiposComprobanteAplicables: input.tiposComprobanteAplicables,
      createdByUserId: input.createdByUserId,
      numeracionAutomatica,
      numeroInicial,
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
   * PATCH sobre un tipo existente. El campo `codigo` es inmutable post-create.
   * `numeracionAutomatica` y `numeroInicial` son set-once: cualquier intento
   * de cambiarlos después de la creación lanza un DomainError (E-TN-08/09/10).
   */
  async update(
    tenantId: string,
    id: string,
    input: ActualizarTipoDocumentoFisicoInput,
  ): Promise<TipoDocumentoFisico> {
    const existente = await this.repo.findById(tenantId, id);
    if (!existente) throw new TipoDocumentoFisicoNoEncontradoError(id);

    // Set-once: `numeracionAutomatica` y `numeroInicial` son inmutables
    // post-create. Cualquier intento de cambiarlos (incluso con el mismo
    // valor) lanza error — no hay excepción de idempotencia (spec E-TN-09).
    if (input.numeracionAutomatica !== undefined || input.numeroInicial !== undefined) {
      throw new TipoDocumentoFisicoNumeroInicialInmutableError();
    }

    // Si el tipo ya tiene numeración automática y se intenta cambiar esTributario
    // a true → viola la regla auto⇒¬tributario (E-TN-06).
    if (existente.numeracionAutomatica && input.esTributario === true) {
      throw new TipoDocumentoFisicoNumeracionAutoTributarioInvalidaError();
    }

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
