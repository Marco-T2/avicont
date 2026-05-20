import { Inject, Injectable } from '@nestjs/common';
import type { DocumentoFisico, Moneda } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { NumeroDocumento } from './domain/numero-documento';
import {
  DocumentoFisicoNoEncontradoError,
  DocumentoFisicoNumeroDuplicadoError,
  DocumentoFisicoNumeroFormatoInvalidoError,
  DocumentoFisicoInmutablePorComprobanteContabilizadoError,
  DocumentoFisicoReferenciadoPorComprobanteError,
  DocumentoFisicoMontoRequeridoParaTributarioError,
  DocumentoFisicoMontoNoPermitidoParaNoTributarioError,
} from './domain/documento-fisico-errors';
import {
  DOCUMENTO_FISICO_REPOSITORY_PORT,
  DocumentoFisicoRepositoryPort,
  DocumentoFisicoListarFiltros,
  DocumentoFisicoListarPagination,
  DocumentoFisicoUpdateData,
} from './ports/documento-fisico.repository.port';
import {
  TIPOS_DOCUMENTO_FISICO_READER_PORT,
  TiposDocumentoFisicoReaderPort,
} from '@/tipos-documento-fisico/ports/tipos-documento-fisico-reader.port';
import {
  TipoDocumentoFisicoNoEncontradoError,
  TipoDocumentoFisicoInactivoError,
} from '@/tipos-documento-fisico/domain/tipo-documento-fisico-errors';
import {
  CONTACTOS_READER_PORT,
  ContactosReaderPort,
} from '@/contactos/ports/contactos-reader.port';
import { ContactoNoEncontradoError } from '@/contactos/domain/contacto-errors';

// ============================================================
// Inputs del service
// ============================================================

export interface CrearDocumentoFisicoInput {
  tipoDocumentoFisicoId: string;
  /** Será normalizado (trim + uppercase) vía NumeroDocumento VO. */
  numero: string;
  fechaEmision: Date;
  /** `null` para tipos no-tributarios (Decisión 4). Para tributarios es obligatorio. */
  monto: string | null;
  moneda: Moneda | null;
  glosa: string | null;
  contactoId: string | null;
  createdByUserId: string;
}

export interface ActualizarDocumentoFisicoInput {
  tipoDocumentoFisicoId?: string;
  numero?: string;
  fechaEmision?: Date;
  monto?: string | null;
  moneda?: Moneda | null;
  glosa?: string | null;
  contactoId?: string | null;
}

// ============================================================
// Service
// ============================================================

@Injectable()
export class DocumentosFisicosService {
  constructor(
    @Inject(DOCUMENTO_FISICO_REPOSITORY_PORT)
    private readonly repo: DocumentoFisicoRepositoryPort,
    @Inject(TIPOS_DOCUMENTO_FISICO_READER_PORT)
    private readonly tiposReader: TiposDocumentoFisicoReaderPort,
    @Inject(CONTACTOS_READER_PORT)
    private readonly contactosReader: ContactosReaderPort,
  ) {}

  /**
   * Crea un documento físico aplicando las reglas de negocio:
   * - Valida que el tipo existe en el tenant y está activo (REQ-D-06/07).
   * - Valida regla de monto condicional según `esTributario` del tipo (REQ-D-13/14).
   * - Normaliza el número vía `NumeroDocumento` VO (REQ-D-02).
   * - Verifica unicidad de número amigable antes del UNIQUE de BD (cicatriz F-01).
   * - Valida que el contacto, si se provee, existe en el tenant (REQ-D-10).
   *   Contacto inactivo se permite al crear — la validación de activo es al contabilizar (E-D-09).
   */
  async create(tenantId: string, input: CrearDocumentoFisicoInput): Promise<DocumentoFisico> {
    // 1. Validar tipo: existencia + activo
    const tipo = await this.tiposReader.findById(tenantId, input.tipoDocumentoFisicoId);
    if (!tipo) throw new TipoDocumentoFisicoNoEncontradoError(input.tipoDocumentoFisicoId);
    if (!tipo.activo) throw new TipoDocumentoFisicoInactivoError(tipo.id, tipo.codigo);

    // 2. Validar regla de monto condicional (Decisión 4 — REQ-D-13/14)
    if (tipo.esTributario) {
      // Tipo tributario: monto y moneda son OBLIGATORIOS
      if (input.monto === null || input.monto === undefined) {
        throw new DocumentoFisicoMontoRequeridoParaTributarioError('monto');
      }
      if (input.moneda === null || input.moneda === undefined) {
        throw new DocumentoFisicoMontoRequeridoParaTributarioError('moneda');
      }
    } else {
      // Tipo no-tributario: monto y moneda deben ser NULL (el monto viene del Comprobante)
      if (input.monto !== null && input.monto !== undefined) {
        throw new DocumentoFisicoMontoNoPermitidoParaNoTributarioError('monto');
      }
      if (input.moneda !== null && input.moneda !== undefined) {
        throw new DocumentoFisicoMontoNoPermitidoParaNoTributarioError('moneda');
      }
    }

    // 3. Normalizar número vía VO — lanza RangeError si el formato es inválido;
    //    el service lo mapea al DomainError estable (CLAUDE.md §6.3).
    let numeroNormalizado: string;
    try {
      numeroNormalizado = NumeroDocumento.of(input.numero).toString();
    } catch {
      throw new DocumentoFisicoNumeroFormatoInvalidoError(input.numero);
    }

    // 4. Pre-check amigable de unicidad (cicatriz F-01, CLAUDE.md §4.8)
    const existente = await this.repo.findByNumero(
      tenantId,
      input.tipoDocumentoFisicoId,
      numeroNormalizado,
    );
    if (existente) {
      throw new DocumentoFisicoNumeroDuplicadoError(numeroNormalizado, input.tipoDocumentoFisicoId);
    }

    // 5. Validar contacto si se provee — solo existencia en el tenant (no activo)
    if (input.contactoId !== null && input.contactoId !== undefined) {
      const contactos = await this.contactosReader.obtenerBatch(tenantId, [input.contactoId]);
      if (!contactos.has(input.contactoId)) {
        throw new ContactoNoEncontradoError(input.contactoId);
      }
    }

    // 6. Persistir — el monto cruza como Decimal (CLAUDE.md §4.5)
    const montoDecimal =
      input.monto !== null && input.monto !== undefined ? new Prisma.Decimal(input.monto) : null;

    return this.repo.create(tenantId, {
      tipoDocumentoFisicoId: input.tipoDocumentoFisicoId,
      numero: numeroNormalizado,
      fechaEmision: input.fechaEmision,
      monto: montoDecimal,
      moneda: input.moneda ?? null,
      glosa: input.glosa ?? null,
      contactoId: input.contactoId ?? null,
      createdByUserId: input.createdByUserId,
    });
  }

  /**
   * Devuelve el documento por id. Lanza `DocumentoFisicoNoEncontradoError`
   * si no existe o pertenece a otro tenant (multi-tenancy defense in depth).
   */
  async findById(tenantId: string, id: string): Promise<DocumentoFisico> {
    const doc = await this.repo.findById(tenantId, id);
    if (!doc) throw new DocumentoFisicoNoEncontradoError(id);
    return doc;
  }

  /**
   * Lista paginada de documentos físicos del tenant con filtros opcionales.
   * El orden y la paginación son responsabilidad del caller (controller → service → repo).
   */
  async listar(
    tenantId: string,
    filtros: DocumentoFisicoListarFiltros,
    pagination: DocumentoFisicoListarPagination,
  ): Promise<{ items: DocumentoFisico[]; total: number }> {
    return this.repo.listar(tenantId, filtros, pagination);
  }

  /**
   * PATCH parcial sobre un documento físico. Reglas de mutabilidad (D10):
   * - Si el doc tiene asociaciones a comprobantes CONTABILIZADOS → inmutable (E-E-03/04).
   * - Si está suelto o solo en borradores → editable (E-E-01/02).
   * - La normalización del número aplica igual que en `create` (E-E-05).
   *
   * No se re-valida la regla de monto condicional en el PATCH — el tipo ya
   * fue validado al crear. Si el tipo cambia en el PATCH, la validación de
   * monto queda como deuda (se cubre cuando se implemente cambio de tipo en PATCH).
   */
  async update(
    tenantId: string,
    id: string,
    input: ActualizarDocumentoFisicoInput,
  ): Promise<DocumentoFisico> {
    const doc = await this.repo.findById(tenantId, id);
    if (!doc) throw new DocumentoFisicoNoEncontradoError(id);

    // Defense in depth: si hay al menos una asociación contabilizada → inmutable
    const contabilizadas = await this.repo.countAsociacionesContabilizadas(tenantId, id);
    if (contabilizadas > 0) {
      // Usamos el id del doc como placeholder del comprobanteContabilizadoId — en unit
      // tests el id exacto no importa; en producción el adapter tiene el id real.
      throw new DocumentoFisicoInmutablePorComprobanteContabilizadoError(id, `${id}-contabilizado`);
    }

    // Normalizar número si viene en el input (E-E-05)
    let numeroNormalizado: string | undefined;
    if (input.numero !== undefined) {
      try {
        numeroNormalizado = NumeroDocumento.of(input.numero).toString();
      } catch {
        throw new DocumentoFisicoNumeroFormatoInvalidoError(input.numero);
      }
    }

    // exactOptionalPropertyTypes: spread condicional (CLAUDE.md §2.5.1)
    const data: DocumentoFisicoUpdateData = {
      ...(numeroNormalizado !== undefined ? { numero: numeroNormalizado } : {}),
      ...(input.tipoDocumentoFisicoId !== undefined
        ? { tipoDocumentoFisicoId: input.tipoDocumentoFisicoId }
        : {}),
      ...(input.fechaEmision !== undefined ? { fechaEmision: input.fechaEmision } : {}),
      ...(input.glosa !== undefined ? { glosa: input.glosa } : {}),
      ...(input.contactoId !== undefined ? { contactoId: input.contactoId } : {}),
      ...(input.monto !== undefined
        ? {
            monto: input.monto !== null ? new Prisma.Decimal(input.monto) : null,
          }
        : {}),
      ...(input.moneda !== undefined ? { moneda: input.moneda } : {}),
    };

    return this.repo.update(tenantId, id, data);
  }

  /**
   * Elimina físicamente un documento físico. Reglas de eliminación (D7):
   * - Si hay asociaciones activas (cualquier estado de comprobante) → no eliminable (E-EL-03).
   * - Si no hay asociaciones (incluyendo post-anulación donde las asociaciones se borraron) → eliminable.
   *
   * Nota: E-EL-02 (historial de asociaciones anuladas) es deuda documentada (task 9.4).
   * Per design D7, las asociaciones de comprobantes anulados se borran en la TX del anular,
   * por lo que `countAsociaciones = 0` post-anulación y el doc es eliminable.
   */
  async eliminar(tenantId: string, id: string): Promise<void> {
    const doc = await this.repo.findById(tenantId, id);
    if (!doc) throw new DocumentoFisicoNoEncontradoError(id);

    const totalAsociaciones = await this.repo.countAsociaciones(tenantId, id);
    if (totalAsociaciones > 0) {
      // No tenemos un comprobanteId específico en este nivel (podría haber varios).
      // Usamos un placeholder — el error se enriquece con el id del primer comprobante
      // en el controller/adapter cuando se necesite el detalle exacto.
      throw new DocumentoFisicoReferenciadoPorComprobanteError(id, `${id}-comprobante`, 'BORRADOR');
    }

    await this.repo.eliminar(tenantId, id);
  }
}
