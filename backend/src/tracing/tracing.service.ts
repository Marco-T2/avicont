import { Injectable, Inject } from '@nestjs/common';
import { TRACING_PORT, TracingPort, Span, SpanOptions, SpanContext } from './ports/tracing.port';

/**
 * Tracing Service - Wraps the tracing port for dependency injection.
 * Use this service throughout your application for distributed tracing.
 */
@Injectable()
export class TracingService {
  constructor(@Inject(TRACING_PORT) private readonly tracing: TracingPort) {}

  /**
   * Start a new span
   */
  startSpan(name: string, options?: SpanOptions): Span {
    return this.tracing.startSpan(name, options);
  }

  /**
   * Start an active span and execute a function within it
   */
  startActiveSpan<T>(name: string, fn: (span: Span) => T, options?: SpanOptions): T {
    return this.tracing.startActiveSpan(name, fn, options);
  }

  /**
   * Get the current active span
   */
  getActiveSpan(): Span | undefined {
    return this.tracing.getActiveSpan();
  }

  /**
   * Get the current trace context
   */
  getCurrentContext(): SpanContext | undefined {
    return this.tracing.getCurrentContext();
  }

  /**
   * Inject trace context for outgoing requests
   */
  inject(carrier: Record<string, string>): void {
    this.tracing.inject(carrier);
  }

  /**
   * Extract trace context from incoming requests
   */
  extract(carrier: Record<string, string>): SpanContext | undefined {
    return this.tracing.extract(carrier);
  }

  /**
   * Add attributes to the current span
   */
  addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
    const span = this.getActiveSpan();
    if (span) {
      span.setAttributes(attributes);
    }
  }

  /**
   * Add tenant context to the current span
   */
  addTenantContext(tenantId: string, userId?: string): void {
    this.addSpanAttributes({
      'tenant.id': tenantId,
      ...(userId && { 'user.id': userId }),
    });
  }

  /**
   * Record an error on the current span
   */
  recordError(error: Error): void {
    const span = this.getActiveSpan();
    if (span) {
      span.recordException(error);
      span.setStatus('error', error.message);
    }
  }
}
