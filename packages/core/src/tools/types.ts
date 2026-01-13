/**
 * Tool Framework Types
 *
 * Type definitions for the tool execution framework.
 */

import type { ToolDefinition, ToolCall, HookContext } from '../types/hooks.js';

// =============================================================================
// Tool Handler Types
// =============================================================================

/**
 * Context passed to tool handlers during execution
 */
export interface ToolContext {
  /** Agent ID executing the tool */
  agentId: string;
  /** Hook context for pipeline integration */
  hookContext: HookContext;
  /** Execution timeout in milliseconds */
  timeout?: number;
  /** Whether to execute in sandbox mode */
  sandbox?: boolean;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Tool handler function signature
 */
export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<unknown>;

/**
 * Tool validation function signature
 */
export type ToolValidator = (
  args: Record<string, unknown>,
  definition: ToolDefinition
) => ValidationResult;

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

/**
 * Validation error
 */
export interface ValidationError {
  path: string;
  message: string;
  expected?: string;
  received?: unknown;
}

// =============================================================================
// Tool Registry Types
// =============================================================================

/**
 * Registered tool with handler
 */
export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
  validator?: ToolValidator;
  options: ToolOptions;
  registeredAt: number;
  lastExecutedAt?: number;
  executionCount: number;
  errorCount: number;
}

/**
 * Options for tool registration
 */
export interface ToolOptions {
  /** Category for grouping tools */
  category?: string;
  /** Timeout for this specific tool (overrides default) */
  timeout?: number;
  /** Whether tool supports sandboxing */
  sandboxable?: boolean;
  /** Whether tool is cacheable */
  cacheable?: boolean;
  /** Cache TTL in milliseconds */
  cacheTtl?: number;
  /** Maximum retries on failure */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
  /** Whether tool requires authentication */
  requiresAuth?: boolean;
  /** Required permissions */
  requiredPermissions?: string[];
  /** Rate limit (calls per minute) */
  rateLimit?: number;
  /** Whether tool is deprecated */
  deprecated?: boolean;
  /** Deprecation message */
  deprecationMessage?: string;
}

// =============================================================================
// Tool Execution Types
// =============================================================================

/**
 * Result of tool execution
 */
export interface ToolExecutionResult {
  /** Tool call ID */
  toolCallId: string;
  /** Tool name */
  toolName: string;
  /** Whether execution was successful */
  success: boolean;
  /** Execution result */
  result?: unknown;
  /** Execution error */
  error?: Error;
  /** Execution duration in milliseconds */
  duration: number;
  /** Whether result was from cache */
  cached?: boolean;
  /** Number of retries performed */
  retries?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Tool execution statistics
 */
export interface ToolExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  cachedExecutions: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  totalRetries: number;
  lastExecutionAt?: number;
}

// =============================================================================
// Sandbox Types
// =============================================================================

/**
 * Sandbox configuration
 */
export interface SandboxConfig {
  /** Enable sandbox mode */
  enabled: boolean;
  /** Maximum execution time in sandbox */
  maxExecutionTime: number;
  /** Maximum memory usage */
  maxMemory: number;
  /** Allowed global objects */
  allowedGlobals?: string[];
  /** Blocked APIs */
  blockedApis?: string[];
  /** Whether to allow network access */
  allowNetwork?: boolean;
  /** Whether to allow file system access */
  allowFileSystem?: boolean;
}

/**
 * Default sandbox configuration
 */
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  enabled: true,
  maxExecutionTime: 30000,
  maxMemory: 128 * 1024 * 1024, // 128MB
  allowedGlobals: ['JSON', 'Math', 'Date', 'Array', 'Object', 'String', 'Number'],
  blockedApis: ['eval', 'Function', 'process', 'require'],
  allowNetwork: false,
  allowFileSystem: false,
};

// =============================================================================
// Result Transformer Types
// =============================================================================

/**
 * Result transformer function
 */
export type ResultTransformer = (
  result: unknown,
  toolCall: ToolCall,
  context: ToolContext
) => Promise<unknown>;

/**
 * Error recovery strategy
 */
export type ErrorRecoveryStrategy = 'retry' | 'fallback' | 'ignore' | 'throw';

/**
 * Error recovery configuration
 */
export interface ErrorRecoveryConfig {
  strategy: ErrorRecoveryStrategy;
  maxRetries?: number;
  retryDelay?: number;
  fallbackValue?: unknown;
  fallbackHandler?: ToolHandler;
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

// =============================================================================
// Cache Types
// =============================================================================

/**
 * Cache entry
 */
export interface CacheEntry {
  key: string;
  value: unknown;
  createdAt: number;
  expiresAt: number;
  hits: number;
}

/**
 * Cache interface
 */
export interface ToolCache {
  get(key: string): unknown | undefined;
  set(key: string, value: unknown, ttl: number): void;
  delete(key: string): boolean;
  clear(): void;
  has(key: string): boolean;
  getStats(): {
    size: number;
    hits: number;
    misses: number;
  };
}

// =============================================================================
// Events
// =============================================================================

/**
 * Tool execution events
 */
export interface ToolEvents {
  'tool:registered': (name: string, definition: ToolDefinition) => void;
  'tool:unregistered': (name: string) => void;
  'tool:executing': (toolCall: ToolCall, context: ToolContext) => void;
  'tool:completed': (toolCall: ToolCall, result: ToolExecutionResult) => void;
  'tool:error': (toolCall: ToolCall, error: Error) => void;
  'tool:retry': (toolCall: ToolCall, attempt: number, error: Error) => void;
  'tool:cached': (toolCall: ToolCall, result: unknown) => void;
  'tool:rate-limited': (toolCall: ToolCall) => void;
  'tool:deprecated-used': (toolCall: ToolCall, message: string) => void;
}
