import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { OrganizationStatus } from '@prisma/client';

import { RedisService } from '@/cache/redis.service';
import { ALLOW_ON_NON_ACTIVE_ORG_KEY } from '@/common/decorators/allow-on-non-active-org.decorator';
import { OrgStatusNoActivaError } from '@/common/errors';
import { ORG_STATUS_READER_PORT, OrgStatusReaderPort } from '@/common/ports/org-status-reader.port';

const CACHE_TTL_SECONDS = 300;
const READONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Guard global que bloquea mutaciones (POST/PUT/PATCH/DELETE) cuando la org
// activa del request tiene status distinto de ACTIVE.
//
// Registrado como APP_GUARD en AppModule. Corre antes de los guards de controller
// (AuthGuard, TenantGuard, etc.). El diseño es best-effort: sin token o token
// inválido → transparente (no rompe /auth/login|register|refresh).
@Injectable()
export class OrgStatusGuard implements CanActivate {
  private readonly logger = new Logger(OrgStatusGuard.name);

  constructor(
    private readonly jwt: JwtService,
    @Inject(ORG_STATUS_READER_PORT) private readonly orgStatusReader: OrgStatusReaderPort,
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      headers: { authorization?: string };
    }>();

    if (READONLY_METHODS.has(request.method)) return true;

    const token = this.extractToken(request.headers.authorization);
    if (!token) return true;

    const payload = this.decodeToken(token);
    if (!payload) return true;

    if (payload.isSuperAdmin === true) return true;

    const tenantId = payload.activeTenantId;
    if (!tenantId) return true;

    const allowed = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOW_ON_NON_ACTIVE_ORG_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed === true) return true;

    const status = await this.resolveStatus(tenantId);
    if (status === null) return true;
    if (status !== 'ACTIVE') throw new OrgStatusNoActivaError({ status });

    return true;
  }

  private extractToken(authorization: string | undefined): string | null {
    if (!authorization) return null;
    const parts = authorization.split(' ');
    if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') return null;
    return parts[1] ?? null;
  }

  private decodeToken(token: string): { activeTenantId?: string; isSuperAdmin?: boolean } | null {
    try {
      return this.jwt.verify<{ activeTenantId?: string; isSuperAdmin?: boolean }>(token);
    } catch {
      return null;
    }
  }

  private async resolveStatus(tenantId: string): Promise<OrganizationStatus | null> {
    const cacheKey = `org-status:${tenantId}`;

    try {
      const cached = await this.redis.get<OrganizationStatus>(cacheKey);
      if (cached !== null) return cached;
    } catch (err) {
      this.logger.warn(`Cache GET org-status failed: ${(err as Error).message}`);
    }

    const status = await this.orgStatusReader.getStatus(tenantId);
    if (status === null) return null;

    try {
      await this.redis.set(cacheKey, status, CACHE_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`Cache SET org-status failed: ${(err as Error).message}`);
    }

    return status;
  }
}
