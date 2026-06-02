import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RedisService } from '@/cache/redis.service';
import { OrgPacksReaderPort, ORG_PACKS_READER_PORT } from '@/packs/ports/org-packs.reader.port';
import { ForbiddenError } from '@/common/errors';
import { PackNoEncontradoError } from '@/packs/domain/pack-errors';

import { REQUIRE_PACK_KEY } from '../decorators/require-pack.decorator';

const CACHE_TTL_SECONDS = 5 * 60;

// Guard que rechaza requests a endpoints de un PACK opcional que NO está activo
// para la organización del request. Decoración requerida: @RequirePack('<clave>').
//
// Se registra a nivel de controller en @UseGuards, DESPUÉS de AuthGuard('jwt')
// (necesita req.user.activeTenantId, que solo existe tras autenticar) y ANTES de
// PermissionsGuard (un 404 de pack apagado debe ganarle al 403 de permiso, para
// no revelar que el endpoint existe). Endpoints sin @RequirePack pasan transparentes.
//
// Espejo EXACTO de ModuleEnabledGuard (eje 1 / vertical), pero ORTOGONAL: este
// guard decide SOLO "este pack está activo para la org" (visibilidad de la
// feature). NO toca Organization.status ni mutaciones — de eso se encarga
// OrgStatusGuard, cadena independiente (regla 3 del diseño packs-eje2 §8).
@Injectable()
export class PackEnabledGuard implements CanActivate {
  private readonly logger = new Logger(PackEnabledGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(ORG_PACKS_READER_PORT)
    private readonly orgPacks: OrgPacksReaderPort,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const claveRequerida = this.reflector.getAllAndOverride<string | undefined>(REQUIRE_PACK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!claveRequerida) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { activeTenantId?: string } | undefined;
    const tenantId = (request.headers['x-tenant-id'] as string | undefined) || user?.activeTenantId;
    if (!tenantId) {
      throw new ForbiddenError('PACK_SIN_CONTEXTO_ORG', 'Se requiere contexto de organización');
    }

    const clavesActivas = await this.getPacksActivos(tenantId);
    if (!clavesActivas.includes(claveRequerida)) {
      // 404 deliberado: el pack "no existe" para esta org (no se revela que
      // existe pero está apagado). Mismo patrón que ModuleEnabledGuard.
      throw new PackNoEncontradoError({ clave: claveRequerida });
    }
    return true;
  }

  // Resuelve las claves de packs activos de la org con cache Redis (TTL 300).
  // En miss, o ante fallo de Redis, cae a la BD (fuente de verdad, vía el puerto)
  // — NO fail-open: si no se puede confirmar que el pack está activo, se deniega.
  private async getPacksActivos(organizationId: string): Promise<string[]> {
    const cacheKey = `org-packs:${organizationId}`;

    try {
      const cached = await this.redis.get<string[]>(cacheKey);
      if (cached) return cached;
    } catch (err) {
      this.logger.warn(`Cache GET packs failed: ${(err as Error).message}`);
    }

    const clavesActivas = await this.orgPacks.packsActivos(organizationId);

    try {
      await this.redis.set(cacheKey, clavesActivas, CACHE_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`Cache SET packs failed: ${(err as Error).message}`);
    }
    return clavesActivas;
  }
}
