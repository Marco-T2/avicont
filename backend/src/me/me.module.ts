import { Module } from '@nestjs/common';
import { RbacModule } from '@/rbac/rbac.module';
import { PacksModule } from '@/packs/pack.module';
import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { MeController } from './me.controller';

// TenantContextService es dependencia (opcional) del constructor de PrismaService;
// sin él en providers, Nest no puede instanciar el PrismaService propio del módulo.
// PacksModule exporta OrgPacksReaderPort: la superficie pública cross-módulo para
// leer los packs activos de la org (core §3.7), consumida por /me/permissions.
@Module({
  imports: [RbacModule, PacksModule],
  controllers: [MeController],
  providers: [PrismaService, TenantContextService],
})
export class MeModule {}
