/**
 * Tool Executor
 *
 * Executes tools with validation, caching, sandboxing, and error recovery.
 */

import { EventEmitter } from 'eventemitter3';
import type { ToolCall } from '../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../hooks/registry.js';
import { ToolRegistry } from './registry.js';
import type {
  ToolContext,
  ToolExecutionResult,
  ToolExecutionStats,
  ToolEvents,
  ToolCache,
  CacheEntry,
  SandboxConfig,
  ErrorRecoveryConfig,
  ResultTransformer,
} from './types.js';
import { DEFAULT_SANDBOX_CONFIG } from './types.js';

// =============================================================================
// Simple In-Memory Cache
// =============================================================================

class SimpleCache implements ToolCache {
  private cache: Map<string, CacheEntry> = new Map();
  private hits = 0;
  private misses = 0;

  get(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    entry.hits++;
    this.hits++;
    return entry.value;
  }

  set(key: string, value: unknown, ttl: number): void {
    this.cache.set(key, {
      key,
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl,
      hits: 0,
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  getStats() {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
    };
  }
}

// =============================================================================
// Rate Limiter
// =============================================================================

class RateLimiter {
  private windows: Map<string, number[]> = new Map();
  private windowSize = 60000; // 1 minute

  isAllowed(toolName: string, limit: number): boolean {
    const now = Date.now();
    const windowStart = now - this.windowSize;

    let calls = this.windows.get(toolName) ?? [];
    calls = calls.filter((t) => t > windowStart);

    if (calls.length >= limit) {
      return false;
    }

    calls.push(now);
    this.windows.set(toolName, calls);
    return true;
  }

  getRemainingCalls(toolName: string, limit: number): number {
    const now = Date.now();
    const windowStart = now - this.windowSize;

    const calls = this.windows.get(toolName) ?? [];
    const recentCalls = calls.filter((t) => t > windowStart);

    return Math.max(0, limit - recentCalls.length);
  }

  reset(toolName: string): void {
    this.windows.delete(toolName);
  }

  resetAll(): void {
    this.windows.clear();
  }
}

// =============================================================================
// Tool Executor Implementation
// =============================================================================

export class ToolExecutor extends EventEmitter<ToolEvents> {
  private registry: ToolRegistry;
  private hookRegistry: HookRegistry;
  private cache: ToolCache;
  private rateLimiter: RateLimiter;
  private sandboxConfig: SandboxConfig;
  private defaultTimeout: number;
  private resultTransformers: Map<string, ResultTransformer> = new Map();
  private errorRecoveryConfigs: Map<string, ErrorRecoveryConfig> = new Map();

  // Statistics
  private stats: Map<string, ToolExecutionStats> = new Map();

  constructor(
    registry: ToolRegistry,
    hookRegistry: HookRegistry,
    options: {
      cache?: ToolCache;
      sandboxConfig?: Partial<SandboxConfig>;
      defaultTimeout?: number;
    } = {}
  ) {
    super();
    this.registry = registry;
    this.hookRegistry = hookRegistry;
    this.cache = options.cache ?? new SimpleCache();
    this.rateLimiter = new RateLimiter();
    this.sandboxConfig = { ...DEFAULT_SANDBOX_CONFIG, ...options.sandboxConfig };
    this.defaultTimeout = options.defaultTimeout ?? 30000;
  }

  /**
   * Execute a tool call
   */
  async execute(
    toolCall: ToolCall,
    context: ToolContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const toolName = toolCall.name;

    // Get registered tool
    const tool = this.registry.get(toolName);
    if (!tool) {
      return {
        toolCallId: toolCall.id,
        toolName,
        success: false,
        error: new Error(`Tool not found: ${toolName}`),
        duration: Date.now() - startTime,
      };
    }

    // Check deprecation
    if (tool.options.deprecated) {
      this.emit(
        'tool:deprecated-used',
        toolCall,
        tool.options.deprecationMessage ?? `Tool ${toolName} is deprecated`
      );
    }

    // Check rate limit
    if (tool.options.rateLimit) {
      if (!this.rateLimiter.isAllowed(toolName, tool.options.rateLimit)) {
        this.emit('tool:rate-limited', toolCall);
        return {
          toolCallId: toolCall.id,
          toolName,
          success: false,
          error: new Error(`Rate limit exceeded for tool: ${toolName}`),
          duration: Date.now() - startTime,
        };
      }
    }

    // Check cache
    if (tool.options.cacheable) {
      const cacheKey = this.getCacheKey(toolCall);
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) {
        this.emit('tool:cached', toolCall, cached);
        this.updateStats(toolName, Date.now() - startTime, true, false, true);
        return {
          toolCallId: toolCall.id,
          toolName,
          success: true,
          result: cached,
          duration: Date.now() - startTime,
          cached: true,
        };
      }
    }

    // Execute validation hook
    const validationResult = await this.hookRegistry.execute(
      HOOK_NAMES.TOOL_VALIDATION,
      {
        toolName,
        args: toolCall.arguments,
        schema: tool.definition.parameters,
      },
      context.hookContext
    );

    if (!validationResult.success) {
      return {
        toolCallId: toolCall.id,
        toolName,
        success: false,
        error: validationResult.error ?? new Error('Validation failed'),
        duration: Date.now() - startTime,
      };
    }

    // Custom validator
    if (tool.validator) {
      const validation = tool.validator(toolCall.arguments, tool.definition);
      if (!validation.valid) {
        return {
          toolCallId: toolCall.id,
          toolName,
          success: false,
          error: new Error(`Validation failed: ${validation.errors?.map((e) => e.message).join(', ')}`),
          duration: Date.now() - startTime,
        };
      }
    }

    this.emit('tool:executing', toolCall, context);

    // Execute with error recovery
    let result: unknown;
    let error: Error | undefined;
    let retries = 0;

    const recoveryConfig = this.errorRecoveryConfigs.get(toolName);
    const maxRetries = recoveryConfig?.maxRetries ?? tool.options.maxRetries ?? 0;
    const retryDelay = recoveryConfig?.retryDelay ?? tool.options.retryDelay ?? 1000;

    while (retries <= maxRetries) {
      try {
        // Execute sandbox hook if enabled
        if (context.sandbox ?? this.sandboxConfig.enabled) {
          await this.hookRegistry.execute(
            HOOK_NAMES.TOOL_SANDBOX,
            {
              toolId: toolName,
              permissions: [],
              resourceLimits: {
                maxTokens: this.sandboxConfig.maxMemory,
                maxTime: this.sandboxConfig.maxExecutionTime,
              },
            },
            context.hookContext
          );
        }

        // Execute the tool
        const timeout = context.timeout ?? tool.options.timeout ?? this.defaultTimeout;
        result = await this.executeWithTimeout(
          tool.handler,
          toolCall.arguments,
          context,
          timeout
        );

        // Transform result
        result = await this.transformResult(result, toolCall, context);

        // Execute result transform hook
        const transformResult = await this.hookRegistry.execute(
          HOOK_NAMES.TOOL_RESULT_TRANSFORM,
          {
            toolName,
            originalResult: result,
            toolCall,
          },
          context.hookContext
        );

        if (transformResult.success && (transformResult.data as { transformedResult?: unknown })?.transformedResult !== undefined) {
          result = (transformResult.data as { transformedResult: unknown }).transformedResult;
        }

        error = undefined;
        break;
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
        retries++;

        // Check if we should retry
        if (retries <= maxRetries) {
          const shouldRetry = recoveryConfig?.shouldRetry?.(error, retries) ?? true;
          if (shouldRetry) {
            this.emit('tool:retry', toolCall, retries, error);
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            continue;
          }
        }

        // Execute error recovery hook
        const recoveryResult = await this.hookRegistry.execute(
          HOOK_NAMES.TOOL_ERROR_RECOVERY,
          {
            toolName,
            error,
            args: toolCall.arguments,
            retryCount: retries - 1,
          },
          context.hookContext
        );

        if (recoveryResult.success) {
          const recoveryData = recoveryResult.data as { recovered?: boolean; fallbackResult?: unknown };
          if (recoveryData?.recovered) {
            result = recoveryData.fallbackResult;
            error = undefined;
            break;
          }
        }

        // Use configured fallback
        if (recoveryConfig?.strategy === 'fallback') {
          if (recoveryConfig.fallbackHandler) {
            try {
              result = await recoveryConfig.fallbackHandler(toolCall.arguments, context);
              error = undefined;
            } catch {
              // Fallback also failed
            }
          } else if (recoveryConfig.fallbackValue !== undefined) {
            result = recoveryConfig.fallbackValue;
            error = undefined;
          }
        } else if (recoveryConfig?.strategy === 'ignore') {
          result = undefined;
          error = undefined;
        }
        break;
      }
    }

    const duration = Date.now() - startTime;
    const success = error === undefined;

    // Record execution in registry
    this.registry.recordExecution(toolName, success);

    // Update stats
    this.updateStats(toolName, duration, success, retries > 0, false);

    // Cache successful results
    if (success && tool.options.cacheable && tool.options.cacheTtl) {
      const cacheKey = this.getCacheKey(toolCall);
      this.cache.set(cacheKey, result, tool.options.cacheTtl);
    }

    const executionResult: ToolExecutionResult = {
      toolCallId: toolCall.id,
      toolName,
      success,
      result: success ? result : undefined,
      error,
      duration,
      retries: retries > 0 ? retries : undefined,
    };

    if (success) {
      this.emit('tool:completed', toolCall, executionResult);
    } else {
      this.emit('tool:error', toolCall, error!);
    }

    return executionResult;
  }

  /**
   * Execute multiple tool calls in parallel
   */
  async executeParallel(
    toolCalls: ToolCall[],
    context: ToolContext
  ): Promise<ToolExecutionResult[]> {
    return Promise.all(
      toolCalls.map((tc) => this.execute(tc, context))
    );
  }

  /**
   * Execute multiple tool calls sequentially
   */
  async executeSequential(
    toolCalls: ToolCall[],
    context: ToolContext
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    for (const toolCall of toolCalls) {
      results.push(await this.execute(toolCall, context));
    }
    return results;
  }

  /**
   * Add a result transformer for a tool
   */
  addResultTransformer(toolName: string, transformer: ResultTransformer): void {
    this.resultTransformers.set(toolName, transformer);
  }

  /**
   * Remove a result transformer
   */
  removeResultTransformer(toolName: string): boolean {
    return this.resultTransformers.delete(toolName);
  }

  /**
   * Configure error recovery for a tool
   */
  configureErrorRecovery(toolName: string, config: ErrorRecoveryConfig): void {
    this.errorRecoveryConfigs.set(toolName, config);
  }

  /**
   * Get execution statistics for a tool
   */
  getStats(toolName: string): ToolExecutionStats | undefined {
    return this.stats.get(toolName);
  }

  /**
   * Get all execution statistics
   */
  getAllStats(): Map<string, ToolExecutionStats> {
    return new Map(this.stats);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hits: number; misses: number } {
    return this.cache.getStats();
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Reset rate limits
   */
  resetRateLimits(): void {
    this.rateLimiter.resetAll();
  }

  /**
   * Update sandbox configuration
   */
  updateSandboxConfig(config: Partial<SandboxConfig>): void {
    this.sandboxConfig = { ...this.sandboxConfig, ...config };
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Execute handler with timeout
   */
  private async executeWithTimeout(
    handler: (args: Record<string, unknown>, context: ToolContext) => Promise<unknown>,
    args: Record<string, unknown>,
    context: ToolContext,
    timeout: number
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Tool execution timed out after ${timeout}ms`));
      }, timeout);

      handler(args, context)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Transform result using registered transformer
   */
  private async transformResult(
    result: unknown,
    toolCall: ToolCall,
    context: ToolContext
  ): Promise<unknown> {
    const transformer = this.resultTransformers.get(toolCall.name);
    if (transformer) {
      return transformer(result, toolCall, context);
    }
    return result;
  }

  /**
   * Generate cache key for a tool call
   */
  private getCacheKey(toolCall: ToolCall): string {
    return `${toolCall.name}:${JSON.stringify(toolCall.arguments)}`;
  }

  /**
   * Update execution statistics
   */
  private updateStats(
    toolName: string,
    duration: number,
    success: boolean,
    hadRetries: boolean,
    cached: boolean
  ): void {
    let stats = this.stats.get(toolName);
    if (!stats) {
      stats = {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        cachedExecutions: 0,
        averageDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        totalRetries: 0,
      };
      this.stats.set(toolName, stats);
    }

    stats.totalExecutions++;
    if (success) {
      stats.successfulExecutions++;
    } else {
      stats.failedExecutions++;
    }
    if (cached) {
      stats.cachedExecutions++;
    }
    if (hadRetries) {
      stats.totalRetries++;
    }

    // Update duration stats
    stats.minDuration = Math.min(stats.minDuration, duration);
    stats.maxDuration = Math.max(stats.maxDuration, duration);
    stats.averageDuration = (
      (stats.averageDuration * (stats.totalExecutions - 1) + duration) /
      stats.totalExecutions
    );
    stats.lastExecutionAt = Date.now();
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a tool executor
 */
export function createToolExecutor(
  registry: ToolRegistry,
  hookRegistry: HookRegistry,
  options?: {
    cache?: ToolCache;
    sandboxConfig?: Partial<SandboxConfig>;
    defaultTimeout?: number;
  }
): ToolExecutor {
  return new ToolExecutor(registry, hookRegistry, options);
}
