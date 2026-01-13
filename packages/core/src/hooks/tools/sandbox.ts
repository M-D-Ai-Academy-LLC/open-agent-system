/**
 * Tool Sandbox Hook (#21)
 *
 * Provides sandboxed execution environment for tools.
 * Use cases: security isolation, permission management, resource limits.
 */

import type {
  HookHandler,
  HookResult,
  ToolSandboxInput,
  ToolSandboxOutput,
  ResourceLimits,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default tool sandbox handler - creates basic sandbox
 */
export const defaultToolSandboxHandler: HookHandler<
  ToolSandboxInput,
  ToolSandboxOutput
> = async (input, context): Promise<HookResult<ToolSandboxOutput>> => {
  const sandboxId = `sandbox-${context.requestId}-${input.toolId}`;

  return {
    success: true,
    data: {
      sandboxId,
      isolated: false,
      restrictions: input.permissions.length === 0
        ? ['no-permissions']
        : [],
    },
  };
};

/**
 * Sandbox configuration
 */
export interface SandboxConfig {
  permissions: string[];
  resourceLimits?: ResourceLimits;
  allowedModules?: string[];
  blockedModules?: string[];
  allowNetwork?: boolean;
  allowFileSystem?: boolean;
  allowedPaths?: string[];
}

/**
 * Sandbox registry for tracking active sandboxes
 */
export interface SandboxRegistry {
  sandboxes: Map<string, {
    toolId: string;
    config: SandboxConfig;
    createdAt: number;
    active: boolean;
  }>;
  create: (sandboxId: string, toolId: string, config: SandboxConfig) => void;
  destroy: (sandboxId: string) => boolean;
  get: (sandboxId: string) => SandboxConfig | undefined;
  isActive: (sandboxId: string) => boolean;
}

/**
 * Creates a sandbox registry
 */
export function createSandboxRegistry(): SandboxRegistry {
  const sandboxes = new Map<string, {
    toolId: string;
    config: SandboxConfig;
    createdAt: number;
    active: boolean;
  }>();

  return {
    sandboxes,
    create: (sandboxId: string, toolId: string, config: SandboxConfig): void => {
      sandboxes.set(sandboxId, {
        toolId,
        config,
        createdAt: Date.now(),
        active: true,
      });
    },
    destroy: (sandboxId: string): boolean => {
      const sandbox = sandboxes.get(sandboxId);
      if (sandbox) {
        sandbox.active = false;
        return true;
      }
      return false;
    },
    get: (sandboxId: string): SandboxConfig | undefined => {
      return sandboxes.get(sandboxId)?.config;
    },
    isActive: (sandboxId: string): boolean => {
      return sandboxes.get(sandboxId)?.active ?? false;
    },
  };
}

/**
 * Creates a sandbox handler with permission checking
 */
export function createPermissionSandbox(
  allowedPermissions: Map<string, string[]>
): HookHandler<ToolSandboxInput, ToolSandboxOutput> {
  return async (input, context): Promise<HookResult<ToolSandboxOutput>> => {
    const sandboxId = `sandbox-${context.requestId}-${input.toolId}`;
    const toolAllowed = allowedPermissions.get(input.toolId) ?? [];

    // Check which requested permissions are granted
    const grantedPermissions = input.permissions.filter(
      (perm) => toolAllowed.includes(perm) || toolAllowed.includes('*')
    );

    const deniedPermissions = input.permissions.filter(
      (perm) => !grantedPermissions.includes(perm)
    );

    return {
      success: true,
      data: {
        sandboxId,
        isolated: true,
        restrictions: deniedPermissions.map((p) => `denied:${p}`),
      },
      metadata: {
        grantedPermissions,
        deniedPermissions,
      },
    };
  };
}

/**
 * Creates a sandbox handler with resource limits
 */
export function createResourceLimitedSandbox(
  defaultLimits: ResourceLimits,
  toolLimits?: Map<string, ResourceLimits>
): HookHandler<ToolSandboxInput, ToolSandboxOutput> {
  return async (input, context): Promise<HookResult<ToolSandboxOutput>> => {
    const sandboxId = `sandbox-${context.requestId}-${input.toolId}`;

    // Merge limits: input > tool-specific > default
    const limits: ResourceLimits = {
      ...defaultLimits,
      ...(toolLimits?.get(input.toolId) ?? {}),
      ...(input.resourceLimits ?? {}),
    };

    const restrictions: string[] = [];

    if (limits.maxMemoryMb) {
      restrictions.push(`max-memory:${limits.maxMemoryMb}mb`);
    }
    if (limits.maxCpuPercent) {
      restrictions.push(`max-cpu:${limits.maxCpuPercent}%`);
    }
    if (limits.maxDurationMs) {
      restrictions.push(`max-duration:${limits.maxDurationMs}ms`);
    }
    if (limits.maxNetworkRequests) {
      restrictions.push(`max-network:${limits.maxNetworkRequests}`);
    }

    return {
      success: true,
      data: {
        sandboxId,
        isolated: true,
        restrictions,
      },
      metadata: {
        appliedLimits: limits,
      },
    };
  };
}

/**
 * Creates a sandbox handler with code validation
 */
export function createCodeValidationSandbox(
  validators: Array<{
    name: string;
    validate: (code: string) => { valid: boolean; reason?: string };
  }>
): HookHandler<ToolSandboxInput, ToolSandboxOutput> {
  return async (input, context): Promise<HookResult<ToolSandboxOutput>> => {
    const sandboxId = `sandbox-${context.requestId}-${input.toolId}`;

    if (!input.code) {
      return {
        success: true,
        data: {
          sandboxId,
          isolated: false,
          restrictions: ['no-code-provided'],
        },
      };
    }

    const restrictions: string[] = [];

    for (const validator of validators) {
      const result = validator.validate(input.code);
      if (!result.valid) {
        restrictions.push(`blocked:${validator.name}:${result.reason ?? 'failed'}`);
      }
    }

    return {
      success: true,
      data: {
        sandboxId,
        isolated: restrictions.length === 0,
        restrictions,
      },
    };
  };
}

/**
 * Creates a sandbox handler with module restrictions
 */
export function createModuleRestrictedSandbox(
  allowedModules: string[],
  blockedModules: string[]
): HookHandler<ToolSandboxInput, ToolSandboxOutput> {
  return async (input, context): Promise<HookResult<ToolSandboxOutput>> => {
    const sandboxId = `sandbox-${context.requestId}-${input.toolId}`;

    const restrictions: string[] = [];

    // Add blocked modules to restrictions
    for (const module of blockedModules) {
      restrictions.push(`blocked-module:${module}`);
    }

    // If allowlist is provided and not '*', add restriction
    if (allowedModules.length > 0 && !allowedModules.includes('*')) {
      restrictions.push(`allowed-modules:${allowedModules.join(',')}`);
    }

    return {
      success: true,
      data: {
        sandboxId,
        isolated: true,
        restrictions,
      },
      metadata: {
        allowedModules,
        blockedModules,
      },
    };
  };
}

/**
 * Creates a sandbox handler with audit logging
 */
export function createAuditedSandbox(
  innerHandler: HookHandler<ToolSandboxInput, ToolSandboxOutput>,
  auditLog: {
    logSandboxCreation: (entry: {
      sandboxId: string;
      toolId: string;
      permissions: string[];
      restrictions: string[];
      timestamp: number;
      requestId: string;
    }) => void;
  }
): HookHandler<ToolSandboxInput, ToolSandboxOutput> {
  return async (input, context): Promise<HookResult<ToolSandboxOutput>> => {
    const result = await innerHandler(input, context);

    if (result.success) {
      auditLog.logSandboxCreation({
        sandboxId: result.data.sandboxId,
        toolId: input.toolId,
        permissions: input.permissions,
        restrictions: result.data.restrictions,
        timestamp: Date.now(),
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Creates a sandbox pool for reusing sandbox configurations
 */
export function createSandboxPool(
  poolSize: number = 10
): {
  handler: HookHandler<ToolSandboxInput, ToolSandboxOutput>;
  getPoolStats: () => { available: number; inUse: number };
  cleanup: () => void;
} {
  const pool: Array<{
    sandboxId: string;
    inUse: boolean;
    toolId?: string;
    config?: SandboxConfig;
  }> = [];

  // Initialize pool
  for (let i = 0; i < poolSize; i++) {
    pool.push({
      sandboxId: `pool-sandbox-${i}`,
      inUse: false,
    });
  }

  const handler: HookHandler<ToolSandboxInput, ToolSandboxOutput> = async (
    input,
    _context
  ): Promise<HookResult<ToolSandboxOutput>> => {
    const available = pool.find((p) => !p.inUse);

    if (!available) {
      return {
        success: true,
        data: {
          sandboxId: `overflow-${Date.now()}`,
          isolated: false,
          restrictions: ['pool-exhausted'],
        },
      };
    }

    available.inUse = true;
    available.toolId = input.toolId;
    available.config = {
      permissions: input.permissions,
      resourceLimits: input.resourceLimits,
    };

    return {
      success: true,
      data: {
        sandboxId: available.sandboxId,
        isolated: true,
        restrictions: [],
      },
      metadata: {
        pooled: true,
      },
    };
  };

  const getPoolStats = () => ({
    available: pool.filter((p) => !p.inUse).length,
    inUse: pool.filter((p) => p.inUse).length,
  });

  const cleanup = () => {
    for (const item of pool) {
      item.inUse = false;
      item.toolId = undefined;
      item.config = undefined;
    }
  };

  return { handler, getPoolStats, cleanup };
}

/**
 * Creates a composite sandbox handler
 */
export function createCompositeSandbox(
  handlers: HookHandler<ToolSandboxInput, ToolSandboxOutput>[]
): HookHandler<ToolSandboxInput, ToolSandboxOutput> {
  return async (input, context): Promise<HookResult<ToolSandboxOutput>> => {
    const allRestrictions: string[] = [];
    let sandboxId = '';
    let isolated = true;

    for (const handler of handlers) {
      const result = await handler(input, context);

      if (!result.success) {
        return result;
      }

      if (!sandboxId) {
        sandboxId = result.data.sandboxId;
      }

      allRestrictions.push(...result.data.restrictions);
      isolated = isolated && result.data.isolated;
    }

    return {
      success: true,
      data: {
        sandboxId,
        isolated,
        restrictions: [...new Set(allRestrictions)],
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
      priority: 'normal',
      description: 'Basic sandbox handler',
    },
    defaultToolSandboxHandler
  );
}
