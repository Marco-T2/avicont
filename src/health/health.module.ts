import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [PrismaService, TenantContextService],
})
export class HealthModule {}
