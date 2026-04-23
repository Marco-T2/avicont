import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ImpersonationService } from './impersonation.service';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationAuditInterceptor } from './interceptors/impersonation-audit.interceptor';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { IMPERSONATION_REPOSITORY_PORT } from './ports/impersonation.repository.port';
import { PrismaImpersonationRepository } from './adapters/prisma-impersonation.repository';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret:
          config.get<string>('JWT_ACCESS_SECRET') || 'fallback-secret-change-in-production',
        signOptions: {
          expiresIn: config.get<string>('JWT_ACCESS_EXPIRES_IN', '1h') as `${number}${'m' | 'h' | 'd' | 's'}`,
        },
      }),
    }),
  ],
  controllers: [ImpersonationController],
  providers: [
    ImpersonationService,
    PrismaService,
    TenantContextService,
    ImpersonationAuditInterceptor,
    {
      provide: IMPERSONATION_REPOSITORY_PORT,
      useClass: PrismaImpersonationRepository,
    },
  ],
  exports: [ImpersonationService, ImpersonationAuditInterceptor],
})
export class ImpersonationModule {}
