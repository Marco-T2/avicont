import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TracingPort,
  Span,
  SpanOptions,
  SpanContext,
  SpanKind,
  SpanStatusCode,
} from '../ports/tracing.port';
import * as api from '@opentelemetry/api';

/**
 * OpenTelemetry Tracing Adapter.
 * The SDK is initialized in src/tracing/otel-bootstrap.ts BEFORE NestJS loads,
 * so instrumentations can patch http/express/nestjs at import time.
 * This adapter only exposes the already-initialized tracer to the app.
 */
@Injectable()
export class OpenTelemetryAdapter implements TracingPort {
  private readonly logger = new Logger(OpenTelemetryAdapter.name);
  private readonly tracer: api.Tracer;
  private readonly serviceName: string;

  constructor(private readonly config: ConfigService) {
    this.serviceName = config.get<string>('OTEL_SERVICE_NAME', 'saas-api');
    this.tracer = api.trace.getTracer(this.serviceName);
    this.logger.log(`Tracing adapter ready (service: ${this.serviceName})`);
  }

  private mapSpanKind(kind?: SpanKind): api.SpanKind {
    switch (kind) {
      case 'server':
        return api.SpanKind.SERVER;
      case 'client':
        return api.SpanKind.CLIENT;
      case 'producer':
        return api.SpanKind.PRODUCER;
      case 'consumer':
        return api.SpanKind.CONSUMER;
      default:
        return api.SpanKind.INTERNAL;
    }
  }

  private mapStatusCode(code: SpanStatusCode): api.SpanStatusCode {
    switch (code) {
      case 'ok':
        return api.SpanStatusCode.OK;
      case 'error':
        return api.SpanStatusCode.ERROR;
      default:
        return api.SpanStatusCode.UNSET;
    }
  }

  private wrapSpan(otelSpan: api.Span): Span {
    return {
      setAttribute: (key, value) => otelSpan.setAttribute(key, value),
      setAttributes: (attrs) => otelSpan.setAttributes(attrs),
      addEvent: (name, attrs) => otelSpan.addEvent(name, attrs),
      recordException: (error) => otelSpan.recordException(error),
      setStatus: (code, message) =>
        otelSpan.setStatus({
          code: this.mapStatusCode(code),
          ...(message !== undefined ? { message } : {}),
        }),
      end: () => otelSpan.end(),
      getContext: () => {
        const ctx = otelSpan.spanContext();
        return {
          traceId: ctx.traceId,
          spanId: ctx.spanId,
          traceFlags: ctx.traceFlags,
        };
      },
      isRecording: () => otelSpan.isRecording(),
    };
  }

  startSpan(name: string, options?: SpanOptions): Span {
    const otelSpan = this.tracer.startSpan(name, {
      kind: this.mapSpanKind(options?.kind),
      ...(options?.attributes ? { attributes: options.attributes } : {}),
    });
    return this.wrapSpan(otelSpan);
  }

  startActiveSpan<T>(name: string, fn: (span: Span) => T, options?: SpanOptions): T {
    return this.tracer.startActiveSpan<(span: api.Span) => T>(
      name,
      {
        kind: this.mapSpanKind(options?.kind),
        ...(options?.attributes ? { attributes: options.attributes } : {}),
      },
      (otelSpan) => {
        const wrappedSpan = this.wrapSpan(otelSpan);
        try {
          return fn(wrappedSpan);
        } finally {
          otelSpan.end();
        }
      },
    );
  }

  getActiveSpan(): Span | undefined {
    const activeSpan = api.trace.getActiveSpan();
    return activeSpan ? this.wrapSpan(activeSpan) : undefined;
  }

  getCurrentContext(): SpanContext | undefined {
    const activeSpan = api.trace.getActiveSpan();
    if (!activeSpan) return undefined;

    const ctx = activeSpan.spanContext();
    return {
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      traceFlags: ctx.traceFlags,
    };
  }

  inject(carrier: Record<string, string>): void {
    const context = api.context.active();
    api.propagation.inject(context, carrier);
  }

  extract(carrier: Record<string, string>): SpanContext | undefined {
    const context = api.propagation.extract(api.context.active(), carrier);
    const spanContext = api.trace.getSpanContext(context);
    if (!spanContext) return undefined;

    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      traceFlags: spanContext.traceFlags,
    };
  }

  async shutdown(): Promise<void> {
    // No-op: SDK lifecycle is owned by src/tracing/otel-bootstrap.ts
    // which registers SIGTERM/SIGINT handlers for graceful flush.
  }
}
