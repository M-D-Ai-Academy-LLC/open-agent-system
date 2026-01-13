/**
 * MCP Client Package Exports
 *
 * MCP client for connecting to MCP servers.
 */

// Client
export {
  MCPClient,
  createMCPClient,
  createStdioClient,
  createHttpClient,
  createWebSocketClient,
} from './client.js';

// Connection Pool
export {
  MCPConnectionPool,
  createConnectionPool,
  type ConnectionPoolEvents,
  type PoolServerConfig,
} from './pool.js';

// Transport
export {
  type MCPClientTransport,
  BaseTransport,
  StdioClientTransport,
  HttpClientTransport,
  WebSocketClientTransport,
  createTransport,
} from './transport.js';

// Types
export {
  type MCPClientOptions,
  type ConnectionState,
  type ServerCapabilities,
  type ServerInfo,
  type RemoteTool,
  type PropertySchema,
  type ToolCallResult,
  type ToolContent,
  type TextContent,
  type ImageContent,
  type ResourceContent,
  type RemoteResource,
  type ResourceContents,
  type RemotePrompt,
  type PromptArgument,
  type PromptMessage,
  type MCPClientEvents,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcError,
  type JsonRpcNotification,
  type ConnectionPoolOptions,
  type PooledConnection,
} from './types.js';
