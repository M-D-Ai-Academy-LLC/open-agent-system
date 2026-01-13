/**
 * Runtime Types
 *
 * Type definitions for the Agent Runtime system.
 */

import type {
  AgentConfig,
  AgentState,
  AgentMessage,
  Message,
  ToolDefinition,
  ToolCall,
  LLMResponse,
  HookContext,
  StreamChunk,
} from '../types/hooks.js';

export type { StreamChunk };
import type { HookRegistry } from '../hooks/registry.js';

// =============================================================================
// Runtime Configuration
// =============================================================================

export interface RuntimeConfig {
  /** Maximum number of iterations before stopping */
  maxIterations: number;
  /** Maximum execution time in milliseconds */
  maxExecutionTime: number;
  /** Enable streaming responses */
  enableStreaming: boolean;
  /** Enable parallel tool execution */
  parallelToolExecution: boolean;
  /** Default timeout for tool execution (ms) */
  defaultToolTimeout: number;
  /** Enable automatic health checks */
  enableHealthChecks: boolean;
  /** Health check interval (ms) */
  healthCheckInterval: number;
  /** Enable message queuing */
  enableMessageQueue: boolean;
  /** Maximum message queue size */
  maxQueueSize: number;
  /** Enable automatic state persistence */
  enableStatePersistence: boolean;
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  maxIterations: 100,
  maxExecutionTime: 300000, // 5 minutes
  enableStreaming: true,
  parallelToolExecution: false,
  defaultToolTimeout: 30000, // 30 seconds
  enableHealthChecks: true,
  healthCheckInterval: 30000, // 30 seconds
  enableMessageQueue: true,
  maxQueueSize: 1000,
  enableStatePersistence: false,
};

// =============================================================================
// Agent Instance
// =============================================================================

export interface AgentInstance {
  id: string;
  config: AgentConfig;
  state: AgentState;
  parentAgentId?: string;
  childAgentIds: string[];
  createdAt: number;
  lastActiveAt: number;
  iterationCount: number;
  messageHistory: Message[];
  pendingToolCalls: ToolCall[];
  completedToolCalls: Map<string, unknown>;
  metadata: Record<string, unknown>;
}

// =============================================================================
// Runtime Events
// =============================================================================

export interface RuntimeEvents {
  'agent:created': (agentId: string, config: AgentConfig) => void;
  'agent:started': (agentId: string) => void;
  'agent:stopped': (agentId: string, reason: string) => void;
  'agent:error': (agentId: string, error: Error) => void;
  'agent:state-changed': (agentId: string, oldState: AgentState, newState: AgentState) => void;
  'agent:iteration': (agentId: string, iteration: number) => void;
  'agent:message': (agentId: string, message: Message) => void;
  'tool:executing': (agentId: string, toolCall: ToolCall) => void;
  'tool:completed': (agentId: string, toolCall: ToolCall, result: unknown) => void;
  'tool:error': (agentId: string, toolCall: ToolCall, error: Error) => void;
  'message:queued': (agentId: string, message: AgentMessage) => void;
  'message:delivered': (agentId: string, message: AgentMessage) => void;
  'health:check': (agentId: string, healthy: boolean) => void;
}

// =============================================================================
// LLM Adapter Interface
// =============================================================================

export interface LLMAdapter {
  /** Unique identifier for this adapter */
  id: string;
  /** Human-readable name */
  name: string;
  /** Supported models */
  models: string[];

  /** Send a completion request */
  complete(
    messages: Message[],
    options: CompletionOptions
  ): Promise<LLMResponse>;

  /** Send a streaming completion request */
  stream(
    messages: Message[],
    options: CompletionOptions
  ): AsyncIterable<StreamChunk>;

  /** Check if the adapter is healthy */
  healthCheck(): Promise<boolean>;
}

export interface CompletionOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  systemPrompt?: string;
  stopSequences?: string[];
  signal?: AbortSignal;
}


// =============================================================================
// Tool Executor Interface
// =============================================================================

export interface ToolExecutor {
  /** Execute a tool call */
  execute(
    toolCall: ToolCall,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult>;

  /** Execute multiple tool calls in parallel */
  executeParallel(
    toolCalls: ToolCall[],
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult[]>;

  /** Register a tool */
  register(tool: ToolDefinition, handler: ToolHandler): void;

  /** Unregister a tool */
  unregister(toolName: string): boolean;

  /** Get all registered tools */
  getTools(): ToolDefinition[];

  /** Check if a tool exists */
  hasTool(toolName: string): boolean;
}

export interface ToolExecutionContext {
  agentId: string;
  hookContext: HookContext;
  timeout?: number;
  sandbox?: boolean;
}

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: Error;
  duration: number;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<unknown>;

// =============================================================================
// Message Queue Interface
// =============================================================================

export interface MessageQueue {
  /** Enqueue a message */
  enqueue(agentId: string, message: AgentMessage, fromAgentId?: string): Promise<boolean>;

  /** Dequeue a message */
  dequeue(agentId: string): AgentMessage | undefined;

  /** Peek at the next message without removing it */
  peek(agentId: string): AgentMessage | undefined;

  /** Get all messages for an agent */
  getMessages(agentId: string): AgentMessage[];

  /** Get queue length for an agent */
  getLength(agentId: string): number;

  /** Clear queue for an agent */
  clear(agentId: string): void;

  /** Clear all queues */
  clearAll(): void;
}

// =============================================================================
// State Manager Interface
// =============================================================================

export interface StateManager {
  /** Get agent state */
  getState(agentId: string): AgentInstance | undefined;

  /** Set agent state */
  setState(agentId: string, state: Partial<AgentInstance>): void;

  /** Transition agent to new state */
  transition(agentId: string, newState: AgentState): Promise<boolean>;

  /** Get all agent IDs */
  getAgentIds(): string[];

  /** Check if agent exists */
  hasAgent(agentId: string): boolean;

  /** Remove agent state */
  removeAgent(agentId: string): boolean;

  /** Get agent hierarchy */
  getHierarchy(agentId: string): string[];

  /** Persist state to storage */
  persist?(): Promise<void>;

  /** Load state from storage */
  load?(): Promise<void>;
}

// =============================================================================
// Runtime Interface
// =============================================================================

export interface Runtime {
  /** Runtime configuration */
  config: RuntimeConfig;

  /** Hook registry */
  registry: HookRegistry;

  /** State manager */
  stateManager: StateManager;

  /** Tool executor */
  toolExecutor: ToolExecutor;

  /** Message queue */
  messageQueue: MessageQueue;

  /** Create a new agent */
  createAgent(config: AgentConfig, parentAgentId?: string): Promise<string>;

  /** Start an agent */
  startAgent(agentId: string): Promise<void>;

  /** Stop an agent */
  stopAgent(agentId: string, reason?: string): Promise<void>;

  /** Run a single iteration for an agent */
  runIteration(agentId: string, input?: Message): Promise<LLMResponse | null>;

  /** Run agent until completion or limit */
  run(agentId: string, input?: Message): Promise<LLMResponse>;

  /** Send a message to an agent */
  sendMessage(toAgentId: string, message: AgentMessage, fromAgentId?: string): Promise<boolean>;

  /** Get agent state */
  getAgent(agentId: string): AgentInstance | undefined;

  /** Get all agents */
  getAllAgents(): AgentInstance[];

  /** Register an LLM adapter */
  registerAdapter(adapter: LLMAdapter): void;

  /** Get an LLM adapter */
  getAdapter(adapterId: string): LLMAdapter | undefined;

  /** Shutdown the runtime */
  shutdown(): Promise<void>;
}
