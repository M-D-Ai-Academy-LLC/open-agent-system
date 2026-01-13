/**
 * MCP Client Transport
 *
 * Transport layer implementations for MCP client communication.
 */

import type { MCPClientOptions, JsonRpcRequest, JsonRpcResponse } from './types.js';

// =============================================================================
// Transport Interface
// =============================================================================

/**
 * Client transport interface
 */
export interface MCPClientTransport {
  /** Connect to server */
  connect(): Promise<void>;
  /** Disconnect from server */
  disconnect(): Promise<void>;
  /** Send request and wait for response */
  request(req: JsonRpcRequest): Promise<JsonRpcResponse>;
  /** Send notification (no response expected) */
  notify(method: string, params?: unknown): Promise<void>;
  /** Check if connected */
  isConnected(): boolean;
  /** Set message handler for server-initiated messages */
  onMessage(handler: (message: string) => void): void;
}

// =============================================================================
// Base Transport
// =============================================================================

/**
 * Base transport with common functionality
 */
export abstract class BaseTransport implements MCPClientTransport {
  protected options: MCPClientOptions;
  protected connected: boolean = false;
  protected messageHandler?: (message: string) => void;
  protected pendingRequests: Map<string | number, {
    resolve: (response: JsonRpcResponse) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();
  private requestId: number = 0;

  constructor(options: MCPClientOptions) {
    this.options = options;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  protected abstract send(data: string): Promise<void>;

  async request(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (!this.connected) {
      throw new Error('Not connected');
    }

    const id = req.id ?? ++this.requestId;
    const request: JsonRpcRequest = { ...req, id };

    return new Promise((resolve, reject) => {
      const timeout = this.options.requestTimeout ?? 30000;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.send(JSON.stringify(request)).catch(reject);
    });
  }

  async notify(method: string, params?: unknown): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected');
    }

    const notification = {
      jsonrpc: '2.0' as const,
      method,
      params,
    };

    await this.send(JSON.stringify(notification));
  }

  isConnected(): boolean {
    return this.connected;
  }

  onMessage(handler: (message: string) => void): void {
    this.messageHandler = handler;
  }

  protected handleResponse(data: string): void {
    try {
      const message = JSON.parse(data) as JsonRpcResponse;

      // Check if it's a response to a pending request
      if ('id' in message && message.id !== null) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(message.id);
          pending.resolve(message);
          return;
        }
      }

      // Otherwise, forward to message handler (for notifications)
      if (this.messageHandler) {
        this.messageHandler(data);
      }
    } catch {
      // Invalid JSON, ignore
    }
  }

  protected clearPendingRequests(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }
}

// =============================================================================
// Stdio Transport
// =============================================================================

/**
 * Stdio transport for subprocess communication
 */
export class StdioClientTransport extends BaseTransport {
  private process?: {
    stdin: { write: (data: string) => void };
    stdout: { on: (event: string, handler: (data: Buffer) => void) => void };
    stderr: { on: (event: string, handler: (data: Buffer) => void) => void };
    kill: () => void;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
  };
  private buffer: string = '';

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    if (!this.options.command) {
      throw new Error('Command required for stdio transport');
    }

    // Dynamic import for child_process (Node.js only)
    const { spawn } = await import('child_process');

    return new Promise((resolve, reject) => {
      const timeout = this.options.connectionTimeout ?? 10000;
      const timer = setTimeout(() => {
        reject(new Error(`Connection timeout after ${timeout}ms`));
      }, timeout);

      try {
        const proc = spawn(this.options.command!, this.options.args ?? [], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        proc.on('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });

        proc.on('spawn', () => {
          clearTimeout(timer);
          this.process = proc as typeof this.process;
          this.connected = true;

          proc.stdout.on('data', (data: Buffer) => {
            this.handleStdoutData(data.toString());
          });

          proc.stderr.on('data', (data: Buffer) => {
            console.error('[MCP stderr]', data.toString());
          });

          proc.on('exit', () => {
            this.connected = false;
            this.clearPendingRequests(new Error('Process exited'));
          });

          resolve();
        });
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (!this.connected || !this.process) {
      return;
    }

    this.process.kill();
    this.process = undefined;
    this.connected = false;
    this.clearPendingRequests(new Error('Disconnected'));
  }

  protected async send(data: string): Promise<void> {
    if (!this.process) {
      throw new Error('Not connected');
    }

    this.process.stdin.write(data + '\n');
  }

  private handleStdoutData(chunk: string): void {
    this.buffer += chunk;

    // Process complete lines
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.trim()) {
        this.handleResponse(line);
      }
    }
  }
}

// =============================================================================
// HTTP Transport
// =============================================================================

/**
 * HTTP transport for REST-style communication
 */
export class HttpClientTransport extends BaseTransport {
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    if (!this.options.url) {
      throw new Error('URL required for HTTP transport');
    }

    // Test connection with a simple request
    const timeout = this.options.connectionTimeout ?? 10000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(this.options.url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'ping' }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.connected = true;
    } finally {
      clearTimeout(timer);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.clearPendingRequests(new Error('Disconnected'));
  }

  protected async send(data: string): Promise<void> {
    if (!this.options.url) {
      throw new Error('URL required');
    }

    const response = await fetch(this.options.url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: data,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const responseData = await response.text();
    this.handleResponse(responseData);
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.options.auth) {
      switch (this.options.auth.type) {
        case 'bearer':
          headers['Authorization'] = `Bearer ${this.options.auth.credentials}`;
          break;
        case 'apikey':
          headers['X-API-Key'] = this.options.auth.credentials;
          break;
        case 'basic':
          headers['Authorization'] = `Basic ${this.options.auth.credentials}`;
          break;
      }
    }

    return headers;
  }
}

// =============================================================================
// WebSocket Transport
// =============================================================================

/**
 * WebSocket transport for persistent connections
 */
export class WebSocketClientTransport extends BaseTransport {
  private ws?: WebSocket;

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    if (!this.options.url) {
      throw new Error('URL required for WebSocket transport');
    }

    return new Promise((resolve, reject) => {
      const timeout = this.options.connectionTimeout ?? 10000;
      const timer = setTimeout(() => {
        reject(new Error(`Connection timeout after ${timeout}ms`));
      }, timeout);

      try {
        const ws = new WebSocket(this.options.url!);

        ws.onopen = () => {
          clearTimeout(timer);
          this.ws = ws;
          this.connected = true;
          resolve();
        };

        ws.onerror = (event) => {
          clearTimeout(timer);
          reject(new Error(`WebSocket error: ${event}`));
        };

        ws.onmessage = (event) => {
          this.handleResponse(String(event.data));
        };

        ws.onclose = () => {
          this.connected = false;
          this.ws = undefined;
          this.clearPendingRequests(new Error('Connection closed'));
        };
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (!this.connected || !this.ws) {
      return;
    }

    this.ws.close();
    this.ws = undefined;
    this.connected = false;
    this.clearPendingRequests(new Error('Disconnected'));
  }

  protected async send(data: string): Promise<void> {
    if (!this.ws) {
      throw new Error('Not connected');
    }

    this.ws.send(data);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a transport based on options
 */
export function createTransport(options: MCPClientOptions): MCPClientTransport {
  switch (options.transport) {
    case 'stdio':
      return new StdioClientTransport(options);
    case 'http':
      return new HttpClientTransport(options);
    case 'websocket':
      return new WebSocketClientTransport(options);
    default:
      throw new Error(`Unknown transport type: ${options.transport}`);
  }
}
