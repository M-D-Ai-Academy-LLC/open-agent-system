/**
 * MCP Connection Pool
 *
 * Manages a pool of MCP client connections.
 */

import { EventEmitter } from 'eventemitter3';
import type {
  MCPClientOptions,
  ConnectionPoolOptions,
  PooledConnection,
  RemoteTool,
} from './types.js';
import { MCPClient, createMCPClient } from './client.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Pool events
 */
export interface ConnectionPoolEvents {
  'connection:created': (connection: PooledConnection) => void;
  'connection:acquired': (connection: PooledConnection) => void;
  'connection:released': (connection: PooledConnection) => void;
  'connection:closed': (connection: PooledConnection) => void;
  'error': (error: Error, serverId?: string) => void;
}

/**
 * Server configuration for pool
 */
export interface PoolServerConfig {
  id: string;
  options: MCPClientOptions;
  minConnections?: number;
  maxConnections?: number;
}

/**
 * Internal connection entry
 */
interface ConnectionEntry {
  id: string;
  serverId: string;
  client: MCPClient;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  inUse: boolean;
}

// =============================================================================
// Connection Pool Implementation
// =============================================================================

/**
 * MCP Connection Pool
 *
 * Manages multiple connections to MCP servers with pooling and load balancing.
 */
export class MCPConnectionPool extends EventEmitter<ConnectionPoolEvents> {
  private options: ConnectionPoolOptions;
  private servers: Map<string, PoolServerConfig> = new Map();
  private connections: Map<string, ConnectionEntry> = new Map();
  private connectionsByServer: Map<string, Set<string>> = new Map();
  private waitingQueue: Map<string, Array<{
    resolve: (client: MCPClient) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>> = new Map();
  private idleTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private connectionId: number = 0;

  constructor(options: Partial<ConnectionPoolOptions> = {}) {
    super();
    this.options = {
      maxConnections: 10,
      idleTimeout: 60000,
      acquireTimeout: 30000,
      ...options,
    };
  }

  /**
   * Register a server with the pool
   */
  registerServer(config: PoolServerConfig): void {
    this.servers.set(config.id, config);
    this.connectionsByServer.set(config.id, new Set());
    this.waitingQueue.set(config.id, []);
  }

  /**
   * Unregister a server and close all its connections
   */
  async unregisterServer(serverId: string): Promise<void> {
    const connectionIds = this.connectionsByServer.get(serverId);
    if (connectionIds) {
      for (const id of connectionIds) {
        await this.closeConnection(id);
      }
    }
    this.servers.delete(serverId);
    this.connectionsByServer.delete(serverId);
    this.waitingQueue.delete(serverId);
  }

  /**
   * Acquire a connection to a server
   */
  async acquire(serverId: string): Promise<MCPClient> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server not registered: ${serverId}`);
    }

    // Try to find an available connection
    const connectionIds = this.connectionsByServer.get(serverId)!;
    for (const id of connectionIds) {
      const entry = this.connections.get(id);
      if (entry && !entry.inUse) {
        return this.acquireConnection(entry);
      }
    }

    // Create new connection if under limit
    const maxPerServer = server.maxConnections ?? this.options.maxConnections;
    if (connectionIds.size < maxPerServer) {
      const entry = await this.createConnection(server);
      return this.acquireConnection(entry);
    }

    // Wait for a connection to become available
    return this.waitForConnection(serverId);
  }

  /**
   * Release a connection back to the pool
   */
  release(client: MCPClient): void {
    for (const [id, entry] of this.connections) {
      if (entry.client === client) {
        this.releaseConnection(id);
        return;
      }
    }
  }

  /**
   * Execute with automatic acquire/release
   */
  async withConnection<T>(
    serverId: string,
    fn: (client: MCPClient) => Promise<T>
  ): Promise<T> {
    const client = await this.acquire(serverId);
    try {
      return await fn(client);
    } finally {
      this.release(client);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    serverStats: Map<string, { total: number; active: number; idle: number }>;
  } {
    let total = 0;
    let active = 0;
    let idle = 0;
    const serverStats = new Map<string, { total: number; active: number; idle: number }>();

    for (const entry of this.connections.values()) {
      total++;
      if (entry.inUse) {
        active++;
      } else {
        idle++;
      }

      const stats = serverStats.get(entry.serverId) ?? { total: 0, active: 0, idle: 0 };
      stats.total++;
      if (entry.inUse) {
        stats.active++;
      } else {
        stats.idle++;
      }
      serverStats.set(entry.serverId, stats);
    }

    return { totalConnections: total, activeConnections: active, idleConnections: idle, serverStats };
  }

  /**
   * Get all tools across all connected servers
   */
  getAllTools(): Map<string, RemoteTool[]> {
    const toolsByServer = new Map<string, RemoteTool[]>();

    for (const [serverId, connectionIds] of this.connectionsByServer) {
      for (const id of connectionIds) {
        const entry = this.connections.get(id);
        if (entry && entry.client.getState() === 'ready') {
          toolsByServer.set(serverId, entry.client.getCachedTools());
          break; // Only need one connection per server for tool list
        }
      }
    }

    return toolsByServer;
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    // Clear waiting queues
    for (const [serverId, queue] of this.waitingQueue) {
      for (const waiter of queue) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error('Pool closed'));
      }
      this.waitingQueue.set(serverId, []);
    }

    // Close all connections
    for (const id of this.connections.keys()) {
      await this.closeConnection(id);
    }
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private async createConnection(server: PoolServerConfig): Promise<ConnectionEntry> {
    const id = `conn-${++this.connectionId}`;
    const client = createMCPClient(server.options);

    await client.connect();

    const entry: ConnectionEntry = {
      id,
      serverId: server.id,
      client,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      useCount: 0,
      inUse: false,
    };

    this.connections.set(id, entry);
    this.connectionsByServer.get(server.id)!.add(id);

    this.emit('connection:created', this.toPooledConnection(entry));

    return entry;
  }

  private acquireConnection(entry: ConnectionEntry): MCPClient {
    // Cancel idle timer
    const timer = this.idleTimers.get(entry.id);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(entry.id);
    }

    entry.inUse = true;
    entry.useCount++;
    entry.lastUsedAt = Date.now();

    this.emit('connection:acquired', this.toPooledConnection(entry));

    return entry.client;
  }

  private releaseConnection(id: string): void {
    const entry = this.connections.get(id);
    if (!entry) {
      return;
    }

    entry.inUse = false;
    entry.lastUsedAt = Date.now();

    this.emit('connection:released', this.toPooledConnection(entry));

    // Check waiting queue
    const queue = this.waitingQueue.get(entry.serverId);
    if (queue && queue.length > 0) {
      const waiter = queue.shift()!;
      clearTimeout(waiter.timer);
      waiter.resolve(this.acquireConnection(entry));
      return;
    }

    // Set idle timer
    const timer = setTimeout(() => {
      this.closeConnection(id);
    }, this.options.idleTimeout);
    this.idleTimers.set(id, timer);
  }

  private async closeConnection(id: string): Promise<void> {
    const entry = this.connections.get(id);
    if (!entry) {
      return;
    }

    // Cancel idle timer
    const timer = this.idleTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(id);
    }

    await entry.client.disconnect();
    this.connections.delete(id);
    this.connectionsByServer.get(entry.serverId)?.delete(id);

    this.emit('connection:closed', this.toPooledConnection(entry));
  }

  private waitForConnection(serverId: string): Promise<MCPClient> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const queue = this.waitingQueue.get(serverId);
        if (queue) {
          const index = queue.findIndex((w) => w.timer === timer);
          if (index >= 0) {
            queue.splice(index, 1);
          }
        }
        reject(new Error(`Acquire timeout for server: ${serverId}`));
      }, this.options.acquireTimeout);

      this.waitingQueue.get(serverId)!.push({ resolve, reject, timer });
    });
  }

  private toPooledConnection(entry: ConnectionEntry): PooledConnection {
    return {
      id: entry.id,
      serverId: entry.serverId,
      state: entry.client.getState(),
      createdAt: entry.createdAt,
      lastUsedAt: entry.lastUsedAt,
      useCount: entry.useCount,
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a connection pool
 */
export function createConnectionPool(options?: Partial<ConnectionPoolOptions>): MCPConnectionPool {
  return new MCPConnectionPool(options);
}
