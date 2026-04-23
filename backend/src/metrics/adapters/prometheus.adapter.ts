import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as client from 'prom-client';
import {
  MetricsPort,
  MetricLabels,
  HistogramBuckets,
  SummaryPercentiles,
} from '../ports/metrics.port';

/**
 * Prometheus Metrics Adapter
 * Uses prom-client to collect and expose metrics in Prometheus format.
 */
@Injectable()
export class PrometheusAdapter implements MetricsPort, OnModuleInit {
  private readonly registry: client.Registry;
  private readonly counters = new Map<string, client.Counter>();
  private readonly gauges = new Map<string, client.Gauge>();
  private readonly histograms = new Map<string, client.Histogram>();
  private readonly summaries = new Map<string, client.Summary>();
  private readonly prefix: string;

  constructor(private readonly config: ConfigService) {
    this.registry = new client.Registry();
    this.prefix = config.get<string>('METRICS_PREFIX', 'saas_');
  }

  onModuleInit() {
    // Collect default Node.js metrics
    if (this.config.get<string>('METRICS_COLLECT_DEFAULT', 'true') === 'true') {
      client.collectDefaultMetrics({
        register: this.registry,
        prefix: this.prefix,
      });
    }

    // Register common application metrics
    this.registerDefaultMetrics();
  }

  private registerDefaultMetrics() {
    // HTTP request metrics
    this.registerHistogram(
      'http_request_duration_seconds',
      'Duration of HTTP requests in seconds',
      ['method', 'route', 'status_code'],
      { buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] },
    );

    this.registerCounter('http_requests_total', 'Total number of HTTP requests', [
      'method',
      'route',
      'status_code',
    ]);

    // Tenant-specific metrics
    this.registerCounter('tenant_operations_total', 'Total operations per tenant', [
      'tenant_id',
      'operation',
    ]);

    this.registerGauge('tenant_active_users', 'Number of active users per tenant', ['tenant_id']);

    // Auth metrics
    this.registerCounter('auth_login_total', 'Total login attempts', ['status', 'tenant_id']);
    this.registerCounter('auth_token_refresh_total', 'Total token refreshes', ['status']);

    // Database metrics
    this.registerHistogram(
      'db_query_duration_seconds',
      'Duration of database queries in seconds',
      ['operation', 'table'],
      { buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1] },
    );
  }

  private getPrefixedName(name: string): string {
    return `${this.prefix}${name}`;
  }

  registerCounter(name: string, help: string, labelNames: string[] = []): void {
    const prefixedName = this.getPrefixedName(name);
    if (!this.counters.has(prefixedName)) {
      const counter = new client.Counter({
        name: prefixedName,
        help,
        labelNames,
        registers: [this.registry],
      });
      this.counters.set(prefixedName, counter);
    }
  }

  registerGauge(name: string, help: string, labelNames: string[] = []): void {
    const prefixedName = this.getPrefixedName(name);
    if (!this.gauges.has(prefixedName)) {
      const gauge = new client.Gauge({
        name: prefixedName,
        help,
        labelNames,
        registers: [this.registry],
      });
      this.gauges.set(prefixedName, gauge);
    }
  }

  registerHistogram(
    name: string,
    help: string,
    labelNames: string[] = [],
    options?: HistogramBuckets,
  ): void {
    const prefixedName = this.getPrefixedName(name);
    if (!this.histograms.has(prefixedName)) {
      const histogram = new client.Histogram({
        name: prefixedName,
        help,
        labelNames,
        buckets: options?.buckets || client.linearBuckets(0.005, 0.01, 20),
        registers: [this.registry],
      });
      this.histograms.set(prefixedName, histogram);
    }
  }

  registerSummary(
    name: string,
    help: string,
    labelNames: string[] = [],
    options?: SummaryPercentiles,
  ): void {
    const prefixedName = this.getPrefixedName(name);
    if (!this.summaries.has(prefixedName)) {
      const summary = new client.Summary({
        name: prefixedName,
        help,
        labelNames,
        percentiles: options?.percentiles || [0.5, 0.9, 0.95, 0.99],
        maxAgeSeconds: options?.maxAgeSeconds || 600,
        ageBuckets: options?.ageBuckets || 5,
        registers: [this.registry],
      });
      this.summaries.set(prefixedName, summary);
    }
  }

  incrementCounter(name: string, labels?: MetricLabels, value = 1): void {
    const prefixedName = this.getPrefixedName(name);
    const counter = this.counters.get(prefixedName);
    if (counter) {
      if (labels) {
        counter.inc(labels as client.LabelValues<string>, value);
      } else {
        counter.inc(value);
      }
    }
  }

  setGauge(name: string, value: number, labels?: MetricLabels): void {
    const prefixedName = this.getPrefixedName(name);
    const gauge = this.gauges.get(prefixedName);
    if (gauge) {
      if (labels) {
        gauge.set(labels as client.LabelValues<string>, value);
      } else {
        gauge.set(value);
      }
    }
  }

  incrementGauge(name: string, labels?: MetricLabels, value = 1): void {
    const prefixedName = this.getPrefixedName(name);
    const gauge = this.gauges.get(prefixedName);
    if (gauge) {
      if (labels) {
        gauge.inc(labels as client.LabelValues<string>, value);
      } else {
        gauge.inc(value);
      }
    }
  }

  decrementGauge(name: string, labels?: MetricLabels, value = 1): void {
    const prefixedName = this.getPrefixedName(name);
    const gauge = this.gauges.get(prefixedName);
    if (gauge) {
      if (labels) {
        gauge.dec(labels as client.LabelValues<string>, value);
      } else {
        gauge.dec(value);
      }
    }
  }

  observeHistogram(name: string, value: number, labels?: MetricLabels): void {
    const prefixedName = this.getPrefixedName(name);
    const histogram = this.histograms.get(prefixedName);
    if (histogram) {
      if (labels) {
        histogram.observe(labels as client.LabelValues<string>, value);
      } else {
        histogram.observe(value);
      }
    }
  }

  observeSummary(name: string, value: number, labels?: MetricLabels): void {
    const prefixedName = this.getPrefixedName(name);
    const summary = this.summaries.get(prefixedName);
    if (summary) {
      if (labels) {
        summary.observe(labels as client.LabelValues<string>, value);
      } else {
        summary.observe(value);
      }
    }
  }

  startTimer(name: string, labels?: MetricLabels): () => number {
    const prefixedName = this.getPrefixedName(name);
    const histogram = this.histograms.get(prefixedName);
    if (histogram) {
      return labels
        ? histogram.startTimer(labels as client.LabelValues<string>)
        : histogram.startTimer();
    }
    // Return a no-op timer if histogram doesn't exist
    const start = Date.now();
    return () => (Date.now() - start) / 1000;
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }

  resetMetrics(): void {
    this.registry.resetMetrics();
  }
}
