import { Module } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { RbacModule } from '../rbac/rbac.module';

import { PrismaFeatureFlagReaderAdapter } from './adapters/prisma-feature-flag-reader.adapter';
import { PrismaFeatureFlagRepository } from './adapters/prisma-feature-flag.repository';
import { FeatureFlagGuard } from './feature-flag.guard';
import { FeatureFlagsAdminController } from './feature-flags-admin.controller';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';
import { FEATURE_FLAG_READER_PORT } from './ports/feature-flag-reader.port';
import { FEATURE_FLAG_REPOSITORY_PORT } from './ports/feature-flag.repository.port';

// `CacheModule` es @Global() — CacheService se resuelve sin import explícito.
// `TenantContextService` se mantiene como provider del módulo por la misma
// razón documentada en auth.module.ts (commit dc00fff): request-scoped,
// cada módulo lo instancia de nuevo a propósito.
@Module({
  imports: [RbacModule],
  controllers: [FeatureFlagsController, FeatureFlagsAdminController],
  providers: [
    FeatureFlagsService,
    FeatureFlagGuard,
    PrismaService,
    TenantContextService,
    PrismaFeatureFlagRepository,
    PrismaFeatureFlagReaderAdapter,
    { provide: FEATURE_FLAG_REPOSITORY_PORT, useExisting: PrismaFeatureFlagRepository },
    { provide: FEATURE_FLAG_READER_PORT, useExisting: PrismaFeatureFlagReaderAdapter },
  ],
  exports: [FEATURE_FLAG_READER_PORT, FeatureFlagGuard],
})
export class FeatureFlagsModule {}
