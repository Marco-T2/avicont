import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { MembershipsModule } from './memberships/memberships.module';
import { RbacModule } from './rbac/rbac.module';
import { AuditModule } from './audit/audit.module';
import { BillingModule } from './billing/billing.module';
import { CacheModule } from './cache/cache.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaService } from './common/prisma.service';
import { TenantContextService } from './common/tenant-context/tenant-context.service';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';

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
    HealthModule,
    NotificationsModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    MembershipsModule,
    RbacModule,
    AuditModule,
    BillingModule,
    FeatureFlagsModule,
  ],
  controllers: [],
  providers: [
    PrismaService,
    TenantContextService,
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
