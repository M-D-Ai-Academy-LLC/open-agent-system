/**
 * MCP Tool Registry
 *
 * Manages MCP tools and maps agents to tool definitions.
 */

import { EventEmitter } from 'eventemitter3';
import type {
  MCPTool,
  MCPToolCallRequest,
  MCPToolCallResponse,
  MCPContent,
  MCPServerEvents,
} from './types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Tool handler function
 */
export type MCPToolHandler = (
  args: Record<string, unknown>
) => Promise<MCPToolCallResponse> | MCPToolCallResponse;

/**
 * Registered tool
 */
export interface RegisteredMCPTool {
  definition: MCPTool;
  handler: MCPToolHandler;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Tool Registry Implementation
// =============================================================================

/**
 * MCP Tool Registry
 *
 * Manages tool registration and execution for the MCP server.
 */
export class MCPToolRegistry extends EventEmitter<MCPServerEvents> {
  private tools: Map<string, RegisteredMCPTool> = new Map();
  private prefix: string;

  constructor(prefix: string = '') {
    super();
    this.prefix = prefix;
  }

  /**
   * Register a tool
   */
  register(
    definition: MCPTool,
    handler: MCPToolHandler,
    metadata?: Record<string, unknown>
  ): void {
    const prefixedName = this.prefix ? `${this.prefix}_${definition.name}` : definition.name;
    const prefixedDefinition = { ...definition, name: prefixedName };

    this.tools.set(prefixedName, {
      definition: prefixedDefinition,
      handler,
      metadata,
    });

    this.emit('tool:registered', prefixedDefinition);
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    const prefixedName = this.prefix ? `${this.prefix}_${name}` : name;
    return this.tools.delete(prefixedName);
  }

  /**
   * Get a tool by name
   */
  get(name: string): RegisteredMCPTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * List all tool definitions
   */
  list(): MCPTool[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /**
   * Execute a tool call
   */
  async call(request: MCPToolCallRequest): Promise<MCPToolCallResponse> {
    const tool = this.tools.get(request.name);

    if (!tool) {
      return {
        content: [
          {
            type: 'text',
            text: `Tool not found: ${request.name}`,
          },
        ],
        isError: true,
      };
    }

    this.emit('tool:called', request.name, request.arguments);

    try {
      const response = await tool.handler(request.arguments);
      return response;
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Tool execution error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Get tool count
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
  }
}

// =============================================================================
// Agent-to-Tool Mapping
// =============================================================================

/**
 * Agent definition for tool mapping
 */
export interface AgentForMapping {
  id: string;
  name: string;
  description: string;
  parameters?: Record<string, AgentParameter>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Agent parameter definition
 */
export interface AgentParameter {
  type: string;
  description?: string;
  required?: boolean;
  enum?: string[];
  default?: unknown;
}

/**
 * Convert agent definition to MCP tool
 */
export function agentToMCPTool(agent: AgentForMapping): MCPTool {
  const properties: Record<string, { type: string; description?: string; enum?: string[] }> = {};
  const required: string[] = [];

  if (agent.parameters) {
    for (const [name, param] of Object.entries(agent.parameters)) {
      properties[name] = {
        type: param.type,
        description: param.description,
        enum: param.enum,
      };
      if (param.required) {
        required.push(name);
      }
    }
  }

  return {
    name: agent.id,
    description: agent.description,
    inputSchema: {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    },
  };
}

/**
 * Create tool handler from agent
 */
export function createAgentToolHandler(agent: AgentForMapping): MCPToolHandler {
  return async (args: Record<string, unknown>): Promise<MCPToolCallResponse> => {
    try {
      const result = await agent.handler(args);
      return resultToMCPResponse(result);
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Agent error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Convert any result to MCP response
 */
export function resultToMCPResponse(result: unknown): MCPToolCallResponse {
  const content: MCPContent[] = [];

  if (typeof result === 'string') {
    content.push({ type: 'text', text: result });
  } else if (result === null || result === undefined) {
    content.push({ type: 'text', text: '' });
  } else if (typeof result === 'object') {
    // Check for specific response formats
    const obj = result as Record<string, unknown>;

    if ('content' in obj && Array.isArray(obj['content'])) {
      // Already in MCP format
      return result as MCPToolCallResponse;
    }

    if ('text' in obj && typeof obj['text'] === 'string') {
      content.push({ type: 'text', text: obj['text'] });
    } else if ('data' in obj && 'mimeType' in obj) {
      // Image content
      content.push({
        type: 'image',
        data: String(obj['data']),
        mimeType: String(obj['mimeType']),
      });
    } else {
      // Serialize object to JSON
      content.push({ type: 'text', text: JSON.stringify(result, null, 2) });
    }
  } else {
    // Primitive types
    content.push({ type: 'text', text: String(result) });
  }

  return { content };
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a tool registry
 */
export function createMCPToolRegistry(prefix?: string): MCPToolRegistry {
  return new MCPToolRegistry(prefix);
}
