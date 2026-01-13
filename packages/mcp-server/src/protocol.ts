/**
 * MCP Protocol Handler
 *
 * Handles JSON-RPC message parsing and serialization for MCP protocol.
 */

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  JsonRpcNotification,
} from './types.js';
import { JSON_RPC_ERRORS } from './types.js';

// =============================================================================
// Protocol Handler
// =============================================================================

/**
 * MCP Protocol Handler
 *
 * Parses and serializes JSON-RPC messages for MCP communication.
 */
export class MCPProtocolHandler {
  /**
   * Parse a JSON-RPC message
   */
  parseMessage(data: string): JsonRpcRequest | JsonRpcNotification {
    let parsed: unknown;

    try {
      parsed = JSON.parse(data);
    } catch {
      throw new MCPProtocolError('Parse error', JSON_RPC_ERRORS.PARSE_ERROR);
    }

    if (!this.isValidJsonRpc(parsed)) {
      throw new MCPProtocolError('Invalid JSON-RPC', JSON_RPC_ERRORS.INVALID_REQUEST);
    }

    return parsed as JsonRpcRequest | JsonRpcNotification;
  }

  /**
   * Create a success response
   */
  createResponse(id: string | number, result: unknown): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  /**
   * Create an error response
   */
  createErrorResponse(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown
  ): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id: id ?? 0,
      error: {
        code,
        message,
        data,
      },
    };
  }

  /**
   * Create a notification
   */
  createNotification(method: string, params?: unknown): JsonRpcNotification {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
    };

    if (params !== undefined) {
      notification.params = params;
    }

    return notification;
  }

  /**
   * Serialize a message for transport
   */
  serialize(message: JsonRpcResponse | JsonRpcNotification): string {
    return JSON.stringify(message);
  }

  /**
   * Check if a message is a request (has id)
   */
  isRequest(message: JsonRpcRequest | JsonRpcNotification): message is JsonRpcRequest {
    return 'id' in message && message.id !== undefined;
  }

  /**
   * Check if a message is a notification (no id)
   */
  isNotification(message: JsonRpcRequest | JsonRpcNotification): message is JsonRpcNotification {
    return !('id' in message);
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Validate JSON-RPC message structure
   */
  private isValidJsonRpc(data: unknown): boolean {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    const obj = data as Record<string, unknown>;

    // Must have jsonrpc field
    if (obj['jsonrpc'] !== '2.0') {
      return false;
    }

    // Must have method field
    if (typeof obj['method'] !== 'string') {
      return false;
    }

    // params must be object or array if present
    if ('params' in obj) {
      const params = obj['params'];
      if (
        params !== null &&
        params !== undefined &&
        typeof params !== 'object'
      ) {
        return false;
      }
    }

    // id must be string, number, or null if present
    if ('id' in obj) {
      const id = obj['id'];
      if (
        id !== null &&
        typeof id !== 'string' &&
        typeof id !== 'number'
      ) {
        return false;
      }
    }

    return true;
  }
}

// =============================================================================
// Protocol Error
// =============================================================================

/**
 * MCP Protocol Error
 */
export class MCPProtocolError extends Error {
  code: number;
  data?: unknown;

  constructor(message: string, code: number, data?: unknown) {
    super(message);
    this.name = 'MCPProtocolError';
    this.code = code;
    this.data = data;
  }

  toJsonRpcError(): JsonRpcError {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a protocol handler instance
 */
export function createProtocolHandler(): MCPProtocolHandler {
  return new MCPProtocolHandler();
}
