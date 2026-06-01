import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../auth.service';
import { RedisService } from '@/cache/redis.service';
import { CLOCK_PORT, ClockPort } from '@/common/clock/clock.port';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        config.get<string>('JWT_ACCESS_SECRET') || 'fallback-secret-change-in-production',
    });
  }

  async validate(payload: JwtPayload) {
    // Revocación inmediata para tokens de super-admin (REQ-SA-03).
    // El mecanismo es un epoch por usuario en Redis: si existe una marca de
    // revocación más nueva que el iat del token, el token se considera revocado.
    // El claim de plataforma se revoca en bloque (todos los tokens activos del
    // usuario), sin necesidad de jti por token.
    // docs/disenos/super-admin-plataforma.md §4.3, design.md Decisión 4.2.
    if (payload.isSuperAdmin === true) {
      const key = `superadmin:revoked:${payload.sub}`;
      const revokedAtStr = await this.redis.get<string>(key);
      if (revokedAtStr !== null) {
        const revokedAtMs = Number(revokedAtStr);
        const iatMs = (payload.iat ?? 0) * 1000;
        if (revokedAtMs > iatMs) {
          throw new UnauthorizedException('Token revocado');
        }
      }
    }

    return {
      sub: payload.sub,
      email: payload.email,
      activeTenantId: payload.activeTenantId,
      roles: payload.roles,
      // Normaliza a boolean estricto: si el claim no existe, es false.
      // Comparación estricta === true (no truthy) — CLAUDE.md §5 naming.
      isSuperAdmin: payload.isSuperAdmin === true,
      // Propagar claims de impersonation al req.user para que guards/interceptors
      // puedan diferenciar sesiones impersonadas.
      impersonatedBy: payload.impersonatedBy,
      impersonationId: payload.impersonationId,
    };
  }
}
