/**
 * Chat Command - Interactive chat with an agent
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

interface ChatOptions {
  agent?: string;
  model?: string;
  system?: string;
}

export function chatCommand(): Command {
  return new Command('chat')
    .description('Start an interactive chat session with an agent')
    .option('-a, --agent <agent>', 'Agent name to use')
    .option('-m, --model <model>', 'Override default model')
    .option('-s, --system <system>', 'Override system prompt')
    .action(async (options: ChatOptions) => {
      const spinner = ora();

      try {
        console.log(chalk.blue('\n🤖 Open Agent System - Interactive Chat\n'));
        console.log(chalk.dim('Type "exit" or press Ctrl+C to quit\n'));

        spinner.start('Initializing chat session...');

        // TODO: Initialize agent and chat session
        // This will be implemented when the core agent runtime is ready

        spinner.succeed('Chat session ready');
        console.log(chalk.dim(`Agent: ${options.agent ?? 'default'}`));
        console.log(chalk.dim(`Model: ${options.model ?? 'anthropic/claude-sonnet-4'}\n`));

        // Interactive loop placeholder
        let continueChat = true;

        while (continueChat) {
          const { message } = await inquirer.prompt([
            {
              type: 'input',
              name: 'message',
              message: chalk.green('You:'),
              prefix: '',
            },
          ]);

          if (message.toLowerCase() === 'exit' || message.toLowerCase() === 'quit') {
            continueChat = false;
            console.log(chalk.dim('\nGoodbye! 👋\n'));
            break;
          }

          // Placeholder response
          console.log(chalk.cyan('\nAssistant:'));
          console.log(chalk.yellow('  Chat runtime not yet implemented.'));
          console.log(chalk.yellow('  Full chat support coming in v0.2.0\n'));
        }
      } catch (error) {
        if ((error as { name?: string }).name === 'ExitPromptError') {
          console.log(chalk.dim('\n\nGoodbye! 👋\n'));
          return;
        }
        spinner.fail('Chat failed');
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
        process.exit(1);
      }
    });
}
