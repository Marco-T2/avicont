import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { MembershipsModule } from './memberships/memberships.module';
import { RbacModule } from './rbac/rbac.module';
import { CustomRolesModule } from './custom-roles/custom-roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { AuditModule } from './audit/audit.module';
import { BillingModule } from './billing/billing.module';
import { CacheModule } from './cache/cache.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { HealthModule } from './health/health.module';
import { LoggerModule } from './logger/logger.module';
import { MetricsModule } from './metrics/metrics.module';
import { TracingModule } from './tracing/tracing.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaService } from './common/prisma.service';
import { TenantContextService } from './common/tenant-context/tenant-context.service';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { HttpMetricsInterceptor } from './metrics/interceptors/http-metrics.interceptor';
import { HttpLoggingInterceptor } from './logger/interceptors/http-logging.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('RATE_LIMIT_TTL', 60) * 1000,
          limit: config.get<number>('RATE_LIMIT_LIMIT', 100),
        },
      ],
    }),
    CacheModule,
    LoggerModule,
    MetricsModule,
    TracingModule,
    HealthModule,
    NotificationsModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    MembershipsModule,
    RbacModule,
    CustomRolesModule,
    PermissionsModule,
    AuditModule,
    BillingModule,
    FeatureFlagsModule,
  ],
  controllers: [],
  providers: [
    PrismaService,
    TenantContextService,
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
