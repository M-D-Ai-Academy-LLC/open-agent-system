/**
 * Tool Sandbox
 *
 * Provides sandboxed execution environment for tools with resource limits.
 */

import type { HookHandler, HookResult, ToolSandboxInput, ToolSandboxOutput } from '../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../hooks/registry.js';
import type { SandboxConfig } from './types.js';
import { DEFAULT_SANDBOX_CONFIG } from './types.js';

// =============================================================================
// Sandbox Context
// =============================================================================

/**
 * Sandbox execution context
 */
export interface SandboxContext {
  /** Allowed globals */
  globals: Record<string, unknown>;
  /** Blocked APIs */
  blocked: Set<string>;
  /** Start time for execution tracking */
  startTime: number;
  /** Maximum execution time */
  maxTime: number;
  /** Memory tracking (simulated) */
  memoryUsed: number;
  /** Max memory limit */
  maxMemory: number;
}

/**
 * Sandbox execution result
 */
export interface SandboxResult {
  success: boolean;
  result?: unknown;
  error?: Error;
  executionTime: number;
  memoryUsed: number;
  terminated?: boolean;
  terminationReason?: string;
}

// =============================================================================
// Sandbox Implementation
// =============================================================================

export class Sandbox {
  private config: SandboxConfig;
  private blockedPatterns: RegExp[];

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_SANDBOX_CONFIG, ...config };
    this.blockedPatterns = this.buildBlockedPatterns();
  }

  /**
   * Create a sandboxed context
   */
  createContext(): SandboxContext {
    const globals: Record<string, unknown> = {};

    // Add allowed globals
    for (const name of this.config.allowedGlobals ?? []) {
      // Safe subset of globals
      switch (name) {
        case 'JSON':
          globals['JSON'] = {
            parse: JSON.parse.bind(JSON),
            stringify: JSON.stringify.bind(JSON),
          };
          break;
        case 'Math':
          globals['Math'] = { ...Math };
          break;
        case 'Date':
          globals['Date'] = class SafeDate extends Date {};
          break;
        case 'Array':
          globals['Array'] = {
            isArray: Array.isArray.bind(Array),
            from: Array.from.bind(Array),
            of: Array.of.bind(Array),
          };
          break;
        case 'Object':
          globals['Object'] = {
            keys: Object.keys.bind(Object),
            values: Object.values.bind(Object),
            entries: Object.entries.bind(Object),
            assign: Object.assign.bind(Object),
            fromEntries: Object.fromEntries.bind(Object),
          };
          break;
        case 'String':
          globals['String'] = {
            fromCharCode: String.fromCharCode.bind(String),
            fromCodePoint: String.fromCodePoint.bind(String),
          };
          break;
        case 'Number':
          globals['Number'] = {
            isNaN: Number.isNaN.bind(Number),
            isFinite: Number.isFinite.bind(Number),
            parseInt: Number.parseInt.bind(Number),
            parseFloat: Number.parseFloat.bind(Number),
          };
          break;
      }
    }

    return {
      globals,
      blocked: new Set(this.config.blockedApis ?? []),
      startTime: Date.now(),
      maxTime: this.config.maxExecutionTime,
      memoryUsed: 0,
      maxMemory: this.config.maxMemory,
    };
  }

  /**
   * Check if code contains blocked APIs
   */
  checkCode(code: string): { safe: boolean; violations: string[] } {
    const violations: string[] = [];

    for (const pattern of this.blockedPatterns) {
      if (pattern.test(code)) {
        violations.push(pattern.source);
      }
    }

    return {
      safe: violations.length === 0,
      violations,
    };
  }

  /**
   * Check if args contain blocked content
   */
  checkArgs(args: Record<string, unknown>): { safe: boolean; violations: string[] } {
    const violations: string[] = [];
    const argsStr = JSON.stringify(args);

    for (const pattern of this.blockedPatterns) {
      if (pattern.test(argsStr)) {
        violations.push(pattern.source);
      }
    }

    return {
      safe: violations.length === 0,
      violations,
    };
  }

  /**
   * Execute in sandbox (simplified implementation)
   * Note: Full sandboxing requires VM2 or similar in production
   */
  async execute(
    handler: () => Promise<unknown>,
    context: SandboxContext
  ): Promise<SandboxResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      // Set timeout for max execution time
      const timer = setTimeout(() => {
        resolve({
          success: false,
          error: new Error('Execution timeout exceeded'),
          executionTime: context.maxTime,
          memoryUsed: context.memoryUsed,
          terminated: true,
          terminationReason: 'timeout',
        });
      }, context.maxTime);

      handler()
        .then((result) => {
          clearTimeout(timer);
          resolve({
            success: true,
            result,
            executionTime: Date.now() - startTime,
            memoryUsed: context.memoryUsed,
          });
        })
        .catch((error) => {
          clearTimeout(timer);
          resolve({
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            executionTime: Date.now() - startTime,
            memoryUsed: context.memoryUsed,
          });
        });
    });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SandboxConfig>): void {
    this.config = { ...this.config, ...config };
    this.blockedPatterns = this.buildBlockedPatterns();
  }

  /**
   * Get current configuration
   */
  getConfig(): SandboxConfig {
    return { ...this.config };
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private buildBlockedPatterns(): RegExp[] {
    const patterns: RegExp[] = [];

    // Add patterns for blocked APIs
    for (const api of this.config.blockedApis ?? []) {
      patterns.push(new RegExp(`\\b${api}\\b`, 'gi'));
    }

    // Block process/require if not allowed
    if (!this.config.allowNetwork) {
      patterns.push(/\bfetch\b/gi);
      patterns.push(/\bXMLHttpRequest\b/gi);
      patterns.push(/\bWebSocket\b/gi);
    }

    if (!this.config.allowFileSystem) {
      patterns.push(/\bfs\b/gi);
      patterns.push(/\breadFileSync\b/gi);
      patterns.push(/\bwriteFileSync\b/gi);
    }

    return patterns;
  }
}

// =============================================================================
// Default Sandbox Hook Handler
// =============================================================================

/**
 * Generate a unique sandbox ID
 */
function generateSandboxId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return 'sandbox-' + Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Default tool sandbox handler
 * Matches ToolSandboxInput/Output types from hooks.ts
 */
export const defaultToolSandboxHandler: HookHandler<
  ToolSandboxInput,
  ToolSandboxOutput
> = async (input, _context): Promise<HookResult<ToolSandboxOutput>> => {
  const sandbox = new Sandbox({
    maxExecutionTime: input.resourceLimits?.maxDurationMs ?? DEFAULT_SANDBOX_CONFIG.maxExecutionTime,
    maxMemory: (input.resourceLimits?.maxMemoryMb ?? 128) * 1024 * 1024,
  });

  // Check code if provided
  const restrictions: string[] = [];
  if (input.code) {
    const codeCheck = sandbox.checkCode(input.code);
    if (!codeCheck.safe) {
      restrictions.push(...codeCheck.violations);
    }
  }

  // Check permissions
  const blockedPermissions = input.permissions.filter(
    (p) => !['read', 'write', 'execute'].includes(p)
  );
  if (blockedPermissions.length > 0) {
    restrictions.push(...blockedPermissions.map((p) => `blocked-permission:${p}`));
  }

  return {
    success: true,
    data: {
      sandboxId: generateSandboxId(),
      isolated: true,
      restrictions,
    },
  };
};

/**
 * Create a strict sandbox handler
 */
export function createStrictSandboxHandler(
  additionalBlocked: string[] = []
): HookHandler<ToolSandboxInput, ToolSandboxOutput> {
  return async (input, _context): Promise<HookResult<ToolSandboxOutput>> => {
    const config = {
      ...DEFAULT_SANDBOX_CONFIG,
      blockedApis: [
        ...(DEFAULT_SANDBOX_CONFIG.blockedApis ?? []),
        ...additionalBlocked,
      ],
      allowNetwork: false,
      allowFileSystem: false,
    };

    const sandbox = new Sandbox(config);
    const restrictions: string[] = [];

    if (input.code) {
      const codeCheck = sandbox.checkCode(input.code);
      if (!codeCheck.safe) {
        restrictions.push(...codeCheck.violations);
      }
    }

    return {
      success: true,
      data: {
        sandboxId: generateSandboxId(),
        isolated: true,
        restrictions,
      },
      metadata: {
        strictMode: true,
      },
    };
  };
}

/**
 * Create a permissive sandbox handler (for trusted tools)
 */
export function createPermissiveSandboxHandler(): HookHandler<
  ToolSandboxInput,
  ToolSandboxOutput
> {
  return async (_input, _context): Promise<HookResult<ToolSandboxOutput>> => {
    return {
      success: true,
      data: {
        sandboxId: generateSandboxId(),
        isolated: false,
        restrictions: [],
      },
      metadata: {
        permissiveMode: true,
      },
    };
  };
}

/**
 * Create a resource-limited sandbox handler
 */
export function createResourceLimitedSandboxHandler(
  maxMemory: number,
  maxTime: number
): HookHandler<ToolSandboxInput, ToolSandboxOutput> {
  return async (input, _context): Promise<HookResult<ToolSandboxOutput>> => {
    const config = {
      ...DEFAULT_SANDBOX_CONFIG,
      maxMemory,
      maxExecutionTime: maxTime,
    };

    const sandbox = new Sandbox(config);
    const restrictions: string[] = [];

    if (input.code) {
      const codeCheck = sandbox.checkCode(input.code);
      if (!codeCheck.safe) {
        restrictions.push(...codeCheck.violations);
      }
    }

    return {
      success: true,
      data: {
        sandboxId: generateSandboxId(),
        isolated: true,
        restrictions,
      },
      metadata: {
        resourceLimits: {
          maxMemory,
          maxTime,
        },
      },
    };
  };
}

/**
 * Register the default tool sandbox hook
 */
export function registerDefaultToolSandbox(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.TOOL_SANDBOX,
    {
      id: 'default-tool-sandbox',
      name: 'Default Tool Sandbox',
      priority: 'high',
      description: 'Basic tool sandboxing handler',
    },
    defaultToolSandboxHandler
  );
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a sandbox instance
 */
export function createSandbox(config?: Partial<SandboxConfig>): Sandbox {
  return new Sandbox(config);
}
