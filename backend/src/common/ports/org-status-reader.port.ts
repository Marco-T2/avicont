import type { OrganizationStatus } from '@prisma/client';

export const ORG_STATUS_READER_PORT = 'ORG_STATUS_READER_PORT';

/**
 * Puerto de solo-lectura para obtener el status de una organización.
 * Consumido por OrgStatusGuard para enforcement de modo lectura.
 * Se define en common (consumidor) y se implementa en tenants (dueño del dominio).
 */
export abstract class OrgStatusReaderPort {
  /**
   * Devuelve el status de la organización, o null si no existe.
   * El guard usa null como señal de transparencia (no bloquear).
   */
  abstract getStatus(id: string): Promise<OrganizationStatus | null>;
}
