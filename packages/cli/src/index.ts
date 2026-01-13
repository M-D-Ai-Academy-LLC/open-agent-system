/**
 * @open-agent/cli
 *
 * CLI for building and running LLM-agnostic multi-agent systems.
 */

import { Command } from 'commander';
import { VERSION } from '@open-agent/core';
import { initCommand } from './commands/init.js';
import { runCommand } from './commands/run.js';
import { chatCommand } from './commands/chat.js';
import { configCommand } from './commands/config.js';
import { agentCommand } from './commands/agent.js';
import { toolsCommand } from './commands/tools.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('open-agent')
    .description('CLI for building LLM-agnostic multi-agent systems')
    .version(VERSION);

  // Register commands
  program.addCommand(initCommand());
  program.addCommand(runCommand());
  program.addCommand(chatCommand());
  program.addCommand(configCommand());
  program.addCommand(agentCommand());
  program.addCommand(toolsCommand());

  return program;
}

export { initCommand, runCommand, chatCommand, configCommand, agentCommand, toolsCommand };
