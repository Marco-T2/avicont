import type { AdjuntoComprobante } from '@prisma/client';

export const ADJUNTO_COMPROBANTE_REPOSITORY_PORT = 'ADJUNTO_COMPROBANTE_REPOSITORY_PORT';

export interface CrearAdjuntoData {
  id?: string;
  organizationId: string;
  comprobanteId: string;
  storageKey: string;
  nombreOriginal: string;
  mimeType: string;
  tamanoBytes: number;
  sha256?: string;
  subidoPorUserId: string;
}

export interface ActualizarAdjuntoData {
  storageKey: string;
  nombreOriginal: string;
  mimeType: string;
  tamanoBytes: number;
  sha256?: string;
}

/**
 * Puerto del repositorio de adjuntos de comprobantes.
 * Todas las operaciones filtran por `organizationId` para cumplir Anti-31
 * (aislamiento multi-tenant estricto, CLAUDE.md §4.2).
 *
 * La implementación concreta es `PrismaAdjuntoComprobanteRepository`.
 */
export interface AdjuntoComprobanteRepositoryPort {
  /**
   * Persiste un nuevo adjunto. El `id` se genera si no se provee.
   */
  crear(data: CrearAdjuntoData): Promise<AdjuntoComprobante>;

  /**
   * Lista los adjuntos de un comprobante del tenant.
   * Anti-31: filtra por `organizationId` + `comprobanteId`.
   */
  listar(organizationId: string, comprobanteId: string): Promise<AdjuntoComprobante[]>;

  /**
   * Obtiene un adjunto por id. Devuelve null si no existe O si es de otro
   * tenant (cross-tenant → 404, no 403, para no filtrar existencia).
   */
  obtenerPorId(organizationId: string, adjuntoId: string): Promise<AdjuntoComprobante | null>;

  /**
   * Actualiza los campos de un adjunto (para reemplazo).
   * Solo actualiza si el adjunto pertenece al tenant (Anti-31 defense in depth).
   */
  actualizar(
    organizationId: string,
    adjuntoId: string,
    data: ActualizarAdjuntoData,
  ): Promise<AdjuntoComprobante>;

  /**
   * Elimina un adjunto por id. Solo borra si pertenece al tenant (Anti-31).
   * Devuelve true si se borró, false si no existía o era de otro tenant.
   */
  eliminar(organizationId: string, adjuntoId: string): Promise<boolean>;

  /**
   * Cuenta los adjuntos de un comprobante. Usado para validar el tope de 10
   * antes de crear un nuevo adjunto.
   */
  contarPorComprobante(organizationId: string, comprobanteId: string): Promise<number>;
}
