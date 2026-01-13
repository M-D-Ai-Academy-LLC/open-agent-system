/**
 * Agent Runtime
 *
 * Main runtime for managing agent lifecycle, message handling,
 * and tool execution within the hook pipeline.
 */

import { EventEmitter } from 'eventemitter3';
import type {
  AgentConfig,
  AgentMessage,
  Message,
  LLMResponse,
  HookContext,
} from '../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../hooks/registry.js';
import type {
  Runtime,
  RuntimeConfig,
  RuntimeEvents,
  AgentInstance,
  LLMAdapter,
  CompletionOptions,
} from './types.js';
import { DEFAULT_RUNTIME_CONFIG } from './types.js';
import { DefaultStateManager, createStateManager } from './state-manager.js';
import { DefaultToolExecutor, createToolExecutor } from './tool-executor.js';
import { DefaultMessageQueue, createMessageQueue } from './message-queue.js';

// =============================================================================
// Agent Runtime Implementation
// =============================================================================

export class AgentRuntime extends EventEmitter<RuntimeEvents> implements Runtime {
  config: RuntimeConfig;
  registry: HookRegistry;
  stateManager: DefaultStateManager;
  toolExecutor: DefaultToolExecutor;
  messageQueue: DefaultMessageQueue;

  private adapters: Map<string, LLMAdapter> = new Map();
  private defaultAdapter?: LLMAdapter;
  private healthCheckInterval?: ReturnType<typeof setInterval>;
  private shuttingDown = false;

  constructor(config: Partial<RuntimeConfig> = {}, registry?: HookRegistry) {
    super();
    this.config = { ...DEFAULT_RUNTIME_CONFIG, ...config };
    this.registry = registry ?? new HookRegistry();
    this.stateManager = createStateManager(this.registry);
    this.toolExecutor = createToolExecutor(this.registry, this.config.defaultToolTimeout);
    this.messageQueue = createMessageQueue(this.registry, this.config.maxQueueSize);

    // Wire up state manager events
    this.stateManager.on('agent:transition', (agentId, from, to) => {
      this.emit('agent:state-changed', agentId, from, to);
    });

    // Start health checks if enabled
    if (this.config.enableHealthChecks) {
      this.startHealthChecks();
    }
  }

  /**
   * Generate a unique agent ID
   */
  private generateAgentId(): string {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return 'agent-' + Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Create a new agent
   */
  async createAgent(config: AgentConfig, parentAgentId?: string): Promise<string> {
    const agentId = this.generateAgentId();

    // Create hook context
    const context: HookContext = {
      requestId: `create-${agentId}`,
      timestamp: Date.now(),
      metadata: {
        parentAgentId,
      },
    };

    // Execute agent init hook
    const result = await this.registry.execute(
      HOOK_NAMES.AGENT_INIT,
      {
        agentId,
        config,
        parentAgentId,
      },
      context
    );

    if (!result.success) {
      throw result.error;
    }

    // Create agent instance
    this.stateManager.createAgent(agentId, config, parentAgentId);

    // If spawned from parent, execute spawn hook
    if (parentAgentId) {
      await this.registry.execute(
        HOOK_NAMES.AGENT_SPAWN,
        {
          parentAgentId,
          childConfig: config,
          inheritPermissions: true,
        },
        context
      );
    }

    this.emit('agent:created', agentId, config);
    return agentId;
  }

  /**
   * Start an agent
   */
  async startAgent(agentId: string): Promise<void> {
    const agent = this.stateManager.getState(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Transition to thinking state
    await this.stateManager.transition(agentId, 'thinking');
    this.emit('agent:started', agentId);
  }

  /**
   * Stop an agent
   */
  async stopAgent(agentId: string, reason: string = 'manual'): Promise<void> {
    const agent = this.stateManager.getState(agentId);
    if (!agent) {
      return;
    }

    // Create hook context
    const context: HookContext = {
      requestId: `stop-${agentId}`,
      timestamp: Date.now(),
      metadata: {
        reason,
      },
    };

    // Execute termination hook
    await this.registry.execute(
      HOOK_NAMES.AGENT_TERMINATION,
      {
        agentId,
        reason: reason as 'completed' | 'cancelled',
        finalState: {
          iterationCount: agent.iterationCount,
          messageCount: agent.messageHistory.length,
        },
      },
      context
    );

    // Transition to completed state
    await this.stateManager.transition(agentId, 'completed');

    // Clear message queue
    this.messageQueue.clear(agentId);

    this.emit('agent:stopped', agentId, reason);
  }

  /**
   * Run a single iteration for an agent
   */
  async runIteration(agentId: string, input?: Message): Promise<LLMResponse | null> {
    const agent = this.stateManager.getState(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (this.shuttingDown) {
      return null;
    }

    // Check iteration limit
    if (agent.iterationCount >= this.config.maxIterations) {
      await this.stopAgent(agentId, 'resource-limit');
      return null;
    }

    // Add input to message history
    if (input) {
      agent.messageHistory.push(input);
      this.emit('agent:message', agentId, input);
    }

    // Process any queued messages
    if (this.config.enableMessageQueue) {
      let queuedMessage = this.messageQueue.dequeue(agentId);
      while (queuedMessage) {
        // Convert AgentMessage to Message and add to history
        const message: Message = {
          role: 'user',
          content: JSON.stringify(queuedMessage.payload),
        };
        agent.messageHistory.push(message);
        this.emit('message:delivered', agentId, queuedMessage);
        queuedMessage = this.messageQueue.dequeue(agentId);
      }
    }

    // Transition to thinking state
    await this.stateManager.transition(agentId, 'thinking');

    // Create hook context
    const context: HookContext = {
      requestId: `iteration-${agentId}-${agent.iterationCount}`,
      timestamp: Date.now(),
      metadata: {
        agentId,
        iteration: agent.iterationCount,
      },
    };

    try {
      // Get adapter
      const adapter = this.getAdapterForAgent(agent);
      if (!adapter) {
        throw new Error('No LLM adapter available');
      }

      // Build messages
      const messages = this.buildMessages(agent);

      // Build completion options
      const options: CompletionOptions = {
        model: agent.config.model ?? 'default',
        temperature: 0.7,
        tools: this.toolExecutor.getTools(),
        systemPrompt: agent.config.systemPrompt,
      };

      // Execute request transform hook
      const transformedRequest = await this.registry.execute(
        HOOK_NAMES.REQUEST_TRANSFORM,
        {
          messages,
          model: options.model,
          temperature: options.temperature,
          tools: options.tools,
        },
        context
      );

      if (!transformedRequest.success) {
        throw transformedRequest.error;
      }

      // Call LLM
      const response = await adapter.complete(messages, options);

      // Execute response transform hook
      const transformedResponse = await this.registry.execute(
        HOOK_NAMES.RESPONSE_TRANSFORM,
        {
          response,
          originalRequest: transformedRequest.data as Record<string, unknown>,
        },
        context
      );

      const finalResponse = transformedResponse.success
        ? (transformedResponse.data as { response?: LLMResponse })?.response ?? response
        : response;

      // Add assistant message to history
      const assistantMessage: Message = {
        role: 'assistant',
        content: finalResponse.content,
      };
      agent.messageHistory.push(assistantMessage);
      this.emit('agent:message', agentId, assistantMessage);

      // Handle tool calls
      if (finalResponse.toolCalls && finalResponse.toolCalls.length > 0) {
        await this.handleToolCalls(agentId, finalResponse.toolCalls, context);
      }

      // Update iteration count
      this.stateManager.setState(agentId, {
        iterationCount: agent.iterationCount + 1,
      });

      this.emit('agent:iteration', agentId, agent.iterationCount + 1);

      // Transition back to idle or thinking based on tool calls
      if (!finalResponse.toolCalls || finalResponse.toolCalls.length === 0) {
        await this.stateManager.transition(agentId, 'idle');
      }

      return finalResponse;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('agent:error', agentId, err);

      // Transition to error state
      await this.stateManager.transition(agentId, 'error');
      throw err;
    }
  }

  /**
   * Run agent until completion or limit
   */
  async run(agentId: string, input?: Message): Promise<LLMResponse> {
    const startTime = Date.now();
    let lastResponse: LLMResponse | null = null;

    await this.startAgent(agentId);

    // Initial iteration with input
    lastResponse = await this.runIteration(agentId, input);

    // Continue until done
    while (true) {
      const agent = this.stateManager.getState(agentId);
      if (!agent) {
        break;
      }

      // Check termination conditions
      if (agent.state === 'completed' || agent.state === 'error' || agent.state === 'idle') {
        break;
      }

      // Check time limit
      if (Date.now() - startTime > this.config.maxExecutionTime) {
        await this.stopAgent(agentId, 'timeout');
        break;
      }

      // Check if still processing tools
      if (agent.pendingToolCalls.length > 0) {
        // Wait for tools to complete, then continue
        await this.waitForToolCompletion(agentId);
      }

      // Run next iteration
      lastResponse = await this.runIteration(agentId);

      if (!lastResponse) {
        break;
      }

      // If no tool calls, we're done
      if (!lastResponse.toolCalls || lastResponse.toolCalls.length === 0) {
        break;
      }
    }

    if (!lastResponse) {
      throw new Error('Agent execution failed: no response');
    }

    return lastResponse;
  }

  /**
   * Send a message to an agent
   */
  async sendMessage(
    toAgentId: string,
    message: AgentMessage,
    fromAgentId?: string
  ): Promise<boolean> {
    const success = await this.messageQueue.enqueue(toAgentId, message, fromAgentId);
    if (success) {
      this.emit('message:queued', toAgentId, message);
    }
    return success;
  }

  /**
   * Get agent state
   */
  getAgent(agentId: string): AgentInstance | undefined {
    return this.stateManager.getState(agentId);
  }

  /**
   * Get all agents
   */
  getAllAgents(): AgentInstance[] {
    return this.stateManager.getAgentIds().map((id) => this.stateManager.getState(id)!);
  }

  /**
   * Register an LLM adapter
   */
  registerAdapter(adapter: LLMAdapter): void {
    this.adapters.set(adapter.id, adapter);
    if (!this.defaultAdapter) {
      this.defaultAdapter = adapter;
    }
  }

  /**
   * Get an LLM adapter
   */
  getAdapter(adapterId: string): LLMAdapter | undefined {
    return this.adapters.get(adapterId);
  }

  /**
   * Shutdown the runtime
   */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;

    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    // Stop all agents
    for (const agentId of this.stateManager.getAgentIds()) {
      await this.stopAgent(agentId, 'shutdown');
    }

    // Clear all queues
    this.messageQueue.clearAll();

    // Clear state
    this.stateManager.clear();
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Handle tool calls from LLM response
   */
  private async handleToolCalls(
    agentId: string,
    toolCalls: LLMResponse['toolCalls'],
    context: HookContext
  ): Promise<void> {
    if (!toolCalls || toolCalls.length === 0) {
      return;
    }

    const agent = this.stateManager.getState(agentId);
    if (!agent) {
      return;
    }

    // Transition to executing-tool state
    await this.stateManager.transition(agentId, 'executing-tool');

    // Store pending tool calls
    agent.pendingToolCalls = [...toolCalls];

    // Execute tools
    const executionContext = {
      agentId,
      hookContext: context,
      timeout: this.config.defaultToolTimeout,
      sandbox: true,
    };

    const results = this.config.parallelToolExecution
      ? await this.toolExecutor.executeParallel(toolCalls, executionContext)
      : await Promise.all(toolCalls.map((tc) => this.toolExecutor.execute(tc, executionContext)));

    // Process results
    for (const result of results) {
      this.emit(
        result.success ? 'tool:completed' : 'tool:error',
        agentId,
        toolCalls.find((tc) => tc.id === result.toolCallId)!,
        result.success ? result.result : result.error!
      );

      // Store completed result
      agent.completedToolCalls.set(result.toolCallId, result);

      // Remove from pending
      agent.pendingToolCalls = agent.pendingToolCalls.filter(
        (tc) => tc.id !== result.toolCallId
      );

      // Add tool result to message history
      const toolMessage: Message = {
        role: 'tool',
        content: result.success ? JSON.stringify(result.result) : String(result.error),
        toolCallId: result.toolCallId,
      };
      agent.messageHistory.push(toolMessage);
      this.emit('agent:message', agentId, toolMessage);
    }

    // Transition back to thinking
    await this.stateManager.transition(agentId, 'thinking');
  }

  /**
   * Wait for tool completion
   */
  private async waitForToolCompletion(agentId: string): Promise<void> {
    const checkInterval = 100;
    const maxWait = this.config.defaultToolTimeout;
    let waited = 0;

    while (waited < maxWait) {
      const agent = this.stateManager.getState(agentId);
      if (!agent || agent.pendingToolCalls.length === 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }
  }

  /**
   * Build messages for LLM request
   */
  private buildMessages(agent: AgentInstance): Message[] {
    const messages: Message[] = [];

    // Add system prompt
    if (agent.config.systemPrompt) {
      messages.push({
        role: 'system',
        content: agent.config.systemPrompt,
      });
    }

    // Add message history
    messages.push(...agent.messageHistory);

    return messages;
  }

  /**
   * Get adapter for an agent
   */
  private getAdapterForAgent(_agent: AgentInstance): LLMAdapter | undefined {
    // For now, just use the default adapter
    // Could be extended to select based on agent config
    return this.defaultAdapter;
  }

  /**
   * Start health check interval
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const agentId of this.stateManager.getAgentIds()) {
        const agent = this.stateManager.getState(agentId);
        if (!agent) continue;

        // Skip inactive agents
        if (agent.state === 'completed' || agent.state === 'error') {
          continue;
        }

        const context: HookContext = {
          requestId: `health-${agentId}-${Date.now()}`,
          timestamp: Date.now(),
          metadata: { agentId },
        };

        const result = await this.registry.execute(
          HOOK_NAMES.AGENT_HEALTH_CHECK,
          {
            agentId,
            checks: ['memory', 'responsiveness', 'task-queue', 'connections'],
          },
          context
        );

        const healthy = result.success && (result.data as { healthy?: boolean })?.healthy !== false;
        this.emit('health:check', agentId, healthy);
      }
    }, this.config.healthCheckInterval);
  }
}

/**
 * Create an agent runtime
 */
export function createRuntime(
  config?: Partial<RuntimeConfig>,
  registry?: HookRegistry
): AgentRuntime {
  return new AgentRuntime(config, registry);
}
