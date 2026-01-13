/**
 * Message Queue
 *
 * Manages inter-agent message passing with hook integration.
 */

import { EventEmitter } from 'eventemitter3';
import type { AgentMessage, HookContext } from '../types/hooks.js';
import type { HookRegistry } from '../hooks/registry.js';
import { HOOK_NAMES } from '../hooks/registry.js';
import type { MessageQueue } from './types.js';

// =============================================================================
// Message Queue Events
// =============================================================================

interface MessageQueueEvents {
  'message:enqueued': (agentId: string, message: AgentMessage) => void;
  'message:dequeued': (agentId: string, message: AgentMessage) => void;
  'queue:full': (agentId: string) => void;
  'queue:cleared': (agentId: string) => void;
}

// =============================================================================
// Queue Entry with Priority
// =============================================================================

interface QueueEntry {
  message: AgentMessage;
  priority: number;
  enqueuedAt: number;
  fromAgentId?: string;
}

// =============================================================================
// Priority Weights
// =============================================================================

const PRIORITY_WEIGHTS: Record<'high' | 'normal' | 'low', number> = {
  high: 0,
  normal: 1,
  low: 2,
};

// =============================================================================
// Default Message Queue Implementation
// =============================================================================

export class DefaultMessageQueue
  extends EventEmitter<MessageQueueEvents>
  implements MessageQueue
{
  private queues: Map<string, QueueEntry[]> = new Map();
  private registry: HookRegistry;
  private maxQueueSize: number;

  constructor(registry: HookRegistry, maxQueueSize: number = 1000) {
    super();
    this.registry = registry;
    this.maxQueueSize = maxQueueSize;
  }

  /**
   * Enqueue a message for an agent
   */
  async enqueue(
    agentId: string,
    message: AgentMessage,
    fromAgentId?: string
  ): Promise<boolean> {
    // Ensure queue exists
    if (!this.queues.has(agentId)) {
      this.queues.set(agentId, []);
    }

    const queue = this.queues.get(agentId)!;

    // Check queue capacity
    if (queue.length >= this.maxQueueSize) {
      this.emit('queue:full', agentId);
      return false;
    }

    // Create hook context
    const context: HookContext = {
      requestId: `enqueue-${agentId}-${Date.now()}`,
      timestamp: Date.now(),
      metadata: {
        toAgentId: agentId,
        fromAgentId,
        messageType: message.type,
      },
    };

    // Execute message passing hook
    const result = await this.registry.execute(
      HOOK_NAMES.MESSAGE_PASSING,
      {
        fromAgentId: fromAgentId ?? 'system',
        toAgentId: agentId,
        message,
        priority: 'normal' as const,
      },
      context
    );

    if (!result.success) {
      return false;
    }

    const data = result.data as { delivered?: boolean };
    if (data.delivered === false) {
      return false;
    }

    // Determine priority
    const priorityHint = context.metadata['priority'] as 'high' | 'normal' | 'low' | undefined;
    const priority = PRIORITY_WEIGHTS[priorityHint ?? 'normal'];

    const entry: QueueEntry = {
      message,
      priority,
      enqueuedAt: Date.now(),
      fromAgentId,
    };

    // Insert in priority order
    const insertIndex = this.findInsertIndex(queue, entry);
    queue.splice(insertIndex, 0, entry);

    this.emit('message:enqueued', agentId, message);
    return true;
  }

  /**
   * Dequeue the next message for an agent
   */
  dequeue(agentId: string): AgentMessage | undefined {
    const queue = this.queues.get(agentId);
    if (!queue || queue.length === 0) {
      return undefined;
    }

    const entry = queue.shift();
    if (entry) {
      this.emit('message:dequeued', agentId, entry.message);
      return entry.message;
    }

    return undefined;
  }

  /**
   * Peek at the next message without removing it
   */
  peek(agentId: string): AgentMessage | undefined {
    const queue = this.queues.get(agentId);
    if (!queue || queue.length === 0) {
      return undefined;
    }

    return queue[0]?.message;
  }

  /**
   * Get all messages for an agent (does not remove them)
   */
  getMessages(agentId: string): AgentMessage[] {
    const queue = this.queues.get(agentId);
    if (!queue) {
      return [];
    }

    return queue.map((entry) => entry.message);
  }

  /**
   * Get queue length for an agent
   */
  getLength(agentId: string): number {
    return this.queues.get(agentId)?.length ?? 0;
  }

  /**
   * Clear queue for an agent
   */
  clear(agentId: string): void {
    const queue = this.queues.get(agentId);
    if (queue && queue.length > 0) {
      queue.length = 0;
      this.emit('queue:cleared', agentId);
    }
  }

  /**
   * Clear all queues
   */
  clearAll(): void {
    for (const agentId of this.queues.keys()) {
      this.clear(agentId);
    }
    this.queues.clear();
  }

  /**
   * Remove queue for an agent
   */
  removeQueue(agentId: string): boolean {
    const existed = this.queues.has(agentId);
    this.queues.delete(agentId);
    if (existed) {
      this.emit('queue:cleared', agentId);
    }
    return existed;
  }

  /**
   * Get all agent IDs with queues
   */
  getAgentIds(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * Get total message count across all queues
   */
  getTotalMessageCount(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  /**
   * Get messages by type for an agent
   */
  getMessagesByType(agentId: string, type: AgentMessage['type']): AgentMessage[] {
    const queue = this.queues.get(agentId);
    if (!queue) {
      return [];
    }

    return queue.filter((entry) => entry.message.type === type).map((entry) => entry.message);
  }

  /**
   * Remove expired messages (older than maxAge ms)
   */
  removeExpired(maxAge: number): number {
    const now = Date.now();
    let removed = 0;

    for (const [agentId, queue] of this.queues) {
      const originalLength = queue.length;
      const filtered = queue.filter((entry) => now - entry.enqueuedAt < maxAge);
      removed += originalLength - filtered.length;
      this.queues.set(agentId, filtered);
    }

    return removed;
  }

  /**
   * Find the correct insertion index to maintain priority order
   */
  private findInsertIndex(queue: QueueEntry[], entry: QueueEntry): number {
    // Binary search for insertion point
    let low = 0;
    let high = queue.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const midEntry = queue[mid]!;

      // Lower priority number = higher priority
      // If same priority, older messages come first (FIFO within priority)
      if (
        midEntry.priority < entry.priority ||
        (midEntry.priority === entry.priority && midEntry.enqueuedAt <= entry.enqueuedAt)
      ) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return low;
  }
}

/**
 * Create a message queue
 */
export function createMessageQueue(
  registry: HookRegistry,
  maxQueueSize?: number
): DefaultMessageQueue {
  return new DefaultMessageQueue(registry, maxQueueSize);
}
