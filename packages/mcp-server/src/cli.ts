#!/usr/bin/env node
/**
 * MCP Server CLI
 *
 * Command-line interface for running the MCP server.
 */

import { createMCPServer } from './server.js';
import { createStdioTransport } from './transport.js';

// =============================================================================
// CLI Implementation
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  const config = {
    name: 'open-agent-mcp',
    version: '0.1.0',
    prefix: '',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--name':
      case '-n':
        config.name = args[++i] ?? config.name;
        break;
      case '--version':
      case '-v':
        console.log(config.version);
        process.exit(0);
        break;
      case '--prefix':
      case '-p':
        config.prefix = args[++i] ?? '';
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }

  // Create server
  const server = createMCPServer({
    name: config.name,
    version: config.version,
    toolOptions: {
      prefix: config.prefix || undefined,
    },
  });

  // Set up event handlers
  server.on('error', (error) => {
    console.error('Server error:', error.message);
  });

  server.on('client:connected', () => {
    console.error('Client connected');
  });

  server.on('client:disconnected', () => {
    console.error('Client disconnected');
  });

  // Create and start transport
  const transport = createStdioTransport(server);
  await transport.start();

  // Handle shutdown
  process.on('SIGINT', async () => {
    await transport.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await transport.stop();
    process.exit(0);
  });
}

function printHelp(): void {
  console.log(`
Open Agent MCP Server

Usage: open-agent-mcp [options]

Options:
  -n, --name <name>     Server name (default: open-agent-mcp)
  -p, --prefix <prefix> Tool name prefix
  -v, --version         Show version
  -h, --help            Show help

Example:
  open-agent-mcp --name my-server --prefix agent

This starts an MCP server that communicates via stdin/stdout.
Tools can be registered programmatically by importing the server module.
`);
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
