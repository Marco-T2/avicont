// Puerto cross-módulo DEFINIDO por platform (consumidor) para leer organizaciones.
// El módulo `tenants` es el dueño del dominio Organization; registra el adapter
// concreto y lo exporta vía este token (CLAUDE.md §3.3 — no importación directa).
//
// Superficie mínima: solo los métodos que PlatformAdminService necesita.

import type { Organization } from '@prisma/client';

export const ORGS_READER_PORT = Symbol('ORGS_READER_PORT');

export abstract class OrgsReaderPort {
  /**
   * Lista todas las organizaciones de la plataforma sin filtro de tenant.
   * Solo invocable desde rutas super-admin gateadas por SuperAdminGuard.
   * (REQ-SA-12 — cross-tenant legítimo para el super-admin)
   */
  abstract listAll(): Promise<Organization[]>;

  /**
   * Busca una organización por ID. Retorna null si no existe.
   * Super-admin puede acceder a cualquier org (cross-tenant legítimo).
   */
  abstract findById(id: string): Promise<Organization | null>;
}
