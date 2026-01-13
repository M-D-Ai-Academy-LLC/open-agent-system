/**
 * Init Command - Initialize a new Open Agent project
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

interface InitOptions {
  name?: string;
  template?: 'minimal' | 'standard' | 'full';
  provider?: string;
  yes?: boolean;
}

export function initCommand(): Command {
  return new Command('init')
    .description('Initialize a new Open Agent project')
    .argument('[directory]', 'Project directory', '.')
    .option('-n, --name <name>', 'Project name')
    .option('-t, --template <template>', 'Project template (minimal, standard, full)', 'standard')
    .option('-p, --provider <provider>', 'Default LLM provider', 'openrouter')
    .option('-y, --yes', 'Skip prompts and use defaults')
    .action(async (directory: string, options: InitOptions) => {
      const spinner = ora();

      try {
        console.log(chalk.blue('\n🤖 Open Agent System - Project Initialization\n'));

        // Get project configuration
        const config = options.yes
          ? {
              name: options.name ?? 'my-agent-project',
              template: options.template ?? 'standard',
              provider: options.provider ?? 'openrouter',
            }
          : await promptConfig(options);

        // Create project structure
        spinner.start('Creating project structure...');
        await createProjectStructure(directory, config);
        spinner.succeed('Project structure created');

        // Create configuration files
        spinner.start('Generating configuration files...');
        await createConfigFiles(directory, config);
        spinner.succeed('Configuration files generated');

        // Create example agent
        spinner.start('Creating example agent...');
        await createExampleAgent(directory, config);
        spinner.succeed('Example agent created');

        console.log(chalk.green('\n✅ Project initialized successfully!\n'));
        console.log(chalk.dim('Next steps:'));
        console.log(chalk.dim(`  cd ${directory}`));
        console.log(chalk.dim('  pnpm install'));
        console.log(chalk.dim('  open-agent run\n'));
      } catch (error) {
        spinner.fail('Initialization failed');
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
        process.exit(1);
      }
    });
}

async function promptConfig(options: InitOptions) {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Project name:',
      default: options.name ?? 'my-agent-project',
    },
    {
      type: 'list',
      name: 'template',
      message: 'Select a template:',
      choices: [
        { name: 'Minimal - Basic agent setup', value: 'minimal' },
        { name: 'Standard - Agent with tools and hooks', value: 'standard' },
        { name: 'Full - Complete multi-agent system', value: 'full' },
      ],
      default: options.template ?? 'standard',
    },
    {
      type: 'list',
      name: 'provider',
      message: 'Default LLM provider:',
      choices: [
        { name: 'OpenRouter (300+ models)', value: 'openrouter' },
        { name: 'OpenAI', value: 'openai' },
        { name: 'Anthropic', value: 'anthropic' },
        { name: 'Custom', value: 'custom' },
      ],
      default: options.provider ?? 'openrouter',
    },
  ]);

  return answers;
}

async function createProjectStructure(
  directory: string,
  _config: { name: string; template: string; provider: string }
) {
  const dirs = [
    'agents',
    'tools',
    'hooks',
    'prompts',
    'config',
  ];

  for (const dir of dirs) {
    await mkdir(join(directory, dir), { recursive: true });
  }
}

async function createConfigFiles(
  directory: string,
  config: { name: string; template: string; provider: string }
) {
  // Create open-agent.config.ts
  const configContent = `/**
 * Open Agent System Configuration
 */
import { defineConfig } from '@open-agent/core';

export default defineConfig({
  name: '${config.name}',

  // Default provider configuration
  provider: {
    name: '${config.provider}',
    // Add your API key in .env file: OPENROUTER_API_KEY=...
  },

  // Default model for agents
  defaultModel: 'anthropic/claude-sonnet-4',

  // Hook plugins
  hooks: {
    // Add hook configurations here
  },

  // Agent definitions directory
  agentsDir: './agents',

  // Tools directory
  toolsDir: './tools',

  // Observability
  observability: {
    tracing: true,
    metrics: true,
    logLevel: 'info',
  },
});
`;

  await writeFile(join(directory, 'open-agent.config.ts'), configContent);

  // Create .env.example
  const envContent = `# Open Agent System Environment Variables

# OpenRouter API Key (get one at https://openrouter.ai)
OPENROUTER_API_KEY=

# Optional: OpenAI API Key
OPENAI_API_KEY=

# Optional: Anthropic API Key
ANTHROPIC_API_KEY=

# Logging level (debug, info, warn, error)
LOG_LEVEL=info
`;

  await writeFile(join(directory, '.env.example'), envContent);

  // Create .gitignore
  const gitignoreContent = `# Dependencies
node_modules/

# Build
dist/

# Environment
.env
.env.local

# Logs
*.log

# State
.open-agent/

# IDE
.vscode/
.idea/
`;

  await writeFile(join(directory, '.gitignore'), gitignoreContent);
}

async function createExampleAgent(
  directory: string,
  _config: { name: string; template: string; provider: string }
) {
  const agentContent = `/**
 * Example Agent - Research Assistant
 */
import { defineAgent } from '@open-agent/core';

export default defineAgent({
  name: 'research-assistant',
  description: 'An AI assistant that helps with research tasks',

  // System prompt
  systemPrompt: \`You are a helpful research assistant. You can:
- Search for information
- Summarize documents
- Answer questions based on provided context

Always cite your sources and be clear about uncertainty.\`,

  // Model override (optional - uses default if not specified)
  // model: 'anthropic/claude-sonnet-4',

  // Tools this agent can use
  tools: ['web-search', 'document-reader'],

  // Maximum iterations for autonomous tasks
  maxIterations: 10,

  // Timeout in milliseconds
  timeout: 60000,
});
`;

  await writeFile(join(directory, 'agents', 'research-assistant.ts'), agentContent);
}
