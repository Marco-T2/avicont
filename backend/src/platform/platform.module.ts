import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { PlatformAuditInterceptor } from '@/audit/platform-audit.interceptor';
import { CuentasModule } from '@/cuentas/cuentas.module';
import { TiposDocumentoFisicoModule } from '@/tipos-documento-fisico/tipos-documento-fisico.module';
import { GranjaModule } from '@/granja/granja.module';
import { UsersModule } from '@/users/users.module';
import { MembershipsReaderModule } from '@/memberships/memberships-reader.module';
import { PacksModule } from '@/packs/pack.module';

import { PLATFORM_AUDIT_PORT } from './ports/platform-audit.port';
import { PrismaPlatformAuditRepository } from './adapters/prisma-platform-audit.repository';
import { ORGS_READER_PORT } from './ports/orgs-reader.port';
import { PrismaOrgsReaderAdapter } from '@/tenants/adapters/prisma-orgs-reader.adapter';
import { ORGS_WRITER_PORT } from './ports/orgs-writer.port';
import { PrismaOrgsWriterAdapter } from '@/tenants/adapters/prisma-orgs-writer.adapter';
import { PLATFORM_STATS_READER_PORT } from './ports/platform-stats-reader.port';
import { PrismaPlatformStatsReaderAdapter } from '@/tenants/adapters/prisma-platform-stats-reader.adapter';
import { PLATFORM_ACTIVITY_READER_PORT } from './ports/platform-activity-reader.port';
import { PrismaPlatformActivityReaderAdapter } from './adapters/prisma-platform-activity-reader.adapter';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformAdminController } from './platform-admin.controller';

/**
 * Módulo de administración de plataforma (super-admin).
 *
 * Registra:
 * - PlatformAuditInterceptor + su repositorio (Slice 4 — ya existía).
 * - OrgsReaderPort y OrgsWriterPort: adapters implementados en el módulo
 *   `tenants` (dueño del dominio Organization). Los adapters se registran acá
 *   con sus tokens para no cruzar módulos directamente (CLAUDE.md §3.3).
 *   La membership OWNER se crea en el mismo nested write que la org
 *   (ver PrismaOrgsWriterAdapter.create).
 * - PlatformAdminService y PlatformAdminController (Slice 6a).
 *
 * ClockPort ya es global (ClockModule) — no se re-registra acá.
 */
@Module({
  imports: [
    // Proveen los seeder ports que PlatformAdminService usa al crear orgs
    CuentasModule,
    TiposDocumentoFisicoModule,
    GranjaModule,
    // Provee USERS_READER_PORT para resolver ownerEmail → userId
    UsersModule,
    // Provee MEMBERSHIPS_READER_PORT para listar miembros cross-tenant (REQ-PM-01)
    MembershipsReaderModule,
    // Provee PackService (eje 2): el super-admin habilita/revoca entitlement.
    // La lógica de dominio (vertical, cache, escritura) vive en packs/.
    PacksModule,
  ],
  controllers: [PlatformAdminController],
  providers: [
    PrismaService,
    TenantContextService,

    // Auditoría de plataforma (Slice 4)
    {
      provide: PLATFORM_AUDIT_PORT,
      useClass: PrismaPlatformAuditRepository,
    },
    PlatformAuditInterceptor,

    // Ports cross-module: adapter de lectura de orgs (dueño: tenants)
    PrismaOrgsReaderAdapter,
    { provide: ORGS_READER_PORT, useExisting: PrismaOrgsReaderAdapter },

    // Ports cross-module: adapter de escritura de orgs (dueño: tenants)
    PrismaOrgsWriterAdapter,
    { provide: ORGS_WRITER_PORT, useExisting: PrismaOrgsWriterAdapter },

    // Port de stats de plataforma (dueño: tenants — dueño de Organization).
    // El adapter agrega cross-tenant, enforcement en SuperAdminGuard (Anti-31 deliberada).
    PrismaPlatformStatsReaderAdapter,
    { provide: PLATFORM_STATS_READER_PORT, useExisting: PrismaPlatformStatsReaderAdapter },

    // Port de actividad de plataforma (lectura de platform_audit).
    // Separado de PlatformAuditPort que es write-only (REQ-PCT-06).
    PrismaPlatformActivityReaderAdapter,
    { provide: PLATFORM_ACTIVITY_READER_PORT, useExisting: PrismaPlatformActivityReaderAdapter },

    PlatformAdminService,
  ],
  exports: [PLATFORM_AUDIT_PORT, PlatformAuditInterceptor],
})
export class PlatformModule {}
