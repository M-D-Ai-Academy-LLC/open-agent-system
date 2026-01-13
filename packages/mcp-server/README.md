# @open-agent/mcp-server

MCP (Model Context Protocol) server for the Open Agent System. Exposes agents as MCP tools that can be used by any MCP-compatible client (Claude Desktop, etc.).

## Installation

```bash
npm install @open-agent/mcp-server
```

## Quick Start

### CLI Usage

Run the server via stdio (for use with Claude Desktop):

```bash
npx open-agent-mcp
```

With options:

```bash
npx open-agent-mcp --name my-agents --prefix agent
```

### Programmatic Usage

```typescript
import { createMCPServer, createStdioTransport } from '@open-agent/mcp-server';

// Create server
const server = createMCPServer({
  name: 'my-mcp-server',
  version: '1.0.0',
});

// Register a tool
server.registerTool(
  {
    name: 'hello',
    description: 'Say hello',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name to greet' },
      },
      required: ['name'],
    },
  },
  async (args) => ({
    content: [{ type: 'text', text: `Hello, ${args.name}!` }],
  })
);

// Start with stdio transport
const transport = createStdioTransport(server);
await transport.start();
```

### Register an Agent

```typescript
import { createMCPServer } from '@open-agent/mcp-server';

const server = createMCPServer({
  name: 'agent-server',
  version: '1.0.0',
});

// Register an agent as a tool
server.registerAgent({
  id: 'summarizer',
  name: 'Text Summarizer',
  description: 'Summarizes text content',
  parameters: {
    text: {
      type: 'string',
      description: 'Text to summarize',
      required: true,
    },
    maxLength: {
      type: 'number',
      description: 'Maximum summary length',
      default: 100,
    },
  },
  handler: async (args) => {
    const text = args.text as string;
    // Summarization logic here
    return { summary: text.slice(0, 100) + '...' };
  },
});
```

## Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "open-agents": {
      "command": "npx",
      "args": ["open-agent-mcp"]
    }
  }
}
```

## API Reference

### MCPServer

Main server class.

```typescript
const server = createMCPServer({
  name: string;           // Server name
  version: string;        // Server version
  auth?: {                // Optional authentication
    enabled: boolean;
    type: 'token' | 'apikey' | 'custom';
    validator?: (credentials: string) => Promise<boolean>;
  };
  toolOptions?: {
    prefix?: string;      // Tool name prefix
  };
});
```

#### Methods

- `registerTool(definition, handler, metadata?)` - Register an MCP tool
- `registerAgent(agent)` - Register an agent as a tool
- `registerResource(resource)` - Register a resource
- `registerPrompt(prompt)` - Register a prompt
- `handleMessage(data)` - Handle incoming JSON-RPC message
- `getCapabilities()` - Get server capabilities
- `isInitialized()` - Check initialization status

### Transports

#### StdioTransport

For CLI/stdio communication:

```typescript
const transport = createStdioTransport(server);
await transport.start();
```

#### HTTPTransport

For HTTP communication (placeholder):

```typescript
const transport = createHTTPTransport(server, {
  port: 3000,
  host: 'localhost',
  path: '/mcp',
});
await transport.start();
```

#### WebSocketTransport

For WebSocket communication (placeholder):

```typescript
const transport = createWebSocketTransport(server, {
  port: 8080,
  host: 'localhost',
});
await transport.start();
```

### Tool Registry

Standalone tool registry:

```typescript
import { createMCPToolRegistry } from '@open-agent/mcp-server';

const registry = createMCPToolRegistry('prefix');
registry.register(definition, handler);
const tools = registry.list();
const result = await registry.call({ name: 'tool', arguments: {} });
```

### Utilities

```typescript
import { agentToMCPTool, resultToMCPResponse } from '@open-agent/mcp-server';

// Convert agent to MCP tool definition
const tool = agentToMCPTool(agent);

// Convert any result to MCP response
const response = resultToMCPResponse({ data: 'value' });
```

## Events

```typescript
server.on('request', (request) => console.log('Request:', request.method));
server.on('response', (response) => console.log('Response:', response.id));
server.on('tool:registered', (tool) => console.log('Tool:', tool.name));
server.on('tool:called', (name, args) => console.log('Call:', name));
server.on('client:connected', () => console.log('Connected'));
server.on('client:disconnected', () => console.log('Disconnected'));
server.on('error', (error) => console.error('Error:', error));
```

## Protocol

This server implements the [Model Context Protocol](https://spec.modelcontextprotocol.io/) specification.

Supported methods:
- `initialize` / `notifications/initialized`
- `shutdown`
- `tools/list` / `tools/call`
- `resources/list` / `resources/read`
- `prompts/list` / `prompts/get`

## License

MIT
