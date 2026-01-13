/**
 * Hook Registry - Central registration and execution of hooks
 *
 * Provides a type-safe way to register, manage, and execute hooks
 * across all 7 categories (50 hook points).
 */

import { EventEmitter } from 'eventemitter3';
import type {
  HookHandler,
  HookMetadata,
  HookContext,
  HookResult,
  HookCategory,
  HookPriority,
} from '../types/hooks.js';

// =============================================================================
// Hook Names (All 50 hooks)
// =============================================================================

export const HOOK_NAMES = {
  // Gateway Hooks (#1-7)
  REQUEST_TRANSFORM: 'gateway:request-transform',
  RESPONSE_TRANSFORM: 'gateway:response-transform',
  MODEL_SELECTION: 'gateway:model-selection',
  PROVIDER_ROUTING: 'gateway:provider-routing',
  FALLBACK_TRIGGER: 'gateway:fallback-trigger',
  RETRY_DECISION: 'gateway:retry-decision',
  CIRCUIT_BREAKER: 'gateway:circuit-breaker',

  // Auth Hooks (#8-14)
  API_KEY_VALIDATION: 'auth:api-key-validation',
  API_KEY_ROTATION: 'auth:api-key-rotation',
  PERMISSION_CHECK: 'auth:permission-check',
  RATE_LIMIT: 'auth:rate-limit',
  QUOTA_CHECK: 'auth:quota-check',
  SESSION_VALIDATION: 'auth:session-validation',
  AUDIT_LOG: 'auth:audit-log',

  // Tool Calling Hooks (#15-21)
  TOOL_REGISTRATION: 'tool:registration',
  TOOL_VALIDATION: 'tool:validation',
  TOOL_EXECUTION: 'tool:execution',
  TOOL_RESULT_TRANSFORM: 'tool:result-transform',
  TOOL_ERROR_RECOVERY: 'tool:error-recovery',
  MCP_TOOL_DISCOVERY: 'tool:mcp-discovery',
  TOOL_SANDBOX: 'tool:sandbox',

  // Agent Lifecycle Hooks (#22-28)
  AGENT_INIT: 'agent:init',
  AGENT_SPAWN: 'agent:spawn',
  AGENT_TERMINATION: 'agent:termination',
  STATE_TRANSITION: 'agent:state-transition',
  MESSAGE_PASSING: 'agent:message-passing',
  TASK_DELEGATION: 'agent:task-delegation',
  AGENT_HEALTH_CHECK: 'agent:health-check',

  // Streaming Hooks (#29-35)
  STREAM_START: 'stream:start',
  CHUNK_PROCESS: 'stream:chunk-process',
  STREAM_COMPLETE: 'stream:complete',
  STREAM_ERROR: 'stream:error',
  BACKPRESSURE: 'stream:backpressure',
  STREAM_MULTIPLEX: 'stream:multiplex',
  PARTIAL_RESULT: 'stream:partial-result',

  // Observability Hooks (#36-42)
  METRIC_COLLECTION: 'observability:metric-collection',
  TRACE_START: 'observability:trace-start',
  SPAN_ANNOTATION: 'observability:span-annotation',
  LOG_ENRICHMENT: 'observability:log-enrichment',
  ALERT_TRIGGER: 'observability:alert-trigger',
  COST_TRACKING: 'observability:cost-tracking',
  PERFORMANCE_PROFILING: 'observability:performance-profiling',

  // Security Hooks (#43-50)
  INPUT_SANITIZATION: 'security:input-sanitization',
  OUTPUT_FILTERING: 'security:output-filtering',
  PII_DETECTION: 'security:pii-detection',
  PROMPT_INJECTION: 'security:prompt-injection',
  CONTENT_MODERATION: 'security:content-moderation',
  DATA_ENCRYPTION: 'security:data-encryption',
  COMPLIANCE_CHECK: 'security:compliance-check',
  THREAT_DETECTION: 'security:threat-detection',
} as const;

export type HookName = (typeof HOOK_NAMES)[keyof typeof HOOK_NAMES];

// =============================================================================
// Hook Registration Entry
// =============================================================================

interface HookRegistration<TInput = unknown, TOutput = unknown> {
  metadata: HookMetadata;
  handler: HookHandler<TInput, TOutput>;
  enabled: boolean;
}

// =============================================================================
// Hook Registry Events
// =============================================================================

interface HookRegistryEvents {
  'hook:registered': (metadata: HookMetadata) => void;
  'hook:unregistered': (hookId: string) => void;
  'hook:enabled': (hookId: string) => void;
  'hook:disabled': (hookId: string) => void;
  'hook:executed': (hookId: string, duration: number, success: boolean) => void;
  'hook:error': (hookId: string, error: Error) => void;
}

// =============================================================================
// Hook Registry Class
// =============================================================================

export class HookRegistry extends EventEmitter<HookRegistryEvents> {
  private hooks: Map<HookName, Map<string, HookRegistration>> = new Map();
  private executionOrder: Map<HookName, string[]> = new Map();

  constructor() {
    super();
    // Initialize maps for all hook names
    for (const hookName of Object.values(HOOK_NAMES)) {
      this.hooks.set(hookName, new Map());
      this.executionOrder.set(hookName, []);
    }
  }

  /**
   * Register a hook handler
   */
  register<TInput, TOutput>(
    hookName: HookName,
    metadata: Omit<HookMetadata, 'category'>,
    handler: HookHandler<TInput, TOutput>
  ): void {
    const category = this.getCategoryFromHookName(hookName);
    const fullMetadata: HookMetadata = { ...metadata, category };

    const registration: HookRegistration<TInput, TOutput> = {
      metadata: fullMetadata,
      handler: handler as HookHandler<unknown, unknown>,
      enabled: true,
    };

    const hookMap = this.hooks.get(hookName);
    if (!hookMap) {
      throw new Error(`Unknown hook name: ${hookName}`);
    }

    hookMap.set(metadata.id, registration);
    this.updateExecutionOrder(hookName);

    this.emit('hook:registered', fullMetadata);
  }

  /**
   * Unregister a hook handler
   */
  unregister(hookName: HookName, hookId: string): boolean {
    const hookMap = this.hooks.get(hookName);
    if (!hookMap) {
      return false;
    }

    const deleted = hookMap.delete(hookId);
    if (deleted) {
      this.updateExecutionOrder(hookName);
      this.emit('hook:unregistered', hookId);
    }

    return deleted;
  }

  /**
   * Enable a hook
   */
  enable(hookName: HookName, hookId: string): boolean {
    const registration = this.getRegistration(hookName, hookId);
    if (!registration) {
      return false;
    }

    registration.enabled = true;
    this.emit('hook:enabled', hookId);
    return true;
  }

  /**
   * Disable a hook
   */
  disable(hookName: HookName, hookId: string): boolean {
    const registration = this.getRegistration(hookName, hookId);
    if (!registration) {
      return false;
    }

    registration.enabled = false;
    this.emit('hook:disabled', hookId);
    return true;
  }

  /**
   * Execute all registered handlers for a hook in priority order
   * Returns the result of the last successful handler, or the first error
   */
  async execute<TInput, TOutput>(
    hookName: HookName,
    input: TInput,
    context: HookContext
  ): Promise<HookResult<TOutput>> {
    const order = this.executionOrder.get(hookName);
    const hookMap = this.hooks.get(hookName);

    if (!order || !hookMap || order.length === 0) {
      // No handlers registered, pass through
      return {
        success: true,
        data: input as unknown as TOutput,
        metadata: { passthrough: true },
      };
    }

    let lastResult: HookResult<TOutput> = {
      success: true,
      data: input as unknown as TOutput,
    };

    for (const hookId of order) {
      const registration = hookMap.get(hookId);
      if (!registration || !registration.enabled) {
        continue;
      }

      const startTime = performance.now();

      try {
        // Pass the result of the previous hook as input to the next
        const currentInput = lastResult.success ? lastResult.data : input;
        lastResult = (await registration.handler(
          currentInput,
          context
        )) as HookResult<TOutput>;

        const duration = performance.now() - startTime;
        this.emit('hook:executed', hookId, duration, lastResult.success);

        // If a hook fails and is not recoverable, stop the chain
        if (!lastResult.success && !lastResult.recoverable) {
          this.emit('hook:error', hookId, lastResult.error);
          return lastResult;
        }
      } catch (error) {
        const duration = performance.now() - startTime;
        const err = error instanceof Error ? error : new Error(String(error));

        this.emit('hook:executed', hookId, duration, false);
        this.emit('hook:error', hookId, err);

        return {
          success: false,
          error: err,
          recoverable: false,
        };
      }
    }

    return lastResult;
  }

  /**
   * Execute hooks with a pipeline pattern - each hook transforms the input
   */
  async executePipeline<T>(
    hookName: HookName,
    input: T,
    context: HookContext
  ): Promise<HookResult<T>> {
    return this.execute<T, T>(hookName, input, context);
  }

  /**
   * Execute hooks in parallel and collect all results
   */
  async executeParallel<TInput, TOutput>(
    hookName: HookName,
    input: TInput,
    context: HookContext
  ): Promise<HookResult<TOutput>[]> {
    const order = this.executionOrder.get(hookName);
    const hookMap = this.hooks.get(hookName);

    if (!order || !hookMap || order.length === 0) {
      return [];
    }

    const promises = order
      .map((hookId) => hookMap.get(hookId))
      .filter((reg): reg is HookRegistration => reg !== undefined && reg.enabled)
      .map(async (registration) => {
        const startTime = performance.now();

        try {
          const result = (await registration.handler(input, context)) as HookResult<TOutput>;
          const duration = performance.now() - startTime;
          this.emit('hook:executed', registration.metadata.id, duration, result.success);
          return result;
        } catch (error) {
          const duration = performance.now() - startTime;
          const err = error instanceof Error ? error : new Error(String(error));
          this.emit('hook:executed', registration.metadata.id, duration, false);
          this.emit('hook:error', registration.metadata.id, err);
          return {
            success: false,
            error: err,
            recoverable: false,
          } as HookResult<TOutput>;
        }
      });

    return Promise.all(promises);
  }

  /**
   * Get all registered hooks for a category
   */
  getHooksByCategory(category: HookCategory): HookMetadata[] {
    const result: HookMetadata[] = [];

    for (const [hookName, hookMap] of this.hooks) {
      if (this.getCategoryFromHookName(hookName) === category) {
        for (const registration of hookMap.values()) {
          result.push(registration.metadata);
        }
      }
    }

    return result;
  }

  /**
   * Get all registered hooks
   */
  getAllHooks(): Map<HookName, HookMetadata[]> {
    const result = new Map<HookName, HookMetadata[]>();

    for (const [hookName, hookMap] of this.hooks) {
      const metadataList: HookMetadata[] = [];
      for (const registration of hookMap.values()) {
        metadataList.push(registration.metadata);
      }
      result.set(hookName, metadataList);
    }

    return result;
  }

  /**
   * Check if a hook has any handlers registered
   */
  hasHandlers(hookName: HookName): boolean {
    const hookMap = this.hooks.get(hookName);
    return hookMap !== undefined && hookMap.size > 0;
  }

  /**
   * Get the count of handlers for a hook
   */
  getHandlerCount(hookName: HookName): number {
    const hookMap = this.hooks.get(hookName);
    return hookMap?.size ?? 0;
  }

  /**
   * Clear all hooks (useful for testing)
   */
  clear(): void {
    for (const hookMap of this.hooks.values()) {
      hookMap.clear();
    }
    for (const hookName of Object.values(HOOK_NAMES)) {
      this.executionOrder.set(hookName, []);
    }
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private getRegistration(hookName: HookName, hookId: string): HookRegistration | undefined {
    return this.hooks.get(hookName)?.get(hookId);
  }

  private getCategoryFromHookName(hookName: HookName): HookCategory {
    const prefix = hookName.split(':')[0];
    const categoryMap: Record<string, HookCategory> = {
      gateway: 'gateway',
      auth: 'auth',
      tool: 'tool-calling',
      agent: 'agent-lifecycle',
      stream: 'streaming',
      observability: 'observability',
      security: 'security',
    };

    const category = categoryMap[prefix ?? ''];
    if (!category) {
      throw new Error(`Unknown hook category for: ${hookName}`);
    }
    return category;
  }

  private updateExecutionOrder(hookName: HookName): void {
    const hookMap = this.hooks.get(hookName);
    if (!hookMap) {
      return;
    }

    const priorityOrder: Record<HookPriority, number> = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
    };

    const entries = Array.from(hookMap.entries());
    entries.sort((a, b) => {
      const priorityA = priorityOrder[a[1].metadata.priority];
      const priorityB = priorityOrder[b[1].metadata.priority];
      return priorityA - priorityB;
    });

    this.executionOrder.set(
      hookName,
      entries.map(([id]) => id)
    );
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let globalRegistry: HookRegistry | null = null;

export function getHookRegistry(): HookRegistry {
  if (!globalRegistry) {
    globalRegistry = new HookRegistry();
  }
  return globalRegistry;
}

export function resetHookRegistry(): void {
  globalRegistry = null;
}
