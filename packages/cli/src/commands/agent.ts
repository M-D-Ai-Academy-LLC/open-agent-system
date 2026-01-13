/**
 * Agent Command - Manage agents from CLI
 *
 * Provides commands for listing, creating, running, and monitoring agents.
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

interface AgentConfig {
  id: string;
  name: string;
  description: string;
  version: string;
  model: string;
  instructions: string;
  tools: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface AgentListOptions {
  format?: 'table' | 'json';
  all?: boolean;
}

interface AgentCreateOptions {
  name?: string;
  description?: string;
  model?: string;
  instructions?: string;
  template?: string;
  interactive?: boolean;
}

interface AgentRunOptions {
  task?: string;
  input?: string;
  file?: string;
  model?: string;
  stream?: boolean;
  verbose?: boolean;
  timeout?: number;
}

interface AgentStatusOptions {
  watch?: boolean;
  interval?: number;
}

// =============================================================================
// Agent Command
// =============================================================================

export function agentCommand(): Command {
  const agent = new Command('agent').description('Manage agents');

  // agent list
  agent
    .command('list')
    .alias('ls')
    .description('List available agents')
    .option('-f, --format <format>', 'Output format (table, json)', 'table')
    .option('-a, --all', 'Show all agents including system agents')
    .action(async (options: AgentListOptions) => {
      console.log(chalk.blue('\n🤖 Available Agents\n'));

      try {
        // Load agents from config directory
        const agents = await loadAgents();

        if (agents.length === 0) {
          console.log(chalk.dim('No agents found.'));
          console.log(chalk.dim('Create one with: open-agent agent create\n'));
          return;
        }

        if (options.format === 'json') {
          console.log(JSON.stringify(agents, null, 2));
        } else {
          // Table format
          console.log(
            chalk.dim('─'.repeat(80))
          );
          console.log(
            chalk.bold(
              padRight('ID', 20) +
              padRight('Name', 25) +
              padRight('Model', 20) +
              'Tools'
            )
          );
          console.log(
            chalk.dim('─'.repeat(80))
          );

          for (const a of agents) {
            console.log(
              padRight(a.id, 20) +
              padRight(a.name, 25) +
              padRight(a.model, 20) +
              a.tools.length.toString()
            );
          }
          console.log(
            chalk.dim('─'.repeat(80))
          );
          console.log(chalk.dim(`\nTotal: ${agents.length} agent(s)\n`));
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      }
    });

  // agent create
  agent
    .command('create [id]')
    .description('Create a new agent')
    .option('-n, --name <name>', 'Agent name')
    .option('-d, --description <description>', 'Agent description')
    .option('-m, --model <model>', 'Default model (e.g., gpt-4, claude-sonnet-4)')
    .option('-i, --instructions <instructions>', 'System instructions')
    .option('-t, --template <template>', 'Use a template (general, researcher, coder)')
    .option('--interactive', 'Interactive mode', true)
    .action(async (id: string | undefined, options: AgentCreateOptions) => {
      console.log(chalk.blue('\n🛠️  Create New Agent\n'));
      const spinner = ora();

      try {
        let config: Partial<AgentConfig>;

        if (options.interactive && !id) {
          // Interactive mode
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'id',
              message: 'Agent ID (unique identifier):',
              validate: (input: string) => {
                if (!input) return 'ID is required';
                if (!/^[a-z0-9-]+$/.test(input)) {
                  return 'ID must be lowercase alphanumeric with hyphens';
                }
                return true;
              },
            },
            {
              type: 'input',
              name: 'name',
              message: 'Agent name:',
              default: (answers: { id: string }) => toTitleCase(answers.id.replace(/-/g, ' ')),
            },
            {
              type: 'input',
              name: 'description',
              message: 'Description:',
              default: 'A helpful AI agent',
            },
            {
              type: 'list',
              name: 'model',
              message: 'Default model:',
              choices: [
                'claude-sonnet-4-20250514',
                'claude-opus-4-20250514',
                'gpt-4o',
                'gpt-4-turbo',
                'openrouter/auto',
              ],
              default: 'claude-sonnet-4-20250514',
            },
            {
              type: 'list',
              name: 'template',
              message: 'Start from template:',
              choices: [
                { name: 'General Purpose', value: 'general' },
                { name: 'Researcher', value: 'researcher' },
                { name: 'Coder', value: 'coder' },
                { name: 'Custom (empty)', value: 'custom' },
              ],
              default: 'general',
            },
          ]);

          config = {
            id: answers.id,
            name: answers.name,
            description: answers.description,
            model: answers.model,
            instructions: getTemplateInstructions(answers.template),
            tools: getTemplateTools(answers.template),
          };
        } else {
          // Non-interactive mode
          config = {
            id: id ?? `agent-${Date.now()}`,
            name: options.name ?? id ?? 'New Agent',
            description: options.description ?? 'A helpful AI agent',
            model: options.model ?? 'claude-sonnet-4-20250514',
            instructions: options.instructions ?? getTemplateInstructions(options.template ?? 'general'),
            tools: getTemplateTools(options.template ?? 'general'),
          };
        }

        spinner.start('Creating agent...');

        // Save agent configuration
        const agentConfig: AgentConfig = {
          ...config as AgentConfig,
          version: '1.0.0',
          metadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await saveAgent(agentConfig);

        spinner.succeed(`Agent "${config.name}" created successfully`);
        console.log(chalk.dim(`\nID: ${config.id}`));
        console.log(chalk.dim(`Config saved to: ${getAgentConfigPath(config.id!)}\n`));
        console.log(chalk.green('Run with: open-agent agent run ' + config.id + ' --task "Your task"\n'));
      } catch (error) {
        spinner.fail('Failed to create agent');
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      }
    });

  // agent run
  agent
    .command('run <id>')
    .description('Run an agent with a task')
    .option('-t, --task <task>', 'Task description')
    .option('-i, --input <input>', 'Additional input context')
    .option('-f, --file <file>', 'Load task from file')
    .option('-m, --model <model>', 'Override default model')
    .option('-s, --stream', 'Enable streaming output', true)
    .option('-v, --verbose', 'Enable verbose output')
    .option('--timeout <ms>', 'Execution timeout in milliseconds', '300000')
    .action(async (id: string, options: AgentRunOptions) => {
      console.log(chalk.blue(`\n🚀 Running Agent: ${id}\n`));
      const spinner = ora();

      try {
        // Load agent configuration
        spinner.start('Loading agent...');
        const agentConfig = await loadAgent(id);

        if (!agentConfig) {
          spinner.fail(`Agent "${id}" not found`);
          console.log(chalk.dim('\nAvailable agents:'));
          const agents = await loadAgents();
          for (const a of agents) {
            console.log(chalk.dim(`  - ${a.id}`));
          }
          process.exit(1);
        }

        spinner.succeed(`Agent "${agentConfig.name}" loaded`);

        // Get task
        let task = options.task;
        if (options.file) {
          task = await fs.readFile(options.file, 'utf-8');
        }

        if (!task) {
          console.error(chalk.red('Error: Please provide a task with --task or --file'));
          process.exit(1);
        }

        console.log(chalk.dim(`\nTask: ${task.substring(0, 100)}${task.length > 100 ? '...' : ''}`));
        console.log(chalk.dim(`Model: ${options.model ?? agentConfig.model}`));
        console.log(chalk.dim(`Stream: ${options.stream}`));
        console.log(chalk.dim(`Timeout: ${options.timeout}ms\n`));

        spinner.start('Executing task...');

        // TODO: Integrate with actual agent runtime
        // This placeholder demonstrates the CLI interface

        // Simulate execution
        await new Promise(resolve => setTimeout(resolve, 1000));

        spinner.info('Agent runtime integration pending');
        console.log(chalk.yellow('\nNote: Full agent execution coming in next release'));
        console.log(chalk.dim('The agent would process:'));
        console.log(chalk.dim(`  - Instructions: ${agentConfig.instructions.substring(0, 50)}...`));
        console.log(chalk.dim(`  - Tools: ${agentConfig.tools.join(', ') || 'none'}`));
        console.log(chalk.dim(`  - Task: ${task.substring(0, 50)}...`));
        console.log('');
      } catch (error) {
        spinner.fail('Execution failed');
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
        process.exit(1);
      }
    });

  // agent status
  agent
    .command('status [id]')
    .description('Show agent status')
    .option('-w, --watch', 'Watch mode - continuously update')
    .option('-i, --interval <ms>', 'Watch interval in milliseconds', '2000')
    .action(async (id: string | undefined, options: AgentStatusOptions) => {
      console.log(chalk.blue('\n📊 Agent Status\n'));

      try {
        if (id) {
          // Show specific agent status
          const agentConfig = await loadAgent(id);

          if (!agentConfig) {
            console.error(chalk.red(`Agent "${id}" not found`));
            process.exit(1);
          }

          showAgentStatus(agentConfig);
        } else {
          // Show all agents status
          const agents = await loadAgents();

          if (agents.length === 0) {
            console.log(chalk.dim('No agents configured.'));
            console.log(chalk.dim('Create one with: open-agent agent create\n'));
            return;
          }

          for (const agentConfig of agents) {
            showAgentStatus(agentConfig);
            console.log('');
          }
        }

        // Watch mode
        if (options.watch) {
          console.log(chalk.dim(`\nWatching... (Ctrl+C to stop)\n`));
          const interval = parseInt(options.interval?.toString() ?? '2000', 10);

          setInterval(async () => {
            console.clear();
            console.log(chalk.blue('\n📊 Agent Status (Live)\n'));

            const agents = id ? [await loadAgent(id)] : await loadAgents();
            for (const agentConfig of agents) {
              if (agentConfig) {
                showAgentStatus(agentConfig);
                console.log('');
              }
            }

            console.log(chalk.dim(`Last updated: ${new Date().toLocaleTimeString()}`));
          }, interval);
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      }
    });

  // agent delete
  agent
    .command('delete <id>')
    .alias('rm')
    .description('Delete an agent')
    .option('-f, --force', 'Force deletion without confirmation')
    .action(async (id: string, options: { force?: boolean }) => {
      console.log(chalk.blue(`\n🗑️  Delete Agent: ${id}\n`));

      try {
        const agentConfig = await loadAgent(id);

        if (!agentConfig) {
          console.error(chalk.red(`Agent "${id}" not found`));
          process.exit(1);
        }

        if (!options.force) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Are you sure you want to delete "${agentConfig.name}"?`,
              default: false,
            },
          ]);

          if (!confirm) {
            console.log(chalk.dim('Deletion cancelled.\n'));
            return;
          }
        }

        await deleteAgent(id);
        console.log(chalk.green(`Agent "${agentConfig.name}" deleted successfully\n`));
      } catch (error) {
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      }
    });

  // agent edit
  agent
    .command('edit <id>')
    .description('Edit an agent configuration')
    .action(async (id: string) => {
      console.log(chalk.blue(`\n✏️  Edit Agent: ${id}\n`));

      try {
        const agentConfig = await loadAgent(id);

        if (!agentConfig) {
          console.error(chalk.red(`Agent "${id}" not found`));
          process.exit(1);
        }

        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Agent name:',
            default: agentConfig.name,
          },
          {
            type: 'input',
            name: 'description',
            message: 'Description:',
            default: agentConfig.description,
          },
          {
            type: 'list',
            name: 'model',
            message: 'Default model:',
            choices: [
              'claude-sonnet-4-20250514',
              'claude-opus-4-20250514',
              'gpt-4o',
              'gpt-4-turbo',
              'openrouter/auto',
            ],
            default: agentConfig.model,
          },
          {
            type: 'editor',
            name: 'instructions',
            message: 'System instructions:',
            default: agentConfig.instructions,
          },
        ]);

        const updatedConfig: AgentConfig = {
          ...agentConfig,
          ...answers,
          updatedAt: new Date().toISOString(),
        };

        await saveAgent(updatedConfig);
        console.log(chalk.green(`\nAgent "${updatedConfig.name}" updated successfully\n`));
      } catch (error) {
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      }
    });

  // agent export
  agent
    .command('export <id>')
    .description('Export agent configuration')
    .option('-o, --output <file>', 'Output file path')
    .action(async (id: string, options: { output?: string }) => {
      try {
        const agentConfig = await loadAgent(id);

        if (!agentConfig) {
          console.error(chalk.red(`Agent "${id}" not found`));
          process.exit(1);
        }

        const json = JSON.stringify(agentConfig, null, 2);

        if (options.output) {
          await fs.writeFile(options.output, json);
          console.log(chalk.green(`\nExported to: ${options.output}\n`));
        } else {
          console.log(json);
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      }
    });

  // agent import
  agent
    .command('import <file>')
    .description('Import agent from file')
    .option('-f, --force', 'Overwrite existing agent')
    .action(async (file: string, options: { force?: boolean }) => {
      const spinner = ora();

      try {
        spinner.start('Importing agent...');

        const content = await fs.readFile(file, 'utf-8');
        const agentConfig = JSON.parse(content) as AgentConfig;

        // Check if exists
        const existing = await loadAgent(agentConfig.id);
        if (existing && !options.force) {
          spinner.fail(`Agent "${agentConfig.id}" already exists`);
          console.log(chalk.dim('Use --force to overwrite\n'));
          return;
        }

        agentConfig.updatedAt = new Date().toISOString();
        await saveAgent(agentConfig);

        spinner.succeed(`Agent "${agentConfig.name}" imported successfully\n`);
      } catch (error) {
        spinner.fail('Import failed');
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      }
    });

  return agent;
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

function getAgentsDir(): string {
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '.';
  return path.join(home, '.open-agent', 'agents');
}

function getAgentConfigPath(id: string): string {
  return path.join(getAgentsDir(), `${id}.json`);
}

async function ensureAgentsDir(): Promise<void> {
  const dir = getAgentsDir();
  await fs.mkdir(dir, { recursive: true });
}

async function loadAgents(): Promise<AgentConfig[]> {
  try {
    await ensureAgentsDir();
    const dir = getAgentsDir();
    const files = await fs.readdir(dir);

    const agents: AgentConfig[] = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(dir, file), 'utf-8');
        agents.push(JSON.parse(content) as AgentConfig);
      }
    }

    return agents.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function loadAgent(id: string): Promise<AgentConfig | null> {
  try {
    const configPath = getAgentConfigPath(id);
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content) as AgentConfig;
  } catch {
    return null;
  }
}

async function saveAgent(config: AgentConfig): Promise<void> {
  await ensureAgentsDir();
  const configPath = getAgentConfigPath(config.id);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

async function deleteAgent(id: string): Promise<void> {
  const configPath = getAgentConfigPath(id);
  await fs.unlink(configPath);
}

function getTemplateInstructions(template: string): string {
  switch (template) {
    case 'researcher':
      return `You are a research assistant. Your role is to:
- Find and synthesize information from multiple sources
- Provide accurate, well-cited responses
- Identify gaps in available information
- Suggest follow-up questions for deeper understanding`;

    case 'coder':
      return `You are a coding assistant. Your role is to:
- Write clean, efficient, and well-documented code
- Debug and fix issues in existing code
- Explain complex concepts in simple terms
- Follow best practices for the relevant language/framework`;

    case 'general':
    default:
      return `You are a helpful AI assistant. Your role is to:
- Assist users with a wide range of tasks
- Provide clear, accurate, and helpful responses
- Ask clarifying questions when needed
- Admit when you don't know something`;
  }
}

function getTemplateTools(template: string): string[] {
  switch (template) {
    case 'researcher':
      return ['web_search', 'read_url', 'summarize'];
    case 'coder':
      return ['read_file', 'write_file', 'run_command', 'search_code'];
    case 'general':
    default:
      return [];
  }
}

function showAgentStatus(agentConfig: AgentConfig): void {
  console.log(chalk.bold(agentConfig.name) + chalk.dim(` (${agentConfig.id})`));
  console.log(chalk.dim('─'.repeat(40)));
  console.log(`  ${chalk.dim('Description:')} ${agentConfig.description}`);
  console.log(`  ${chalk.dim('Model:')} ${agentConfig.model}`);
  console.log(`  ${chalk.dim('Version:')} ${agentConfig.version}`);
  console.log(`  ${chalk.dim('Tools:')} ${agentConfig.tools.join(', ') || 'none'}`);
  console.log(`  ${chalk.dim('Created:')} ${new Date(agentConfig.createdAt).toLocaleString()}`);
  console.log(`  ${chalk.dim('Updated:')} ${new Date(agentConfig.updatedAt).toLocaleString()}`);
  console.log(`  ${chalk.dim('Status:')} ${chalk.green('● Ready')}`);
}
