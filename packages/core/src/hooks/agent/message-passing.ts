/**
 * Message Passing Hook (#26)
 *
 * Handles inter-agent communication.
 * Use cases: agent coordination, event broadcasting, request/response patterns.
 */

import type {
  HookHandler,
  HookResult,
  MessagePassingInput,
  MessagePassingOutput,
  AgentMessage,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default message passing handler - immediate delivery
 */
export const defaultMessagePassingHandler: HookHandler<
  MessagePassingInput,
  MessagePassingOutput
> = async (_input, context): Promise<HookResult<MessagePassingOutput>> => {
  const messageId = `msg-${context.requestId}-${Date.now()}`;

  return {
    success: true,
    data: {
      delivered: true,
      messageId,
    },
  };
};

/**
 * Message queue for deferred delivery
 */
export interface MessageQueue {
  queues: Map<string, Array<{
    messageId: string;
    message: AgentMessage;
    fromAgentId: string;
    priority: 'high' | 'normal' | 'low';
    timestamp: number;
  }>>;
  enqueue: (toAgentId: string, messageId: string, message: AgentMessage, fromAgentId: string, priority: 'high' | 'normal' | 'low') => number;
  dequeue: (agentId: string) => { messageId: string; message: AgentMessage; fromAgentId: string } | undefined;
  peek: (agentId: string) => { messageId: string; message: AgentMessage; fromAgentId: string } | undefined;
  length: (agentId: string) => number;
  clear: (agentId: string) => void;
}

/**
 * Creates a message queue
 */
export function createMessageQueue(): MessageQueue {
  const queues = new Map<string, Array<{
    messageId: string;
    message: AgentMessage;
    fromAgentId: string;
    priority: 'high' | 'normal' | 'low';
    timestamp: number;
  }>>();

  const getQueue = (agentId: string) => {
    let queue = queues.get(agentId);
    if (!queue) {
      queue = [];
      queues.set(agentId, queue);
    }
    return queue;
  };

  const priorityOrder = { high: 0, normal: 1, low: 2 };

  return {
    queues,
    enqueue: (toAgentId, messageId, message, fromAgentId, priority) => {
      const queue = getQueue(toAgentId);
      queue.push({
        messageId,
        message,
        fromAgentId,
        priority,
        timestamp: Date.now(),
      });

      // Sort by priority then timestamp
      queue.sort((a, b) => {
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.timestamp - b.timestamp;
      });

      return queue.findIndex((item) => item.messageId === messageId);
    },
    dequeue: (agentId) => {
      const queue = getQueue(agentId);
      const item = queue.shift();
      if (!item) return undefined;
      return {
        messageId: item.messageId,
        message: item.message,
        fromAgentId: item.fromAgentId,
      };
    },
    peek: (agentId) => {
      const queue = getQueue(agentId);
      const item = queue[0];
      if (!item) return undefined;
      return {
        messageId: item.messageId,
        message: item.message,
        fromAgentId: item.fromAgentId,
      };
    },
    length: (agentId) => getQueue(agentId).length,
    clear: (agentId) => queues.delete(agentId),
  };
}

/**
 * Creates a message passing handler with queuing
 */
export function createQueuedMessagePassing(
  queue: MessageQueue,
  directDeliveryEnabled: boolean = false
): HookHandler<MessagePassingInput, MessagePassingOutput> {
  return async (input, context): Promise<HookResult<MessagePassingOutput>> => {
    const messageId = `msg-${context.requestId}-${Date.now()}`;
    const priority = input.priority ?? 'normal';

    const queuePosition = queue.enqueue(
      input.toAgentId,
      messageId,
      input.message,
      input.fromAgentId,
      priority
    );

    return {
      success: true,
      data: {
        delivered: directDeliveryEnabled && queuePosition === 0,
        messageId,
        queuePosition: directDeliveryEnabled ? undefined : queuePosition,
      },
    };
  };
}

/**
 * Creates a message passing handler with filtering
 */
export function createFilteredMessagePassing(
  filters: Array<{
    name: string;
    filter: (message: AgentMessage, fromAgentId: string, toAgentId: string) => boolean;
  }>
): HookHandler<MessagePassingInput, MessagePassingOutput> {
  return async (input, context): Promise<HookResult<MessagePassingOutput>> => {
    for (const { name, filter } of filters) {
      if (!filter(input.message, input.fromAgentId, input.toAgentId)) {
        return {
          success: true,
          data: {
            delivered: false,
            messageId: `blocked-${context.requestId}`,
          },
          metadata: {
            blockedBy: name,
          },
        };
      }
    }

    const messageId = `msg-${context.requestId}-${Date.now()}`;

    return {
      success: true,
      data: {
        delivered: true,
        messageId,
      },
    };
  };
}

/**
 * Creates a message passing handler with routing
 */
export function createRoutedMessagePassing(
  router: {
    getRoute: (fromAgentId: string, toAgentId: string) => string[];
    isReachable: (fromAgentId: string, toAgentId: string) => boolean;
  }
): HookHandler<MessagePassingInput, MessagePassingOutput> {
  return async (input, context): Promise<HookResult<MessagePassingOutput>> => {
    if (!router.isReachable(input.fromAgentId, input.toAgentId)) {
      return {
        success: true,
        data: {
          delivered: false,
          messageId: `unreachable-${context.requestId}`,
        },
        metadata: {
          reason: 'unreachable',
        },
      };
    }

    const route = router.getRoute(input.fromAgentId, input.toAgentId);
    const messageId = `msg-${context.requestId}-${Date.now()}`;

    return {
      success: true,
      data: {
        delivered: true,
        messageId,
      },
      metadata: {
        route,
        hops: route.length - 1,
      },
    };
  };
}

/**
 * Creates a message passing handler with acknowledgment
 */
export function createAcknowledgedMessagePassing(
  ackTracker: {
    registerPending: (messageId: string, callback: () => void) => void;
    acknowledge: (messageId: string) => boolean;
    isPending: (messageId: string) => boolean;
  },
  timeoutMs: number = 5000
): HookHandler<MessagePassingInput, MessagePassingOutput> {
  return async (_input, context): Promise<HookResult<MessagePassingOutput>> => {
    const messageId = `msg-${context.requestId}-${Date.now()}`;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (ackTracker.isPending(messageId)) {
          resolve({
            success: true,
            data: {
              delivered: false,
              messageId,
            },
            metadata: {
              reason: 'ack-timeout',
            },
          });
        }
      }, timeoutMs);

      ackTracker.registerPending(messageId, () => {
        clearTimeout(timeout);
        resolve({
          success: true,
          data: {
            delivered: true,
            messageId,
          },
          metadata: {
            acknowledged: true,
          },
        });
      });
    });
  };
}

/**
 * Creates a message passing handler with broadcast support
 */
export function createBroadcastMessagePassing(
  agentRegistry: {
    getAllAgentIds: () => string[];
    getAgentsByRole: (role: string) => string[];
  }
): HookHandler<MessagePassingInput, MessagePassingOutput> {
  return async (input, context): Promise<HookResult<MessagePassingOutput>> => {
    const messageId = `msg-${context.requestId}-${Date.now()}`;

    // Check for broadcast targets
    let recipients: string[];

    if (input.toAgentId === '*') {
      // Broadcast to all agents except sender
      recipients = agentRegistry.getAllAgentIds().filter((id) => id !== input.fromAgentId);
    } else if (input.toAgentId.startsWith('role:')) {
      // Broadcast to agents with specific role
      const role = input.toAgentId.substring(5);
      recipients = agentRegistry.getAgentsByRole(role).filter((id) => id !== input.fromAgentId);
    } else {
      // Single recipient
      recipients = [input.toAgentId];
    }

    return {
      success: true,
      data: {
        delivered: recipients.length > 0,
        messageId,
      },
      metadata: {
        recipients,
        broadcastCount: recipients.length,
      },
    };
  };
}

/**
 * Creates a message passing handler with logging
 */
export function createLoggingMessagePassing(
  logger: {
    debug: (message: string, context: Record<string, unknown>) => void;
    info: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<MessagePassingInput, MessagePassingOutput>
): HookHandler<MessagePassingInput, MessagePassingOutput> {
  return async (input, context): Promise<HookResult<MessagePassingOutput>> => {
    logger.debug(`Message sent: ${input.fromAgentId} -> ${input.toAgentId}`, {
      fromAgentId: input.fromAgentId,
      toAgentId: input.toAgentId,
      messageType: input.message.type,
      priority: input.priority,
      requestId: context.requestId,
    });

    const handler = innerHandler ?? defaultMessagePassingHandler;
    const result = await handler(input, context);

    if (result.success) {
      logger.info(`Message delivery: ${result.data.delivered ? 'success' : 'failed'}`, {
        messageId: result.data.messageId,
        delivered: result.data.delivered,
        queuePosition: result.data.queuePosition,
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Register the default message passing hook
 */
export function registerDefaultMessagePassing(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.MESSAGE_PASSING,
    {
      id: 'default-message-passing',
      name: 'Default Message Passing',
      priority: 'normal',
      description: 'Basic message passing handler',
    },
    defaultMessagePassingHandler
  );
}
