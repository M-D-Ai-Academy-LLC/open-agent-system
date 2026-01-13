/**
 * Tool Execution Hook (#17)
 *
 * Manages tool execution lifecycle.
 * Use cases: execution tracking, timeout management, metrics collection.
 */

import type {
  HookHandler,
  HookResult,
  ToolExecutionInput,
  ToolExecutionOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Tool executor function type
 */
export type ToolExecutor = (
  toolId: string,
  toolName: string,
  args: Record<string, unknown>
) => Promise<unknown>;

/**
 * Execution registry for tracking active executions
 */
export interface ExecutionRegistry {
  executions: Map<string, {
    toolId: string;
    toolName: string;
    startTime: number;
    timeout?: number;
  }>;
  register: (executionId: string, toolId: string, toolName: string, timeout?: number) => void;
  complete: (executionId: string) => number;
  getActive: () => Array<{ executionId: string; toolId: string; toolName: string; duration: number }>;
}

/**
 * Creates an execution registry
 */
export function createExecutionRegistry(): ExecutionRegistry {
  const executions = new Map<string, {
    toolId: string;
    toolName: string;
    startTime: number;
    timeout?: number;
  }>();

  return {
    executions,
    register: (executionId: string, toolId: string, toolName: string, timeout?: number): void => {
      executions.set(executionId, {
        toolId,
        toolName,
        startTime: Date.now(),
        timeout,
      });
    },
    complete: (executionId: string): number => {
      const execution = executions.get(executionId);
      if (!execution) return 0;
      const duration = Date.now() - execution.startTime;
      executions.delete(executionId);
      return duration;
    },
    getActive: () => {
      const now = Date.now();
      return Array.from(executions.entries()).map(([executionId, exec]) => ({
        executionId,
        toolId: exec.toolId,
        toolName: exec.toolName,
        duration: now - exec.startTime,
      }));
    },
  };
}

/**
 * Default tool execution handler - tracks execution
 */
export const defaultToolExecutionHandler: HookHandler<
  ToolExecutionInput,
  ToolExecutionOutput
> = async (input, context): Promise<HookResult<ToolExecutionOutput>> => {
  const startTime = Date.now();

  // Default implementation just returns placeholder
  // Real implementation would invoke the actual tool
  const duration = Date.now() - startTime;

  return {
    success: true,
    data: {
      result: {
        executed: true,
        toolId: input.toolId,
        toolName: input.toolName,
        arguments: input.arguments,
      },
      duration,
      metadata: {
        executedAt: startTime,
        requestId: context.requestId,
      },
    },
  };
};

/**
 * Creates an execution handler with a tool registry
 */
export function createRegisteredExecution(
  toolExecutors: Map<string, ToolExecutor>,
  registry?: ExecutionRegistry
): HookHandler<ToolExecutionInput, ToolExecutionOutput> {
  return async (input, context): Promise<HookResult<ToolExecutionOutput>> => {
    const executor = toolExecutors.get(input.toolName);
    const startTime = Date.now();
    const executionId = `${context.requestId}:${input.toolId}`;

    registry?.register(executionId, input.toolId, input.toolName, input.timeout);

    if (!executor) {
      registry?.complete(executionId);
      return {
        success: true,
        data: {
          result: null,
          duration: Date.now() - startTime,
          metadata: {
            error: `No executor found for tool: ${input.toolName}`,
          },
        },
      };
    }

    try {
      const result = await executor(input.toolId, input.toolName, input.arguments);
      const duration = registry?.complete(executionId) ?? (Date.now() - startTime);

      return {
        success: true,
        data: {
          result,
          duration,
          metadata: {
            executedAt: startTime,
          },
        },
      };
    } catch (error) {
      const duration = registry?.complete(executionId) ?? (Date.now() - startTime);

      return {
        success: true,
        data: {
          result: null,
          duration,
          metadata: {
            error: error instanceof Error ? error.message : String(error),
            executedAt: startTime,
          },
        },
      };
    }
  };
}

/**
 * Creates an execution handler with timeout
 */
export function createTimeoutExecution(
  innerHandler: HookHandler<ToolExecutionInput, ToolExecutionOutput>,
  defaultTimeoutMs: number = 30000
): HookHandler<ToolExecutionInput, ToolExecutionOutput> {
  return async (input, context): Promise<HookResult<ToolExecutionOutput>> => {
    const timeout = input.timeout ?? defaultTimeoutMs;
    const startTime = Date.now();

    const timeoutPromise = new Promise<HookResult<ToolExecutionOutput>>((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          data: {
            result: null,
            duration: Date.now() - startTime,
            metadata: {
              error: `Execution timed out after ${timeout}ms`,
              timedOut: true,
            },
          },
        });
      }, timeout);
    });

    return Promise.race([innerHandler(input, context), timeoutPromise]);
  };
}

/**
 * Execution metrics
 */
export interface ExecutionMetrics {
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  totalDuration: number;
  avgDuration: number;
}

/**
 * Creates an execution handler with metrics collection
 */
export function createMetricsExecution(
  innerHandler: HookHandler<ToolExecutionInput, ToolExecutionOutput>,
  onMetrics?: (toolName: string, metrics: ExecutionMetrics) => void
): {
  handler: HookHandler<ToolExecutionInput, ToolExecutionOutput>;
  getMetrics: (toolName?: string) => Map<string, ExecutionMetrics>;
} {
  const metricsMap = new Map<string, ExecutionMetrics>();

  const getOrCreateMetrics = (toolName: string): ExecutionMetrics => {
    let metrics = metricsMap.get(toolName);
    if (!metrics) {
      metrics = {
        totalExecutions: 0,
        successCount: 0,
        failureCount: 0,
        timeoutCount: 0,
        totalDuration: 0,
        avgDuration: 0,
      };
      metricsMap.set(toolName, metrics);
    }
    return metrics;
  };

  const handler: HookHandler<ToolExecutionInput, ToolExecutionOutput> = async (
    input,
    context
  ): Promise<HookResult<ToolExecutionOutput>> => {
    const result = await innerHandler(input, context);
    const metrics = getOrCreateMetrics(input.toolName);

    metrics.totalExecutions++;

    if (result.success) {
      const hasError = result.data.metadata?.['error'];
      const timedOut = result.data.metadata?.['timedOut'];

      if (timedOut) {
        metrics.timeoutCount++;
        metrics.failureCount++;
      } else if (hasError) {
        metrics.failureCount++;
      } else {
        metrics.successCount++;
      }

      metrics.totalDuration += result.data.duration;
      metrics.avgDuration = metrics.totalDuration / metrics.totalExecutions;

      onMetrics?.(input.toolName, { ...metrics });
    }

    return result;
  };

  const getMetrics = (toolName?: string): Map<string, ExecutionMetrics> => {
    if (toolName) {
      const metrics = metricsMap.get(toolName);
      const result = new Map<string, ExecutionMetrics>();
      if (metrics) {
        result.set(toolName, { ...metrics });
      }
      return result;
    }
    return new Map(Array.from(metricsMap.entries()).map(([k, v]) => [k, { ...v }]));
  };

  return { handler, getMetrics };
}

/**
 * Register the default tool execution hook
 */
export function registerDefaultToolExecution(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.TOOL_EXECUTION,
    {
      id: 'default-tool-execution',
      name: 'Default Tool Execution',
      priority: 'normal',
      description: 'Basic tool execution tracking',
    },
    defaultToolExecutionHandler
  );
}
