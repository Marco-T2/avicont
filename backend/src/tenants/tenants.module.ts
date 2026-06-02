import { forwardRef, Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RbacModule } from '../rbac/rbac.module';
import { PeriodosFiscalesModule } from '../periodos-fiscales/periodos-fiscales.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { CuentasModule } from '../cuentas/cuentas.module';
import { TiposDocumentoFisicoModule } from '../tipos-documento-fisico/tipos-documento-fisico.module';
import { GranjaModule } from '../granja/granja.module';
import { TENANT_REPOSITORY_PORT } from './ports/tenant.repository.port';
import { PrismaTenantRepository } from './adapters/prisma-tenant.repository';
import { ORG_STATUS_READER_PORT } from '@/common/ports/org-status-reader.port';
import { PrismaOrgStatusReaderAdapter } from './adapters/prisma-org-status-reader.adapter';

// CacheModule es @Global, así que RedisService está disponible sin importar.
// forwardRef con PeriodosFiscalesModule para evitar dependencia circular si
// algún día periodos-fiscales consumiera algo de tenants (hoy no, pero
// blindamos el contrato).
//
// CuentasModule se importa para proveer PLAN_CUENTAS_SEEDER_PORT que
// TenantsService inyecta al crear una organización (seeding-por-tipo §7).
// La dependencia es unidireccional: tenants → cuentas. No hay ciclo porque
// CuentasModule no importa TenantsModule (verificado con grep).
//
// TiposDocumentoFisicoModule provee TIPO_DOCUMENTO_FISICO_SEEDER_PORT para
// sembrar los 8 tipos universales al crear una organización (design §D3, §7.2).
// Dependencia unidireccional sin forwardRef: tenants → tipos-documento-fisico.
//
// GranjaModule provee TIPO_REGISTRO_SEEDER_PORT para sembrar los 12 tipos de
// registro fábrica al activar el vertical granja (design granja-v1 §8).
// Dependencia unidireccional sin forwardRef: tenants → granja. No hay ciclo:
// GranjaModule no importa TenantsModule (verificado con grep).
@Module({
  imports: [
    RbacModule,
    forwardRef(() => PeriodosFiscalesModule),
    MembershipsModule,
    CuentasModule,
    TiposDocumentoFisicoModule,
    GranjaModule,
  ],
  controllers: [TenantsController],
  providers: [
    TenantsService,
    PrismaService,
    TenantContextService,
    TenantGuard,
    PrismaTenantRepository,
    { provide: TENANT_REPOSITORY_PORT, useExisting: PrismaTenantRepository },
    PrismaOrgStatusReaderAdapter,
    { provide: ORG_STATUS_READER_PORT, useExisting: PrismaOrgStatusReaderAdapter },
  ],
  exports: [TenantsService, ORG_STATUS_READER_PORT],
})
export class TenantsModule {}
