import { Module } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { PrismaService } from '../common/prisma.service';
import { PERMISSIONS_RESOLVER_PORT } from './ports/permissions-resolver.port';
import { PERMISSIONS_CACHE_PORT } from './ports/permissions-cache.port';
import { PrismaPermissionsResolver } from './adapters/prisma-permissions-resolver.adapter';
import { RedisPermissionsCache } from './adapters/redis-permissions-cache.adapter';

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
  ],
  exports: [RbacService, PermissionsGuard],
})
export class RbacModule {}
