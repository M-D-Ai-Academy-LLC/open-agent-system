/**
 * MCP Server Types
 *
 * Type definitions for the Model Context Protocol server.
 */

// =============================================================================
// MCP Protocol Types
// =============================================================================

/**
 * JSON-RPC request
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC response
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

/**
 * JSON-RPC error
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * JSON-RPC notification (no id, no response expected)
 */
export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

// =============================================================================
// MCP Tool Types
// =============================================================================

/**
 * MCP tool definition
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, MCPPropertySchema>;
    required?: string[];
  };
}

/**
 * MCP property schema
 */
export interface MCPPropertySchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: MCPPropertySchema;
  properties?: Record<string, MCPPropertySchema>;
  required?: string[];
  default?: unknown;
}

/**
 * MCP tool call request
 */
export interface MCPToolCallRequest {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * MCP tool call response
 */
export interface MCPToolCallResponse {
  content: MCPContent[];
  isError?: boolean;
}

/**
 * MCP content types
 */
export type MCPContent =
  | MCPTextContent
  | MCPImageContent
  | MCPResourceContent;

/**
 * Text content
 */
export interface MCPTextContent {
  type: 'text';
  text: string;
}

/**
 * Image content
 */
export interface MCPImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

/**
 * Resource content
 */
export interface MCPResourceContent {
  type: 'resource';
  resource: {
    uri: string;
    text?: string;
    blob?: string;
    mimeType?: string;
  };
}

// =============================================================================
// MCP Resource Types
// =============================================================================

/**
 * MCP resource definition
 */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * MCP resource template
 */
export interface MCPResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// =============================================================================
// MCP Prompt Types
// =============================================================================

/**
 * MCP prompt definition
 */
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

/**
 * MCP prompt argument
 */
export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * MCP prompt message
 */
export interface MCPPromptMessage {
  role: 'user' | 'assistant';
  content: MCPContent;
}

// =============================================================================
// MCP Server Info Types
// =============================================================================

/**
 * Server capabilities
 */
export interface MCPServerCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: Record<string, never>;
}

/**
 * Server info
 */
export interface MCPServerInfo {
  name: string;
  version: string;
}

/**
 * Initialize result
 */
export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPServerCapabilities;
  serverInfo: MCPServerInfo;
}

// =============================================================================
// MCP Server Configuration
// =============================================================================

/**
 * MCP server configuration
 */
export interface MCPServerConfig {
  /** Server name */
  name: string;
  /** Server version */
  version: string;
  /** Authentication configuration */
  auth?: MCPAuthConfig;
  /** Tool registration options */
  toolOptions?: {
    /** Whether to auto-register agent tools */
    autoRegisterAgents?: boolean;
    /** Tool name prefix */
    prefix?: string;
  };
}

/**
 * Authentication configuration
 */
export interface MCPAuthConfig {
  /** Enable authentication */
  enabled: boolean;
  /** Authentication type */
  type: 'token' | 'apikey' | 'custom';
  /** Token/API key validator */
  validator?: (credentials: string) => Promise<boolean> | boolean;
}

// =============================================================================
// MCP Protocol Methods
// =============================================================================

/**
 * Standard MCP methods
 */
export const MCP_METHODS = {
  // Lifecycle
  INITIALIZE: 'initialize',
  INITIALIZED: 'notifications/initialized',
  SHUTDOWN: 'shutdown',

  // Tools
  TOOLS_LIST: 'tools/list',
  TOOLS_CALL: 'tools/call',
  TOOLS_LIST_CHANGED: 'notifications/tools/list_changed',

  // Resources
  RESOURCES_LIST: 'resources/list',
  RESOURCES_READ: 'resources/read',
  RESOURCES_SUBSCRIBE: 'resources/subscribe',
  RESOURCES_UNSUBSCRIBE: 'resources/unsubscribe',
  RESOURCES_LIST_CHANGED: 'notifications/resources/list_changed',

  // Prompts
  PROMPTS_LIST: 'prompts/list',
  PROMPTS_GET: 'prompts/get',
  PROMPTS_LIST_CHANGED: 'notifications/prompts/list_changed',

  // Logging
  LOGGING_SET_LEVEL: 'logging/setLevel',
  LOGGING_MESSAGE: 'notifications/message',
} as const;

/**
 * JSON-RPC error codes
 */
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// =============================================================================
// Event Types
// =============================================================================

/**
 * MCP server events
 */
export interface MCPServerEvents {
  'request': (request: JsonRpcRequest) => void;
  'response': (response: JsonRpcResponse) => void;
  'notification': (notification: JsonRpcNotification) => void;
  'error': (error: Error) => void;
  'tool:registered': (tool: MCPTool) => void;
  'tool:called': (name: string, args: Record<string, unknown>) => void;
  'client:connected': () => void;
  'client:disconnected': () => void;
}
