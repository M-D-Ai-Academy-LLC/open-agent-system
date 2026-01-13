/**
 * Metric Collection Hook (#36)
 *
 * Collects and records metrics for observability.
 * Use cases: performance monitoring, usage tracking, SLO management.
 */

import type {
  HookHandler,
  HookResult,
  MetricCollectionInput,
  MetricCollectionOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default metric collection handler
 */
export const defaultMetricCollectionHandler: HookHandler<
  MetricCollectionInput,
  MetricCollectionOutput
> = async (input, _context): Promise<HookResult<MetricCollectionOutput>> => {
  return {
    success: true,
    data: {
      recorded: true,
      aggregated: input.value,
    },
  };
};

/**
 * Metric type definitions
 */
export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

/**
 * Metric definition
 */
export interface MetricDefinition {
  name: string;
  type: MetricType;
  description: string;
  labels: string[];
  unit?: string;
  buckets?: number[]; // For histograms
}

/**
 * Metric store interface
 */
export interface MetricStore {
  metrics: Map<string, {
    definition: MetricDefinition;
    values: Array<{
      value: number;
      labels: Record<string, string>;
      timestamp: number;
    }>;
    aggregated: {
      sum: number;
      count: number;
      min: number;
      max: number;
      avg: number;
    };
  }>;
  record: (name: string, value: number, labels: Record<string, string>) => void;
  get: (name: string) => number | undefined;
  getAggregated: (name: string) => { sum: number; count: number; min: number; max: number; avg: number } | undefined;
  reset: (name: string) => void;
  getAll: () => Record<string, unknown>;
}

/**
 * Creates a metric store
 */
export function createMetricStore(): MetricStore {
  const metrics = new Map<string, {
    definition: MetricDefinition;
    values: Array<{
      value: number;
      labels: Record<string, string>;
      timestamp: number;
    }>;
    aggregated: {
      sum: number;
      count: number;
      min: number;
      max: number;
      avg: number;
    };
  }>();

  const ensureMetric = (name: string) => {
    if (!metrics.has(name)) {
      metrics.set(name, {
        definition: {
          name,
          type: 'gauge',
          description: '',
          labels: [],
        },
        values: [],
        aggregated: { sum: 0, count: 0, min: Infinity, max: -Infinity, avg: 0 },
      });
    }
    return metrics.get(name)!;
  };

  return {
    metrics,
    record: (name, value, labels) => {
      const metric = ensureMetric(name);
      metric.values.push({ value, labels, timestamp: Date.now() });

      // Update aggregations
      metric.aggregated.sum += value;
      metric.aggregated.count++;
      metric.aggregated.min = Math.min(metric.aggregated.min, value);
      metric.aggregated.max = Math.max(metric.aggregated.max, value);
      metric.aggregated.avg = metric.aggregated.sum / metric.aggregated.count;
    },
    get: (name) => {
      const metric = metrics.get(name);
      if (!metric || metric.values.length === 0) return undefined;
      return metric.values[metric.values.length - 1]!.value;
    },
    getAggregated: (name) => {
      const metric = metrics.get(name);
      if (!metric || metric.aggregated.count === 0) return undefined;
      return metric.aggregated;
    },
    reset: (name) => {
      const metric = metrics.get(name);
      if (metric) {
        metric.values = [];
        metric.aggregated = { sum: 0, count: 0, min: Infinity, max: -Infinity, avg: 0 };
      }
    },
    getAll: () => {
      const result: Record<string, unknown> = {};
      for (const [name, metric] of metrics) {
        result[name] = {
          latest: metric.values[metric.values.length - 1]?.value,
          aggregated: metric.aggregated,
          count: metric.values.length,
        };
      }
      return result;
    },
  };
}

/**
 * Alert threshold configuration
 */
export interface AlertThreshold {
  metric: string;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

/**
 * Creates a metric collection handler with a store
 */
export function createStoredMetricHandler(
  store: MetricStore
): HookHandler<MetricCollectionInput, MetricCollectionOutput> {
  return async (input, _context): Promise<HookResult<MetricCollectionOutput>> => {
    store.record(input.metricName, input.value, input.labels);
    const aggregated = store.getAggregated(input.metricName);

    return {
      success: true,
      data: {
        recorded: true,
        aggregated: aggregated?.avg,
      },
    };
  };
}

/**
 * Creates a metric collection handler with alert thresholds
 */
export function createAlertingMetricHandler(
  thresholds: AlertThreshold[],
  store?: MetricStore
): HookHandler<MetricCollectionInput, MetricCollectionOutput> {
  const metricStore = store ?? createMetricStore();

  return async (input, _context): Promise<HookResult<MetricCollectionOutput>> => {
    metricStore.record(input.metricName, input.value, input.labels);

    const alerts: string[] = [];

    // Check thresholds
    for (const threshold of thresholds) {
      if (threshold.metric !== input.metricName) continue;

      let triggered = false;
      switch (threshold.condition) {
        case 'gt':
          triggered = input.value > threshold.value;
          break;
        case 'lt':
          triggered = input.value < threshold.value;
          break;
        case 'eq':
          triggered = input.value === threshold.value;
          break;
        case 'gte':
          triggered = input.value >= threshold.value;
          break;
        case 'lte':
          triggered = input.value <= threshold.value;
          break;
      }

      if (triggered) {
        alerts.push(`[${threshold.severity.toUpperCase()}] ${threshold.message}`);
      }
    }

    return {
      success: true,
      data: {
        recorded: true,
        aggregated: metricStore.getAggregated(input.metricName)?.avg,
        alerts: alerts.length > 0 ? alerts : undefined,
      },
    };
  };
}

/**
 * Creates a histogram metric handler
 */
export function createHistogramMetricHandler(
  buckets: number[] = [0.1, 0.5, 1, 2.5, 5, 10, 25, 50, 100]
): HookHandler<MetricCollectionInput, MetricCollectionOutput> {
  const histograms = new Map<string, {
    buckets: Map<number, number>;
    sum: number;
    count: number;
  }>();

  return async (input, _context): Promise<HookResult<MetricCollectionOutput>> => {
    if (!histograms.has(input.metricName)) {
      const bucketMap = new Map<number, number>();
      for (const b of buckets) {
        bucketMap.set(b, 0);
      }
      bucketMap.set(Infinity, 0);
      histograms.set(input.metricName, {
        buckets: bucketMap,
        sum: 0,
        count: 0,
      });
    }

    const histogram = histograms.get(input.metricName)!;
    histogram.sum += input.value;
    histogram.count++;

    // Increment all buckets where value <= bucket
    for (const bucket of histogram.buckets.keys()) {
      if (input.value <= bucket) {
        histogram.buckets.set(bucket, histogram.buckets.get(bucket)! + 1);
      }
    }

    return {
      success: true,
      data: {
        recorded: true,
        aggregated: histogram.sum / histogram.count,
      },
      metadata: {
        type: 'histogram',
        sum: histogram.sum,
        count: histogram.count,
      },
    };
  };
}

/**
 * Creates a rate-calculating metric handler
 */
export function createRateMetricHandler(
  windowMs: number = 60000
): HookHandler<MetricCollectionInput, MetricCollectionOutput> {
  const windows = new Map<string, Array<{ value: number; timestamp: number }>>();

  return async (input, _context): Promise<HookResult<MetricCollectionOutput>> => {
    const now = input.timestamp ?? Date.now();

    if (!windows.has(input.metricName)) {
      windows.set(input.metricName, []);
    }

    const window = windows.get(input.metricName)!;
    window.push({ value: input.value, timestamp: now });

    // Remove old entries
    const cutoff = now - windowMs;
    while (window.length > 0 && window[0]!.timestamp < cutoff) {
      window.shift();
    }

    // Calculate rate
    const sum = window.reduce((acc, entry) => acc + entry.value, 0);
    const rate = sum / (windowMs / 1000); // Per second

    return {
      success: true,
      data: {
        recorded: true,
        aggregated: rate,
      },
      metadata: {
        windowMs,
        samplesInWindow: window.length,
        rate,
      },
    };
  };
}

/**
 * Creates a buffered metric handler for batch reporting
 */
export function createBufferedMetricHandler(
  batchSize: number = 100,
  flushInterval: number = 10000,
  reporter: (metrics: Array<{ name: string; value: number; labels: Record<string, string>; timestamp: number }>) => Promise<void>
): {
  handler: HookHandler<MetricCollectionInput, MetricCollectionOutput>;
  flush: () => Promise<void>;
  stop: () => void;
} {
  const buffer: Array<{
    name: string;
    value: number;
    labels: Record<string, string>;
    timestamp: number;
  }> = [];

  let intervalId: ReturnType<typeof setInterval> | undefined;

  const flush = async () => {
    if (buffer.length === 0) return;
    const toReport = buffer.splice(0, buffer.length);
    await reporter(toReport);
  };

  // Start periodic flush
  intervalId = setInterval(flush, flushInterval);

  const handler: HookHandler<MetricCollectionInput, MetricCollectionOutput> = async (
    input,
    _context
  ): Promise<HookResult<MetricCollectionOutput>> => {
    buffer.push({
      name: input.metricName,
      value: input.value,
      labels: input.labels,
      timestamp: input.timestamp ?? Date.now(),
    });

    // Auto-flush if buffer is full
    if (buffer.length >= batchSize) {
      await flush();
    }

    return {
      success: true,
      data: {
        recorded: true,
      },
      metadata: {
        buffered: true,
        bufferSize: buffer.length,
      },
    };
  };

  const stop = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = undefined;
    }
  };

  return { handler, flush, stop };
}

/**
 * Creates a labeled metric handler with automatic label management
 */
export function createLabeledMetricHandler(
  defaultLabels: Record<string, string>,
  innerHandler?: HookHandler<MetricCollectionInput, MetricCollectionOutput>
): HookHandler<MetricCollectionInput, MetricCollectionOutput> {
  return async (input, context): Promise<HookResult<MetricCollectionOutput>> => {
    const enrichedInput: MetricCollectionInput = {
      ...input,
      labels: {
        ...defaultLabels,
        ...input.labels,
      },
    };

    const handler = innerHandler ?? defaultMetricCollectionHandler;
    return handler(enrichedInput, context);
  };
}

/**
 * Creates a logging metric handler
 */
export function createLoggingMetricHandler(
  logger: {
    debug: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<MetricCollectionInput, MetricCollectionOutput>
): HookHandler<MetricCollectionInput, MetricCollectionOutput> {
  return async (input, context): Promise<HookResult<MetricCollectionOutput>> => {
    logger.debug(`Recording metric: ${input.metricName}`, {
      metricName: input.metricName,
      value: input.value,
      labels: input.labels,
      requestId: context.requestId,
    });

    const handler = innerHandler ?? defaultMetricCollectionHandler;
    const result = await handler(input, context);

    if (result.success && result.data.alerts && result.data.alerts.length > 0) {
      logger.debug(`Metric alerts triggered: ${input.metricName}`, {
        metricName: input.metricName,
        alerts: result.data.alerts,
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Register the default metric collection hook
 */
export function registerDefaultMetricCollection(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.METRIC_COLLECTION,
    {
      id: 'default-metric-collection',
      name: 'Default Metric Collection',
      priority: 'normal',
      description: 'Basic metric collection handler',
    },
    defaultMetricCollectionHandler
  );
}
