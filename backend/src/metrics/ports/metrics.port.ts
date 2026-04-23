/**
 * Metrics Port - Core interface for metrics providers.
 * Implement this interface to connect Prometheus, StatsD, or other metrics backends.
 */

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export interface MetricLabels {
  [key: string]: string | number;
}

export interface HistogramBuckets {
  buckets?: number[];
}

export interface SummaryPercentiles {
  percentiles?: number[];
  maxAgeSeconds?: number;
  ageBuckets?: number;
}

export interface MetricsPort {
  /**
   * Increment a counter
   */
  incrementCounter(name: string, labels?: MetricLabels, value?: number): void;

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, labels?: MetricLabels): void;

  /**
   * Increment a gauge
   */
  incrementGauge(name: string, labels?: MetricLabels, value?: number): void;

  /**
   * Decrement a gauge
   */
  decrementGauge(name: string, labels?: MetricLabels, value?: number): void;

  /**
   * Observe a value in a histogram
   */
  observeHistogram(name: string, value: number, labels?: MetricLabels): void;

  /**
   * Observe a value in a summary
   */
  observeSummary(name: string, value: number, labels?: MetricLabels): void;

  /**
   * Start a timer for measuring duration (returns a function to call when done)
   */
  startTimer(name: string, labels?: MetricLabels): () => number;

  /**
   * Register a counter metric
   */
  registerCounter(name: string, help: string, labelNames?: string[]): void;

  /**
   * Register a gauge metric
   */
  registerGauge(name: string, help: string, labelNames?: string[]): void;

  /**
   * Register a histogram metric
   */
  registerHistogram(
    name: string,
    help: string,
    labelNames?: string[],
    options?: HistogramBuckets,
  ): void;

  /**
   * Register a summary metric
   */
  registerSummary(
    name: string,
    help: string,
    labelNames?: string[],
    options?: SummaryPercentiles,
  ): void;

  /**
   * Get all metrics in the provider's format (e.g., Prometheus text format)
   */
  getMetrics(): Promise<string>;

  /**
   * Get the content type for the metrics endpoint
   */
  getContentType(): string;

  /**
   * Reset all metrics
   */
  resetMetrics(): void;
}

/**
 * Injection token for the MetricsPort
 */
export const METRICS_PORT = Symbol('METRICS_PORT');
