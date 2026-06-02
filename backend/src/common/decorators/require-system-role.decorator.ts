import { SetMetadata } from '@nestjs/common';
import type { SystemRole } from '@prisma/client';

export const REQUIRE_SYSTEM_ROLE_KEY = 'require-system-role';

/**
 * Marca un endpoint como gateado por el SystemRole del miembro en la org activa
 * (OWNER/ADMIN), NO por un permiso fino del catálogo RBAC. Lo enforza
 * `SystemRolesGuard`, que lee el claim `roles` del JWT (poblado por
 * `extractRolesForTenant` en `auth.service`).
 *
 * Se usa para acciones de administración estructural de la org cuyo gobierno es
 * el rol del sistema y no un permiso asignable (ej. activar/desactivar un pack,
 * diseño `docs/disenos/packs-eje2.md` §5.4): el Owner decide, no se delega vía
 * permiso fino.
 */
export const RequireSystemRole = (...roles: SystemRole[]) =>
  SetMetadata(REQUIRE_SYSTEM_ROLE_KEY, roles);
