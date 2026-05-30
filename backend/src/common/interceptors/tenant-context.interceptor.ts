import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from, switchMap } from 'rxjs';
import { TenantContextService } from '../tenant-context/tenant-context.service';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly metrics: MetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const user = req.user as {
      sub?: string;
      roles?: string[];
      tenantId?: string;
      activeTenantId?: string;
    };
    const headerTenantId = req.headers['x-tenant-id'] as string | undefined;
    const jwtTenant = user?.activeTenantId || user?.tenantId;
    const host = (req.headers.host as string | undefined) ?? '';
    const subdomainTenant = this.extractTenantFromHost(host);

    const tenantId = headerTenantId || jwtTenant || subdomainTenant;
    req.tenantId = tenantId;

    // Solo contamos operaciones con tenant autenticado (JWT) o explícito vía
    // header de super-admin; NO las derivadas del subdominio (resolver
    // descartado, CLAUDE.md §10.4) para no contaminar la métrica con el Host.
    const tenantParaMetrica = jwtTenant || headerTenantId;
    if (tenantParaMetrica) {
      const operation = `${context.getClass().name}.${context.getHandler().name}`;
      this.metrics.recordTenantOperation(operation);
    }

    const result = this.tenantContext.runWithContext(
      {
        ...(tenantId !== undefined ? { tenantId } : {}),
        ...(user?.sub !== undefined ? { userId: user.sub } : {}),
        roles: user?.roles ?? [],
      },
      () => next.handle(),
    );

    // If runWithContext returns a Promise<Observable>, unwrap it
    if (result instanceof Promise) {
      return from(result).pipe(switchMap((obs) => obs));
    }
    // If it returns an Observable directly, return it
    return result;
  }

  private extractTenantFromHost(host: string): string | undefined {
    const parts = host.split('.');
    if (parts.length < 3) {
      return undefined;
    }
    // Ignore localhost with port
    if (host.includes('localhost')) {
      return undefined;
    }
    return parts[0];
  }
}
