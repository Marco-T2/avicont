import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { PlatformAuditInterceptor } from '@/audit/platform-audit.interceptor';
import { PLATFORM_AUDIT_PORT } from './ports/platform-audit.port';
import { PrismaPlatformAuditRepository } from './adapters/prisma-platform-audit.repository';

/**
 * Módulo de administración de plataforma.
 *
 * Registra el repositorio de auditoría con el token `PLATFORM_AUDIT_PORT`
 * y exporta el interceptor para uso en los controllers de plataforma.
 *
 * ClockPort ya es global (ClockModule) — no se re-registra acá.
 */
@Module({
  providers: [
    PrismaService,
    TenantContextService,
    {
      provide: PLATFORM_AUDIT_PORT,
      useClass: PrismaPlatformAuditRepository,
    },
    PlatformAuditInterceptor,
  ],
  exports: [PLATFORM_AUDIT_PORT, PlatformAuditInterceptor],
})
export class PlatformModule {}
