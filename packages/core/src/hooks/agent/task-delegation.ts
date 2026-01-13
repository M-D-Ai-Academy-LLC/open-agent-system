/**
 * Task Delegation Hook (#27)
 *
 * Handles task assignment from parent to child agents.
 * Use cases: workload distribution, capability matching, priority scheduling.
 */

import type {
  HookHandler,
  HookResult,
  TaskDelegationInput,
  TaskDelegationOutput,
  TaskDefinition,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default task delegation handler - assigns to specified target
 */
export const defaultTaskDelegationHandler: HookHandler<
  TaskDelegationInput,
  TaskDelegationOutput
> = async (input, context): Promise<HookResult<TaskDelegationOutput>> => {
  const assignedAgentId = input.targetAgentId ?? `auto-${context.requestId}`;

  return {
    success: true,
    data: {
      delegated: true,
      assignedAgentId,
    },
  };
};

/**
 * Agent pool for task delegation
 */
export interface AgentPool {
  agents: Map<string, {
    capabilities: string[];
    currentLoad: 'low' | 'medium' | 'high';
    taskCount: number;
    avgCompletionTime: number;
  }>;
  register: (agentId: string, capabilities: string[]) => void;
  updateLoad: (agentId: string, load: 'low' | 'medium' | 'high') => void;
  incrementTaskCount: (agentId: string) => void;
  decrementTaskCount: (agentId: string) => void;
  findByCapabilities: (required: string[]) => string[];
  findLeastLoaded: (candidates: string[]) => string | undefined;
}

/**
 * Creates an agent pool
 */
export function createAgentPool(): AgentPool {
  const agents = new Map<string, {
    capabilities: string[];
    currentLoad: 'low' | 'medium' | 'high';
    taskCount: number;
    avgCompletionTime: number;
  }>();

  return {
    agents,
    register: (agentId, capabilities) => {
      agents.set(agentId, {
        capabilities,
        currentLoad: 'low',
        taskCount: 0,
        avgCompletionTime: 0,
      });
    },
    updateLoad: (agentId, load) => {
      const agent = agents.get(agentId);
      if (agent) {
        agent.currentLoad = load;
      }
    },
    incrementTaskCount: (agentId) => {
      const agent = agents.get(agentId);
      if (agent) {
        agent.taskCount++;
        // Update load based on task count
        if (agent.taskCount > 5) agent.currentLoad = 'high';
        else if (agent.taskCount > 2) agent.currentLoad = 'medium';
        else agent.currentLoad = 'low';
      }
    },
    decrementTaskCount: (agentId) => {
      const agent = agents.get(agentId);
      if (agent && agent.taskCount > 0) {
        agent.taskCount--;
        // Update load based on task count
        if (agent.taskCount > 5) agent.currentLoad = 'high';
        else if (agent.taskCount > 2) agent.currentLoad = 'medium';
        else agent.currentLoad = 'low';
      }
    },
    findByCapabilities: (required) => {
      const matches: string[] = [];
      for (const [agentId, agent] of agents) {
        const hasAll = required.every((cap) => agent.capabilities.includes(cap));
        if (hasAll) {
          matches.push(agentId);
        }
      }
      return matches;
    },
    findLeastLoaded: (candidates) => {
      const loadOrder = { low: 0, medium: 1, high: 2 };
      let bestAgent: string | undefined;
      let bestLoad = 3; // Higher than any valid load

      for (const agentId of candidates) {
        const agent = agents.get(agentId);
        if (agent) {
          const load = loadOrder[agent.currentLoad];
          if (load < bestLoad) {
            bestLoad = load;
            bestAgent = agentId;
          }
        }
      }

      return bestAgent;
    },
  };
}

/**
 * Creates a task delegation handler with capability matching
 */
export function createCapabilityMatchingDelegation(
  agentPool: AgentPool
): HookHandler<TaskDelegationInput, TaskDelegationOutput> {
  return async (input, _context): Promise<HookResult<TaskDelegationOutput>> => {
    // If target specified, use it
    if (input.targetAgentId) {
      return {
        success: true,
        data: {
          delegated: true,
          assignedAgentId: input.targetAgentId,
        },
      };
    }

    // Find agents by capabilities
    const requiredCaps = input.task.requiredCapabilities ?? [];
    const candidates = agentPool.findByCapabilities(requiredCaps);

    if (candidates.length === 0) {
      return {
        success: false,
        error: new Error(`No agents found with required capabilities: ${requiredCaps.join(', ')}`),
        recoverable: true,
      };
    }

    // Apply selection criteria
    let filteredCandidates = candidates;

    if (input.selectionCriteria?.currentLoad) {
      filteredCandidates = candidates.filter((id) => {
        const agent = agentPool.agents.get(id);
        return agent && agent.currentLoad === input.selectionCriteria!.currentLoad;
      });
    }

    if (input.selectionCriteria?.preferredAgents) {
      const preferred = filteredCandidates.filter((id) =>
        input.selectionCriteria!.preferredAgents!.includes(id)
      );
      if (preferred.length > 0) {
        filteredCandidates = preferred;
      }
    }

    // Select least loaded agent
    const assignedAgentId = agentPool.findLeastLoaded(filteredCandidates);

    if (!assignedAgentId) {
      return {
        success: false,
        error: new Error('No available agents found'),
        recoverable: true,
      };
    }

    agentPool.incrementTaskCount(assignedAgentId);

    return {
      success: true,
      data: {
        delegated: true,
        assignedAgentId,
      },
      metadata: {
        candidateCount: candidates.length,
        filteredCount: filteredCandidates.length,
      },
    };
  };
}

/**
 * Creates a task delegation handler with priority scheduling
 */
export function createPriorityScheduledDelegation(
  taskQueue: {
    enqueue: (task: TaskDefinition, agentId: string) => number;
    getEstimatedWait: (agentId: string) => number;
  }
): HookHandler<TaskDelegationInput, TaskDelegationOutput> {
  return async (input, context): Promise<HookResult<TaskDelegationOutput>> => {
    const assignedAgentId = input.targetAgentId ?? `auto-${context.requestId}`;

    const position = taskQueue.enqueue(input.task, assignedAgentId);
    const estimatedWait = taskQueue.getEstimatedWait(assignedAgentId);

    // Calculate estimated completion time
    const estimatedCompletion = input.task.deadline
      ? Math.min(Date.now() + estimatedWait, input.task.deadline)
      : Date.now() + estimatedWait;

    return {
      success: true,
      data: {
        delegated: true,
        assignedAgentId,
        estimatedCompletion,
      },
      metadata: {
        queuePosition: position,
        estimatedWaitMs: estimatedWait,
      },
    };
  };
}

/**
 * Creates a task delegation handler with load balancing
 */
export function createLoadBalancedDelegation(
  agentPool: AgentPool,
  strategy: 'round-robin' | 'least-loaded' | 'random' = 'least-loaded'
): HookHandler<TaskDelegationInput, TaskDelegationOutput> {
  let roundRobinIndex = 0;

  return async (input, _context): Promise<HookResult<TaskDelegationOutput>> => {
    const requiredCaps = input.task.requiredCapabilities ?? [];
    const candidates = agentPool.findByCapabilities(requiredCaps);

    if (candidates.length === 0) {
      return {
        success: false,
        error: new Error('No capable agents available'),
        recoverable: true,
      };
    }

    let assignedAgentId: string;

    switch (strategy) {
      case 'round-robin':
        assignedAgentId = candidates[roundRobinIndex % candidates.length]!;
        roundRobinIndex++;
        break;

      case 'random':
        assignedAgentId = candidates[Math.floor(Math.random() * candidates.length)]!;
        break;

      case 'least-loaded':
      default:
        assignedAgentId = agentPool.findLeastLoaded(candidates) ?? candidates[0]!;
        break;
    }

    agentPool.incrementTaskCount(assignedAgentId);

    return {
      success: true,
      data: {
        delegated: true,
        assignedAgentId,
      },
      metadata: {
        strategy,
        candidateCount: candidates.length,
      },
    };
  };
}

/**
 * Creates a task delegation handler with dependency resolution
 */
export function createDependencyAwareDelegation(
  taskTracker: {
    isCompleted: (taskId: string) => boolean;
    getCompletionPromise: (taskId: string) => Promise<void>;
  }
): HookHandler<TaskDelegationInput, TaskDelegationOutput> {
  return async (input, context): Promise<HookResult<TaskDelegationOutput>> => {
    // Check dependencies
    const dependencies = input.task.dependencies ?? [];
    const pendingDeps = dependencies.filter((dep) => !taskTracker.isCompleted(dep));

    if (pendingDeps.length > 0) {
      return {
        success: true,
        data: {
          delegated: false,
          assignedAgentId: '',
        },
        metadata: {
          blockedBy: pendingDeps,
          reason: 'dependencies-pending',
        },
      };
    }

    const assignedAgentId = input.targetAgentId ?? `auto-${context.requestId}`;

    return {
      success: true,
      data: {
        delegated: true,
        assignedAgentId,
      },
    };
  };
}

/**
 * Creates a task delegation handler with logging
 */
export function createLoggingDelegation(
  logger: {
    info: (message: string, context: Record<string, unknown>) => void;
    warn: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<TaskDelegationInput, TaskDelegationOutput>
): HookHandler<TaskDelegationInput, TaskDelegationOutput> {
  return async (input, context): Promise<HookResult<TaskDelegationOutput>> => {
    logger.info(`Task delegation requested: ${input.task.id}`, {
      parentAgentId: input.parentAgentId,
      taskId: input.task.id,
      taskDescription: input.task.description,
      targetAgentId: input.targetAgentId,
      requiredCapabilities: input.task.requiredCapabilities,
      requestId: context.requestId,
    });

    const handler = innerHandler ?? defaultTaskDelegationHandler;
    const result = await handler(input, context);

    if (result.success) {
      if (result.data.delegated) {
        logger.info(`Task delegated: ${input.task.id}`, {
          taskId: input.task.id,
          assignedAgentId: result.data.assignedAgentId,
          estimatedCompletion: result.data.estimatedCompletion,
          requestId: context.requestId,
        });
      } else {
        logger.warn(`Task delegation failed: ${input.task.id}`, {
          taskId: input.task.id,
          reason: result.metadata,
          requestId: context.requestId,
        });
      }
    }

    return result;
  };
}

/**
 * Register the default task delegation hook
 */
export function registerDefaultTaskDelegation(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.TASK_DELEGATION,
    {
      id: 'default-task-delegation',
      name: 'Default Task Delegation',
      priority: 'normal',
      description: 'Basic task delegation handler',
    },
    defaultTaskDelegationHandler
  );
}
