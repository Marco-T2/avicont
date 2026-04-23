import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../cache/redis.service';
import { PrismaService } from '../../common/prisma.service';
import { PermissionsCachePort } from '../ports/permissions-cache.port';
import { ResolvedPermissions } from '../ports/permissions-resolver.port';

const TTL_SECONDS = 5 * 60; // 5 minutos
const KEY_PREFIX = 'perms';

@Injectable()
export class RedisPermissionsCache implements PermissionsCachePort {
  private readonly logger = new Logger(RedisPermissionsCache.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  private key(userId: string, organizationId: string): string {
    return `${KEY_PREFIX}:${userId}:${organizationId}`;
  }

  async get(userId: string, organizationId: string): Promise<ResolvedPermissions | null> {
    try {
      return await this.redis.get<ResolvedPermissions>(this.key(userId, organizationId));
    } catch (err) {
      // Redis caído → degradar silenciosamente (resolver consulta DB).
      this.logger.warn(`Cache GET failed (${(err as Error).message}); falling back to DB`);
      return null;
    }
  }

  async set(
    userId: string,
    organizationId: string,
    value: ResolvedPermissions,
  ): Promise<void> {
    try {
      await this.redis.set(this.key(userId, organizationId), value, TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`Cache SET failed (${(err as Error).message}); skipping`);
    }
  }

  async invalidateUser(userId: string, organizationId: string): Promise<void> {
    try {
      await this.redis.del(this.key(userId, organizationId));
    } catch (err) {
      this.logger.warn(`Cache invalidate user failed (${(err as Error).message})`);
    }
  }

  async invalidateUsersByCustomRole(customRoleId: string): Promise<void> {
    // Resolvemos los memberships afectados para invalidar key por key.
    // delPattern (KEYS *) sería más simple pero peligroso en prod a escala.
    try {
      const memberships = await this.prisma.membership.findMany({
        where: { customRoleId },
        select: { userId: true, organizationId: true },
      });
      await Promise.all(
        memberships.map((m) => this.redis.del(this.key(m.userId, m.organizationId))),
      );
    } catch (err) {
      this.logger.warn(`Cache invalidate role failed (${(err as Error).message})`);
    }
  }

  async invalidateOrganization(organizationId: string): Promise<void> {
    try {
      // Pattern delete acotado por org. Aceptable porque el alcance es UNA org.
      await this.redis.delPattern(`${KEY_PREFIX}:*:${organizationId}`);
    } catch (err) {
      this.logger.warn(`Cache invalidate organization failed (${(err as Error).message})`);
    }
  }
}
