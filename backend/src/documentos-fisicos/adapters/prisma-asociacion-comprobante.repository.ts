import { Injectable } from '@nestjs/common';
import type { ComprobanteDocumentoFisico, EstadoComprobante } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { DocumentoFisicoYaAsociadoAOtroContabilizadoError } from '../domain/documento-fisico-errors';
import {
  AsociacionComprobanteRepositoryPort,
  type AsociarInput,
} from '../ports/asociacion-comprobante.repository.port';

// ----------------------------------------------------------------
// Valores EXACTOS de meta.target según violación confirmados
// empíricamente con el integration spec (test E-A-03).
//
// Al violar el UNIQUE PARCIAL `comprobante_documento_fisico_unique_contabilizado`
// (WHERE comprobanteEstado = 'CONTABILIZADO'), Prisma reporta:
//   meta.target = ["documentoFisicoId"]       ← array de 1 elemento
//
// Al violar el UNIQUE normal (documentoFisicoId, comprobanteId),
// Prisma reporta:
//   meta.target = ["documentoFisicoId","comprobanteId"]  ← array de 2 elementos
//
// NOTA IMPORTANTE: el nombre del índice en Postgres es
// `comprobante_documento_fisico_unique_contabilizado`, pero Prisma
// NO expone ese nombre en meta.target para índices raw SQL. En su
// lugar normaliza el target a los nombres de campo del modelo.
// La distinción se hace por longitud del array: 1 = parcial, 2 = normal.
// ----------------------------------------------------------------

/** Target del UNIQUE PARCIAL: solo el campo documentoFisicoId */
const TARGET_PARCIAL = 'documentoFisicoId';
/**
 * Target del UNIQUE NORMAL: documentoFisicoId + comprobanteId.
 * Se deja documentado (aunque no se usa en condicional) para que
 * el siguiente dev entienda la distinción. Si se quiere mapear la
 * violación del normal a un error concreto, comparar con este valor.
 */
// const TARGET_NORMAL = 'documentoFisicoId,comprobanteId';

@Injectable()
export class PrismaAsociacionComprobanteRepository extends AsociacionComprobanteRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Inserta una fila de asociación comprobante ↔ documentoFisico.
   *
   * Casos de P2002 manejados:
   *   - UNIQUE PARCIAL (comprobanteEstado = 'CONTABILIZADO') →
   *     `DocumentoFisicoYaAsociadoAOtroContabilizadoError` (R3, cicatriz F-01).
   *   - UNIQUE normal (documentoFisicoId, comprobanteId) →
   *     relanzado tal cual (idempotencia es responsabilidad del servicio).
   */
  async asociar(
    tenantId: string,
    input: AsociarInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteDocumentoFisico> {
    const client = tx ?? this.prisma;
    try {
      return await client.comprobanteDocumentoFisico.create({
        data: {
          organizationId: tenantId,
          comprobanteId: input.comprobanteId,
          documentoFisicoId: input.documentoFisicoId,
          comprobanteEstado: input.comprobanteEstado,
        },
      });
    } catch (err) {
      this.mapP2002Asociar(err, input.documentoFisicoId);
      throw err;
    }
  }

  /**
   * Borra UNA asociación específica.
   * Retorna 0 si no existía (idempotente).
   * Defense in depth: incluye `organizationId` en el WHERE.
   */
  async desasociar(
    tenantId: string,
    comprobanteId: string,
    documentoFisicoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const result = await client.comprobanteDocumentoFisico.deleteMany({
      where: { organizationId: tenantId, comprobanteId, documentoFisicoId },
    });
    return result.count;
  }

  /**
   * Borra TODAS las asociaciones de un comprobante.
   * Usado al ANULAR: libera los documentos para re-uso.
   * Defense in depth: filtra por `organizationId`.
   */
  async desasociarTodasDelComprobante(
    tenantId: string,
    comprobanteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const result = await client.comprobanteDocumentoFisico.deleteMany({
      where: { organizationId: tenantId, comprobanteId },
    });
    return result.count;
  }

  /**
   * Refresca la columna cache `comprobanteEstado` para TODAS las filas
   * del comprobante. Se invoca en la misma TX que cambia el estado del
   * comprobante.
   *
   * Al pasar a CONTABILIZADO, puede violar el UNIQUE PARCIAL si otro
   * comprobante ya contabilizó el mismo documento físico. En ese caso
   * Prisma lanza P2002 con `meta.target = ["documentoFisicoId"]`
   * (array de 1 elemento — el campo del UNIQUE PARCIAL).
   * Lo mapeamos a `DocumentoFisicoYaAsociadoAOtroContabilizadoError` (R3).
   *
   * Defense in depth: filtra por `comprobanteId + organizationId`.
   */
  async refrescarEstadoComprobante(
    tenantId: string,
    comprobanteId: string,
    nuevoEstado: EstadoComprobante,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    try {
      const result = await client.comprobanteDocumentoFisico.updateMany({
        where: { comprobanteId, organizationId: tenantId },
        data: { comprobanteEstado: nuevoEstado },
      });
      return result.count;
    } catch (err) {
      this.mapP2002Contabilizar(err);
      throw err;
    }
  }

  /** Lista todas las asociaciones de un comprobante del tenant. */
  async listarPorComprobante(
    tenantId: string,
    comprobanteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteDocumentoFisico[]> {
    const client = tx ?? this.prisma;
    return client.comprobanteDocumentoFisico.findMany({
      where: { organizationId: tenantId, comprobanteId },
    });
  }

  /** Lista todas las asociaciones de un documento físico del tenant. */
  async listarPorDocumento(
    tenantId: string,
    documentoFisicoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteDocumentoFisico[]> {
    const client = tx ?? this.prisma;
    return client.comprobanteDocumentoFisico.findMany({
      where: { organizationId: tenantId, documentoFisicoId },
    });
  }

  // ------------------------------------------------------------------
  // Helpers privados de mapeo de errores Prisma
  // ------------------------------------------------------------------

  /**
   * Mapeo de P2002 para el método `asociar`.
   *
   * ÚNICO PARCIAL (target = ["documentoFisicoId"], 1 elemento) →
   *   `DocumentoFisicoYaAsociadoAOtroContabilizadoError`.
   * UNIQUE NORMAL (target = ["documentoFisicoId","comprobanteId"], 2 elementos) →
   *   se deja pasar para que el servicio lo maneje (asociación ya existente).
   */
  private mapP2002Asociar(err: unknown, documentoFisicoId: string): void {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return;

    const target = this.normalizeTarget(err);
    if (target === TARGET_PARCIAL) {
      throw new DocumentoFisicoYaAsociadoAOtroContabilizadoError(documentoFisicoId);
    }
    // TARGET_NORMAL: la asociación ya existe — el caller decide la semántica.
  }

  /**
   * Mapeo de P2002 para `refrescarEstadoComprobante` (UPDATE).
   *
   * Un UPDATE que viola el UNIQUE PARCIAL llega con
   * `meta.target = ["documentoFisicoId"]` (1 elemento), igual que en INSERT.
   * Cualquier P2002 aquí es el parcial — no hay otro UNIQUE que pueda
   * violarse en un `updateMany` que solo toca `comprobanteEstado`.
   */
  private mapP2002Contabilizar(err: unknown): void {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return;

    const target = this.normalizeTarget(err);
    if (target === TARGET_PARCIAL) {
      // El documentoFisicoId no está disponible aquí; el servicio lo resolverá
      // del contexto de la TX. Se pasa string vacío como placeholder.
      throw new DocumentoFisicoYaAsociadoAOtroContabilizadoError('');
    }
  }

  /**
   * Normaliza `meta.target` a string unificado para comparar.
   * - Array → elementos joinados con coma (ej: "documentoFisicoId,comprobanteId")
   * - String → tal cual
   * - Otro → string vacío
   */
  private normalizeTarget(err: Prisma.PrismaClientKnownRequestError): string {
    const raw = err.meta?.['target'];
    if (Array.isArray(raw)) return (raw as string[]).join(',');
    if (typeof raw === 'string') return raw;
    return '';
  }
}
