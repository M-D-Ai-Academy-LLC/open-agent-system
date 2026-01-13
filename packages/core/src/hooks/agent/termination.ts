/**
 * Agent Termination Hook (#24)
 *
 * Handles graceful agent termination and cleanup.
 * Use cases: resource release, state persistence, orphan handling.
 */

import type {
  HookHandler,
  HookResult,
  AgentTerminationInput,
  AgentTerminationOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default agent termination handler - basic cleanup
 */
export const defaultAgentTerminationHandler: HookHandler<
  AgentTerminationInput,
  AgentTerminationOutput
> = async (_input, _context): Promise<HookResult<AgentTerminationOutput>> => {
  return {
    success: true,
    data: {
      terminated: true,
      cleanupCompleted: true,
      orphanedResources: [],
    },
  };
};

/**
 * Termination strategy
 */
export type TerminationStrategy = 'immediate' | 'graceful' | 'cascade';

/**
 * Creates a termination handler with resource cleanup
 */
export function createResourceCleanupTermination(
  resourceTracker: {
    getResources: (agentId: string) => string[];
    release: (resourceId: string) => boolean;
  }
): HookHandler<AgentTerminationInput, AgentTerminationOutput> {
  return async (input, _context): Promise<HookResult<AgentTerminationOutput>> => {
    const resources = resourceTracker.getResources(input.agentId);
    const orphanedResources: string[] = [];

    for (const resourceId of resources) {
      if (!resourceTracker.release(resourceId)) {
        orphanedResources.push(resourceId);
      }
    }

    return {
      success: true,
      data: {
        terminated: true,
        cleanupCompleted: orphanedResources.length === 0,
        orphanedResources: orphanedResources.length > 0 ? orphanedResources : undefined,
      },
      metadata: {
        releasedResources: resources.filter((r) => !orphanedResources.includes(r)),
      },
    };
  };
}

/**
 * Creates a termination handler with cascade behavior
 */
export function createCascadeTermination(
  childTracker: {
    getChildren: (agentId: string) => string[];
    terminate: (agentId: string, reason: AgentTerminationInput['reason']) => Promise<boolean>;
  }
): HookHandler<AgentTerminationInput, AgentTerminationOutput> {
  return async (input, _context): Promise<HookResult<AgentTerminationOutput>> => {
    const children = childTracker.getChildren(input.agentId);
    const orphanedResources: string[] = [];

    // Terminate all children first
    for (const childId of children) {
      const success = await childTracker.terminate(childId, 'cancelled');
      if (!success) {
        orphanedResources.push(`child:${childId}`);
      }
    }

    return {
      success: true,
      data: {
        terminated: true,
        cleanupCompleted: orphanedResources.length === 0,
        orphanedResources: orphanedResources.length > 0 ? orphanedResources : undefined,
      },
      metadata: {
        cascadedTerminations: children.length,
      },
    };
  };
}

/**
 * Creates a termination handler with state persistence
 */
export function createStatePersistingTermination(
  stateStore: {
    save: (agentId: string, state: Record<string, unknown>) => Promise<boolean>;
    getCheckpointId: (agentId: string) => string;
  }
): HookHandler<AgentTerminationInput, AgentTerminationOutput> {
  return async (input, _context): Promise<HookResult<AgentTerminationOutput>> => {
    if (input.finalState) {
      const saved = await stateStore.save(input.agentId, input.finalState);

      if (!saved) {
        return {
          success: true,
          data: {
            terminated: true,
            cleanupCompleted: false,
            orphanedResources: ['unsaved-state'],
          },
        };
      }
    }

    return {
      success: true,
      data: {
        terminated: true,
        cleanupCompleted: true,
      },
      metadata: {
        checkpointId: input.finalState ? stateStore.getCheckpointId(input.agentId) : undefined,
      },
    };
  };
}

/**
 * Creates a termination handler with timeout
 */
export function createTimeoutTermination(
  innerHandler: HookHandler<AgentTerminationInput, AgentTerminationOutput>,
  timeoutMs: number = 5000
): HookHandler<AgentTerminationInput, AgentTerminationOutput> {
  return async (input, context): Promise<HookResult<AgentTerminationOutput>> => {
    const timeoutPromise = new Promise<HookResult<AgentTerminationOutput>>((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          data: {
            terminated: true,
            cleanupCompleted: false,
            orphanedResources: ['timeout-exceeded'],
          },
          metadata: {
            timedOut: true,
          },
        });
      }, timeoutMs);
    });

    return Promise.race([innerHandler(input, context), timeoutPromise]);
  };
}

/**
 * Creates a termination handler with reason-based behavior
 */
export function createReasonBasedTermination(
  handlers: Partial<Record<AgentTerminationInput['reason'], HookHandler<AgentTerminationInput, AgentTerminationOutput>>>,
  defaultHandler?: HookHandler<AgentTerminationInput, AgentTerminationOutput>
): HookHandler<AgentTerminationInput, AgentTerminationOutput> {
  return async (input, context): Promise<HookResult<AgentTerminationOutput>> => {
    const handler = handlers[input.reason] ?? defaultHandler ?? defaultAgentTerminationHandler;
    return handler(input, context);
  };
}

/**
 * Creates a termination handler with logging
 */
export function createLoggingTermination(
  logger: {
    info: (message: string, context: Record<string, unknown>) => void;
    warn: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<AgentTerminationInput, AgentTerminationOutput>
): HookHandler<AgentTerminationInput, AgentTerminationOutput> {
  return async (input, context): Promise<HookResult<AgentTerminationOutput>> => {
    logger.info(`Terminating agent: ${input.agentId}`, {
      agentId: input.agentId,
      reason: input.reason,
      hasFinalState: !!input.finalState,
      requestId: context.requestId,
    });

    const handler = innerHandler ?? defaultAgentTerminationHandler;
    const result = await handler(input, context);

    if (result.success) {
      if (result.data.orphanedResources && result.data.orphanedResources.length > 0) {
        logger.warn(`Agent terminated with orphaned resources: ${input.agentId}`, {
          agentId: input.agentId,
          orphanedResources: result.data.orphanedResources,
          requestId: context.requestId,
        });
      } else {
        logger.info(`Agent terminated cleanly: ${input.agentId}`, {
          agentId: input.agentId,
          cleanupCompleted: result.data.cleanupCompleted,
          requestId: context.requestId,
        });
      }
    }

    return result;
  };
}

/**
 * Creates a composite termination handler
 */
export function createCompositeTermination(
  handlers: HookHandler<AgentTerminationInput, AgentTerminationOutput>[]
): HookHandler<AgentTerminationInput, AgentTerminationOutput> {
  return async (input, context): Promise<HookResult<AgentTerminationOutput>> => {
    const allOrphaned: string[] = [];
    let allCleanupCompleted = true;

    for (const handler of handlers) {
      const result = await handler(input, context);

      if (!result.success) {
        return result;
      }

      if (result.data.orphanedResources) {
        allOrphaned.push(...result.data.orphanedResources);
      }
      allCleanupCompleted = allCleanupCompleted && result.data.cleanupCompleted;
    }

    return {
      success: true,
      data: {
        terminated: true,
        cleanupCompleted: allCleanupCompleted,
        orphanedResources: allOrphaned.length > 0 ? allOrphaned : undefined,
      },
    };
  };
}

/**
 * Register the default agent termination hook
 */
export function registerDefaultAgentTermination(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.AGENT_TERMINATION,
    {
      id: 'default-agent-termination',
      name: 'Default Agent Termination',
      priority: 'normal',
      description: 'Basic agent termination handler',
    },
    defaultAgentTerminationHandler
  );
}
