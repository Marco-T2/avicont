import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { LOGGER_PORT, LoggerPort } from '../ports/logger.port';
import { TRACING_PORT, TracingPort } from '../../tracing/ports/tracing.port';

/**
 * HTTP Logging Interceptor
 * Logs all incoming requests and outgoing responses with timing, status, and trace context.
 * Logs are shipped to Loki for visualization in Grafana.
 */
@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger: LoggerPort;

  constructor(
    @Inject(LOGGER_PORT) logger: LoggerPort,
    @Inject(TRACING_PORT) private readonly tracing: TracingPort,
  ) {
    this.logger = logger.child({ module: 'HTTP' });
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Skip logging for health and metrics endpoints
    if (
      request.path.includes('/health') ||
      request.path.includes('/metrics') ||
      request.path.includes('/favicon')
    ) {
      return next.handle();
    }

    const startTime = Date.now();
    const method = request.method;
    const url = request.url;
    const userAgent = request.get('user-agent') || 'unknown';
    const ip = request.ip || request.get('x-forwarded-for') || 'unknown';
    const tenantId = request.get('x-tenant-id') || 'unknown';
    const userId = (request as unknown as { user?: { sub?: string } }).user?.sub || 'anonymous';

    // Get trace context for correlation
    const traceContext = this.tracing.getCurrentContext();
    const traceId = traceContext?.traceId || '';
    const spanId = traceContext?.spanId || '';

    // Log incoming request
    this.logger.info(`→ ${method} ${url}`, {
      type: 'request',
      method,
      url,
      path: request.path,
      query: Object.keys(request.query).length > 0 ? request.query : undefined,
      userAgent,
      ip,
      tenantId,
      userId,
      traceId,
      spanId,
      contentLength: request.get('content-length') || '0',
      contentType: request.get('content-type') || 'none',
    });

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;

          // Log successful response
          this.logger.info(`← ${method} ${url} ${statusCode} ${duration}ms`, {
            type: 'response',
            method,
            url,
            path: request.path,
            statusCode,
            duration,
            tenantId,
            userId,
            traceId,
            spanId,
            responseSize: this.getResponseSize(data),
          });
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || error.statusCode || 500;

          // Log error response
          this.logger.error(`← ${method} ${url} ${statusCode} ${duration}ms`, {
            type: 'response',
            method,
            url,
            path: request.path,
            statusCode,
            duration,
            tenantId,
            userId,
            traceId,
            spanId,
            errorName: error.name,
            errorMessage: error.message,
          });
        },
      }),
    );
  }

  private getResponseSize(data: unknown): number {
    if (!data) return 0;
    try {
      return JSON.stringify(data).length;
    } catch {
      return 0;
    }
  }
}
