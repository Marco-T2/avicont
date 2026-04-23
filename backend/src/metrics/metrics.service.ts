import { Injectable, Inject } from '@nestjs/common';
import { METRICS_PORT, MetricsPort, MetricLabels } from './ports/metrics.port';

/**
 * Metrics Service - Wraps the metrics port for dependency injection.
 * Use this service throughout your application for recording metrics.
 */
@Injectable()
export class MetricsService {
  constructor(@Inject(METRICS_PORT) private readonly metrics: MetricsPort) {}

  /**
   * Increment a counter
   */
  incrementCounter(name: string, labels?: MetricLabels, value?: number): void {
    this.metrics.incrementCounter(name, labels, value);
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, labels?: MetricLabels): void {
    this.metrics.setGauge(name, value, labels);
  }

  /**
   * Increment a gauge
   */
  incrementGauge(name: string, labels?: MetricLabels, value?: number): void {
    this.metrics.incrementGauge(name, labels, value);
  }

  /**
   * Decrement a gauge
   */
  decrementGauge(name: string, labels?: MetricLabels, value?: number): void {
    this.metrics.decrementGauge(name, labels, value);
  }

  /**
   * Observe a histogram value
   */
  observeHistogram(name: string, value: number, labels?: MetricLabels): void {
    this.metrics.observeHistogram(name, value, labels);
  }

  /**
   * Start a timer and return a function to stop it
   */
  startTimer(name: string, labels?: MetricLabels): () => number {
    return this.metrics.startTimer(name, labels);
  }

  /**
   * Record a login attempt
   */
  recordLogin(success: boolean, tenantId?: string): void {
    this.metrics.incrementCounter('auth_login_total', {
      status: success ? 'success' : 'failure',
      tenant_id: tenantId || 'unknown',
    });
  }

  /**
   * Record a tenant operation
   */
  recordTenantOperation(tenantId: string, operation: string): void {
    this.metrics.incrementCounter('tenant_operations_total', {
      tenant_id: tenantId,
      operation,
    });
  }

  /**
   * Set active users for a tenant
   */
  setActiveUsers(tenantId: string, count: number): void {
    this.metrics.setGauge('tenant_active_users', count, { tenant_id: tenantId });
  }

  /**
   * Record database query duration
   */
  recordDbQuery(operation: string, table: string, durationSeconds: number): void {
    this.metrics.observeHistogram('db_query_duration_seconds', durationSeconds, {
      operation,
      table,
    });
  }
}
