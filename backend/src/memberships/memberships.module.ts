import { Module } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';
import { MembershipsReaderAdapter } from './adapters/memberships-reader.adapter';
import { PrismaMembershipRepository } from './adapters/prisma-membership.repository';
import { MEMBERSHIPS_READER_PORT } from './ports/memberships-reader.port';
import { MEMBERSHIP_REPOSITORY_PORT } from './ports/membership.repository.port';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [RbacModule],
  controllers: [MembershipsController],
  providers: [
    MembershipsService,
    PrismaService,
    TenantContextService,
    MembershipsReaderAdapter,
    { provide: MEMBERSHIPS_READER_PORT, useExisting: MembershipsReaderAdapter },
    PrismaMembershipRepository,
    { provide: MEMBERSHIP_REPOSITORY_PORT, useExisting: PrismaMembershipRepository },
  ],
  exports: [MembershipsService, MEMBERSHIPS_READER_PORT],
})
export class MembershipsModule {}
