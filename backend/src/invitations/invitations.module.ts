import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InvitationsService } from './invitations.service';
import { InvitationsController } from './invitations.controller';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { RbacModule } from '../rbac/rbac.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CustomRolesModule } from '../custom-roles/custom-roles.module';
import { INVITATION_REPOSITORY_PORT } from './ports/invitation.repository.port';
import { PrismaInvitationRepository } from './adapters/prisma-invitation.repository';

@Module({
  imports: [ConfigModule, RbacModule, NotificationsModule, CustomRolesModule],
  controllers: [InvitationsController],
  providers: [
    InvitationsService,
    PrismaService,
    TenantContextService,
    {
      provide: INVITATION_REPOSITORY_PORT,
      useClass: PrismaInvitationRepository,
    },
  ],
  exports: [InvitationsService],
})
export class InvitationsModule {}
