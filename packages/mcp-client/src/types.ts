/**
 * MCP Client Types
 *
 * Type definitions for the MCP client.
 */

// =============================================================================
// Connection Types
// =============================================================================

/**
 * MCP client connection options
 */
export interface MCPClientOptions {
  /** Server command (for stdio transport) */
  command?: string;
  /** Server command arguments */
  args?: string[];
  /** Server URL (for HTTP/WebSocket transport) */
  url?: string;
  /** Transport type */
  transport: 'stdio' | 'http' | 'websocket';
  /** Connection timeout in ms */
  connectionTimeout?: number;
  /** Request timeout in ms */
  requestTimeout?: number;
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Reconnection delay in ms */
  reconnectDelay?: number;
  /** Authentication headers/token */
  auth?: {
    type: 'bearer' | 'apikey' | 'basic';
    credentials: string;
  };
}

/**
 * Connection state
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'initializing'
  | 'ready'
  | 'reconnecting'
  | 'error';

// =============================================================================
// Server Info Types
// =============================================================================

/**
 * Server capabilities (from MCP protocol)
 */
export interface ServerCapabilities {
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
export interface ServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
  capabilities: ServerCapabilities;
}

// =============================================================================
// Tool Types
// =============================================================================

/**
 * MCP tool definition (from server)
 */
export interface RemoteTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, PropertySchema>;
    required?: string[];
  };
}

/**
 * Property schema
 */
export interface PropertySchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: PropertySchema;
  properties?: Record<string, PropertySchema>;
  required?: string[];
  default?: unknown;
}

/**
 * Tool call result
 */
export interface ToolCallResult {
  content: ToolContent[];
  isError?: boolean;
}

/**
 * Tool content types
 */
export type ToolContent =
  | TextContent
  | ImageContent
  | ResourceContent;

/**
 * Text content
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * Image content
 */
export interface ImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

/**
 * Resource content
 */
export interface ResourceContent {
  type: 'resource';
  resource: {
    uri: string;
    text?: string;
    blob?: string;
    mimeType?: string;
  };
}

// =============================================================================
// Resource Types
// =============================================================================

/**
 * Remote resource
 */
export interface RemoteResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * Resource contents
 */
export interface ResourceContents {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

// =============================================================================
// Prompt Types
// =============================================================================

/**
 * Remote prompt
 */
export interface RemotePrompt {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
}

/**
 * Prompt argument
 */
export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * Prompt message
 */
export interface PromptMessage {
  role: 'user' | 'assistant';
  content: ToolContent;
}

// =============================================================================
// Event Types
// =============================================================================

/**
 * MCP client events
 */
export interface MCPClientEvents {
  'connecting': () => void;
  'connected': () => void;
  'initialized': (serverInfo: ServerInfo) => void;
  'ready': () => void;
  'disconnected': () => void;
  'reconnecting': (attempt: number) => void;
  'error': (error: Error) => void;
  'tools:changed': (tools: RemoteTool[]) => void;
  'resources:changed': (resources: RemoteResource[]) => void;
  'prompts:changed': (prompts: RemotePrompt[]) => void;
  'log': (level: string, message: string, data?: unknown) => void;
}

// =============================================================================
// JSON-RPC Types
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
 * JSON-RPC notification
 */
export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

// =============================================================================
// Pool Types
// =============================================================================

/**
 * Connection pool options
 */
export interface ConnectionPoolOptions {
  /** Maximum number of connections */
  maxConnections: number;
  /** Idle timeout before closing connection (ms) */
  idleTimeout: number;
  /** Acquire timeout (ms) */
  acquireTimeout: number;
}

/**
 * Pooled connection info
 */
export interface PooledConnection {
  id: string;
  serverId: string;
  state: ConnectionState;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
}
