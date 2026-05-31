import { Module } from '@nestjs/common';
import { RbacModule } from '@/rbac/rbac.module';
import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { MeController } from './me.controller';

@Module({
  imports: [RbacModule],
  controllers: [MeController],
  providers: [PrismaService, TenantContextService],
})
export class MeModule {}
