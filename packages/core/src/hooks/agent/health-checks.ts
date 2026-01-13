/**
 * Health Checks Hook (#28)
 *
 * Monitors agent health and performance.
 * Use cases: liveness probes, resource monitoring, performance optimization.
 */

import type {
  HookHandler,
  HookResult,
  AgentHealthCheckInput,
  AgentHealthCheckOutput,
  HealthMetrics,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default health check handler - returns healthy
 */
export const defaultAgentHealthCheckHandler: HookHandler<
  AgentHealthCheckInput,
  AgentHealthCheckOutput
> = async (_input, _context): Promise<HookResult<AgentHealthCheckOutput>> => {
  const metrics: HealthMetrics = {
    memoryUsage: 0,
    taskQueueLength: 0,
    averageResponseTime: 0,
    errorRate: 0,
    uptime: 0,
  };

  return {
    success: true,
    data: {
      healthy: true,
      metrics,
      recommendations: [],
    },
  };
};

/**
 * Health thresholds configuration
 */
export interface HealthThresholds {
  maxMemoryUsage?: number;
  maxTaskQueueLength?: number;
  maxAverageResponseTime?: number;
  maxErrorRate?: number;
  minUptime?: number;
}

/**
 * Default health thresholds
 */
export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  maxMemoryUsage: 0.9, // 90% of available memory
  maxTaskQueueLength: 100,
  maxAverageResponseTime: 5000, // 5 seconds
  maxErrorRate: 0.1, // 10% error rate
  minUptime: 0, // No minimum uptime required
};

/**
 * Creates a health check handler with metrics collection
 */
export function createMetricsHealthCheck(
  metricsCollector: {
    getMemoryUsage: (agentId: string) => number;
    getTaskQueueLength: (agentId: string) => number;
    getAverageResponseTime: (agentId: string) => number;
    getErrorRate: (agentId: string) => number;
    getUptime: (agentId: string) => number;
  },
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): HookHandler<AgentHealthCheckInput, AgentHealthCheckOutput> {
  return async (input, _context): Promise<HookResult<AgentHealthCheckOutput>> => {
    const checks = input.checks;
    const metrics: HealthMetrics = {
      memoryUsage: 0,
      taskQueueLength: 0,
      averageResponseTime: 0,
      errorRate: 0,
      uptime: 0,
    };
    const recommendations: string[] = [];
    let healthy = true;

    if (checks.includes('memory')) {
      metrics.memoryUsage = metricsCollector.getMemoryUsage(input.agentId);
      if (thresholds.maxMemoryUsage && metrics.memoryUsage > thresholds.maxMemoryUsage) {
        healthy = false;
        recommendations.push(`High memory usage: ${(metrics.memoryUsage * 100).toFixed(1)}%`);
      }
    }

    if (checks.includes('task-queue')) {
      metrics.taskQueueLength = metricsCollector.getTaskQueueLength(input.agentId);
      if (thresholds.maxTaskQueueLength && metrics.taskQueueLength > thresholds.maxTaskQueueLength) {
        healthy = false;
        recommendations.push(`Task queue overloaded: ${metrics.taskQueueLength} tasks`);
      }
    }

    if (checks.includes('responsiveness')) {
      metrics.averageResponseTime = metricsCollector.getAverageResponseTime(input.agentId);
      if (thresholds.maxAverageResponseTime && metrics.averageResponseTime > thresholds.maxAverageResponseTime) {
        healthy = false;
        recommendations.push(`Slow response time: ${metrics.averageResponseTime}ms`);
      }
    }

    if (checks.includes('connections')) {
      metrics.errorRate = metricsCollector.getErrorRate(input.agentId);
      if (thresholds.maxErrorRate && metrics.errorRate > thresholds.maxErrorRate) {
        healthy = false;
        recommendations.push(`High error rate: ${(metrics.errorRate * 100).toFixed(1)}%`);
      }
    }

    metrics.uptime = metricsCollector.getUptime(input.agentId);
    if (thresholds.minUptime && metrics.uptime < thresholds.minUptime) {
      recommendations.push(`Low uptime: ${metrics.uptime}ms`);
    }

    return {
      success: true,
      data: {
        healthy,
        metrics,
        recommendations: recommendations.length > 0 ? recommendations : undefined,
      },
    };
  };
}

/**
 * Creates a health check handler with ping-based liveness
 */
export function createLivenessHealthCheck(
  pingHandler: {
    ping: (agentId: string) => Promise<boolean>;
    getLastPingTime: (agentId: string) => number;
  },
  timeoutMs: number = 5000
): HookHandler<AgentHealthCheckInput, AgentHealthCheckOutput> {
  return async (input, _context): Promise<HookResult<AgentHealthCheckOutput>> => {
    const metrics: HealthMetrics = {
      memoryUsage: 0,
      taskQueueLength: 0,
      averageResponseTime: 0,
      errorRate: 0,
      uptime: Date.now() - pingHandler.getLastPingTime(input.agentId),
    };

    try {
      const pingPromise = pingHandler.ping(input.agentId);
      const timeoutPromise = new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), timeoutMs);
      });

      const alive = await Promise.race([pingPromise, timeoutPromise]);

      return {
        success: true,
        data: {
          healthy: alive,
          metrics,
          recommendations: alive ? undefined : ['Agent not responding to health ping'],
        },
      };
    } catch (error) {
      return {
        success: true,
        data: {
          healthy: false,
          metrics,
          recommendations: [`Health ping failed: ${error instanceof Error ? error.message : String(error)}`],
        },
      };
    }
  };
}

/**
 * Creates a health check handler with readiness probe
 */
export function createReadinessHealthCheck(
  readinessChecks: Array<{
    name: string;
    check: (agentId: string) => Promise<boolean>;
  }>
): HookHandler<AgentHealthCheckInput, AgentHealthCheckOutput> {
  return async (input, _context): Promise<HookResult<AgentHealthCheckOutput>> => {
    const metrics: HealthMetrics = {
      memoryUsage: 0,
      taskQueueLength: 0,
      averageResponseTime: 0,
      errorRate: 0,
      uptime: 0,
    };
    const recommendations: string[] = [];
    let healthy = true;

    for (const { name, check } of readinessChecks) {
      try {
        const ready = await check(input.agentId);
        if (!ready) {
          healthy = false;
          recommendations.push(`Readiness check failed: ${name}`);
        }
      } catch (error) {
        healthy = false;
        recommendations.push(`Readiness check error (${name}): ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      success: true,
      data: {
        healthy,
        metrics,
        recommendations: recommendations.length > 0 ? recommendations : undefined,
      },
    };
  };
}

/**
 * Creates a health check handler with self-healing
 */
export function createSelfHealingHealthCheck(
  innerHandler: HookHandler<AgentHealthCheckInput, AgentHealthCheckOutput>,
  healingActions: Map<string, (agentId: string) => Promise<boolean>>
): HookHandler<AgentHealthCheckInput, AgentHealthCheckOutput> {
  return async (input, context): Promise<HookResult<AgentHealthCheckOutput>> => {
    const result = await innerHandler(input, context);

    if (!result.success) {
      return result;
    }

    if (result.data.healthy) {
      return result;
    }

    // Try to heal based on recommendations
    const healedRecommendations: string[] = [];
    const remainingRecommendations = result.data.recommendations ?? [];

    for (const recommendation of remainingRecommendations) {
      const healingAction = healingActions.get(recommendation);
      if (healingAction) {
        try {
          const healed = await healingAction(input.agentId);
          if (healed) {
            healedRecommendations.push(`Healed: ${recommendation}`);
          } else {
            healedRecommendations.push(recommendation);
          }
        } catch {
          healedRecommendations.push(recommendation);
        }
      } else {
        healedRecommendations.push(recommendation);
      }
    }

    // Re-check health after healing
    const afterHealing = await innerHandler(input, context);

    if (afterHealing.success) {
      return {
        success: true,
        data: {
          healthy: afterHealing.data.healthy,
          metrics: afterHealing.data.metrics,
          recommendations: healedRecommendations.length > 0 ? healedRecommendations : undefined,
        },
        metadata: {
          selfHealingAttempted: true,
        },
      };
    }

    return afterHealing;
  };
}

/**
 * Creates a health check handler with caching
 */
export function createCachedHealthCheck(
  innerHandler: HookHandler<AgentHealthCheckInput, AgentHealthCheckOutput>,
  cacheTtlMs: number = 5000
): HookHandler<AgentHealthCheckInput, AgentHealthCheckOutput> {
  const cache = new Map<string, {
    result: HookResult<AgentHealthCheckOutput>;
    timestamp: number;
  }>();

  return async (input, context): Promise<HookResult<AgentHealthCheckOutput>> => {
    const cacheKey = `${input.agentId}:${input.checks.sort().join(',')}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < cacheTtlMs) {
      // Return cached result with cache metadata
      if (cached.result.success) {
        return {
          success: true,
          data: cached.result.data,
          metadata: {
            cached: true,
            cacheAge: Date.now() - cached.timestamp,
          },
        };
      }
      return cached.result;
    }

    const result = await innerHandler(input, context);

    cache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });

    return result;
  };
}

/**
 * Creates a health check handler with logging
 */
export function createLoggingHealthCheck(
  logger: {
    debug: (message: string, context: Record<string, unknown>) => void;
    warn: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<AgentHealthCheckInput, AgentHealthCheckOutput>
): HookHandler<AgentHealthCheckInput, AgentHealthCheckOutput> {
  return async (input, context): Promise<HookResult<AgentHealthCheckOutput>> => {
    logger.debug(`Health check requested: ${input.agentId}`, {
      agentId: input.agentId,
      checks: input.checks,
      requestId: context.requestId,
    });

    const handler = innerHandler ?? defaultAgentHealthCheckHandler;
    const result = await handler(input, context);

    if (result.success) {
      if (!result.data.healthy) {
        logger.warn(`Agent unhealthy: ${input.agentId}`, {
          agentId: input.agentId,
          metrics: result.data.metrics,
          recommendations: result.data.recommendations,
          requestId: context.requestId,
        });
      } else {
        logger.debug(`Agent healthy: ${input.agentId}`, {
          agentId: input.agentId,
          metrics: result.data.metrics,
          requestId: context.requestId,
        });
      }
    }

    return result;
  };
}

/**
 * Creates a composite health check handler
 */
export function createCompositeHealthCheck(
  handlers: HookHandler<AgentHealthCheckInput, AgentHealthCheckOutput>[]
): HookHandler<AgentHealthCheckInput, AgentHealthCheckOutput> {
  return async (input, context): Promise<HookResult<AgentHealthCheckOutput>> => {
    const combinedMetrics: HealthMetrics = {
      memoryUsage: 0,
      taskQueueLength: 0,
      averageResponseTime: 0,
      errorRate: 0,
      uptime: 0,
    };
    const allRecommendations: string[] = [];
    let healthy = true;

    for (const handler of handlers) {
      const result = await handler(input, context);

      if (!result.success) {
        return result;
      }

      healthy = healthy && result.data.healthy;

      // Aggregate metrics (take max/worst values)
      combinedMetrics.memoryUsage = Math.max(combinedMetrics.memoryUsage, result.data.metrics.memoryUsage);
      combinedMetrics.taskQueueLength = Math.max(combinedMetrics.taskQueueLength, result.data.metrics.taskQueueLength);
      combinedMetrics.averageResponseTime = Math.max(combinedMetrics.averageResponseTime, result.data.metrics.averageResponseTime);
      combinedMetrics.errorRate = Math.max(combinedMetrics.errorRate, result.data.metrics.errorRate);
      combinedMetrics.uptime = Math.max(combinedMetrics.uptime, result.data.metrics.uptime);

      if (result.data.recommendations) {
        allRecommendations.push(...result.data.recommendations);
      }
    }

    return {
      success: true,
      data: {
        healthy,
        metrics: combinedMetrics,
        recommendations: allRecommendations.length > 0 ? [...new Set(allRecommendations)] : undefined,
      },
    };
  };
}

/**
 * Register the default agent health check hook
 */
export function registerDefaultAgentHealthCheck(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.AGENT_HEALTH_CHECK,
    {
      id: 'default-agent-health-check',
      name: 'Default Agent Health Check',
      priority: 'normal',
      description: 'Basic agent health check handler',
    },
    defaultAgentHealthCheckHandler
  );
}
