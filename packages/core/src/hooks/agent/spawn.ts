/**
 * Agent Spawn Hook (#23)
 *
 * Handles spawning of child agents from parent agents.
 * Use cases: task delegation, parallel processing, specialized sub-tasks.
 */

import type {
  HookHandler,
  HookResult,
  AgentSpawnInput,
  AgentSpawnOutput,
  AgentConfig,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default agent spawn handler - basic spawning
 */
export const defaultAgentSpawnHandler: HookHandler<
  AgentSpawnInput,
  AgentSpawnOutput
> = async (input, context): Promise<HookResult<AgentSpawnOutput>> => {
  const childAgentId = `${input.parentAgentId}-child-${context.requestId}`;

  return {
    success: true,
    data: {
      childAgentId,
      spawned: true,
      inheritedCapabilities: input.inheritPermissions ? ['inherited'] : [],
    },
  };
};

/**
 * Spawn limits configuration
 */
export interface SpawnLimits {
  maxChildrenPerAgent?: number;
  maxTotalAgents?: number;
  maxDepth?: number;
  allowedRoles?: string[];
}

/**
 * Creates a spawn handler with limits
 */
export function createLimitedSpawn(
  limits: SpawnLimits,
  agentTracker: {
    getChildCount: (agentId: string) => number;
    getTotalCount: () => number;
    getDepth: (agentId: string) => number;
  }
): HookHandler<AgentSpawnInput, AgentSpawnOutput> {
  return async (input, context): Promise<HookResult<AgentSpawnOutput>> => {
    // Check child limit per agent
    if (limits.maxChildrenPerAgent !== undefined) {
      const childCount = agentTracker.getChildCount(input.parentAgentId);
      if (childCount >= limits.maxChildrenPerAgent) {
        return {
          success: false,
          error: new Error(`Maximum children (${limits.maxChildrenPerAgent}) reached for agent ${input.parentAgentId}`),
          recoverable: false,
        };
      }
    }

    // Check total agent limit
    if (limits.maxTotalAgents !== undefined) {
      const totalCount = agentTracker.getTotalCount();
      if (totalCount >= limits.maxTotalAgents) {
        return {
          success: false,
          error: new Error(`Maximum total agents (${limits.maxTotalAgents}) reached`),
          recoverable: true,
        };
      }
    }

    // Check depth limit
    if (limits.maxDepth !== undefined) {
      const depth = agentTracker.getDepth(input.parentAgentId);
      if (depth >= limits.maxDepth) {
        return {
          success: false,
          error: new Error(`Maximum spawn depth (${limits.maxDepth}) reached`),
          recoverable: false,
        };
      }
    }

    // Check role allowlist
    if (limits.allowedRoles && limits.allowedRoles.length > 0) {
      if (!limits.allowedRoles.includes(input.childConfig.role)) {
        return {
          success: false,
          error: new Error(`Role "${input.childConfig.role}" is not allowed for spawning`),
          recoverable: false,
        };
      }
    }

    const childAgentId = `${input.parentAgentId}-child-${context.requestId}`;

    return {
      success: true,
      data: {
        childAgentId,
        spawned: true,
        inheritedCapabilities: input.inheritPermissions ? ['inherited'] : [],
      },
      metadata: {
        currentChildCount: agentTracker.getChildCount(input.parentAgentId) + 1,
        currentTotalCount: agentTracker.getTotalCount() + 1,
        depth: agentTracker.getDepth(input.parentAgentId) + 1,
      },
    };
  };
}

/**
 * Creates a spawn handler with capability inheritance
 */
export function createCapabilityInheritingSpawn(
  parentCapabilities: Map<string, string[]>,
  inheritanceRules: Map<string, string[]>
): HookHandler<AgentSpawnInput, AgentSpawnOutput> {
  return async (input, context): Promise<HookResult<AgentSpawnOutput>> => {
    const childAgentId = `${input.parentAgentId}-child-${context.requestId}`;
    const inheritedCapabilities: string[] = [];

    if (input.inheritPermissions) {
      const parentCaps = parentCapabilities.get(input.parentAgentId) ?? [];
      const inheritRules = inheritanceRules.get(input.childConfig.role) ?? [];

      // Inherit only capabilities allowed by rules
      for (const cap of parentCaps) {
        if (inheritRules.includes(cap) || inheritRules.includes('*')) {
          inheritedCapabilities.push(cap);
        }
      }
    }

    return {
      success: true,
      data: {
        childAgentId,
        spawned: true,
        inheritedCapabilities,
      },
    };
  };
}

/**
 * Creates a spawn handler with task-specific configuration
 */
export function createTaskConfiguredSpawn(
  taskConfigMapper: (task: string, baseConfig: AgentConfig) => AgentConfig
): HookHandler<AgentSpawnInput, AgentSpawnOutput> {
  return async (input, context): Promise<HookResult<AgentSpawnOutput>> => {
    const childAgentId = `${input.parentAgentId}-child-${context.requestId}`;

    // Apply task-specific configuration
    const enhancedConfig = input.delegatedTask
      ? taskConfigMapper(input.delegatedTask, input.childConfig)
      : input.childConfig;

    const inheritedCapabilities: string[] = [];

    // Derive capabilities from enhanced config
    if (enhancedConfig.tools && enhancedConfig.tools.length > 0) {
      inheritedCapabilities.push('tool-use');
    }
    if (enhancedConfig.model) {
      inheritedCapabilities.push(`model:${enhancedConfig.model}`);
    }

    return {
      success: true,
      data: {
        childAgentId,
        spawned: true,
        inheritedCapabilities,
      },
      metadata: {
        appliedConfig: enhancedConfig,
        delegatedTask: input.delegatedTask,
      },
    };
  };
}

/**
 * Creates a spawn handler with queuing
 */
export function createQueuedSpawn(
  spawnQueue: {
    enqueue: (request: { parentAgentId: string; config: AgentConfig }) => string;
    getPosition: (queueId: string) => number;
  },
  maxConcurrentSpawns: number,
  currentSpawnCount: () => number
): HookHandler<AgentSpawnInput, AgentSpawnOutput> {
  return async (input, context): Promise<HookResult<AgentSpawnOutput>> => {
    if (currentSpawnCount() >= maxConcurrentSpawns) {
      const queueId = spawnQueue.enqueue({
        parentAgentId: input.parentAgentId,
        config: input.childConfig,
      });

      return {
        success: true,
        data: {
          childAgentId: `queued-${queueId}`,
          spawned: false,
          inheritedCapabilities: [],
        },
        metadata: {
          queued: true,
          queuePosition: spawnQueue.getPosition(queueId),
        },
      };
    }

    const childAgentId = `${input.parentAgentId}-child-${context.requestId}`;

    return {
      success: true,
      data: {
        childAgentId,
        spawned: true,
        inheritedCapabilities: input.inheritPermissions ? ['inherited'] : [],
      },
    };
  };
}

/**
 * Creates a spawn handler with logging
 */
export function createLoggingSpawn(
  logger: {
    info: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<AgentSpawnInput, AgentSpawnOutput>
): HookHandler<AgentSpawnInput, AgentSpawnOutput> {
  return async (input, context): Promise<HookResult<AgentSpawnOutput>> => {
    logger.info(`Spawning child agent from: ${input.parentAgentId}`, {
      parentAgentId: input.parentAgentId,
      childRole: input.childConfig.role,
      delegatedTask: input.delegatedTask,
      inheritPermissions: input.inheritPermissions,
      requestId: context.requestId,
    });

    const handler = innerHandler ?? defaultAgentSpawnHandler;
    const result = await handler(input, context);

    if (result.success) {
      logger.info(`Child agent spawned: ${result.data.childAgentId}`, {
        childAgentId: result.data.childAgentId,
        spawned: result.data.spawned,
        inheritedCapabilities: result.data.inheritedCapabilities,
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Register the default agent spawn hook
 */
export function registerDefaultAgentSpawn(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.AGENT_SPAWN,
    {
      id: 'default-agent-spawn',
      name: 'Default Agent Spawn',
      priority: 'normal',
      description: 'Basic agent spawning handler',
    },
    defaultAgentSpawnHandler
  );
}
