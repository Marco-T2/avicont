import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PrismaService, TenantContextService],
  exports: [UsersService],
})
export class UsersModule {}
