import { Module } from '@nestjs/common';
import { CustomRolesService } from './custom-roles.service';
import { CustomRolesController } from './custom-roles.controller';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { RbacModule } from '../rbac/rbac.module';
import { CUSTOM_ROLE_REPOSITORY_PORT } from './ports/custom-role.repository.port';
import { PrismaCustomRoleRepository } from './adapters/prisma-custom-role.repository';

@Module({
  imports: [RbacModule],
  controllers: [CustomRolesController],
  providers: [
    CustomRolesService,
    PrismaService,
    TenantContextService,
    {
      provide: CUSTOM_ROLE_REPOSITORY_PORT,
      useClass: PrismaCustomRoleRepository,
    },
  ],
  exports: [CustomRolesService],
})
export class CustomRolesModule {}
