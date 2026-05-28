import { CallHandler, ExecutionContext } from '@nestjs/common';
import { throwError } from 'rxjs';

import { LoggerPort } from '../ports/logger.port';
import { TracingPort } from '../../tracing/ports/tracing.port';
import { HttpLoggingInterceptor } from './http-logging.interceptor';

/**
 * Cubre el fix del bug: los DomainError exponen `httpStatus` (no `status`/`statusCode`),
 * así que antes TODO error de dominio 4xx se logueaba como 500 a nivel `error`,
 * contaminando el nivel error y las métricas 5xx. Ahora:
 *   - statusCode se lee de httpStatus cuando no hay status/statusCode.
 *   - 4xx → warn; 5xx → error (con el Error completo).
 */
describe('HttpLoggingInterceptor — status de error', () => {
  function build() {
    const childLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const logger = {
      child: jest.fn(() => childLogger),
    } as unknown as LoggerPort;
    const tracing = {
      getCurrentContext: jest.fn(() => ({ traceId: 'trace-1', spanId: 'span-1' })),
    } as unknown as TracingPort;

    const interceptor = new HttpLoggingInterceptor(logger, tracing);

    const request = {
      method: 'POST',
      url: '/api/comprobantes',
      path: '/api/comprobantes',
      query: {},
      ip: '127.0.0.1',
      get: jest.fn(() => undefined),
    };
    const response = { statusCode: 200 };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;

    return { interceptor, context, childLogger };
  }

  function run(
    interceptor: HttpLoggingInterceptor,
    context: ExecutionContext,
    error: unknown,
  ): Promise<unknown> {
    const next: CallHandler = { handle: () => throwError(() => error) };
    return new Promise((resolve) => {
      interceptor.intercept(context, next).subscribe({
        error: () => resolve(undefined),
      });
    });
  }

  it('un DomainError 422 (httpStatus) se loguea como warn con statusCode 422', async () => {
    const { interceptor, context, childLogger } = build();
    // Forma de un DomainError: httpStatus, sin status/statusCode.
    const domainError = Object.assign(new Error('Estado inválido'), {
      httpStatus: 422,
      code: 'COMPROBANTE_DESBALANCEADO',
    });

    await run(interceptor, context, domainError);

    expect(childLogger.error).not.toHaveBeenCalled();
    expect(childLogger.warn).toHaveBeenCalledTimes(1);
    const [, ctx] = childLogger.warn.mock.calls[0];
    expect(ctx).toMatchObject({ statusCode: 422 });
  });

  it('un error 500 se loguea como error con el Error completo', async () => {
    const { interceptor, context, childLogger } = build();
    const boom = new Error('boom');

    await run(interceptor, context, boom);

    expect(childLogger.warn).not.toHaveBeenCalled();
    expect(childLogger.error).toHaveBeenCalledTimes(1);
    const [, ctx, errArg] = childLogger.error.mock.calls[0];
    expect(ctx).toMatchObject({ statusCode: 500 });
    expect(errArg).toBe(boom);
  });

  it('respeta status/statusCode de HttpException (NestJS) por sobre el default', async () => {
    const { interceptor, context, childLogger } = build();
    const httpError = Object.assign(new Error('not found'), { status: 404 });

    await run(interceptor, context, httpError);

    expect(childLogger.error).not.toHaveBeenCalled();
    expect(childLogger.warn).toHaveBeenCalledTimes(1);
    expect(childLogger.warn.mock.calls[0][1]).toMatchObject({ statusCode: 404 });
  });
});
