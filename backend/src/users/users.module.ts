import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { PrismaUserRepository } from './adapters/prisma-user.repository';
import { USER_REPOSITORY_PORT } from './ports/user.repository.port';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    PrismaService,
    TenantContextService,
    PrismaUserRepository,
    { provide: USER_REPOSITORY_PORT, useExisting: PrismaUserRepository },
  ],
  exports: [UsersService],
})
export class UsersModule {}
