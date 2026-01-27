import { Module, Global } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RbacModule } from '../rbac/rbac.module';

@Global()
@Module({
  imports: [RbacModule],
  controllers: [AuditController],
  providers: [AuditService, PrismaService, TenantContextService, TenantGuard],
  exports: [AuditService],
})
export class AuditModule {}
