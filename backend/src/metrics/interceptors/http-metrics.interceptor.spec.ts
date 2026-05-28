import { CallHandler, ExecutionContext } from '@nestjs/common';
import { throwError } from 'rxjs';

import { MetricsPort } from '../ports/metrics.port';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';

/**
 * Cubre el fix del bug: los DomainError exponen `httpStatus` (no `status`/`statusCode`),
 * así que antes todo error de dominio 4xx incrementaba http_requests_total{status_code="500"}
 * (falso pico de 5xx en Prometheus).
 */
describe('HttpMetricsInterceptor — status_code de error', () => {
  function build() {
    const metrics = {
      startTimer: jest.fn(() => () => 0.5),
      incrementCounter: jest.fn(),
      observeHistogram: jest.fn(),
    } as unknown as MetricsPort;

    const interceptor = new HttpMetricsInterceptor(metrics);

    const request = { method: 'POST', path: '/api/comprobantes', route: { path: '/comprobantes' } };
    const response = { statusCode: 200 };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
      getClass: () => undefined,
      getHandler: () => undefined,
    } as unknown as ExecutionContext;

    return { interceptor, context, metrics: metrics as unknown as { incrementCounter: jest.Mock } };
  }

  function run(
    interceptor: HttpMetricsInterceptor,
    context: ExecutionContext,
    error: unknown,
  ): Promise<unknown> {
    const next: CallHandler = { handle: () => throwError(() => error) };
    return new Promise((resolve) => {
      interceptor.intercept(context, next).subscribe({ error: () => resolve(undefined) });
    });
  }

  it('cuenta un DomainError 422 (httpStatus) como status_code 422, no 500', async () => {
    const { interceptor, context, metrics } = build();
    const domainError = Object.assign(new Error('desbalanceado'), { httpStatus: 422 });

    await run(interceptor, context, domainError);

    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'http_requests_total',
      expect.objectContaining({ status_code: '422' }),
    );
  });

  it('cae a 500 cuando el error no expone ningún status', async () => {
    const { interceptor, context, metrics } = build();

    await run(interceptor, context, new Error('boom'));

    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      'http_requests_total',
      expect.objectContaining({ status_code: '500' }),
    );
  });
});
