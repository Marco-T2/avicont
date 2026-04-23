import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface JwtPayload {
  sub: string;
  email: string;
  activeTenantId?: string;
  roles?: string[];
  // Presentes solo en tokens de impersonation (ver ImpersonationService).
  impersonatedBy?: string;
  impersonationId?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException('Email already in use');
    }
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        hashedPassword,
        displayName: dto.displayName,
      },
    });
    return { id: user.id, email: user.email };
  }

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const isMatch = await bcrypt.compare(password, user.hashedPassword);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.validateUser(dto.email, dto.password);
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, deactivatedAt: null },
      include: {
        organization: true,
        customRole: { select: { slug: true, permissions: true } },
      },
    });

    const activeTenantId = memberships[0]?.organizationId;
    const roles = this.extractRolesForTenant(memberships, activeTenantId);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      activeTenantId,
      roles,
    };

    const accessToken = this.jwtService.sign(payload);
    // Login = nueva familia de refresh tokens. Detección de reuso (CLAUDE.md §5.3)
    // pendiente de implementar en Fase 0.6; por ahora sólo persistimos familyId.
    const refreshToken = await this.createRefreshToken(user.id, activeTenantId);

    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    const hash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: hash, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!stored) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotación: marcar el viejo como revocado.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), revokedReason: 'rotated' },
    });

    const activeTenantId = stored.organizationId ?? undefined;
    const memberships = await this.prisma.membership.findMany({
      where: { userId: stored.userId, deactivatedAt: null },
      include: { customRole: { select: { slug: true, permissions: true } } },
    });
    const roles = this.extractRolesForTenant(memberships, activeTenantId);

    const payload: JwtPayload = {
      sub: stored.userId,
      email: stored.user.email,
      activeTenantId,
      roles,
    };

    const accessToken = this.jwtService.sign(payload);
    // Rotación preserva la familia del token anterior.
    const newRefreshToken = await this.createRefreshToken(
      stored.userId,
      activeTenantId,
      stored.familyId,
    );

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string) {
    const hash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash },
      data: { revokedAt: new Date(), revokedReason: 'logout' },
    });
  }

  async switchTenant(userId: string, tenantId: string): Promise<TokenPair> {
    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: tenantId, userId } },
      include: {
        user: true,
        organization: true,
        customRole: { select: { slug: true, permissions: true } },
      },
    });
    if (!membership || membership.deactivatedAt) {
      throw new UnauthorizedException('Not a member of this tenant');
    }

    const roles = this.extractRolesForTenant([membership], tenantId);

    const payload: JwtPayload = {
      sub: userId,
      email: membership.user.email,
      activeTenantId: tenantId,
      roles,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.createRefreshToken(userId, tenantId);

    return { accessToken, refreshToken };
  }

  // Extrae los "roles" del usuario en un tenant dado, como array de strings.
  // - Si el membership tiene systemRole (OWNER/ADMIN), se emite ese string.
  // - Si tiene customRole, se emite el slug (ej "contador", "granjero").
  // Esto alimenta el claim `roles` del JWT. El guard resuelve permisos reales
  // consultando BD (ver Fase 0.6).
  private extractRolesForTenant(
    memberships: Array<{
      organizationId: string;
      systemRole: string | null;
      customRole?: { slug: string } | null;
    }>,
    activeTenantId: string | undefined,
  ): string[] {
    if (!activeTenantId) return [];
    return memberships
      .filter((m) => m.organizationId === activeTenantId)
      .map((m) => m.systemRole ?? m.customRole?.slug ?? null)
      .filter((r): r is string => r !== null);
  }

  private async createRefreshToken(
    userId: string,
    tenantId?: string,
    familyId?: string,
  ): Promise<string> {
    const raw = crypto.randomBytes(32).toString('hex');
    const hash = this.hashToken(raw);
    const expiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d');
    const expiresAt = new Date(Date.now() + this.parseDuration(expiresIn));
    const family = familyId ?? crypto.randomUUID();

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: hash,
        userId,
        organizationId: tenantId,
        familyId: family,
        expiresAt,
      },
    });

    return raw;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 30 * 24 * 60 * 60 * 1000;
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
