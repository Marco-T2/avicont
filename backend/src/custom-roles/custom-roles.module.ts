import { Module } from '@nestjs/common';
import { CustomRolesService } from './custom-roles.service';
import { CustomRolesController } from './custom-roles.controller';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { RbacModule } from '../rbac/rbac.module';
import { CUSTOM_ROLE_REPOSITORY_PORT } from './ports/custom-role.repository.port';
import { CUSTOM_ROLES_READER_PORT } from './ports/custom-roles-reader.port';
import { PrismaCustomRoleRepository } from './adapters/prisma-custom-role.repository';
import { PrismaCustomRolesReaderAdapter } from './adapters/prisma-custom-roles-reader.adapter';

@Module({
  // PermissionsModule exporta CatalogoAsignableResolver: el candado de
  // validatePermissions filtra por vertical + packs (cierre deuda RBAC §7).
  imports: [RbacModule, PermissionsModule],
  controllers: [CustomRolesController],
  providers: [
    CustomRolesService,
    PrismaService,
    TenantContextService,
    {
      provide: CUSTOM_ROLE_REPOSITORY_PORT,
      useClass: PrismaCustomRoleRepository,
    },
    PrismaCustomRolesReaderAdapter,
    {
      provide: CUSTOM_ROLES_READER_PORT,
      useExisting: PrismaCustomRolesReaderAdapter,
    },
  ],
  exports: [CustomRolesService, CUSTOM_ROLES_READER_PORT],
})
export class CustomRolesModule {}
