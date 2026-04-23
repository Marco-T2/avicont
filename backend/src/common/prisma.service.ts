import { INestApplication, Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { TenantContextService } from './tenant-context/tenant-context.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly tenantContext: TenantContextService) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
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
