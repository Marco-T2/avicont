import { INestApplication, Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { TenantContextService } from './tenant-context/tenant-context.service';
import { MetricsService } from '../metrics/metrics.service';

/**
 * Extrae operación y tabla del SQL crudo que emite Prisma en el evento 'query'.
 * Heurístico y de baja cardinalidad: el verbo SQL inicial como operación y la
 * primera tabla `"public"."X"` referenciada; ante SQL no reconocido → 'unknown'.
 */
export function parseDbQuery(sql: string): { operation: string; table: string } {
  const operation = /^\s*(\w+)/.exec(sql)?.[1]?.toLowerCase() ?? 'unknown';
  const table =
    /"public"\."([^"]+)"/.exec(sql)?.[1] ??
    /(?:from|into|update|join)\s+"?([a-zA-Z_]\w*)"?/i.exec(sql)?.[1] ??
    'unknown';
  return { operation, table };
}

@Injectable()
export class PrismaService
  extends PrismaClient<{ adapter: PrismaPg; log: [{ level: 'query'; emit: 'event' }] }>
  implements OnModuleInit, OnModuleDestroy
{
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly metrics: MetricsService,
  ) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    super({ adapter, log: [{ level: 'query', emit: 'event' }] });
  }

  async onModuleInit() {
    this.$on('query', (event: Prisma.QueryEvent) => {
      const { operation, table } = parseDbQuery(event.query);
      // Prisma reporta la duración en milisegundos; la métrica es en segundos.
      this.metrics.recordDbQuery(operation, table, event.duration / 1000);
    });
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }

  /**
   * Get tenant-scoped where clause for queries.
   * Use this helper method in services to ensure tenant isolation.
   */
  getTenantWhere<T extends Record<string, any>>(where?: T): T & { tenantId?: string } {
    const tenantId = this.tenantContext.getTenantId();
    return { ...where, tenantId } as T & { tenantId?: string };
  }

  /**
   * Add tenantId to data for create operations.
   */
  getTenantData<T extends Record<string, any>>(data: T): T & { tenantId?: string } {
    const tenantId = this.tenantContext.getTenantId();
    return { ...data, tenantId } as T & { tenantId?: string };
  }
}
