import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
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
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';

/**
 * OpenTelemetry Tracing Adapter for Tempo
 * Provides distributed tracing capabilities with automatic instrumentation.
 */
@Injectable()
export class OpenTelemetryAdapter implements TracingPort, OnModuleDestroy {
  private readonly logger = new Logger(OpenTelemetryAdapter.name);
  private readonly tracer: api.Tracer;
  private sdk: NodeSDK | null = null;
  private readonly serviceName: string;

  constructor(private readonly config: ConfigService) {
    this.serviceName = config.get<string>('OTEL_SERVICE_NAME', 'saas-api');
    const enabled = config.get<string>('TRACING_ENABLED', 'true') === 'true';

    if (enabled) {
      this.initializeSDK();
    }

    this.tracer = api.trace.getTracer(this.serviceName);
  }

  private initializeSDK() {
    const endpoint = this.config.get<string>('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://tempo:4318');

    const exporter = new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
    });

    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: this.serviceName,
      [ATTR_SERVICE_VERSION]: this.config.get<string>('APP_VERSION', '1.0.0'),
      'deployment.environment': this.config.get<string>('NODE_ENV', 'development'),
    });

    this.sdk = new NodeSDK({
      resource,
      traceExporter: exporter,
      instrumentations: [
        new HttpInstrumentation({
          ignoreIncomingRequestHook: (req) => {
            // Ignore health checks and metrics endpoints
            return Boolean(
              req.url?.includes('/health') ||
              req.url?.includes('/metrics') ||
              req.url?.includes('/favicon'),
            );
          },
        }),
        new ExpressInstrumentation(),
        new NestInstrumentation(),
      ],
    });

    this.sdk.start();
    this.logger.log(`OpenTelemetry tracing initialized, exporting to: ${endpoint}`);
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
      setStatus: (code, message) => otelSpan.setStatus({ code: this.mapStatusCode(code), message }),
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
      attributes: options?.attributes,
    });
    return this.wrapSpan(otelSpan);
  }

  startActiveSpan<T>(name: string, fn: (span: Span) => T, options?: SpanOptions): T {
    return this.tracer.startActiveSpan(
      name,
      {
        kind: this.mapSpanKind(options?.kind),
        attributes: options?.attributes,
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
    if (this.sdk) {
      await this.sdk.shutdown();
      this.logger.log('OpenTelemetry SDK shutdown');
    }
  }

  async onModuleDestroy() {
    await this.shutdown();
  }
}
