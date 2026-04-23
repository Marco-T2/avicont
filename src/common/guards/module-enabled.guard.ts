import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../../cache/redis.service';
import {
  FeatureModule,
  REQUIRE_MODULE_KEY,
} from '../decorators/require-module.decorator';

const CACHE_TTL_SECONDS = 5 * 60;

interface CachedFeatures {
  contabilidadEnabled: boolean;
  granjaEnabled: boolean;
}

// Guard que rechaza requests a endpoints de un módulo deshabilitado para la
// organización activa. Decoración requerida: @RequireModule('contabilidad'|'granja').
//
// Pensado para registrarse a nivel global. Endpoints sin @RequireModule pasan
// transparentemente.
@Injectable()
export class ModuleEnabledGuard implements CanActivate {
  private readonly logger = new Logger(ModuleEnabledGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<FeatureModule | undefined>(
      REQUIRE_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { activeTenantId?: string } | undefined;
    const tenantId =
      (request.headers['x-tenant-id'] as string | undefined) || user?.activeTenantId;
    if (!tenantId) {
      throw new ForbiddenException('Se requiere contexto de organización');
    }

    const features = await this.getFeatures(tenantId);
    const enabled =
      required === 'contabilidad' ? features.contabilidadEnabled : features.granjaEnabled;

    if (!enabled) {
      // 404 deliberado: el módulo "no existe" para esta org.
      throw new NotFoundException();
    }
    return true;
  }

  private async getFeatures(organizationId: string): Promise<CachedFeatures> {
    const cacheKey = `org-features:${organizationId}`;

    try {
      const cached = await this.redis.get<CachedFeatures>(cacheKey);
      if (cached) return cached;
    } catch (err) {
      this.logger.warn(`Cache GET features failed: ${(err as Error).message}`);
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { contabilidadEnabled: true, granjaEnabled: true },
    });
    if (!org) {
      // Si la org no existe, también 404 — sin filtrar la diferencia.
      throw new NotFoundException();
    }

    try {
      await this.redis.set(cacheKey, org, CACHE_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`Cache SET features failed: ${(err as Error).message}`);
    }
    return org;
  }
}
