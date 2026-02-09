/**
 * Tracing Port - Core interface for distributed tracing providers.
 * Implement this interface to connect OpenTelemetry, Jaeger, Zipkin, etc.
 */

export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
}

export interface SpanOptions {
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean>;
  links?: SpanContext[];
}

export type SpanKind = 'internal' | 'server' | 'client' | 'producer' | 'consumer';

export interface Span {
  /**
   * Set an attribute on the span
   */
  setAttribute(key: string, value: string | number | boolean): void;

  /**
   * Set multiple attributes
   */
  setAttributes(attributes: Record<string, string | number | boolean>): void;

  /**
   * Add an event to the span
   */
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;

  /**
   * Record an exception
   */
  recordException(error: Error): void;

  /**
   * Set the span status
   */
  setStatus(code: SpanStatusCode, message?: string): void;

  /**
   * End the span
   */
  end(): void;

  /**
   * Get the span context
   */
  getContext(): SpanContext;

  /**
   * Check if the span is recording
   */
  isRecording(): boolean;
}

export type SpanStatusCode = 'unset' | 'ok' | 'error';

export interface TracingPort {
  /**
   * Start a new span
   */
  startSpan(name: string, options?: SpanOptions): Span;

  /**
   * Start a span as a child of the current active span
   */
  startActiveSpan<T>(name: string, fn: (span: Span) => T, options?: SpanOptions): T;

  /**
   * Get the current active span
   */
  getActiveSpan(): Span | undefined;

  /**
   * Get the current trace context (for propagation)
   */
  getCurrentContext(): SpanContext | undefined;

  /**
   * Inject trace context into carrier (e.g., HTTP headers)
   */
  inject(carrier: Record<string, string>): void;

  /**
   * Extract trace context from carrier (e.g., HTTP headers)
   */
  extract(carrier: Record<string, string>): SpanContext | undefined;

  /**
   * Shutdown the tracer
   */
  shutdown(): Promise<void>;
}

/**
 * Injection token for the TracingPort
 */
export const TRACING_PORT = Symbol('TRACING_PORT');
