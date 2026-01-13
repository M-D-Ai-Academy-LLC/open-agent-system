/**
 * Agent Init Hook (#22)
 *
 * Initializes agents with configuration and capabilities.
 * Use cases: agent bootstrapping, capability setup, resource allocation.
 */

import type {
  HookHandler,
  HookResult,
  AgentInitInput,
  AgentInitOutput,
  AgentConfig,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default agent init handler - basic initialization
 */
export const defaultAgentInitHandler: HookHandler<
  AgentInitInput,
  AgentInitOutput
> = async (input, _context): Promise<HookResult<AgentInitOutput>> => {
  const capabilities: string[] = [];

  // Derive capabilities from config
  if (input.config.tools && input.config.tools.length > 0) {
    capabilities.push('tool-use');
  }
  if (input.config.systemPrompt) {
    capabilities.push('custom-persona');
  }
  if (input.parentAgentId) {
    capabilities.push('sub-agent');
  }

  return {
    success: true,
    data: {
      initialized: true,
      agentId: input.agentId,
      capabilities,
    },
  };
};

/**
 * Agent registry for tracking initialized agents
 */
export interface AgentRegistry {
  agents: Map<string, {
    config: AgentConfig;
    capabilities: string[];
    parentAgentId?: string;
    childAgentIds: string[];
    initTime: number;
    status: 'initializing' | 'ready' | 'busy' | 'terminated';
  }>;
  register: (agentId: string, config: AgentConfig, capabilities: string[], parentAgentId?: string) => void;
  get: (agentId: string) => AgentConfig | undefined;
  getCapabilities: (agentId: string) => string[];
  getChildren: (agentId: string) => string[];
  setStatus: (agentId: string, status: 'initializing' | 'ready' | 'busy' | 'terminated') => void;
  unregister: (agentId: string) => boolean;
}

/**
 * Creates an agent registry
 */
export function createAgentRegistry(): AgentRegistry {
  const agents = new Map<string, {
    config: AgentConfig;
    capabilities: string[];
    parentAgentId?: string;
    childAgentIds: string[];
    initTime: number;
    status: 'initializing' | 'ready' | 'busy' | 'terminated';
  }>();

  return {
    agents,
    register: (agentId, config, capabilities, parentAgentId) => {
      agents.set(agentId, {
        config,
        capabilities,
        parentAgentId,
        childAgentIds: [],
        initTime: Date.now(),
        status: 'initializing',
      });

      // Add to parent's child list
      if (parentAgentId) {
        const parent = agents.get(parentAgentId);
        if (parent) {
          parent.childAgentIds.push(agentId);
        }
      }
    },
    get: (agentId) => agents.get(agentId)?.config,
    getCapabilities: (agentId) => agents.get(agentId)?.capabilities ?? [],
    getChildren: (agentId) => agents.get(agentId)?.childAgentIds ?? [],
    setStatus: (agentId, status) => {
      const agent = agents.get(agentId);
      if (agent) {
        agent.status = status;
      }
    },
    unregister: (agentId) => {
      const agent = agents.get(agentId);
      if (!agent) return false;

      // Remove from parent's child list
      if (agent.parentAgentId) {
        const parent = agents.get(agent.parentAgentId);
        if (parent) {
          parent.childAgentIds = parent.childAgentIds.filter((id) => id !== agentId);
        }
      }

      agents.delete(agentId);
      return true;
    },
  };
}

/**
 * Creates an init handler with capability validation
 */
export function createCapabilityValidatingInit(
  requiredCapabilities: Map<string, string[]>,
  availableCapabilities: string[]
): HookHandler<AgentInitInput, AgentInitOutput> {
  return async (input, _context): Promise<HookResult<AgentInitOutput>> => {
    const required = requiredCapabilities.get(input.config.role) ?? [];
    const missing = required.filter((cap) => !availableCapabilities.includes(cap));

    if (missing.length > 0) {
      return {
        success: false,
        error: new Error(`Missing required capabilities: ${missing.join(', ')}`),
        recoverable: false,
      };
    }

    // Grant capabilities based on role
    const grantedCapabilities = availableCapabilities.filter(
      (cap) => required.includes(cap) || required.length === 0
    );

    return {
      success: true,
      data: {
        initialized: true,
        agentId: input.agentId,
        capabilities: grantedCapabilities,
      },
    };
  };
}

/**
 * Creates an init handler with resource allocation
 */
export function createResourceAllocatingInit(
  resourcePool: {
    allocate: (agentId: string, resources: string[]) => boolean;
    deallocate: (agentId: string) => void;
  },
  roleResources: Map<string, string[]>
): HookHandler<AgentInitInput, AgentInitOutput> {
  return async (input, _context): Promise<HookResult<AgentInitOutput>> => {
    const resources = roleResources.get(input.config.role) ?? [];

    if (!resourcePool.allocate(input.agentId, resources)) {
      return {
        success: false,
        error: new Error('Failed to allocate resources for agent'),
        recoverable: true,
      };
    }

    const capabilities: string[] = [];
    if (resources.includes('gpu')) capabilities.push('gpu-accelerated');
    if (resources.includes('memory-large')) capabilities.push('large-context');
    if (resources.includes('network')) capabilities.push('network-access');

    return {
      success: true,
      data: {
        initialized: true,
        agentId: input.agentId,
        capabilities,
      },
      metadata: {
        allocatedResources: resources,
      },
    };
  };
}

/**
 * Creates an init handler with logging
 */
export function createLoggingInit(
  logger: {
    info: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<AgentInitInput, AgentInitOutput>
): HookHandler<AgentInitInput, AgentInitOutput> {
  return async (input, context): Promise<HookResult<AgentInitOutput>> => {
    logger.info(`Initializing agent: ${input.agentId}`, {
      agentId: input.agentId,
      role: input.config.role,
      parentAgentId: input.parentAgentId,
      requestId: context.requestId,
    });

    const handler = innerHandler ?? defaultAgentInitHandler;
    const result = await handler(input, context);

    if (result.success) {
      logger.info(`Agent initialized: ${input.agentId}`, {
        agentId: result.data.agentId,
        capabilities: result.data.capabilities,
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Creates a composite init handler
 */
export function createCompositeInit(
  handlers: HookHandler<AgentInitInput, AgentInitOutput>[]
): HookHandler<AgentInitInput, AgentInitOutput> {
  return async (input, context): Promise<HookResult<AgentInitOutput>> => {
    const allCapabilities: string[] = [];

    for (const handler of handlers) {
      const result = await handler(input, context);

      if (!result.success) {
        return result;
      }

      allCapabilities.push(...result.data.capabilities);
    }

    return {
      success: true,
      data: {
        initialized: true,
        agentId: input.agentId,
        capabilities: [...new Set(allCapabilities)],
      },
    };
  };
}

/**
 * Register the default agent init hook
 */
export function registerDefaultAgentInit(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.AGENT_INIT,
    {
      id: 'default-agent-init',
      name: 'Default Agent Init',
      priority: 'high',
      description: 'Basic agent initialization handler',
    },
    defaultAgentInitHandler
  );
}
