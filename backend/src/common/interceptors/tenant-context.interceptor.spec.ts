import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';

import { MetricsService } from '../../metrics/metrics.service';
import { TenantContextService } from '../tenant-context/tenant-context.service';
import { TenantContextInterceptor } from './tenant-context.interceptor';

/**
 * Verifica el cableado de la métrica tenant_operations_total: cada request
 * con tenant resuelto registra una operación etiquetada por controller.handler,
 * y las requests sin tenant (públicas) no contaminan la métrica.
 */
describe('TenantContextInterceptor', () => {
  let interceptor: TenantContextInterceptor;
  let tenantContext: { runWithContext: jest.Mock };
  let metrics: { recordTenantOperation: jest.Mock };
  let next: CallHandler;

  class ComprobantesController {}
  function contabilizar() {}

  const buildContext = (req: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
      getClass: () => ComprobantesController,
      getHandler: () => contabilizar,
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    tenantContext = { runWithContext: jest.fn((_store, cb: () => unknown) => cb()) };
    metrics = { recordTenantOperation: jest.fn() };
    next = { handle: jest.fn().mockReturnValue(of('ok')) };
    interceptor = new TenantContextInterceptor(
      tenantContext as unknown as TenantContextService,
      metrics as unknown as MetricsService,
    );
  });

  it('registra la operación del tenant etiquetada por controller.handler', async () => {
    const ctx = buildContext({ user: { activeTenantId: 'org-1' }, headers: {} });

    await lastValueFrom(interceptor.intercept(ctx, next));

    expect(metrics.recordTenantOperation).toHaveBeenCalledWith(
      'ComprobantesController.contabilizar',
    );
  });

  it('registra la operación cuando el tenant viene del header x-tenant-id', async () => {
    const ctx = buildContext({ user: undefined, headers: { 'x-tenant-id': 'org-9' } });

    await lastValueFrom(interceptor.intercept(ctx, next));

    expect(metrics.recordTenantOperation).toHaveBeenCalledWith(
      'ComprobantesController.contabilizar',
    );
  });

  it('no registra operación cuando la request no tiene tenant', async () => {
    const ctx = buildContext({ user: undefined, headers: {} });

    await lastValueFrom(interceptor.intercept(ctx, next));

    expect(metrics.recordTenantOperation).not.toHaveBeenCalled();
  });

  it('no registra operación para tenant derivado del subdominio (resolver descartado, §10.4)', async () => {
    const ctx = buildContext({ user: undefined, headers: { host: 'acme.avicont.bo' } });

    await lastValueFrom(interceptor.intercept(ctx, next));

    expect(metrics.recordTenantOperation).not.toHaveBeenCalled();
  });
});
