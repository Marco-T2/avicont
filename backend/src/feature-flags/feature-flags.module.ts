import { Module } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsAdminController } from './feature-flags-admin.controller';
import { FeatureFlagGuard } from './feature-flag.guard';
import { RbacModule } from '../rbac/rbac.module';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';

@Module({
  imports: [RbacModule],
  controllers: [FeatureFlagsController, FeatureFlagsAdminController],
  providers: [FeatureFlagsService, FeatureFlagGuard, PrismaService, TenantContextService],
  exports: [FeatureFlagsService, FeatureFlagGuard],
})
export class FeatureFlagsModule {}
