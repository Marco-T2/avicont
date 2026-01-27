import { Module, Global } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { RbacModule } from '../rbac/rbac.module';

@Global()
@Module({
  imports: [RbacModule],
  controllers: [AuditController],
  providers: [AuditService, PrismaService, TenantContextService],
  exports: [AuditService],
})
export class AuditModule {}
