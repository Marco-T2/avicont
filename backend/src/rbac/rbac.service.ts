import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  hasAllPermissions,
  hasAnyPermission,
  matchesPermission,
} from './domain/permission-matcher';
import { PermissionsCacheInvalidationPort } from './ports/permissions-cache-invalidation.port';
import { PERMISSIONS_CACHE_PORT, PermissionsCachePort } from './ports/permissions-cache.port';
import {
  PERMISSIONS_RESOLVER_PORT,
  PermissionsResolverPort,
  ResolvedPermissions,
} from './ports/permissions-resolver.port';

// Cuando el cache está vacío y el resolver dice "no es miembro", devolvemos
// este objeto para fail-safe: cero permisos. NO se cachea para no dejar
// "stuck" un usuario que aún se está terminando de aprovisionar.
const EMPTY: ResolvedPermissions = { esOwner: false, esAdmin: false, wildcards: [] };

@Injectable()
export class RbacService implements PermissionsCacheInvalidationPort {
  private readonly logger = new Logger(RbacService.name);

  constructor(
    @Inject(PERMISSIONS_RESOLVER_PORT)
    private readonly resolver: PermissionsResolverPort,
    @Inject(PERMISSIONS_CACHE_PORT)
    private readonly cache: PermissionsCachePort,
  ) {}

  async getPermissions(userId: string, organizationId: string): Promise<ResolvedPermissions> {
    const cached = await this.cache.get(userId, organizationId);
    if (cached) return cached;

    const fresh = await this.resolver.resolve(userId, organizationId);
    if (!fresh) return EMPTY;

    await this.cache.set(userId, organizationId, fresh);
    return fresh;
  }

  async hasPermission(userId: string, organizationId: string, required: string): Promise<boolean> {
    const perms = await this.getPermissions(userId, organizationId);
    if (perms.esOwner || perms.esAdmin) return true;
    return perms.wildcards.some((g) => matchesPermission(g, required));
  }

  async hasAllPermissions(
    userId: string,
    organizationId: string,
    required: string[],
  ): Promise<boolean> {
    const perms = await this.getPermissions(userId, organizationId);
    if (perms.esOwner || perms.esAdmin) return true;
    return hasAllPermissions(perms.wildcards, required);
  }

  async hasAnyPermission(
    userId: string,
    organizationId: string,
    required: string[],
  ): Promise<boolean> {
    const perms = await this.getPermissions(userId, organizationId);
    if (perms.esOwner || perms.esAdmin) return true;
    return hasAnyPermission(perms.wildcards, required);
  }

  // Invalidaciones expuestas para que servicios de dominio las llamen
  // post-commit. Ver §10.4 de CLAUDE.md y decisión 3 de Fase 0.6.
  //
  // Los dos primeros métodos cumplen `PermissionsCacheInvalidationPort`
  // — callers externos deberían inyectar ese port, no `RbacService`
  // directo. `invalidateOrganization` sigue acá porque sólo se usa
  // internamente; si algún día un caller externo lo necesita, se
  // amplía el port.
  invalidateUser(userId: string, organizationId: string): Promise<void> {
    return this.cache.invalidateUser(userId, organizationId);
  }
  invalidateUsersByCustomRole(customRoleId: string): Promise<void> {
    return this.cache.invalidateUsersByCustomRole(customRoleId);
  }
  invalidateOrganization(organizationId: string): Promise<void> {
    return this.cache.invalidateOrganization(organizationId);
  }
}
