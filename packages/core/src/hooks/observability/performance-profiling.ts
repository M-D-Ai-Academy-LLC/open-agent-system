/**
 * Performance Profiling Hook (#42)
 *
 * Profiles operation performance for analysis.
 * Use cases: latency tracking, bottleneck detection, optimization.
 */

import type {
  HookHandler,
  HookResult,
  PerformanceProfilingInput,
  PerformanceProfilingOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default performance profiling handler
 */
export const defaultPerformanceProfilingHandler: HookHandler<
  PerformanceProfilingInput,
  PerformanceProfilingOutput
> = async (input, _context): Promise<HookResult<PerformanceProfilingOutput>> => {
  const duration = input.endTime - input.startTime;

  return {
    success: true,
    data: {
      duration,
    },
  };
};

/**
 * Percentile calculator
 */
export interface PercentileCalculator {
  values: number[];
  add: (value: number) => void;
  getPercentile: (p: number) => number;
  getStats: () => {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    count: number;
  };
  reset: () => void;
}

/**
 * Creates a percentile calculator
 */
export function createPercentileCalculator(maxSamples: number = 10000): PercentileCalculator {
  let values: number[] = [];

  return {
    values,
    add: (value) => {
      values.push(value);
      // Keep only last maxSamples
      if (values.length > maxSamples) {
        values = values.slice(-maxSamples);
      }
    },
    getPercentile: (p) => {
      if (values.length === 0) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      const index = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[Math.max(0, index)]!;
    },
    getStats: () => {
      if (values.length === 0) {
        return { min: 0, max: 0, avg: 0, p50: 0, p90: 0, p95: 0, p99: 0, count: 0 };
      }
      const sorted = [...values].sort((a, b) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);
      const getP = (p: number) => {
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)]!;
      };
      return {
        min: sorted[0]!,
        max: sorted[sorted.length - 1]!,
        avg: sum / values.length,
        p50: getP(50),
        p90: getP(90),
        p95: getP(95),
        p99: getP(99),
        count: values.length,
      };
    },
    reset: () => {
      values = [];
    },
  };
}

/**
 * Performance profile store interface
 */
export interface ProfileStore {
  profiles: Map<string, {
    calculator: PercentileCalculator;
    baseline?: number;
    samples: Array<{
      duration: number;
      timestamp: number;
      metadata?: Record<string, unknown>;
    }>;
  }>;
  record: (operation: string, duration: number, metadata?: Record<string, unknown>) => void;
  getProfile: (operation: string) => ReturnType<PercentileCalculator['getStats']> | undefined;
  setBaseline: (operation: string, baseline: number) => void;
  getBaseline: (operation: string) => number | undefined;
  isAnomaly: (operation: string, duration: number, threshold?: number) => boolean;
}

/**
 * Creates a profile store
 */
export function createProfileStore(maxSamples: number = 1000): ProfileStore {
  const profiles = new Map<string, {
    calculator: PercentileCalculator;
    baseline?: number;
    samples: Array<{
      duration: number;
      timestamp: number;
      metadata?: Record<string, unknown>;
    }>;
  }>();

  const ensureProfile = (operation: string) => {
    if (!profiles.has(operation)) {
      profiles.set(operation, {
        calculator: createPercentileCalculator(maxSamples),
        samples: [],
      });
    }
    return profiles.get(operation)!;
  };

  return {
    profiles,
    record: (operation, duration, metadata) => {
      const profile = ensureProfile(operation);
      profile.calculator.add(duration);
      profile.samples.push({
        duration,
        timestamp: Date.now(),
        metadata,
      });
      // Keep only last maxSamples
      if (profile.samples.length > maxSamples) {
        profile.samples = profile.samples.slice(-maxSamples);
      }
    },
    getProfile: (operation) => {
      const profile = profiles.get(operation);
      if (!profile) return undefined;
      return profile.calculator.getStats();
    },
    setBaseline: (operation, baseline) => {
      const profile = ensureProfile(operation);
      profile.baseline = baseline;
    },
    getBaseline: (operation) => {
      return profiles.get(operation)?.baseline;
    },
    isAnomaly: (operation, duration, threshold = 2) => {
      const profile = profiles.get(operation);
      if (!profile || profile.calculator.values.length < 10) return false;

      const stats = profile.calculator.getStats();
      const stdDev = calculateStdDev(profile.calculator.values, stats.avg);

      // Anomaly if duration is more than threshold standard deviations from mean
      return Math.abs(duration - stats.avg) > threshold * stdDev;
    },
  };
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

/**
 * Creates a performance profiling handler with percentiles
 */
export function createPercentiledProfilingHandler(
  store?: ProfileStore
): HookHandler<PerformanceProfilingInput, PerformanceProfilingOutput> {
  const profileStore = store ?? createProfileStore();

  return async (input, _context): Promise<HookResult<PerformanceProfilingOutput>> => {
    const duration = input.endTime - input.startTime;

    profileStore.record(input.operation, duration, input.metadata);
    const stats = profileStore.getProfile(input.operation);

    // Calculate percentile rank of this duration
    let percentile: number | undefined;
    if (stats && stats.count >= 10) {
      const profile = profileStore.profiles.get(input.operation);
      if (profile) {
        const sorted = [...profile.calculator.values].sort((a, b) => a - b);
        const rank = sorted.filter((v) => v <= duration).length;
        percentile = (rank / sorted.length) * 100;
      }
    }

    return {
      success: true,
      data: {
        duration,
        percentile,
        baseline: profileStore.getBaseline(input.operation),
        anomaly: profileStore.isAnomaly(input.operation, duration),
      },
      metadata: stats ? {
        p50: stats.p50,
        p90: stats.p90,
        p95: stats.p95,
        p99: stats.p99,
        avg: stats.avg,
        count: stats.count,
      } : undefined,
    };
  };
}

/**
 * Creates a performance profiling handler with baseline comparison
 */
export function createBaselineProfilingHandler(
  baselines: Record<string, number>,
  tolerancePercent: number = 20
): HookHandler<PerformanceProfilingInput, PerformanceProfilingOutput> {
  return async (input, _context): Promise<HookResult<PerformanceProfilingOutput>> => {
    const duration = input.endTime - input.startTime;
    const baseline = baselines[input.operation];

    let anomaly = false;
    if (baseline !== undefined) {
      const tolerance = baseline * (tolerancePercent / 100);
      anomaly = duration > baseline + tolerance;
    }

    return {
      success: true,
      data: {
        duration,
        baseline,
        anomaly,
      },
      metadata: baseline !== undefined ? {
        deviationPercent: ((duration - baseline) / baseline) * 100,
        tolerancePercent,
      } : undefined,
    };
  };
}

/**
 * Creates a performance profiling handler with histograms
 */
export function createHistogramProfilingHandler(
  buckets: number[] = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
): HookHandler<PerformanceProfilingInput, PerformanceProfilingOutput> {
  const histograms = new Map<string, {
    buckets: Map<number, number>;
    sum: number;
    count: number;
  }>();

  return async (input, _context): Promise<HookResult<PerformanceProfilingOutput>> => {
    const duration = input.endTime - input.startTime;

    if (!histograms.has(input.operation)) {
      const bucketMap = new Map<number, number>();
      for (const b of buckets) {
        bucketMap.set(b, 0);
      }
      bucketMap.set(Infinity, 0);
      histograms.set(input.operation, {
        buckets: bucketMap,
        sum: 0,
        count: 0,
      });
    }

    const histogram = histograms.get(input.operation)!;
    histogram.sum += duration;
    histogram.count++;

    // Increment all buckets where duration <= bucket
    for (const bucket of histogram.buckets.keys()) {
      if (duration <= bucket) {
        histogram.buckets.set(bucket, histogram.buckets.get(bucket)! + 1);
      }
    }

    // Find percentile based on bucket
    let percentile: number | undefined;
    for (const [bucket, count] of histogram.buckets) {
      if (duration <= bucket) {
        percentile = (count / histogram.count) * 100;
        break;
      }
    }

    return {
      success: true,
      data: {
        duration,
        percentile,
      },
      metadata: {
        histogram: Object.fromEntries(
          Array.from(histogram.buckets.entries())
            .filter(([b]) => b !== Infinity)
            .map(([b, c]) => [b, c])
        ),
        sum: histogram.sum,
        count: histogram.count,
        avg: histogram.sum / histogram.count,
      },
    };
  };
}

/**
 * Creates a performance profiling handler with anomaly detection
 */
export function createAnomalyDetectingProfilingHandler(
  windowSize: number = 100,
  threshold: number = 3
): HookHandler<PerformanceProfilingInput, PerformanceProfilingOutput> {
  const windows = new Map<string, number[]>();

  return async (input, _context): Promise<HookResult<PerformanceProfilingOutput>> => {
    const duration = input.endTime - input.startTime;

    if (!windows.has(input.operation)) {
      windows.set(input.operation, []);
    }

    const window = windows.get(input.operation)!;
    window.push(duration);

    // Keep only last windowSize samples
    while (window.length > windowSize) {
      window.shift();
    }

    // Need minimum samples for anomaly detection
    if (window.length < 10) {
      return {
        success: true,
        data: {
          duration,
          anomaly: false,
        },
        metadata: {
          samplesCollected: window.length,
          minSamplesRequired: 10,
        },
      };
    }

    // Calculate Z-score
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const stdDev = calculateStdDev(window, mean);

    const zScore = stdDev > 0 ? (duration - mean) / stdDev : 0;
    const anomaly = Math.abs(zScore) > threshold;

    return {
      success: true,
      data: {
        duration,
        baseline: mean,
        anomaly,
      },
      metadata: {
        zScore,
        mean,
        stdDev,
        threshold,
        windowSize: window.length,
      },
    };
  };
}

/**
 * Creates a performance profiling handler with SLO tracking
 */
export function createSloProfilingHandler(
  slos: Record<string, {
    target: number; // ms
    percentile: number; // e.g., 99
  }>
): HookHandler<PerformanceProfilingInput, PerformanceProfilingOutput> {
  const store = createProfileStore();

  return async (input, _context): Promise<HookResult<PerformanceProfilingOutput>> => {
    const duration = input.endTime - input.startTime;

    store.record(input.operation, duration, input.metadata);
    const stats = store.getProfile(input.operation);

    const slo = slos[input.operation];
    let sloCompliant: boolean | undefined;
    let sloStatus: 'compliant' | 'warning' | 'breaching' | undefined;

    if (slo && stats && stats.count >= 100) {
      const profile = store.profiles.get(input.operation);
      if (profile) {
        const actualPercentile = profile.calculator.getPercentile(slo.percentile);
        sloCompliant = actualPercentile <= slo.target;

        // Calculate SLO status
        const headroom = slo.target - actualPercentile;
        if (headroom >= slo.target * 0.2) {
          sloStatus = 'compliant';
        } else if (headroom >= 0) {
          sloStatus = 'warning';
        } else {
          sloStatus = 'breaching';
        }
      }
    }

    return {
      success: true,
      data: {
        duration,
        percentile: stats ? (store.profiles.get(input.operation)?.calculator.values.filter((v) => v <= duration).length ?? 0) / stats.count * 100 : undefined,
        baseline: slo?.target,
        anomaly: duration > (slo?.target ?? Infinity),
      },
      metadata: slo && stats ? {
        sloTarget: slo.target,
        sloPercentile: slo.percentile,
        sloCompliant,
        sloStatus,
        actualP99: store.profiles.get(input.operation)?.calculator.getPercentile(99),
      } : undefined,
    };
  };
}

/**
 * Creates a performance profiling handler with reporting
 */
export function createReportingProfilingHandler(
  reporter: {
    report: (profile: {
      operation: string;
      duration: number;
      timestamp: number;
      percentile?: number;
      anomaly?: boolean;
      metadata?: Record<string, unknown>;
    }) => void;
  },
  innerHandler?: HookHandler<PerformanceProfilingInput, PerformanceProfilingOutput>
): HookHandler<PerformanceProfilingInput, PerformanceProfilingOutput> {
  return async (input, context): Promise<HookResult<PerformanceProfilingOutput>> => {
    const handler = innerHandler ?? defaultPerformanceProfilingHandler;
    const result = await handler(input, context);

    if (result.success) {
      reporter.report({
        operation: input.operation,
        duration: result.data.duration,
        timestamp: context.timestamp,
        percentile: result.data.percentile,
        anomaly: result.data.anomaly,
        metadata: input.metadata,
      });
    }

    return result;
  };
}

/**
 * Creates a logging performance profiling handler
 */
export function createLoggingProfilingHandler(
  logger: {
    debug: (message: string, context: Record<string, unknown>) => void;
    warn: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<PerformanceProfilingInput, PerformanceProfilingOutput>
): HookHandler<PerformanceProfilingInput, PerformanceProfilingOutput> {
  return async (input, context): Promise<HookResult<PerformanceProfilingOutput>> => {
    const handler = innerHandler ?? defaultPerformanceProfilingHandler;
    const result = await handler(input, context);

    if (result.success) {
      const logFn = result.data.anomaly ? logger.warn : logger.debug;
      logFn(`Performance: ${input.operation} took ${result.data.duration}ms`, {
        operation: input.operation,
        duration: result.data.duration,
        percentile: result.data.percentile,
        baseline: result.data.baseline,
        anomaly: result.data.anomaly,
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Register the default performance profiling hook
 */
export function registerDefaultPerformanceProfiling(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.PERFORMANCE_PROFILING,
    {
      id: 'default-performance-profiling',
      name: 'Default Performance Profiling',
      priority: 'normal',
      description: 'Basic performance profiling handler',
    },
    defaultPerformanceProfilingHandler
  );
}
