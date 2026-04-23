import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { METRICS_PORT, MetricsPort } from '../ports/metrics.port';

/**
 * HTTP Metrics Interceptor
 * Automatically records request duration and counts for all HTTP endpoints.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(@Inject(METRICS_PORT) private readonly metrics: MetricsPort) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Skip metrics endpoint to avoid recursion
    if (request.path === '/metrics' || request.path === '/api/metrics') {
      return next.handle();
    }

    const method = request.method;
    const route = this.getRoute(context, request);

    const endTimer = this.metrics.startTimer('http_request_duration_seconds', {
      method,
      route,
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = response.statusCode.toString();
          const duration = endTimer();

          this.metrics.incrementCounter('http_requests_total', {
            method,
            route,
            status_code: statusCode,
          });

          this.metrics.observeHistogram('http_request_duration_seconds', duration, {
            method,
            route,
            status_code: statusCode,
          });
        },
        error: (error) => {
          const statusCode = error.status || error.statusCode || 500;
          const duration = endTimer();

          this.metrics.incrementCounter('http_requests_total', {
            method,
            route,
            status_code: statusCode.toString(),
          });

          this.metrics.observeHistogram('http_request_duration_seconds', duration, {
            method,
            route,
            status_code: statusCode.toString(),
          });
        },
      }),
    );
  }

  private getRoute(context: ExecutionContext, request: Request): string {
    // Try to get the route pattern from the controller/handler metadata
    const controller = context.getClass();
    const handler = context.getHandler();

    if (controller && handler) {
      const controllerPath = Reflect.getMetadata('path', controller) || '';
      const handlerPath = Reflect.getMetadata('path', handler) || '';
      const basePath = controllerPath.startsWith('/') ? controllerPath : `/${controllerPath}`;
      const fullPath = handlerPath ? `${basePath}/${handlerPath}` : basePath;
      return fullPath.replace(/\/+/g, '/');
    }

    // Fallback to request path, normalizing parameter values
    return request.route?.path || request.path;
  }
}
