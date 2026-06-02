import { ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { OrganizationStatus } from '@prisma/client';

import { OrgStatusReaderPort } from '@/common/ports/org-status-reader.port';
import { RedisService } from '@/cache/redis.service';
import { OrgStatusNoActivaError } from '@/common/errors';

import { OrgStatusGuard } from './org-status.guard';

// --- helpers ---

function buildJwtPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: 'user-1',
    email: 'user@test.com',
    activeTenantId: 'tenant-1',
    isSuperAdmin: false,
    iat: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

function buildContext(overrides: {
  method?: string;
  handlerMetadata?: unknown;
  classMetadata?: unknown;
  authHeader?: string;
}): ExecutionContext {
  const method = overrides.method ?? 'POST';
  const authHeader = overrides.authHeader ?? 'Bearer valid-token';
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        headers: { authorization: authHeader },
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

// --- mocks ---

function makeJwtService(payload: Record<string, unknown> | null): jest.Mocked<JwtService> {
  return {
    verify: jest.fn((_token: string) => {
      if (payload === null) throw new Error('invalid token');
      return payload;
    }),
  } as unknown as jest.Mocked<JwtService>;
}

function makePort(status: OrganizationStatus | null): jest.Mocked<OrgStatusReaderPort> {
  return {
    getStatus: jest.fn().mockResolvedValue(status),
  } as unknown as jest.Mocked<OrgStatusReaderPort>;
}

function makeRedis(
  cachedStatus: OrganizationStatus | null = null,
  failGet = false,
  failSet = false,
): jest.Mocked<RedisService> {
  return {
    get: jest.fn().mockImplementation(() => {
      if (failGet) return Promise.reject(new Error('Redis down'));
      return Promise.resolve(cachedStatus);
    }),
    set: jest.fn().mockImplementation(() => {
      if (failSet) return Promise.reject(new Error('Redis SET down'));
      return Promise.resolve(undefined);
    }),
  } as unknown as jest.Mocked<RedisService>;
}

function makeReflector(allow: boolean): jest.Mocked<Reflector> {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(allow ? true : undefined),
  } as unknown as jest.Mocked<Reflector>;
}

function buildGuard(
  jwt: jest.Mocked<JwtService>,
  port: jest.Mocked<OrgStatusReaderPort>,
  redis: jest.Mocked<RedisService>,
  reflector: jest.Mocked<Reflector> = makeReflector(false),
): OrgStatusGuard {
  const guard = new OrgStatusGuard(jwt, port, redis, reflector);
  // Silenciar logs en tests
  jest.spyOn(Logger.prototype, 'warn').mockReturnValue(undefined);
  return guard;
}

// --- tests ---

describe('OrgStatusGuard', () => {
  afterEach(() => jest.clearAllMocks());

  describe('lecturas (GET/HEAD/OPTIONS) — siempre transparente', () => {
    it.each(['GET', 'HEAD', 'OPTIONS'])(
      '[+] %s con org SUSPENDED → true (no bloquea lecturas)',
      async (method) => {
        const jwt = makeJwtService(buildJwtPayload({ isSuperAdmin: false }));
        const port = makePort('SUSPENDED');
        const redis = makeRedis(null);
        const guard = buildGuard(jwt, port, redis);

        const ctx = buildContext({ method });
        const result = await guard.canActivate(ctx);

        expect(result).toBe(true);
        expect(port.getStatus).not.toHaveBeenCalled();
      },
    );
  });

  describe('mutaciones con org ACTIVE — siempre pasan', () => {
    it('[+] POST con org ACTIVE → true', async () => {
      const jwt = makeJwtService(buildJwtPayload());
      const port = makePort('ACTIVE');
      const redis = makeRedis(null);
      const guard = buildGuard(jwt, port, redis);

      const ctx = buildContext({ method: 'POST' });
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
    });
  });

  describe('mutaciones con org no-ACTIVE — bloquea', () => {
    it('[-] POST con org SUSPENDED → lanza OrgStatusNoActivaError (status=SUSPENDED)', async () => {
      const jwt = makeJwtService(buildJwtPayload());
      const port = makePort('SUSPENDED');
      const redis = makeRedis(null);
      const guard = buildGuard(jwt, port, redis);

      const ctx = buildContext({ method: 'POST' });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(OrgStatusNoActivaError);
    });

    it('[-] POST con org SUSPENDED → details.status = "SUSPENDED"', async () => {
      const jwt = makeJwtService(buildJwtPayload());
      const port = makePort('SUSPENDED');
      const redis = makeRedis(null);
      const guard = buildGuard(jwt, port, redis);

      const ctx = buildContext({ method: 'POST' });
      try {
        await guard.canActivate(ctx);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(OrgStatusNoActivaError);
        expect((err as OrgStatusNoActivaError).details?.status).toBe('SUSPENDED');
      }
    });

    it('[-] DELETE con org ARCHIVED → lanza OrgStatusNoActivaError (status=ARCHIVED)', async () => {
      const jwt = makeJwtService(buildJwtPayload());
      const port = makePort('ARCHIVED');
      const redis = makeRedis(null);
      const guard = buildGuard(jwt, port, redis);

      const ctx = buildContext({ method: 'DELETE' });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(OrgStatusNoActivaError);
    });
  });

  describe('bypass: isSuperAdmin', () => {
    it('[+] SA con org SUSPENDED + POST → true (bypass total)', async () => {
      const jwt = makeJwtService(buildJwtPayload({ isSuperAdmin: true }));
      const port = makePort('SUSPENDED');
      const redis = makeRedis(null);
      const guard = buildGuard(jwt, port, redis);

      const ctx = buildContext({ method: 'POST' });
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(port.getStatus).not.toHaveBeenCalled();
    });
  });

  describe('bypass: sin token', () => {
    it('[+] sin Authorization header → true (transparente)', async () => {
      const jwt = makeJwtService(null);
      const port = makePort('SUSPENDED');
      const redis = makeRedis(null);
      const guard = buildGuard(jwt, port, redis);

      const ctx = buildContext({ method: 'POST', authHeader: '' });
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(port.getStatus).not.toHaveBeenCalled();
    });

    it('[+] JWT inválido → true (transparente, best-effort)', async () => {
      const jwt = makeJwtService(null); // verify lanza
      const port = makePort('SUSPENDED');
      const redis = makeRedis(null);
      const guard = buildGuard(jwt, port, redis);

      const ctx = buildContext({ method: 'POST', authHeader: 'Bearer bad-token' });
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(port.getStatus).not.toHaveBeenCalled();
    });
  });

  describe('bypass: sin tenantId en claims', () => {
    it('[+] token sin activeTenantId → true (transparente, ruta org-less)', async () => {
      const jwt = makeJwtService(buildJwtPayload({ activeTenantId: undefined }));
      const port = makePort('SUSPENDED');
      const redis = makeRedis(null);
      const guard = buildGuard(jwt, port, redis);

      const ctx = buildContext({ method: 'POST' });
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(port.getStatus).not.toHaveBeenCalled();
    });
  });

  describe('bypass: org inexistente (getStatus → null)', () => {
    it('[+] getStatus null → true (no bloquear)', async () => {
      const jwt = makeJwtService(buildJwtPayload());
      const port = makePort(null);
      const redis = makeRedis(null);
      const guard = buildGuard(jwt, port, redis);

      const ctx = buildContext({ method: 'POST' });
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
    });
  });

  describe('@AllowOnNonActiveOrg() decorator', () => {
    it('[+] decorator presente + org SUSPENDED + POST → true', async () => {
      const jwt = makeJwtService(buildJwtPayload());
      const port = makePort('SUSPENDED');
      const redis = makeRedis(null);
      const reflector = makeReflector(true); // decorator presente
      const guard = buildGuard(jwt, port, redis, reflector);

      const ctx = buildContext({ method: 'POST' });
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(port.getStatus).not.toHaveBeenCalled();
    });

    it('[-] decorator ausente + org SUSPENDED + POST → lanza', async () => {
      const jwt = makeJwtService(buildJwtPayload());
      const port = makePort('SUSPENDED');
      const redis = makeRedis(null);
      const reflector = makeReflector(false); // sin decorator
      const guard = buildGuard(jwt, port, redis, reflector);

      const ctx = buildContext({ method: 'POST' });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(OrgStatusNoActivaError);
    });
  });

  describe('cache', () => {
    it('[+] cache hit → devuelve ACTIVE sin llamar al port', async () => {
      const jwt = makeJwtService(buildJwtPayload());
      const port = makePort('SUSPENDED'); // el port dice SUSPENDED pero el cache dice ACTIVE
      const redis = makeRedis('ACTIVE'); // cache hit
      const guard = buildGuard(jwt, port, redis);

      const ctx = buildContext({ method: 'POST' });
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(port.getStatus).not.toHaveBeenCalled();
    });

    it('[+] cache miss → llama port, setea cache TTL 300s', async () => {
      const jwt = makeJwtService(buildJwtPayload());
      const port = makePort('ACTIVE');
      const redis = makeRedis(null); // cache miss
      const guard = buildGuard(jwt, port, redis);

      const ctx = buildContext({ method: 'POST' });
      await guard.canActivate(ctx);

      expect(port.getStatus).toHaveBeenCalledWith('tenant-1');
      expect(redis.set).toHaveBeenCalledWith('org-status:tenant-1', 'ACTIVE', 300);
    });

    it('[+] Redis falla en GET → logger.warn + fallback BD, no rompe request', async () => {
      const jwt = makeJwtService(buildJwtPayload());
      const port = makePort('ACTIVE');
      const redis = makeRedis(null, true); // Redis falla
      const guard = buildGuard(jwt, port, redis);

      const ctx = buildContext({ method: 'POST' });
      const result = await guard.canActivate(ctx);

      // No rompe el request
      expect(result).toBe(true);
      // Llamó al port como fallback
      expect(port.getStatus).toHaveBeenCalled();
    });

    it('[-] Redis SET falla + org SUSPENDED → guard igual lanza OrgStatusNoActivaError (fallo de caché no cambia la decisión)', async () => {
      const jwt = makeJwtService(buildJwtPayload());
      const port = makePort('SUSPENDED');
      // GET miss para forzar lectura desde BD; SET falla al intentar cachear
      const redis = makeRedis(null, false, true);
      const guard = buildGuard(jwt, port, redis);

      const ctx = buildContext({ method: 'POST' });

      // El fallo del SET no debe tragarse el bloqueo: la org sigue siendo SUSPENDED
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(OrgStatusNoActivaError);
      // Confirmamos que sí consultó BD (no hubo cache hit)
      expect(port.getStatus).toHaveBeenCalledWith('tenant-1');
      // Y que intentó hacer el SET (que falló silenciosamente)
      expect(redis.set).toHaveBeenCalled();
    });
  });
});
