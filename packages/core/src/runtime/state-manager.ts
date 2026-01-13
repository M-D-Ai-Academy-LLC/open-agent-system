/**
 * State Manager
 *
 * Manages agent state and transitions with hook integration.
 */

import { EventEmitter } from 'eventemitter3';
import type {
  AgentConfig,
  AgentState,
  HookContext,
} from '../types/hooks.js';
import type { HookRegistry } from '../hooks/registry.js';
import { HOOK_NAMES } from '../hooks/registry.js';
import type { AgentInstance, StateManager } from './types.js';

// =============================================================================
// State Manager Events
// =============================================================================

interface StateManagerEvents {
  'agent:created': (agentId: string) => void;
  'agent:removed': (agentId: string) => void;
  'agent:transition': (agentId: string, from: AgentState, to: AgentState) => void;
  'agent:updated': (agentId: string, fields: string[]) => void;
}

// =============================================================================
// Valid State Transitions
// =============================================================================

const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  idle: ['thinking', 'completed', 'error'],
  thinking: ['executing-tool', 'waiting', 'delegating', 'completed', 'error', 'idle'],
  'executing-tool': ['thinking', 'waiting', 'error', 'idle'],
  waiting: ['thinking', 'idle', 'error'],
  delegating: ['waiting', 'thinking', 'error'],
  completed: ['idle'], // Can restart
  error: ['idle'], // Can recover
};

// =============================================================================
// Default State Manager Implementation
// =============================================================================

export class DefaultStateManager
  extends EventEmitter<StateManagerEvents>
  implements StateManager
{
  private agents: Map<string, AgentInstance> = new Map();
  private registry: HookRegistry;

  constructor(registry: HookRegistry) {
    super();
    this.registry = registry;
  }

  /**
   * Create a new agent instance
   */
  createAgent(
    agentId: string,
    config: AgentConfig,
    parentAgentId?: string
  ): AgentInstance {
    const agent: AgentInstance = {
      id: agentId,
      config,
      state: 'idle',
      parentAgentId,
      childAgentIds: [],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      iterationCount: 0,
      messageHistory: [],
      pendingToolCalls: [],
      completedToolCalls: new Map(),
      metadata: {},
    };

    this.agents.set(agentId, agent);

    // Update parent's child list
    if (parentAgentId) {
      const parent = this.agents.get(parentAgentId);
      if (parent) {
        parent.childAgentIds.push(agentId);
      }
    }

    this.emit('agent:created', agentId);
    return agent;
  }

  /**
   * Get agent state
   */
  getState(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Set agent state (partial update)
   */
  setState(agentId: string, updates: Partial<AgentInstance>): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }

    const updatedFields: string[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'config' && value !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (agent as any)[key] = value;
        updatedFields.push(key);
      }
    }

    agent.lastActiveAt = Date.now();

    if (updatedFields.length > 0) {
      this.emit('agent:updated', agentId, updatedFields);
    }
  }

  /**
   * Transition agent to new state with validation and hooks
   */
  async transition(agentId: string, newState: AgentState): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    const oldState = agent.state;

    // Validate transition
    if (!this.isValidTransition(oldState, newState)) {
      return false;
    }

    // Create hook context
    const context: HookContext = {
      requestId: `transition-${agentId}-${Date.now()}`,
      timestamp: Date.now(),
      metadata: {
        agentId,
        fromState: oldState,
        toState: newState,
      },
    };

    // Execute state transition hook
    const result = await this.registry.execute(
      HOOK_NAMES.STATE_TRANSITION,
      {
        agentId,
        fromState: oldState,
        toState: newState,
        trigger: 'runtime',
      },
      context
    );

    // Check if transition is allowed
    if (!result.success) {
      return false;
    }

    // The hook can modify the target state
    const finalState = (result.data as { newState?: AgentState })?.newState ?? newState;

    // Apply transition
    agent.state = finalState;
    agent.lastActiveAt = Date.now();

    this.emit('agent:transition', agentId, oldState, finalState);
    return true;
  }

  /**
   * Check if a state transition is valid
   */
  isValidTransition(from: AgentState, to: AgentState): boolean {
    const validTargets = VALID_TRANSITIONS[from];
    return validTargets?.includes(to) ?? false;
  }

  /**
   * Get all agent IDs
   */
  getAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Check if agent exists
   */
  hasAgent(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  /**
   * Remove agent state
   */
  removeAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    // Remove from parent's child list
    if (agent.parentAgentId) {
      const parent = this.agents.get(agent.parentAgentId);
      if (parent) {
        parent.childAgentIds = parent.childAgentIds.filter((id) => id !== agentId);
      }
    }

    // Remove all children recursively
    for (const childId of agent.childAgentIds) {
      this.removeAgent(childId);
    }

    this.agents.delete(agentId);
    this.emit('agent:removed', agentId);
    return true;
  }

  /**
   * Get agent hierarchy (from root to agent)
   */
  getHierarchy(agentId: string): string[] {
    const hierarchy: string[] = [];
    let currentId: string | undefined = agentId;

    while (currentId) {
      hierarchy.unshift(currentId);
      const agent = this.agents.get(currentId);
      currentId = agent?.parentAgentId;
    }

    return hierarchy;
  }

  /**
   * Get all child agents (recursive)
   */
  getAllChildren(agentId: string): string[] {
    const children: string[] = [];
    const agent = this.agents.get(agentId);

    if (!agent) {
      return children;
    }

    for (const childId of agent.childAgentIds) {
      children.push(childId);
      children.push(...this.getAllChildren(childId));
    }

    return children;
  }

  /**
   * Get agents by state
   */
  getAgentsByState(state: AgentState): AgentInstance[] {
    return Array.from(this.agents.values()).filter((agent) => agent.state === state);
  }

  /**
   * Get active agents (not idle, completed, or error)
   */
  getActiveAgents(): AgentInstance[] {
    const inactiveStates: AgentState[] = ['idle', 'completed', 'error'];
    return Array.from(this.agents.values()).filter(
      (agent) => !inactiveStates.includes(agent.state)
    );
  }

  /**
   * Clear all agents
   */
  clear(): void {
    for (const agentId of this.agents.keys()) {
      this.emit('agent:removed', agentId);
    }
    this.agents.clear();
  }

  /**
   * Get agent count
   */
  getAgentCount(): number {
    return this.agents.size;
  }

  /**
   * Export state for persistence
   */
  exportState(): Record<string, AgentInstance> {
    const state: Record<string, AgentInstance> = {};
    for (const [id, agent] of this.agents) {
      state[id] = {
        ...agent,
        // Convert Map to object for serialization
        completedToolCalls: new Map(agent.completedToolCalls),
      };
    }
    return state;
  }

  /**
   * Import state from persistence
   */
  importState(state: Record<string, AgentInstance>): void {
    this.clear();
    for (const [id, agent] of Object.entries(state)) {
      this.agents.set(id, {
        ...agent,
        completedToolCalls: new Map(Object.entries(agent.completedToolCalls || {})),
      });
      this.emit('agent:created', id);
    }
  }
}

/**
 * Create a state manager
 */
export function createStateManager(registry: HookRegistry): DefaultStateManager {
  return new DefaultStateManager(registry);
}
