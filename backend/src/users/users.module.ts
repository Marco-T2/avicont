import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { PrismaUserRepository } from './adapters/prisma-user.repository';
import { PrismaUsersReaderAdapter } from './adapters/users-reader.adapter';
import { PrismaUsersWriterAdapter } from './adapters/users-writer.adapter';
import { USER_REPOSITORY_PORT } from './ports/user.repository.port';
import { USERS_READER_PORT } from './ports/users-reader.port';
import { USERS_WRITER_PORT } from './ports/users-writer.port';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    PrismaService,
    TenantContextService,
    PrismaUserRepository,
    PrismaUsersReaderAdapter,
    PrismaUsersWriterAdapter,
    { provide: USER_REPOSITORY_PORT, useExisting: PrismaUserRepository },
    { provide: USERS_READER_PORT, useExisting: PrismaUsersReaderAdapter },
    { provide: USERS_WRITER_PORT, useExisting: PrismaUsersWriterAdapter },
  ],
  exports: [UsersService, USERS_READER_PORT, USERS_WRITER_PORT],
})
export class UsersModule {}
