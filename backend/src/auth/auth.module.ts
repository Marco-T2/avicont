import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaCredentialsRepository } from './adapters/prisma-credentials.repository';
import { CREDENTIALS_REPOSITORY_PORT } from './ports/credentials.repository.port';
import { MembershipsModule } from '../memberships/memberships.module';
import { UsersModule } from '../users/users.module';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET') || 'fallback-secret-change-in-production',
        signOptions: { expiresIn: '15m' },
      }),
    }),
    UsersModule,
    MembershipsModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    PrismaService,
    TenantContextService,
    PrismaCredentialsRepository,
    { provide: CREDENTIALS_REPOSITORY_PORT, useExisting: PrismaCredentialsRepository },
  ],
  exports: [AuthService],
})
export class AuthModule {}
