import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';

import { PrismaPermissionsResolver } from './adapters/prisma-permissions-resolver.adapter';
import { RedisPermissionsCache } from './adapters/redis-permissions-cache.adapter';
import { PermissionsGuard } from './guards/permissions.guard';
import { PERMISSIONS_CACHE_INVALIDATION_PORT } from './ports/permissions-cache-invalidation.port';
import { PERMISSIONS_CACHE_PORT } from './ports/permissions-cache.port';
import { PERMISSIONS_RESOLVER_PORT } from './ports/permissions-resolver.port';
import { RbacService } from './rbac.service';

@Module({
  providers: [
    RbacService,
    PermissionsGuard,
    TenantContextService,
    PrismaService,
    {
      provide: PERMISSIONS_RESOLVER_PORT,
      useClass: PrismaPermissionsResolver,
    },
    {
      provide: PERMISSIONS_CACHE_PORT,
      useClass: RedisPermissionsCache,
    },
    // Port cross-módulo para invalidación post-commit. RbacService ya
    // implementa esta superficie — la envolvemos con `useExisting` para
    // que los callers externos (memberships, invitations, custom-roles)
    // no dependan del service concreto.
    {
      provide: PERMISSIONS_CACHE_INVALIDATION_PORT,
      useExisting: RbacService,
    },
  ],
  exports: [RbacService, PermissionsGuard, PERMISSIONS_CACHE_INVALIDATION_PORT],
})
export class RbacModule {}
