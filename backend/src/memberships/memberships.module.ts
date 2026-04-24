import { Module } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';
import { MembershipsReaderAdapter } from './adapters/memberships-reader.adapter';
import { MEMBERSHIPS_READER_PORT } from './ports/memberships-reader.port';
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
  ],
  exports: [MembershipsService, MEMBERSHIPS_READER_PORT],
})
export class MembershipsModule {}
