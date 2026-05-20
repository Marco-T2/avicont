import { Module } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';
import { MembershipsReaderModule } from './memberships-reader.module';
import { PrismaMembershipRepository } from './adapters/prisma-membership.repository';
import { MEMBERSHIP_REPOSITORY_PORT } from './ports/membership.repository.port';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { RbacModule } from '../rbac/rbac.module';
import { CustomRolesModule } from '../custom-roles/custom-roles.module';
import { UsersModule } from '../users/users.module';

// `MEMBERSHIPS_READER_PORT` se bindea en `MembershipsReaderModule` (leaf) y se
// re-exporta acá para los consumidores que importan el módulo completo (auth,
// impersonation, tenants). `UsersModule` lo consume directo del leaf, sin tirar
// del require de este módulo — eso rompe el ciclo de carga CJS memberships↔users
// que crasheaba el bootstrap del build de prod.
//
// La dirección memberships→users se conserva: el servicio consume
// USERS_READER_PORT en el flujo de invitación.
@Module({
  imports: [RbacModule, CustomRolesModule, UsersModule, MembershipsReaderModule],
  controllers: [MembershipsController],
  providers: [
    MembershipsService,
    PrismaService,
    TenantContextService,
    PrismaMembershipRepository,
    { provide: MEMBERSHIP_REPOSITORY_PORT, useExisting: PrismaMembershipRepository },
  ],
  exports: [MembershipsReaderModule],
})
export class MembershipsModule {}
