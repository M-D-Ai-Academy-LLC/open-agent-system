/**
 * MCP Transport
 *
 * Transport layer implementations for MCP communication.
 */

import type { MCPServer } from './server.js';

// =============================================================================
// Transport Interface
// =============================================================================

/**
 * Transport interface
 */
export interface MCPTransport {
  /** Start the transport */
  start(): Promise<void>;
  /** Stop the transport */
  stop(): Promise<void>;
  /** Send a message */
  send(message: string): Promise<void>;
  /** Check if running */
  isRunning(): boolean;
}

// =============================================================================
// Stdio Transport
// =============================================================================

/**
 * Stdio Transport
 *
 * Communicates via stdin/stdout using newline-delimited JSON.
 */
export class StdioTransport implements MCPTransport {
  private server: MCPServer;
  private running: boolean = false;
  private inputBuffer: string = '';

  constructor(server: MCPServer) {
    this.server = server;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', this.handleInput.bind(this));
    process.stdin.on('end', this.handleEnd.bind(this));
    process.stdin.resume();
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;
    process.stdin.pause();
    process.stdin.removeAllListeners('data');
    process.stdin.removeAllListeners('end');
  }

  async send(message: string): Promise<void> {
    if (!this.running) {
      return;
    }

    process.stdout.write(message + '\n');
  }

  isRunning(): boolean {
    return this.running;
  }

  private handleInput(chunk: string): void {
    this.inputBuffer += chunk;

    // Process complete messages (newline-delimited)
    const lines = this.inputBuffer.split('\n');
    this.inputBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.trim()) {
        this.processMessage(line);
      }
    }
  }

  private handleEnd(): void {
    // Process any remaining data
    if (this.inputBuffer.trim()) {
      this.processMessage(this.inputBuffer);
    }
    this.stop();
  }

  private async processMessage(data: string): Promise<void> {
    try {
      const response = await this.server.handleMessage(data);
      if (response) {
        await this.send(response);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }
}

// =============================================================================
// HTTP Transport
// =============================================================================

/**
 * HTTP Transport Configuration
 */
export interface HTTPTransportConfig {
  port: number;
  host?: string;
  path?: string;
}

/**
 * HTTP Transport
 *
 * Note: This is a placeholder for HTTP transport.
 * Full implementation would use Node.js http module.
 */
export class HTTPTransport implements MCPTransport {
  private server: MCPServer;
  private config: HTTPTransportConfig;
  private running: boolean = false;

  constructor(server: MCPServer, config: HTTPTransportConfig) {
    this.server = server;
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    // Placeholder - would start HTTP server
    this.running = true;
    console.log(`HTTP transport ready on ${this.config.host ?? 'localhost'}:${this.config.port}`);
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;
  }

  async send(message: string): Promise<void> {
    // HTTP transport sends via response, not push
    void message;
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Handle an HTTP request
   */
  async handleRequest(body: string): Promise<string | null> {
    return this.server.handleMessage(body);
  }
}

// =============================================================================
// WebSocket Transport
// =============================================================================

/**
 * WebSocket Transport Configuration
 */
export interface WebSocketTransportConfig {
  port: number;
  host?: string;
  path?: string;
}

/**
 * WebSocket Transport
 *
 * Note: This is a placeholder for WebSocket transport.
 * Full implementation would use ws module.
 */
export class WebSocketTransport implements MCPTransport {
  // Server stored for future use when full WebSocket implementation is added
  protected server: MCPServer;
  private config: WebSocketTransportConfig;
  private running: boolean = false;

  constructor(server: MCPServer, config: WebSocketTransportConfig) {
    this.server = server;
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    // Placeholder - would start WebSocket server
    this.running = true;
    console.log(`WebSocket transport ready on ${this.config.host ?? 'localhost'}:${this.config.port}`);
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;
  }

  async send(message: string): Promise<void> {
    // Would broadcast to connected clients
    void message;
  }

  isRunning(): boolean {
    return this.running;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a stdio transport
 */
export function createStdioTransport(server: MCPServer): StdioTransport {
  return new StdioTransport(server);
}

/**
 * Create an HTTP transport
 */
export function createHTTPTransport(
  server: MCPServer,
  config: HTTPTransportConfig
): HTTPTransport {
  return new HTTPTransport(server, config);
}

/**
 * Create a WebSocket transport
 */
export function createWebSocketTransport(
  server: MCPServer,
  config: WebSocketTransportConfig
): WebSocketTransport {
  return new WebSocketTransport(server, config);
}
