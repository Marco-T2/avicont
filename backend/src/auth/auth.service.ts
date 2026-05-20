import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import {
  MEMBERSHIPS_READER_PORT,
  type MembershipActivaParaAuth,
  type MembershipsReaderPort,
} from '../memberships/ports/memberships-reader.port';
import { USERS_READER_PORT, type UsersReaderPort } from '../users/ports/users-reader.port';
import { USERS_WRITER_PORT, type UsersWriterPort } from '../users/ports/users-writer.port';
import {
  CredencialesInvalidasError,
  NoMiembroDeTenantError,
  TokenInvalidoError,
} from './domain/auth-errors';
import { JwtClaims, type JwtPayload } from './domain/jwt-claims';
import { RefreshTokenHash } from './domain/refresh-token-hash';
import { TokenFamily } from './domain/token-family';
import {
  CREDENTIALS_REPOSITORY_PORT,
  type CredentialsRepositoryPort,
} from './ports/credentials.repository.port';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

import * as crypto from 'crypto';

export type { JwtPayload };

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(USERS_READER_PORT) private readonly usersReader: UsersReaderPort,
    @Inject(USERS_WRITER_PORT) private readonly usersWriter: UsersWriterPort,
    @Inject(CREDENTIALS_REPOSITORY_PORT)
    private readonly credentials: CredentialsRepositoryPort,
    @Inject(MEMBERSHIPS_READER_PORT)
    private readonly memberships: MembershipsReaderPort,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersReader.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException('Email already in use');
    }
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    return this.usersWriter.create({
      email: dto.email,
      hashedPassword,
      ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
    });
  }

  async validateUser(email: string, password: string) {
    const user = await this.usersReader.findByEmail(email);
    if (!user) {
      throw new CredencialesInvalidasError();
    }
    const isMatch = await bcrypt.compare(password, user.hashedPassword);
    if (!isMatch) {
      throw new CredencialesInvalidasError();
    }
    // Mensaje genérico para no filtrar el estado del usuario al atacante.
    if (!user.isActive) {
      throw new CredencialesInvalidasError();
    }
    return user;
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.validateUser(dto.email, dto.password);
    const memberships = await this.memberships.findActivasByUserId(user.id);

    const activeTenantId = memberships[0]?.organizationId;
    const roles = this.extractRolesForTenant(memberships, activeTenantId);

    const claims = JwtClaims.forUser({
      userId: user.id,
      email: user.email,
      ...(activeTenantId !== undefined ? { activeTenantId } : {}),
      roles,
    });

    const accessToken = this.jwtService.sign(claims.toPayload());
    // Login = nueva familia de refresh tokens. Detección de reuso (CLAUDE.md §5.3)
    // pendiente de implementar en Fase 0.6; por ahora sólo persistimos familyId.
    const refreshToken = await this.createRefreshToken(user.id, activeTenantId);

    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    const hash = RefreshTokenHash.fromRaw(refreshToken);
    const stored = await this.credentials.findActiveByHash(hash.toString());
    if (!stored) {
      throw new TokenInvalidoError();
    }

    // Rotación: marcar el viejo como revocado.
    await this.credentials.revokeById(stored.id, 'rotated');

    const activeTenantId = stored.organizationId ?? undefined;
    const memberships = await this.memberships.findActivasByUserId(stored.userId);
    const roles = this.extractRolesForTenant(memberships, activeTenantId);

    const claims = JwtClaims.forUser({
      userId: stored.userId,
      email: stored.userEmail,
      ...(activeTenantId !== undefined ? { activeTenantId } : {}),
      roles,
    });

    const accessToken = this.jwtService.sign(claims.toPayload());
    // Rotación preserva la familia del token anterior.
    const newRefreshToken = await this.createRefreshToken(
      stored.userId,
      activeTenantId,
      TokenFamily.of(stored.familyId),
    );

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string) {
    const hash = RefreshTokenHash.fromRaw(refreshToken);
    await this.credentials.revokeByHash(hash.toString(), 'logout');
  }

  async switchTenant(userId: string, tenantId: string): Promise<TokenPair> {
    const membership = await this.memberships.findActivaByUserAndTenant(userId, tenantId);
    if (!membership) {
      throw new NoMiembroDeTenantError(tenantId);
    }

    const roles = this.extractRolesForTenant([membership], tenantId);

    const claims = JwtClaims.forUser({
      userId,
      email: membership.userEmail,
      activeTenantId: tenantId,
      roles,
    });

    const accessToken = this.jwtService.sign(claims.toPayload());
    const refreshToken = await this.createRefreshToken(userId, tenantId);

    return { accessToken, refreshToken };
  }

  // Extrae los "roles" del usuario en un tenant dado, como array de strings.
  // - Si el membership tiene systemRole (OWNER/ADMIN), se emite ese string.
  // - Si tiene customRole, se emite el slug (ej "contador", "granjero").
  // Esto alimenta el claim `roles` del JWT. El guard resuelve permisos reales
  // consultando BD (ver Fase 0.6).
  private extractRolesForTenant(
    memberships: MembershipActivaParaAuth[],
    activeTenantId: string | undefined,
  ): string[] {
    if (!activeTenantId) return [];
    return memberships
      .filter((m) => m.organizationId === activeTenantId)
      .map((m) => m.systemRole ?? m.customRoleSlug)
      .filter((r): r is string => r !== null);
  }

  private async createRefreshToken(
    userId: string,
    tenantId?: string,
    family?: TokenFamily,
  ): Promise<string> {
    const raw = crypto.randomBytes(32).toString('hex');
    const hash = RefreshTokenHash.fromRaw(raw);
    const expiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d');
    const expiresAt = new Date(Date.now() + this.parseDuration(expiresIn));
    const tokenFamily = family ?? TokenFamily.generate();

    await this.credentials.create({
      tokenHash: hash.toString(),
      userId,
      ...(tenantId !== undefined ? { organizationId: tenantId } : {}),
      familyId: tokenFamily.toString(),
      expiresAt,
    });

    return raw;
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match || !match[1] || !match[2]) return 30 * 24 * 60 * 60 * 1000;
    const value = parseInt(match[1], 10);
    switch (match[2]) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 30 * 24 * 60 * 60 * 1000;
    }
  }
}
