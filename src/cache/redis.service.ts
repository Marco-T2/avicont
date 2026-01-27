import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    this.client = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
      db: this.config.get<number>('REDIS_DB', 0),
      keyPrefix: 'saas:',
    });
  }

  getClient(): Redis {
    return this.client;
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async delPattern(pattern: string): Promise<void> {
    const keys = await this.client.keys(`saas:${pattern}`);
    if (keys.length > 0) {
      await this.client.del(...keys.map((k: string) => k.replace('saas:', '')));
    }
  }

  async hget<T>(key: string, field: string): Promise<T | null> {
    const value = await this.client.hget(key, field);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  async hset(key: string, field: string, value: unknown): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await this.client.hset(key, field, serialized);
  }

  async hgetall<T>(key: string): Promise<Record<string, T> | null> {
    const data = await this.client.hgetall(key);
    if (!data || Object.keys(data).length === 0) return null;
    const result: Record<string, T> = {};
    for (const [k, v] of Object.entries(data)) {
      try {
        result[k] = JSON.parse(v as string) as T;
      } catch {
        result[k] = v as unknown as T;
      }
    }
    return result;
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const count = await this.client.incr(key);
    if (ttlSeconds && count === 1) {
      await this.client.expire(key, ttlSeconds);
    }
    return count;
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
