import { Module } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { CuentasModule } from '../cuentas/cuentas.module';
import { RbacModule } from '../rbac/rbac.module';

import { PrismaConfiguracionContableRepository } from './adapters/prisma-configuracion-contable.repository';
import { ConfiguracionContableController } from './configuracion-contable.controller';
import { ConfiguracionContableService } from './configuracion-contable.service';
import { CONFIGURACION_CONTABLE_REPOSITORY_PORT } from './ports/configuracion-contable.repository.port';

@Module({
  imports: [RbacModule, CuentasModule],
  controllers: [ConfiguracionContableController],
  providers: [
    ConfiguracionContableService,
    PrismaService,
    TenantContextService,
    {
      provide: CONFIGURACION_CONTABLE_REPOSITORY_PORT,
      useClass: PrismaConfiguracionContableRepository,
    },
  ],
  exports: [ConfiguracionContableService],
})
export class ConfiguracionContableModule {}
