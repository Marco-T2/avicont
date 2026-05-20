import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';

import { MembershipsReaderAdapter } from './adapters/memberships-reader.adapter';
import { MEMBERSHIPS_READER_PORT } from './ports/memberships-reader.port';

// Módulo-puerto cross-módulo: expone SOLO el binding de `MEMBERSHIPS_READER_PORT`
// (consumido por users, auth, impersonation, tenants). `UsersModule` lo importa
// de acá en vez de `MembershipsModule` para no tirar del require de
// `memberships.module.ts` — eso cerraba el ciclo de carga CJS memberships↔users
// que rompía el bootstrap del build de prod. El adapter sólo necesita
// `PrismaService`, así que el módulo es leaf.
@Module({
  providers: [
    PrismaService,
    TenantContextService,
    MembershipsReaderAdapter,
    { provide: MEMBERSHIPS_READER_PORT, useExisting: MembershipsReaderAdapter },
  ],
  exports: [MEMBERSHIPS_READER_PORT],
})
export class MembershipsReaderModule {}
