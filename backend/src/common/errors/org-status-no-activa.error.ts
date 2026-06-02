import type { OrganizationStatus } from '@prisma/client';

import { ForbiddenError } from './forbidden.error';

/**
 * La organización activa no está en estado ACTIVE, por lo que las mutaciones
 * están bloqueadas. HTTP 403 con código estable ORG_STATUS_NO_ACTIVE.
 */
export class OrgStatusNoActivaError extends ForbiddenError {
  constructor({ status }: { status: OrganizationStatus }) {
    super(
      'ORG_STATUS_NO_ACTIVE',
      `La organización no está activa (estado: ${status}). Solo se permiten operaciones de lectura.`,
      { status },
    );
  }
}
