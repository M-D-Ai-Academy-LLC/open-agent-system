/**
 * Tools Command - Manage tools from CLI
 *
 * Provides commands for listing, adding, removing, and testing tools.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// Types
// =============================================================================

interface ToolConfig {
  id: string;
  name: string;
  description: string;
  version: string;
  type: 'builtin' | 'custom' | 'mcp';
  enabled: boolean;
  parameters: ToolParameter[];
  handler?: string;
  mcpServer?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: unknown;
}

interface ToolListOptions {
  format?: 'table' | 'json';
  all?: boolean;
  type?: 'builtin' | 'custom' | 'mcp';
}

interface ToolAddOptions {
  name?: string;
  description?: string;
  type?: 'custom' | 'mcp';
  mcpServer?: string;
  interactive?: boolean;
}

interface ToolTestOptions {
  args?: string;
  verbose?: boolean;
  timeout?: number;
}

// =============================================================================
// Built-in Tools Definition
// =============================================================================

const BUILTIN_TOOLS: ToolConfig[] = [
  {
    id: 'read_file',
    name: 'Read File',
    description: 'Read the contents of a file',
    version: '1.0.0',
    type: 'builtin',
    enabled: true,
    parameters: [
      { name: 'path', type: 'string', description: 'Path to the file', required: true },
      { name: 'encoding', type: 'string', description: 'File encoding', required: false, default: 'utf-8' },
    ],
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'write_file',
    name: 'Write File',
    description: 'Write content to a file',
    version: '1.0.0',
    type: 'builtin',
    enabled: true,
    parameters: [
      { name: 'path', type: 'string', description: 'Path to the file', required: true },
      { name: 'content', type: 'string', description: 'Content to write', required: true },
      { name: 'encoding', type: 'string', description: 'File encoding', required: false, default: 'utf-8' },
    ],
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'run_command',
    name: 'Run Command',
    description: 'Execute a shell command',
    version: '1.0.0',
    type: 'builtin',
    enabled: true,
    parameters: [
      { name: 'command', type: 'string', description: 'Command to execute', required: true },
      { name: 'cwd', type: 'string', description: 'Working directory', required: false },
      { name: 'timeout', type: 'number', description: 'Timeout in ms', required: false, default: 30000 },
    ],
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'web_search',
    name: 'Web Search',
    description: 'Search the web for information',
    version: '1.0.0',
    type: 'builtin',
    enabled: true,
    parameters: [
      { name: 'query', type: 'string', description: 'Search query', required: true },
      { name: 'limit', type: 'number', description: 'Max results', required: false, default: 10 },
    ],
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'read_url',
    name: 'Read URL',
    description: 'Fetch and read content from a URL',
    version: '1.0.0',
    type: 'builtin',
    enabled: true,
    parameters: [
      { name: 'url', type: 'string', description: 'URL to fetch', required: true },
      { name: 'format', type: 'string', description: 'Output format (text, html, json)', required: false, default: 'text' },
    ],
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// =============================================================================
// Tools Command
// =============================================================================

export function toolsCommand(): Command {
  const tools = new Command('tools').description('Manage tools');

  // tools list
  tools
    .command('list')
    .alias('ls')
    .description('List available tools')
    .option('-f, --format <format>', 'Output format (table, json)', 'table')
    .option('-a, --all', 'Show all tools including disabled')
    .option('-t, --type <type>', 'Filter by type (builtin, custom, mcp)')
    .action(async (options: ToolListOptions) => {
      console.log(chalk.blue('\n🔧 Available Tools\n'));

      try {
        // Load all tools
        let allTools = [...BUILTIN_TOOLS];
        const customTools = await loadCustomTools();
        allTools = allTools.concat(customTools);

        // Filter by type
        if (options.type) {
          allTools = allTools.filter((t) => t.type === options.type);
        }

        // Filter disabled unless --all
        if (!options.all) {
          allTools = allTools.filter((t) => t.enabled);
        }

        if (allTools.length === 0) {
          console.log(chalk.dim('No tools found.'));
          console.log(chalk.dim('Add a custom tool with: open-agent tools add\n'));
          return;
        }

        if (options.format === 'json') {
          console.log(JSON.stringify(allTools, null, 2));
        } else {
          // Table format
          console.log(chalk.dim('─'.repeat(90)));
          console.log(
            chalk.bold(
              padRight('ID', 20) +
              padRight('Name', 25) +
              padRight('Type', 10) +
              padRight('Status', 10) +
              'Params'
            )
          );
          console.log(chalk.dim('─'.repeat(90)));

          for (const t of allTools) {
            const status = t.enabled ? chalk.green('enabled') : chalk.dim('disabled');
            console.log(
              padRight(t.id, 20) +
              padRight(t.name, 25) +
              padRight(t.type, 10) +
              padRight(status, 10) +
              t.parameters.length.toString()
            );
          }
          console.log(chalk.dim('─'.repeat(90)));
          console.log(chalk.dim(`\nTotal: ${allTools.length} tool(s)\n`));
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      }
    });

  // tools add
  tools
    .command('add [id]')
    .description('Add a custom tool')
    .option('-n, --name <name>', 'Tool name')
    .option('-d, --description <description>', 'Tool description')
    .option('-t, --type <type>', 'Tool type (custom, mcp)', 'custom')
    .option('-m, --mcp-server <server>', 'MCP server URL (for mcp type)')
    .option('--interactive', 'Interactive mode', true)
    .action(async (id: string | undefined, options: ToolAddOptions) => {
      console.log(chalk.blue('\n➕ Add Custom Tool\n'));
      const spinner = ora();

      try {
        let config: Partial<ToolConfig>;

        if (options.interactive && !id) {
          // Interactive mode
          const answers = await inquirer.prompt<{
            id: string;
            name: string;
            description: string;
            type: string;
            mcpServer?: string;
            addParams: boolean;
          }>([
            {
              type: 'input',
              name: 'id',
              message: 'Tool ID (unique identifier):',
              validate: (input: string) => {
                if (!input) return 'ID is required';
                if (!/^[a-z0-9_]+$/.test(input)) {
                  return 'ID must be lowercase alphanumeric with underscores';
                }
                return true;
              },
            },
            {
              type: 'input',
              name: 'name',
              message: 'Tool name:',
              default: (answers: { id: string }) => toTitleCase(answers.id.replace(/_/g, ' ')),
            },
            {
              type: 'input',
              name: 'description',
              message: 'Description:',
              default: 'A custom tool',
            },
            {
              type: 'list',
              name: 'type',
              message: 'Tool type:',
              choices: [
                { name: 'Custom (JavaScript handler)', value: 'custom' },
                { name: 'MCP (Model Context Protocol server)', value: 'mcp' },
              ],
              default: 'custom',
            },
            {
              type: 'input',
              name: 'mcpServer',
              message: 'MCP Server URL:',
              when: (prevAnswers: { type: string }) => prevAnswers.type === 'mcp',
            },
            {
              type: 'confirm',
              name: 'addParams',
              message: 'Add parameters?',
              default: true,
            },
          ]);

          const parameters: ToolParameter[] = [];

          if (answers.addParams) {
            let addMore = true;
            while (addMore) {
              const param = await inquirer.prompt([
                {
                  type: 'input',
                  name: 'name',
                  message: 'Parameter name:',
                },
                {
                  type: 'list',
                  name: 'type',
                  message: 'Parameter type:',
                  choices: ['string', 'number', 'boolean', 'array', 'object'],
                },
                {
                  type: 'input',
                  name: 'description',
                  message: 'Parameter description:',
                },
                {
                  type: 'confirm',
                  name: 'required',
                  message: 'Required?',
                  default: true,
                },
                {
                  type: 'confirm',
                  name: 'addMore',
                  message: 'Add another parameter?',
                  default: false,
                },
              ]);

              parameters.push({
                name: param.name,
                type: param.type,
                description: param.description,
                required: param.required,
              });

              addMore = param.addMore;
            }
          }

          config = {
            id: answers.id,
            name: answers.name,
            description: answers.description,
            type: answers.type as 'custom' | 'mcp',
            mcpServer: answers.mcpServer,
            parameters,
          };
        } else {
          // Non-interactive mode
          config = {
            id: id ?? `tool_${Date.now()}`,
            name: options.name ?? id ?? 'New Tool',
            description: options.description ?? 'A custom tool',
            type: (options.type as 'custom' | 'mcp') ?? 'custom',
            mcpServer: options.mcpServer,
            parameters: [],
          };
        }

        spinner.start('Adding tool...');

        // Save tool configuration
        const toolConfig: ToolConfig = {
          ...config as ToolConfig,
          version: '1.0.0',
          enabled: true,
          metadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await saveTool(toolConfig);

        spinner.succeed(`Tool "${config.name}" added successfully`);
        console.log(chalk.dim(`\nID: ${config.id}`));
        console.log(chalk.dim(`Config saved to: ${getToolConfigPath(config.id!)}\n`));
        console.log(chalk.green('Test with: open-agent tools test ' + config.id + '\n'));
      } catch (error) {
        spinner.fail('Failed to add tool');
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      }
    });

  // tools remove
  tools
    .command('remove <id>')
    .alias('rm')
    .description('Remove a custom tool')
    .option('-f, --force', 'Force removal without confirmation')
    .action(async (id: string, options: { force?: boolean }) => {
      console.log(chalk.blue(`\n🗑️  Remove Tool: ${id}\n`));

      try {
        // Check if it's a builtin tool
        const builtin = BUILTIN_TOOLS.find((t) => t.id === id);
        if (builtin) {
          console.error(chalk.red('Cannot remove built-in tools.'));
          console.log(chalk.dim('You can disable it with: open-agent tools disable ' + id + '\n'));
          return;
        }

        const toolConfig = await loadTool(id);

        if (!toolConfig) {
          console.error(chalk.red(`Tool "${id}" not found`));
          process.exit(1);
        }

        if (!options.force) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Are you sure you want to remove "${toolConfig.name}"?`,
              default: false,
            },
          ]);

          if (!confirm) {
            console.log(chalk.dim('Removal cancelled.\n'));
            return;
          }
        }

        await deleteTool(id);
        console.log(chalk.green(`Tool "${toolConfig.name}" removed successfully\n`));
      } catch (error) {
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      }
    });

  // tools test
  tools
    .command('test <id>')
    .description('Test a tool')
    .option('-a, --args <json>', 'Arguments as JSON string')
    .option('-v, --verbose', 'Enable verbose output')
    .option('--timeout <ms>', 'Execution timeout in milliseconds', '10000')
    .action(async (id: string, options: ToolTestOptions) => {
      console.log(chalk.blue(`\n🧪 Testing Tool: ${id}\n`));
      const spinner = ora();

      try {
        // Find the tool
        let toolConfig = BUILTIN_TOOLS.find((t) => t.id === id);
        if (!toolConfig) {
          toolConfig = await loadTool(id);
        }

        if (!toolConfig) {
          console.error(chalk.red(`Tool "${id}" not found`));
          process.exit(1);
        }

        // Display tool info
        console.log(chalk.bold(toolConfig.name) + chalk.dim(` (${toolConfig.id})`));
        console.log(chalk.dim('─'.repeat(40)));
        console.log(`  ${chalk.dim('Description:')} ${toolConfig.description}`);
        console.log(`  ${chalk.dim('Type:')} ${toolConfig.type}`);
        console.log(`  ${chalk.dim('Parameters:')}`);
        for (const p of toolConfig.parameters) {
          const req = p.required ? chalk.red('*') : '';
          console.log(`    - ${p.name}${req} (${p.type}): ${p.description}`);
        }
        console.log('');

        // Parse args
        let args: Record<string, unknown> = {};
        if (options.args) {
          try {
            args = JSON.parse(options.args);
          } catch {
            console.error(chalk.red('Invalid JSON in --args'));
            process.exit(1);
          }
        } else if (toolConfig.parameters.length > 0) {
          // Interactive argument collection
          const paramAnswers: Record<string, unknown> = {};
          for (const p of toolConfig.parameters) {
            const answer = await inquirer.prompt([
              {
                type: p.type === 'boolean' ? 'confirm' : 'input',
                name: 'value',
                message: `${p.name}${p.required ? ' (required)' : ''}:`,
                default: p.default,
                validate: (input: string) => {
                  if (p.required && !input) return `${p.name} is required`;
                  return true;
                },
              },
            ]);

            // Type conversion
            let value = answer.value;
            if (p.type === 'number' && typeof value === 'string') {
              value = parseFloat(value);
            } else if (p.type === 'boolean' && typeof value === 'string') {
              value = value.toLowerCase() === 'true';
            } else if ((p.type === 'array' || p.type === 'object') && typeof value === 'string') {
              try {
                value = JSON.parse(value);
              } catch {
                // Keep as string if not valid JSON
              }
            }

            paramAnswers[p.name] = value;
          }
          args = paramAnswers;
        }

        console.log(chalk.dim(`\nArguments: ${JSON.stringify(args)}`));
        spinner.start('Executing tool...');

        // TODO: Integrate with actual tool runtime
        // This placeholder demonstrates the CLI interface

        // Simulate execution
        await new Promise(resolve => setTimeout(resolve, 1000));

        spinner.info('Tool runtime integration pending');
        console.log(chalk.yellow('\nNote: Full tool execution coming in next release'));

        if (options.verbose) {
          console.log(chalk.dim('\nDebug info:'));
          console.log(chalk.dim(`  Tool config: ${JSON.stringify(toolConfig, null, 2)}`));
          console.log(chalk.dim(`  Arguments: ${JSON.stringify(args, null, 2)}`));
        }

        console.log('');
      } catch (error) {
        spinner.fail('Test failed');
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
        process.exit(1);
      }
    });

  // tools enable
  tools
    .command('enable <id>')
    .description('Enable a tool')
    .action(async (id: string) => {
      console.log(chalk.blue(`\n✅ Enabling Tool: ${id}\n`));

      try {
        let toolConfig = await loadTool(id);

        if (!toolConfig) {
          // Check built-in
          const builtin = BUILTIN_TOOLS.find((t) => t.id === id);
          if (builtin) {
            console.log(chalk.dim('Built-in tools are always enabled.\n'));
            return;
          }
          console.error(chalk.red(`Tool "${id}" not found`));
          process.exit(1);
        }

        toolConfig.enabled = true;
        toolConfig.updatedAt = new Date().toISOString();
        await saveTool(toolConfig);

        console.log(chalk.green(`Tool "${toolConfig.name}" enabled\n`));
      } catch (error) {
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      }
    });

  // tools disable
  tools
    .command('disable <id>')
    .description('Disable a tool')
    .action(async (id: string) => {
      console.log(chalk.blue(`\n⏸️  Disabling Tool: ${id}\n`));

      try {
        let toolConfig = await loadTool(id);

        if (!toolConfig) {
          // Check built-in - create a custom override
          const builtin = BUILTIN_TOOLS.find((t) => t.id === id);
          if (builtin) {
            toolConfig = { ...builtin, enabled: false };
            await saveTool(toolConfig);
            console.log(chalk.green(`Built-in tool "${toolConfig.name}" disabled\n`));
            return;
          }
          console.error(chalk.red(`Tool "${id}" not found`));
          process.exit(1);
        }

        toolConfig.enabled = false;
        toolConfig.updatedAt = new Date().toISOString();
        await saveTool(toolConfig);

        console.log(chalk.green(`Tool "${toolConfig.name}" disabled\n`));
      } catch (error) {
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      }
    });

  // tools info
  tools
    .command('info <id>')
    .description('Show detailed tool information')
    .action(async (id: string) => {
      console.log(chalk.blue(`\nℹ️  Tool Information: ${id}\n`));

      try {
        // Find the tool
        let toolConfig = BUILTIN_TOOLS.find((t) => t.id === id);
        if (!toolConfig) {
          toolConfig = await loadTool(id);
        }

        if (!toolConfig) {
          console.error(chalk.red(`Tool "${id}" not found`));
          process.exit(1);
        }

        console.log(chalk.bold(toolConfig.name));
        console.log(chalk.dim('═'.repeat(50)));
        console.log(`${chalk.dim('ID:')} ${toolConfig.id}`);
        console.log(`${chalk.dim('Description:')} ${toolConfig.description}`);
        console.log(`${chalk.dim('Version:')} ${toolConfig.version}`);
        console.log(`${chalk.dim('Type:')} ${toolConfig.type}`);
        console.log(`${chalk.dim('Status:')} ${toolConfig.enabled ? chalk.green('enabled') : chalk.dim('disabled')}`);

        if (toolConfig.mcpServer) {
          console.log(`${chalk.dim('MCP Server:')} ${toolConfig.mcpServer}`);
        }

        console.log(`\n${chalk.dim('Parameters:')}`);
        if (toolConfig.parameters.length === 0) {
          console.log(chalk.dim('  (none)'));
        } else {
          for (const p of toolConfig.parameters) {
            console.log(chalk.dim('─'.repeat(40)));
            console.log(`  ${chalk.bold(p.name)} ${p.required ? chalk.red('(required)') : chalk.dim('(optional)')}`);
            console.log(`    Type: ${p.type}`);
            console.log(`    Description: ${p.description}`);
            if (p.default !== undefined) {
              console.log(`    Default: ${JSON.stringify(p.default)}`);
            }
          }
        }

        console.log(`\n${chalk.dim('Created:')} ${new Date(toolConfig.createdAt).toLocaleString()}`);
        console.log(`${chalk.dim('Updated:')} ${new Date(toolConfig.updatedAt).toLocaleString()}`);
        console.log('');
      } catch (error) {
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      }
    });

  return tools;
}

// =============================================================================
// Helper Functions
// =============================================================================

function padRight(str: string, length: number): string {
  return str.substring(0, length).padEnd(length);
}

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getToolsDir(): string {
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '.';
  return path.join(home, '.open-agent', 'tools');
}

function getToolConfigPath(id: string): string {
  return path.join(getToolsDir(), `${id}.json`);
}

async function ensureToolsDir(): Promise<void> {
  const dir = getToolsDir();
  await fs.mkdir(dir, { recursive: true });
}

async function loadCustomTools(): Promise<ToolConfig[]> {
  try {
    await ensureToolsDir();
    const dir = getToolsDir();
    const files = await fs.readdir(dir);

    const tools: ToolConfig[] = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(dir, file), 'utf-8');
        tools.push(JSON.parse(content) as ToolConfig);
      }
    }

    return tools.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function loadTool(id: string): Promise<ToolConfig | undefined> {
  try {
    const configPath = getToolConfigPath(id);
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content) as ToolConfig;
  } catch {
    return undefined;
  }
}

async function saveTool(config: ToolConfig): Promise<void> {
  await ensureToolsDir();
  const configPath = getToolConfigPath(config.id);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

async function deleteTool(id: string): Promise<void> {
  const configPath = getToolConfigPath(id);
  await fs.unlink(configPath);
}
