/**
 * MCP Client
 *
 * Client implementation for connecting to MCP servers.
 */

import { EventEmitter } from 'eventemitter3';
import type {
  MCPClientOptions,
  MCPClientEvents,
  ConnectionState,
  ServerInfo,
  ServerCapabilities,
  RemoteTool,
  RemoteResource,
  RemotePrompt,
  ToolCallResult,
  ResourceContents,
  PromptMessage,
  JsonRpcRequest,
} from './types.js';
import { createTransport, type MCPClientTransport } from './transport.js';

// =============================================================================
// MCP Client Implementation
// =============================================================================

/**
 * MCP Client
 *
 * Connects to MCP servers and provides access to their tools, resources, and prompts.
 */
export class MCPClient extends EventEmitter<MCPClientEvents> {
  private options: MCPClientOptions;
  private transport: MCPClientTransport;
  private state: ConnectionState = 'disconnected';
  private serverInfo?: ServerInfo;
  private tools: Map<string, RemoteTool> = new Map();
  private resources: Map<string, RemoteResource> = new Map();
  private prompts: Map<string, RemotePrompt> = new Map();
  private reconnectAttempts: number = 0;
  private requestId: number = 0;

  constructor(options: MCPClientOptions) {
    super();
    this.options = {
      connectionTimeout: 10000,
      requestTimeout: 30000,
      autoReconnect: true,
      maxReconnectAttempts: 5,
      reconnectDelay: 1000,
      ...options,
    };
    this.transport = createTransport(this.options);

    // Handle server-initiated messages
    this.transport.onMessage(this.handleServerMessage.bind(this));
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this.state !== 'disconnected') {
      return;
    }

    this.setState('connecting');
    this.emit('connecting');

    try {
      await this.transport.connect();
      this.setState('connected');
      this.emit('connected');

      // Initialize the connection
      await this.initialize();
    } catch (error) {
      this.setState('error');
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (this.state === 'disconnected') {
      return;
    }

    try {
      // Send shutdown if connected
      if (this.state === 'ready') {
        await this.request('shutdown', {});
      }
    } catch {
      // Ignore shutdown errors
    }

    await this.transport.disconnect();
    this.setState('disconnected');
    this.emit('disconnected');
    this.clearCaches();
  }

  /**
   * Get connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get server info
   */
  getServerInfo(): ServerInfo | undefined {
    return this.serverInfo;
  }

  /**
   * Get server capabilities
   */
  getCapabilities(): ServerCapabilities | undefined {
    return this.serverInfo?.capabilities;
  }

  // =============================================================================
  // Tool Operations
  // =============================================================================

  /**
   * List available tools
   */
  async listTools(): Promise<RemoteTool[]> {
    this.ensureReady();

    const response = await this.request('tools/list', {});
    const result = response.result as { tools: RemoteTool[] };

    // Update cache
    this.tools.clear();
    for (const tool of result.tools) {
      this.tools.set(tool.name, tool);
    }

    return result.tools;
  }

  /**
   * Get a specific tool
   */
  getTool(name: string): RemoteTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all cached tools
   */
  getCachedTools(): RemoteTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Call a tool
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolCallResult> {
    this.ensureReady();

    const response = await this.request('tools/call', {
      name,
      arguments: args,
    });

    return response.result as ToolCallResult;
  }

  // =============================================================================
  // Resource Operations
  // =============================================================================

  /**
   * List available resources
   */
  async listResources(): Promise<RemoteResource[]> {
    this.ensureReady();

    const response = await this.request('resources/list', {});
    const result = response.result as { resources: RemoteResource[] };

    // Update cache
    this.resources.clear();
    for (const resource of result.resources) {
      this.resources.set(resource.uri, resource);
    }

    return result.resources;
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<ResourceContents[]> {
    this.ensureReady();

    const response = await this.request('resources/read', { uri });
    const result = response.result as { contents: ResourceContents[] };

    return result.contents;
  }

  /**
   * Get a cached resource
   */
  getCachedResource(uri: string): RemoteResource | undefined {
    return this.resources.get(uri);
  }

  // =============================================================================
  // Prompt Operations
  // =============================================================================

  /**
   * List available prompts
   */
  async listPrompts(): Promise<RemotePrompt[]> {
    this.ensureReady();

    const response = await this.request('prompts/list', {});
    const result = response.result as { prompts: RemotePrompt[] };

    // Update cache
    this.prompts.clear();
    for (const prompt of result.prompts) {
      this.prompts.set(prompt.name, prompt);
    }

    return result.prompts;
  }

  /**
   * Get a prompt
   */
  async getPrompt(name: string, args: Record<string, string> = {}): Promise<{
    description?: string;
    messages: PromptMessage[];
  }> {
    this.ensureReady();

    const response = await this.request('prompts/get', {
      name,
      arguments: args,
    });

    return response.result as { description?: string; messages: PromptMessage[] };
  }

  /**
   * Get a cached prompt
   */
  getCachedPrompt(name: string): RemotePrompt | undefined {
    return this.prompts.get(name);
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private async initialize(): Promise<void> {
    this.setState('initializing');

    const response = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: { listChanged: true },
      },
      clientInfo: {
        name: 'open-agent-mcp-client',
        version: '0.1.0',
      },
    });

    const result = response.result as {
      protocolVersion: string;
      capabilities: ServerCapabilities;
      serverInfo: { name: string; version: string };
    };

    this.serverInfo = {
      name: result.serverInfo.name,
      version: result.serverInfo.version,
      protocolVersion: result.protocolVersion,
      capabilities: result.capabilities,
    };

    // Send initialized notification
    await this.transport.notify('notifications/initialized', {});

    this.setState('ready');
    this.emit('initialized', this.serverInfo);
    this.emit('ready');
    this.reconnectAttempts = 0;

    // Fetch initial data if supported
    if (this.serverInfo.capabilities.tools) {
      await this.listTools();
    }
    if (this.serverInfo.capabilities.resources) {
      await this.listResources();
    }
    if (this.serverInfo.capabilities.prompts) {
      await this.listPrompts();
    }
  }

  private async request(method: string, params: unknown): Promise<{ result: unknown }> {
    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const response = await this.transport.request(request);

    if (response.error) {
      throw new Error(`MCP Error ${response.error.code}: ${response.error.message}`);
    }

    return { result: response.result };
  }

  private handleServerMessage(data: string): void {
    try {
      const message = JSON.parse(data) as { method?: string; params?: unknown };

      if (!message.method) {
        return;
      }

      switch (message.method) {
        case 'notifications/tools/list_changed':
          this.listTools().then((tools) => {
            this.emit('tools:changed', tools);
          }).catch(() => { /* ignore */ });
          break;

        case 'notifications/resources/list_changed':
          this.listResources().then((resources) => {
            this.emit('resources:changed', resources);
          }).catch(() => { /* ignore */ });
          break;

        case 'notifications/prompts/list_changed':
          this.listPrompts().then((prompts) => {
            this.emit('prompts:changed', prompts);
          }).catch(() => { /* ignore */ });
          break;

        case 'notifications/message':
          const params = message.params as { level: string; message: string; data?: unknown } | undefined;
          if (params) {
            this.emit('log', params.level, params.message, params.data);
          }
          break;
      }
    } catch {
      // Invalid JSON, ignore
    }
  }

  private setState(state: ConnectionState): void {
    this.state = state;
  }

  private ensureReady(): void {
    if (this.state !== 'ready') {
      throw new Error(`Client not ready. Current state: ${this.state}`);
    }
  }

  private clearCaches(): void {
    this.tools.clear();
    this.resources.clear();
    this.prompts.clear();
    this.serverInfo = undefined;
  }

  /**
   * Attempt reconnection (for use after unexpected disconnection)
   */
  async attemptReconnect(): Promise<void> {
    if (!this.options.autoReconnect) {
      return;
    }

    const maxAttempts = this.options.maxReconnectAttempts ?? 5;
    if (this.reconnectAttempts >= maxAttempts) {
      this.emit('error', new Error(`Max reconnection attempts (${maxAttempts}) exceeded`));
      return;
    }

    this.reconnectAttempts++;
    this.setState('reconnecting');
    this.emit('reconnecting', this.reconnectAttempts);

    const delay = this.options.reconnectDelay ?? 1000;
    await new Promise((resolve) => setTimeout(resolve, delay * this.reconnectAttempts));

    try {
      await this.connect();
    } catch {
      await this.attemptReconnect();
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an MCP client
 */
export function createMCPClient(options: MCPClientOptions): MCPClient {
  return new MCPClient(options);
}

/**
 * Create an MCP client for a stdio server
 */
export function createStdioClient(command: string, args?: string[]): MCPClient {
  return new MCPClient({
    transport: 'stdio',
    command,
    args,
  });
}

/**
 * Create an MCP client for an HTTP server
 */
export function createHttpClient(url: string, auth?: MCPClientOptions['auth']): MCPClient {
  return new MCPClient({
    transport: 'http',
    url,
    auth,
  });
}

/**
 * Create an MCP client for a WebSocket server
 */
export function createWebSocketClient(url: string, auth?: MCPClientOptions['auth']): MCPClient {
  return new MCPClient({
    transport: 'websocket',
    url,
    auth,
  });
}
