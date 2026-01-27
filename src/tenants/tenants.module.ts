import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { TenantGuard } from '../common/guards/tenant.guard';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, PrismaService, TenantContextService, TenantGuard],
  exports: [TenantsService],
})
export class TenantsModule {}
