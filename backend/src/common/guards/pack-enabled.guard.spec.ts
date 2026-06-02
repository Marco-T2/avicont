import { ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { OrgPacksReaderPort } from '@/packs/ports/org-packs.reader.port';
import { RedisService } from '@/cache/redis.service';
import { ForbiddenError, NotFoundError } from '@/common/errors';

import { PackEnabledGuard } from './pack-enabled.guard';

// --- helpers ---

function buildContext(overrides: {
  metadata?: string | undefined;
  activeTenantId?: string | undefined;
  tenantHeader?: string | undefined;
}): ExecutionContext {
  const user =
    overrides.activeTenantId !== undefined
      ? { activeTenantId: overrides.activeTenantId }
      : undefined;
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        headers: overrides.tenantHeader
          ? { 'x-tenant-id': overrides.tenantHeader }
          : ({} as Record<string, string>),
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeReflector(metadata: string | undefined): jest.Mocked<Reflector> {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(metadata),
  } as unknown as jest.Mocked<Reflector>;
}

function makePort(clavesActivas: string[]): jest.Mocked<OrgPacksReaderPort> {
  return {
    packsActivos: jest.fn().mockResolvedValue(clavesActivas),
    estaActivo: jest.fn(),
  } as unknown as jest.Mocked<OrgPacksReaderPort>;
}

function makeRedis(opts: {
  getValue?: string[] | null;
  getThrows?: boolean;
  setThrows?: boolean;
}): jest.Mocked<RedisService> {
  return {
    get: jest.fn(async () => {
      if (opts.getThrows) throw new Error('redis down');
      return opts.getValue ?? null;
    }),
    set: jest.fn(async () => {
      if (opts.setThrows) throw new Error('redis down');
    }),
  } as unknown as jest.Mocked<RedisService>;
}

function buildGuard(
  reflector: jest.Mocked<Reflector>,
  port: jest.Mocked<OrgPacksReaderPort>,
  redis: jest.Mocked<RedisService>,
): PackEnabledGuard {
  return new PackEnabledGuard(reflector, port, redis);
}

describe('PackEnabledGuard', () => {
  beforeAll(() => {
    // Silenciar el warn de fallo de cache en los tests que lo ejercitan.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('endpoint sin @RequirePack', () => {
    it('pasa transparente sin tocar puerto ni cache', async () => {
      const reflector = makeReflector(undefined);
      const port = makePort([]);
      const redis = makeRedis({});
      const guard = buildGuard(reflector, port, redis);

      const resultado = await guard.canActivate(
        buildContext({ metadata: undefined, activeTenantId: 'org-1' }),
      );

      expect(resultado).toBe(true);
      expect(port.packsActivos).not.toHaveBeenCalled();
      expect(redis.get).not.toHaveBeenCalled();
    });
  });

  describe('pack activo', () => {
    it('deja pasar cuando la clave requerida está entre los packs activos', async () => {
      const reflector = makeReflector('contabilidad.adjuntos');
      const port = makePort(['contabilidad.adjuntos']);
      const redis = makeRedis({ getValue: null });
      const guard = buildGuard(reflector, port, redis);

      const resultado = await guard.canActivate(buildContext({ activeTenantId: 'org-1' }));

      expect(resultado).toBe(true);
    });
  });

  describe('pack no activo', () => {
    it('rechaza con 404 (NotFoundError) cuando la clave NO está activa', async () => {
      const reflector = makeReflector('contabilidad.adjuntos');
      const port = makePort(['contabilidad.otro']);
      const redis = makeRedis({ getValue: null });
      const guard = buildGuard(reflector, port, redis);

      await expect(
        guard.canActivate(buildContext({ activeTenantId: 'org-1' })),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rechaza con 404 cuando la org no tiene ningún pack activo', async () => {
      const reflector = makeReflector('contabilidad.adjuntos');
      const port = makePort([]);
      const redis = makeRedis({ getValue: null });
      const guard = buildGuard(reflector, port, redis);

      await expect(
        guard.canActivate(buildContext({ activeTenantId: 'org-1' })),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('cache Redis', () => {
    it('hit de cache: NO consulta la BD', async () => {
      const reflector = makeReflector('contabilidad.adjuntos');
      const port = makePort([]);
      const redis = makeRedis({ getValue: ['contabilidad.adjuntos'] });
      const guard = buildGuard(reflector, port, redis);

      const resultado = await guard.canActivate(buildContext({ activeTenantId: 'org-1' }));

      expect(resultado).toBe(true);
      expect(redis.get).toHaveBeenCalledWith('org-packs:org-1');
      expect(port.packsActivos).not.toHaveBeenCalled();
    });

    it('miss de cache: lee la BD y cachea el resultado con TTL 300', async () => {
      const reflector = makeReflector('contabilidad.adjuntos');
      const port = makePort(['contabilidad.adjuntos']);
      const redis = makeRedis({ getValue: null });
      const guard = buildGuard(reflector, port, redis);

      const resultado = await guard.canActivate(buildContext({ activeTenantId: 'org-1' }));

      expect(resultado).toBe(true);
      expect(port.packsActivos).toHaveBeenCalledWith('org-1');
      expect(redis.set).toHaveBeenCalledWith('org-packs:org-1', ['contabilidad.adjuntos'], 300);
    });

    it('fallo de Redis GET: cae a BD (no fail-open) y deniega si el pack no está activo', async () => {
      const reflector = makeReflector('contabilidad.adjuntos');
      const port = makePort(['contabilidad.otro']);
      const redis = makeRedis({ getThrows: true });
      const guard = buildGuard(reflector, port, redis);

      await expect(
        guard.canActivate(buildContext({ activeTenantId: 'org-1' })),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(port.packsActivos).toHaveBeenCalledWith('org-1');
    });

    it('fallo de Redis SET tras leer BD: no rompe, deja pasar si el pack está activo', async () => {
      const reflector = makeReflector('contabilidad.adjuntos');
      const port = makePort(['contabilidad.adjuntos']);
      const redis = makeRedis({ getValue: null, setThrows: true });
      const guard = buildGuard(reflector, port, redis);

      const resultado = await guard.canActivate(buildContext({ activeTenantId: 'org-1' }));

      expect(resultado).toBe(true);
    });
  });

  describe('sin tenant en el request', () => {
    it('rechaza con 403 (ForbiddenError) cuando no hay activeTenantId', async () => {
      const reflector = makeReflector('contabilidad.adjuntos');
      const port = makePort([]);
      const redis = makeRedis({});
      const guard = buildGuard(reflector, port, redis);

      await expect(
        guard.canActivate(buildContext({ activeTenantId: undefined })),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('usa el header x-tenant-id como fallback (paridad con ModuleEnabledGuard)', async () => {
      const reflector = makeReflector('contabilidad.adjuntos');
      const port = makePort(['contabilidad.adjuntos']);
      const redis = makeRedis({ getValue: null });
      const guard = buildGuard(reflector, port, redis);

      const resultado = await guard.canActivate(
        buildContext({ activeTenantId: undefined, tenantHeader: 'org-hdr' }),
      );

      expect(resultado).toBe(true);
      expect(port.packsActivos).toHaveBeenCalledWith('org-hdr');
    });
  });
});
