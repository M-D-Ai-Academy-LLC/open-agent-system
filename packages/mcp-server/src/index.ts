/**
 * MCP Server Package Exports
 *
 * Model Context Protocol server for Open Agent System.
 */

// Server
export { MCPServer, createMCPServer } from './server.js';

// Protocol
export {
  MCPProtocolHandler,
  MCPProtocolError,
  createProtocolHandler,
} from './protocol.js';

// Tool Registry
export {
  MCPToolRegistry,
  createMCPToolRegistry,
  agentToMCPTool,
  createAgentToolHandler,
  resultToMCPResponse,
  type MCPToolHandler,
  type RegisteredMCPTool,
  type AgentForMapping,
  type AgentParameter,
} from './tool-registry.js';

// Transport
export {
  type MCPTransport,
  StdioTransport,
  createStdioTransport,
  HTTPTransport,
  createHTTPTransport,
  WebSocketTransport,
  createWebSocketTransport,
  type HTTPTransportConfig,
  type WebSocketTransportConfig,
} from './transport.js';

// Types
export {
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcError,
  type JsonRpcNotification,
  type MCPTool,
  type MCPPropertySchema,
  type MCPToolCallRequest,
  type MCPToolCallResponse,
  type MCPContent,
  type MCPTextContent,
  type MCPImageContent,
  type MCPResourceContent,
  type MCPResource,
  type MCPResourceTemplate,
  type MCPPrompt,
  type MCPPromptArgument,
  type MCPPromptMessage,
  type MCPServerCapabilities,
  type MCPServerInfo,
  type MCPInitializeResult,
  type MCPServerConfig,
  type MCPAuthConfig,
  type MCPServerEvents,
  MCP_METHODS,
  JSON_RPC_ERRORS,
} from './types.js';
