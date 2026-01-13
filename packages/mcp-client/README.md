# @open-agent/mcp-client

MCP (Model Context Protocol) client for connecting to MCP servers. Enables Open Agent System to use tools from any MCP-compatible server.

## Installation

```bash
npm install @open-agent/mcp-client
```

## Quick Start

### Connect to a Stdio Server

```typescript
import { createStdioClient } from '@open-agent/mcp-client';

const client = createStdioClient('npx', ['some-mcp-server']);

client.on('ready', () => {
  console.log('Connected to:', client.getServerInfo()?.name);
});

await client.connect();

// List available tools
const tools = await client.listTools();
console.log('Available tools:', tools.map(t => t.name));

// Call a tool
const result = await client.callTool('some-tool', { param: 'value' });
console.log('Result:', result);

await client.disconnect();
```

### Connect to an HTTP Server

```typescript
import { createHttpClient } from '@open-agent/mcp-client';

const client = createHttpClient('https://mcp.example.com/api', {
  type: 'bearer',
  credentials: 'your-token',
});

await client.connect();
const result = await client.callTool('search', { query: 'hello' });
```

### Connect to a WebSocket Server

```typescript
import { createWebSocketClient } from '@open-agent/mcp-client';

const client = createWebSocketClient('wss://mcp.example.com/ws');

await client.connect();
// Use persistent connection
```

## Connection Pool

For applications that need to manage multiple MCP servers:

```typescript
import { createConnectionPool } from '@open-agent/mcp-client';

const pool = createConnectionPool({
  maxConnections: 10,
  idleTimeout: 60000,
  acquireTimeout: 30000,
});

// Register servers
pool.registerServer({
  id: 'tools-server',
  options: {
    transport: 'stdio',
    command: 'npx',
    args: ['tools-mcp'],
  },
  maxConnections: 3,
});

pool.registerServer({
  id: 'search-server',
  options: {
    transport: 'http',
    url: 'https://search.example.com/mcp',
  },
});

// Use connections
const result = await pool.withConnection('tools-server', async (client) => {
  return client.callTool('calculate', { expression: '1 + 1' });
});

// Or manual acquire/release
const client = await pool.acquire('search-server');
try {
  const results = await client.callTool('search', { query: 'hello' });
  return results;
} finally {
  pool.release(client);
}

// Get all tools across servers
const toolsByServer = pool.getAllTools();

// Close all connections
await pool.close();
```

## API Reference

### MCPClient

Main client class.

```typescript
const client = createMCPClient({
  // Transport type
  transport: 'stdio' | 'http' | 'websocket',

  // For stdio transport
  command: 'npx',
  args: ['server-name'],

  // For http/websocket transport
  url: 'https://example.com/mcp',

  // Timeouts
  connectionTimeout: 10000,
  requestTimeout: 30000,

  // Auto-reconnect
  autoReconnect: true,
  maxReconnectAttempts: 5,
  reconnectDelay: 1000,

  // Authentication
  auth: {
    type: 'bearer' | 'apikey' | 'basic',
    credentials: 'token-or-key',
  },
});
```

#### Methods

##### Connection
- `connect()` - Connect to the server
- `disconnect()` - Disconnect from the server
- `getState()` - Get connection state
- `getServerInfo()` - Get server information
- `getCapabilities()` - Get server capabilities

##### Tools
- `listTools()` - List available tools
- `getTool(name)` - Get a specific tool definition
- `getCachedTools()` - Get cached tool list
- `callTool(name, args)` - Call a tool

##### Resources
- `listResources()` - List available resources
- `readResource(uri)` - Read a resource
- `getCachedResource(uri)` - Get cached resource

##### Prompts
- `listPrompts()` - List available prompts
- `getPrompt(name, args)` - Get a prompt
- `getCachedPrompt(name)` - Get cached prompt

### Events

```typescript
client.on('connecting', () => console.log('Connecting...'));
client.on('connected', () => console.log('Connected'));
client.on('initialized', (serverInfo) => console.log('Server:', serverInfo));
client.on('ready', () => console.log('Ready'));
client.on('disconnected', () => console.log('Disconnected'));
client.on('reconnecting', (attempt) => console.log('Reconnecting...', attempt));
client.on('error', (error) => console.error('Error:', error));
client.on('tools:changed', (tools) => console.log('Tools updated:', tools));
client.on('resources:changed', (resources) => console.log('Resources updated'));
client.on('prompts:changed', (prompts) => console.log('Prompts updated'));
client.on('log', (level, message, data) => console.log(`[${level}]`, message));
```

### Connection Pool

```typescript
const pool = createConnectionPool({
  maxConnections: 10,    // Max connections per server
  idleTimeout: 60000,    // Close idle connections after 60s
  acquireTimeout: 30000, // Timeout for acquiring connection
});
```

#### Methods

- `registerServer(config)` - Register a server
- `unregisterServer(id)` - Unregister and disconnect
- `acquire(serverId)` - Acquire a connection
- `release(client)` - Release a connection
- `withConnection(serverId, fn)` - Execute with auto-release
- `getStats()` - Get pool statistics
- `getAllTools()` - Get tools from all servers
- `close()` - Close all connections

#### Events

```typescript
pool.on('connection:created', (conn) => console.log('Created:', conn.id));
pool.on('connection:acquired', (conn) => console.log('Acquired:', conn.id));
pool.on('connection:released', (conn) => console.log('Released:', conn.id));
pool.on('connection:closed', (conn) => console.log('Closed:', conn.id));
pool.on('error', (error, serverId) => console.error('Error:', error));
```

## Custom Transport

Implement your own transport:

```typescript
import { BaseTransport } from '@open-agent/mcp-client';

class CustomTransport extends BaseTransport {
  async connect(): Promise<void> {
    // Connect to server
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    // Disconnect
    this.connected = false;
  }

  protected async send(data: string): Promise<void> {
    // Send data
  }
}
```

## Error Handling

```typescript
import { MCPClient } from '@open-agent/mcp-client';

const client = createMCPClient({ ... });

try {
  await client.connect();
  const result = await client.callTool('tool', args);
} catch (error) {
  if (error.message.includes('MCP Error')) {
    // Server returned an error
  } else if (error.message.includes('timeout')) {
    // Request timed out
  } else if (error.message.includes('Not connected')) {
    // Connection lost
  }
}
```

## License

MIT
