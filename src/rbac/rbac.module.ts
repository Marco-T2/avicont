import { Module } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';

@Module({
  providers: [RbacService, PermissionsGuard, TenantContextService],
  exports: [RbacService, PermissionsGuard],
})
export class RbacModule {}
