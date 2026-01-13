/**
 * Tool Executor
 *
 * Manages tool registration and execution with hook integration.
 */

import { EventEmitter } from 'eventemitter3';
import type { ToolDefinition, ToolCall, HookContext } from '../types/hooks.js';
import type { HookRegistry } from '../hooks/registry.js';
import { HOOK_NAMES } from '../hooks/registry.js';
import type {
  ToolExecutor,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolHandler,
} from './types.js';

// =============================================================================
// Tool Executor Events
// =============================================================================

interface ToolExecutorEvents {
  'tool:registered': (toolName: string) => void;
  'tool:unregistered': (toolName: string) => void;
  'tool:executing': (toolName: string, args: Record<string, unknown>) => void;
  'tool:completed': (toolName: string, duration: number) => void;
  'tool:error': (toolName: string, error: Error) => void;
}

// =============================================================================
// Tool Registration
// =============================================================================

interface ToolRegistration {
  definition: ToolDefinition;
  handler: ToolHandler;
}

// =============================================================================
// Default Tool Executor Implementation
// =============================================================================

export class DefaultToolExecutor
  extends EventEmitter<ToolExecutorEvents>
  implements ToolExecutor
{
  private tools: Map<string, ToolRegistration> = new Map();
  private registry: HookRegistry;
  private defaultTimeout: number;

  constructor(registry: HookRegistry, defaultTimeout: number = 30000) {
    super();
    this.registry = registry;
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Register a tool
   */
  async register(tool: ToolDefinition, handler: ToolHandler): Promise<void> {
    // Create hook context for registration
    const context: HookContext = {
      requestId: `register-${tool.name}-${Date.now()}`,
      timestamp: Date.now(),
      metadata: {},
    };

    // Execute registration hook
    const result = await this.registry.execute(
      HOOK_NAMES.TOOL_REGISTRATION,
      {
        tool,
        source: 'custom' as const,
      },
      context
    );

    if (!result.success) {
      throw result.error;
    }

    const registration: ToolRegistration = {
      definition: tool,
      handler,
    };

    this.tools.set(tool.name, registration);
    this.emit('tool:registered', tool.name);
  }

  /**
   * Unregister a tool
   */
  unregister(toolName: string): boolean {
    const deleted = this.tools.delete(toolName);
    if (deleted) {
      this.emit('tool:unregistered', toolName);
    }
    return deleted;
  }

  /**
   * Execute a tool call
   */
  async execute(
    toolCall: ToolCall,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = performance.now();
    const timeout = context.timeout ?? this.defaultTimeout;

    const registration = this.tools.get(toolCall.name);
    if (!registration) {
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: false,
        error: new Error(`Tool not found: ${toolCall.name}`),
        duration: performance.now() - startTime,
      };
    }

    this.emit('tool:executing', toolCall.name, toolCall.arguments);

    // Create hook context
    const hookContext: HookContext = {
      ...context.hookContext,
      metadata: {
        ...context.hookContext.metadata,
        toolName: toolCall.name,
        agentId: context.agentId,
      },
    };

    try {
      // Execute validation hook
      const validationResult = await this.registry.execute(
        HOOK_NAMES.TOOL_VALIDATION,
        {
          tool: registration.definition,
        },
        hookContext
      );

      if (!validationResult.success) {
        throw validationResult.error;
      }

      const validationData = validationResult.data as { valid?: boolean; errors?: unknown[] };
      if (validationData.valid === false) {
        throw new Error(`Tool validation failed: ${JSON.stringify(validationData.errors)}`);
      }

      // Execute sandbox hook if enabled
      if (context.sandbox) {
        const sandboxResult = await this.registry.execute(
          HOOK_NAMES.TOOL_SANDBOX,
          {
            toolId: toolCall.id,
            permissions: [],
          },
          hookContext
        );

        if (!sandboxResult.success) {
          throw sandboxResult.error;
        }
      }

      // Execute the tool with timeout
      const result = await this.executeWithTimeout(
        registration.handler,
        toolCall.arguments,
        context,
        timeout
      );

      // Execute result transform hook
      const transformResult = await this.registry.execute(
        HOOK_NAMES.TOOL_RESULT_TRANSFORM,
        {
          toolId: toolCall.id,
          rawResult: result,
        },
        hookContext
      );

      const finalResult = transformResult.success
        ? (transformResult.data as { result?: unknown })?.result ?? result
        : result;

      const duration = performance.now() - startTime;
      this.emit('tool:completed', toolCall.name, duration);

      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: true,
        result: finalResult,
        duration,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = performance.now() - startTime;

      this.emit('tool:error', toolCall.name, err);

      // Try error recovery hook
      const recoveryResult = await this.registry.execute(
        HOOK_NAMES.TOOL_ERROR_RECOVERY,
        {
          toolId: toolCall.id,
          error: err,
          arguments: toolCall.arguments,
          attemptNumber: 1,
        },
        hookContext
      );

      if (recoveryResult.success) {
        const recoveryData = recoveryResult.data as { recovered?: boolean; result?: unknown };
        if (recoveryData.recovered) {
          return {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            success: true,
            result: recoveryData.result,
            duration: performance.now() - startTime,
          };
        }
      }

      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: false,
        error: err,
        duration,
      };
    }
  }

  /**
   * Execute multiple tool calls in parallel
   */
  async executeParallel(
    toolCalls: ToolCall[],
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult[]> {
    const promises = toolCalls.map((toolCall) => this.execute(toolCall, context));
    return Promise.all(promises);
  }

  /**
   * Get all registered tools
   */
  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((reg) => reg.definition);
  }

  /**
   * Check if a tool exists
   */
  hasTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /**
   * Get a tool definition
   */
  getTool(toolName: string): ToolDefinition | undefined {
    return this.tools.get(toolName)?.definition;
  }

  /**
   * Clear all tools
   */
  clear(): void {
    for (const toolName of this.tools.keys()) {
      this.emit('tool:unregistered', toolName);
    }
    this.tools.clear();
  }

  /**
   * Execute handler with timeout
   */
  private async executeWithTimeout(
    handler: ToolHandler,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
    timeout: number
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Tool execution timed out after ${timeout}ms`));
      }, timeout);

      handler(args, context)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }
}

/**
 * Create a tool executor
 */
export function createToolExecutor(
  registry: HookRegistry,
  defaultTimeout?: number
): DefaultToolExecutor {
  return new DefaultToolExecutor(registry, defaultTimeout);
}
