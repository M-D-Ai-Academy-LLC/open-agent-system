/**
 * MCP Server
 *
 * Model Context Protocol server implementation.
 */

import { EventEmitter } from 'eventemitter3';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  MCPServerConfig,
  MCPServerCapabilities,
  MCPInitializeResult,
  MCPTool,
  MCPToolCallRequest,
  MCPResource,
  MCPPrompt,
  MCPPromptMessage,
  MCPServerEvents,
} from './types.js';
import { MCP_METHODS, JSON_RPC_ERRORS } from './types.js';
import { MCPProtocolHandler, MCPProtocolError } from './protocol.js';
import {
  MCPToolRegistry,
  type MCPToolHandler,
  type AgentForMapping,
  agentToMCPTool,
  createAgentToolHandler,
} from './tool-registry.js';

// =============================================================================
// MCP Server Implementation
// =============================================================================

/**
 * MCP Server
 *
 * Implements the Model Context Protocol server.
 */
export class MCPServer extends EventEmitter<MCPServerEvents> {
  private config: MCPServerConfig;
  private protocol: MCPProtocolHandler;
  private toolRegistry: MCPToolRegistry;
  private resources: Map<string, MCPResource> = new Map();
  private prompts: Map<string, MCPPrompt> = new Map();
  private initialized: boolean = false;
  // Client capabilities stored for future use
  protected clientCapabilities: Record<string, unknown> = {};

  constructor(config: MCPServerConfig) {
    super();
    this.config = config;
    this.protocol = new MCPProtocolHandler();
    this.toolRegistry = new MCPToolRegistry(config.toolOptions?.prefix);

    // Forward tool registry events
    this.toolRegistry.on('tool:registered', (tool) => {
      this.emit('tool:registered', tool);
    });
    this.toolRegistry.on('tool:called', (name, args) => {
      this.emit('tool:called', name, args);
    });
  }

  /**
   * Handle an incoming message
   */
  async handleMessage(data: string): Promise<string | null> {
    let message: JsonRpcRequest | JsonRpcNotification;
    let requestId: string | number | null = null;

    try {
      message = this.protocol.parseMessage(data);
      this.emit('request', message as JsonRpcRequest);

      if (this.protocol.isRequest(message)) {
        requestId = message.id;
        const response = await this.handleRequest(message);
        this.emit('response', response);
        return this.protocol.serialize(response);
      } else {
        await this.handleNotification(message);
        return null;
      }
    } catch (error) {
      const errorResponse = this.createErrorResponse(requestId, error);
      return this.protocol.serialize(errorResponse);
    }
  }

  /**
   * Register a tool
   */
  registerTool(
    definition: MCPTool,
    handler: MCPToolHandler,
    metadata?: Record<string, unknown>
  ): void {
    this.toolRegistry.register(definition, handler, metadata);
  }

  /**
   * Register an agent as a tool
   */
  registerAgent(agent: AgentForMapping): void {
    const tool = agentToMCPTool(agent);
    const handler = createAgentToolHandler(agent);
    this.toolRegistry.register(tool, handler, { agentId: agent.id });
  }

  /**
   * Register a resource
   */
  registerResource(resource: MCPResource): void {
    this.resources.set(resource.uri, resource);
  }

  /**
   * Register a prompt
   */
  registerPrompt(prompt: MCPPrompt): void {
    this.prompts.set(prompt.name, prompt);
  }

  /**
   * Get server capabilities
   */
  getCapabilities(): MCPServerCapabilities {
    return {
      tools: {
        listChanged: true,
      },
      resources: this.resources.size > 0 ? {
        subscribe: false,
        listChanged: true,
      } : undefined,
      prompts: this.prompts.size > 0 ? {
        listChanged: true,
      } : undefined,
    };
  }

  /**
   * Get server info
   */
  getServerInfo(): { name: string; version: string } {
    return {
      name: this.config.name,
      version: this.config.version,
    };
  }

  /**
   * Check if server is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Create a notification message
   */
  createNotification(method: string, params?: unknown): string {
    const notification = this.protocol.createNotification(method, params);
    this.emit('notification', notification);
    return this.protocol.serialize(notification);
  }

  // =============================================================================
  // Request Handlers
  // =============================================================================

  private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    // Check authentication if required
    if (this.config.auth?.enabled && request.method !== MCP_METHODS.INITIALIZE) {
      const authHeader = (request.params as Record<string, unknown> | undefined)?.['_auth'] as string | undefined;
      if (authHeader && this.config.auth.validator) {
        const isValid = await this.config.auth.validator(authHeader);
        if (!isValid) {
          throw new MCPProtocolError('Unauthorized', -32000);
        }
      }
    }

    switch (request.method) {
      case MCP_METHODS.INITIALIZE:
        return this.handleInitialize(request);

      case MCP_METHODS.SHUTDOWN:
        return this.handleShutdown(request);

      case MCP_METHODS.TOOLS_LIST:
        return this.handleToolsList(request);

      case MCP_METHODS.TOOLS_CALL:
        return this.handleToolsCall(request);

      case MCP_METHODS.RESOURCES_LIST:
        return this.handleResourcesList(request);

      case MCP_METHODS.RESOURCES_READ:
        return this.handleResourcesRead(request);

      case MCP_METHODS.PROMPTS_LIST:
        return this.handlePromptsList(request);

      case MCP_METHODS.PROMPTS_GET:
        return this.handlePromptsGet(request);

      default:
        throw new MCPProtocolError(
          `Method not found: ${request.method}`,
          JSON_RPC_ERRORS.METHOD_NOT_FOUND
        );
    }
  }

  private async handleNotification(notification: JsonRpcNotification): Promise<void> {
    switch (notification.method) {
      case MCP_METHODS.INITIALIZED:
        this.initialized = true;
        this.emit('client:connected');
        break;

      default:
        // Unknown notifications are ignored
        break;
    }
  }

  private handleInitialize(request: JsonRpcRequest): JsonRpcResponse {
    const params = request.params as { protocolVersion?: string; capabilities?: Record<string, unknown> } | undefined;

    // Store client capabilities
    this.clientCapabilities = params?.capabilities ?? {};

    const result: MCPInitializeResult = {
      protocolVersion: params?.protocolVersion ?? '2024-11-05',
      capabilities: this.getCapabilities(),
      serverInfo: this.getServerInfo(),
    };

    return this.protocol.createResponse(request.id, result);
  }

  private handleShutdown(request: JsonRpcRequest): JsonRpcResponse {
    this.initialized = false;
    this.emit('client:disconnected');
    return this.protocol.createResponse(request.id, null);
  }

  private handleToolsList(request: JsonRpcRequest): JsonRpcResponse {
    const tools = this.toolRegistry.list();
    return this.protocol.createResponse(request.id, { tools });
  }

  private async handleToolsCall(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as MCPToolCallRequest | undefined;

    if (!params || !params.name) {
      throw new MCPProtocolError(
        'Missing tool name',
        JSON_RPC_ERRORS.INVALID_PARAMS
      );
    }

    const result = await this.toolRegistry.call({
      name: params.name,
      arguments: params.arguments ?? {},
    });

    return this.protocol.createResponse(request.id, result);
  }

  private handleResourcesList(request: JsonRpcRequest): JsonRpcResponse {
    const resources = Array.from(this.resources.values());
    return this.protocol.createResponse(request.id, { resources });
  }

  private handleResourcesRead(request: JsonRpcRequest): JsonRpcResponse {
    const params = request.params as { uri?: string } | undefined;

    if (!params?.uri) {
      throw new MCPProtocolError(
        'Missing resource URI',
        JSON_RPC_ERRORS.INVALID_PARAMS
      );
    }

    const resource = this.resources.get(params.uri);
    if (!resource) {
      throw new MCPProtocolError(
        `Resource not found: ${params.uri}`,
        JSON_RPC_ERRORS.INVALID_PARAMS
      );
    }

    // In a real implementation, this would read the actual resource content
    return this.protocol.createResponse(request.id, {
      contents: [
        {
          uri: resource.uri,
          mimeType: resource.mimeType ?? 'text/plain',
          text: '', // Would be populated with actual content
        },
      ],
    });
  }

  private handlePromptsList(request: JsonRpcRequest): JsonRpcResponse {
    const prompts = Array.from(this.prompts.values());
    return this.protocol.createResponse(request.id, { prompts });
  }

  private handlePromptsGet(request: JsonRpcRequest): JsonRpcResponse {
    const params = request.params as { name?: string; arguments?: Record<string, string> } | undefined;

    if (!params?.name) {
      throw new MCPProtocolError(
        'Missing prompt name',
        JSON_RPC_ERRORS.INVALID_PARAMS
      );
    }

    const prompt = this.prompts.get(params.name);
    if (!prompt) {
      throw new MCPProtocolError(
        `Prompt not found: ${params.name}`,
        JSON_RPC_ERRORS.INVALID_PARAMS
      );
    }

    // In a real implementation, this would generate the actual prompt messages
    const messages: MCPPromptMessage[] = [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Prompt: ${prompt.name}`,
        },
      },
    ];

    return this.protocol.createResponse(request.id, {
      description: prompt.description,
      messages,
    });
  }

  // =============================================================================
  // Helpers
  // =============================================================================

  private createErrorResponse(
    id: string | number | null,
    error: unknown
  ): JsonRpcResponse {
    if (error instanceof MCPProtocolError) {
      return this.protocol.createErrorResponse(
        id,
        error.code,
        error.message,
        error.data
      );
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return this.protocol.createErrorResponse(
      id,
      JSON_RPC_ERRORS.INTERNAL_ERROR,
      errorMessage
    );
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an MCP server
 */
export function createMCPServer(config: MCPServerConfig): MCPServer {
  return new MCPServer(config);
}
