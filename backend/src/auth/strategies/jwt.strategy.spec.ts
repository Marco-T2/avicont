import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import type { JwtPayload } from '../domain/jwt-claims';
import type { RedisService } from '@/cache/redis.service';
import type { ClockPort } from '@/common/clock/clock.port';

/**
 * Mock mínimo de RedisService — solo los métodos que JwtStrategy usa.
 */
function makeRedis(getResult: string | null = null): jest.Mocked<Pick<RedisService, 'get'>> {
  return {
    get: jest.fn().mockResolvedValue(getResult),
  };
}

/**
 * Mock mínimo de ClockPort — solo `now()`.
 */
function makeClock(nowMs: number): jest.Mocked<Pick<ClockPort, 'now'>> {
  return {
    now: jest.fn().mockReturnValue(new Date(nowMs)),
  };
}

function buildStrategy(
  redis: jest.Mocked<Pick<RedisService, 'get'>>,
  clock: jest.Mocked<Pick<ClockPort, 'now'>>,
): JwtStrategy {
  // Usamos el constructor que acepta deps sin levantar NestJS.
  return new JwtStrategy(
    {
      get: (key: string, def?: string) => (key === 'JWT_ACCESS_SECRET' ? 'test-secret' : def),
    } as unknown as import('@nestjs/config').ConfigService,
    redis as unknown as RedisService,
    clock as unknown as ClockPort,
  );
}

describe('REQ-SA-02: JwtStrategy.validate propaga isSuperAdmin', () => {
  const basePayload: JwtPayload = {
    sub: 'user-abc',
    email: 'user@avicont.bo',
    iat: 1000, // segundos — simulación de JWT
  } as unknown as JwtPayload;

  describe('propagación del claim', () => {
    it('super-admin: isSuperAdmin normaliza a true en req.user', async () => {
      const redis = makeRedis(null); // sin revocación
      const clock = makeClock(Date.now());
      const strategy = buildStrategy(redis, clock);

      const result = await strategy.validate({ ...basePayload, isSuperAdmin: true });

      expect(result.isSuperAdmin).toBe(true);
    });

    it('usuario regular: isSuperAdmin normaliza a false aunque el campo esté ausente', async () => {
      const redis = makeRedis(null);
      const clock = makeClock(Date.now());
      const strategy = buildStrategy(redis, clock);

      const result = await strategy.validate({ ...basePayload });

      expect(result.isSuperAdmin).toBe(false);
    });
  });

  describe('revocación por epoch generalizada (REQ-LA-01, REQ-LA-02)', () => {
    it('token revocado: Redis marca más nueva que iat → UnauthorizedException (super-admin)', async () => {
      // iat = 1000s, revokedAt = 1_500_000ms > 1000 * 1000 = 1_000_000ms
      const iat = 1000; // segundos
      const revokedAtMs = 1_500_000; // milisegundos — posterior al iat
      const redis = makeRedis(String(revokedAtMs));
      const clock = makeClock(Date.now());
      const strategy = buildStrategy(redis, clock);

      await expect(strategy.validate({ ...basePayload, iat, isSuperAdmin: true })).rejects.toThrow(
        UnauthorizedException,
      );

      // REQ-LA-01: clave unificada revoked:access: (no la vieja superadmin:revoked:)
      expect(redis.get).toHaveBeenCalledWith(`revoked:access:${basePayload.sub}`);
    });

    it('token válido post-epoch: iat posterior a la marca Redis → pasa (super-admin)', async () => {
      // iat = 2000s = 2_000_000ms, revokedAt = 1_500_000ms < 2_000_000ms → válido
      const iat = 2000; // segundos
      const revokedAtMs = 1_500_000; // milisegundos — anterior al iat → no revocado
      const redis = makeRedis(String(revokedAtMs));
      const clock = makeClock(Date.now());
      const strategy = buildStrategy(redis, clock);

      const result = await strategy.validate({ ...basePayload, iat, isSuperAdmin: true });

      expect(result.isSuperAdmin).toBe(true);
    });

    it('REQ-LA-02: usuario regular SÍ consulta Redis con clave revoked:access:', async () => {
      // El check de revocación corre para TODOS, no solo super-admins (REQ-LA-02)
      const redis = makeRedis(null);
      const clock = makeClock(Date.now());
      const strategy = buildStrategy(redis, clock);

      await strategy.validate({ ...basePayload });

      expect(redis.get).toHaveBeenCalledWith(`revoked:access:${basePayload.sub}`);
    });

    it('REQ-LA-02: usuario regular con epoch posterior a iat → UnauthorizedException', async () => {
      // isSuperAdmin ausente/false pero con epoch activo → igual rechazado
      const iat = 1000; // segundos
      const revokedAtMs = 1_500_000; // ms — posterior al iat (1_000_000ms)
      const redis = makeRedis(String(revokedAtMs));
      const clock = makeClock(Date.now());
      const strategy = buildStrategy(redis, clock);

      await expect(strategy.validate({ ...basePayload, iat })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
