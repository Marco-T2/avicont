import { forwardRef, Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RbacModule } from '../rbac/rbac.module';
import { PeriodosFiscalesModule } from '../periodos-fiscales/periodos-fiscales.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { TENANT_REPOSITORY_PORT } from './ports/tenant.repository.port';
import { PrismaTenantRepository } from './adapters/prisma-tenant.repository';

// CacheModule es @Global, así que RedisService está disponible sin importar.
// forwardRef con PeriodosFiscalesModule para evitar dependencia circular si
// algún día periodos-fiscales consumiera algo de tenants (hoy no, pero
// blindamos el contrato).
//
// PrismaService + TenantContextService siguen registrados acá (aunque el
// service ya no los inyecta) porque PrismaService los requiere de forma
// transitiva en su constructor. Mientras se registre per-module en lugar
// de vivir en un PrismaModule global, deben acompañarlo — patrón aceptado
// en §3.2.d (deuda fuera de scope).
@Module({
  imports: [
    RbacModule,
    forwardRef(() => PeriodosFiscalesModule),
    MembershipsModule,
  ],
  controllers: [TenantsController],
  providers: [
    TenantsService,
    PrismaService,
    TenantContextService,
    TenantGuard,
    PrismaTenantRepository,
    { provide: TENANT_REPOSITORY_PORT, useExisting: PrismaTenantRepository },
  ],
  exports: [TenantsService],
})
export class TenantsModule {}
