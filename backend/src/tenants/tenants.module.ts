import { forwardRef, Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RbacModule } from '../rbac/rbac.module';
import { PeriodosFiscalesModule } from '../periodos-fiscales/periodos-fiscales.module';

// CacheModule es @Global, así que RedisService está disponible sin importar.
// forwardRef con PeriodosFiscalesModule para evitar dependencia circular si
// algún día periodos-fiscales consumiera algo de tenants (hoy no, pero
// blindamos el contrato).
@Module({
  imports: [RbacModule, forwardRef(() => PeriodosFiscalesModule)],
  controllers: [TenantsController],
  providers: [TenantsService, PrismaService, TenantContextService, TenantGuard],
  exports: [TenantsService],
})
export class TenantsModule {}
