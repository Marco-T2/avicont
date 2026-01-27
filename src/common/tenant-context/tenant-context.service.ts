import { AsyncLocalStorage } from 'async_hooks';
import { Injectable } from '@nestjs/common';

export type TenantRequestContext = {
  tenantId?: string;
  userId?: string;
  roles?: string[];
};

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantRequestContext>();

  runWithContext<T>(context: TenantRequestContext, callback: () => Promise<T> | T): Promise<T> | T {
    return this.storage.run(context, callback);
  }

  getTenantId(): string | undefined {
    return this.storage.getStore()?.tenantId;
  }

  getUserId(): string | undefined {
    return this.storage.getStore()?.userId;
  }

  getRoles(): string[] {
    return this.storage.getStore()?.roles ?? [];
  }
}
