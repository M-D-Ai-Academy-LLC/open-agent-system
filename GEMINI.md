**CRITICAL: Read `open-agents/INSTRUCTIONS.md` immediately.**

# GEMINI.md

This file provides guidance to Gemini CLI and other Google AI assistants when working with this repository.

## Project Overview

The **Open Agent System** is a framework for repurposing AI coding assistants (Claude Code, Gemini CLI, Codex) as general-purpose agent hosts. Instead of writing code, agents manage files, perform research, transform content, and execute domain-specific workflows—all defined in markdown.

## Quick Reference: Available Agents

| Agent | Description | Triggers |
|-------|-------------|----------|
| *None yet* | *Agents are defined in `open-agents/agents/`* | *See INSTRUCTIONS.md* |

> **Note:** See `open-agents/INSTRUCTIONS.md` for the full agent catalog and routing logic.

## Key Concepts

### The Pointer Pattern
Open Agent Systems use a three-layer architecture:
1. **Entry Points** (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`) - Tool-specific files that point to instructions
2. **Index** (`open-agents/INSTRUCTIONS.md`) - Agent catalog, routing logic, loaded at conversation start
3. **Agents** (`open-agents/agents/*.md`) - Full agent definitions, loaded on-demand

## Repository Structure

```
open-agent-system/
├── OpenAgentDefinition.md      # Complete specification for building Open Agent Systems
├── open-agents/                # Agent system folder
│   ├── INSTRUCTIONS.md         # Agent catalog and routing (READ THIS FIRST)
│   ├── agents/                 # Individual agent definitions
│   ├── tools/                  # Tool configurations
│   ├── source/                 # Input files
│   └── output-*/               # Output folders (drafts, refined, final)
├── prompts/                    # Agent system prompts for autonomous development
├── ai-dev-tasks/               # Enterprise workflow templates (git submodule)
└── packages/                   # TypeScript packages (@open-agent/core, cli, adapters)
```

## Available Commands

### Feature Management (MCP Tools)
- `feature_get_stats` - Get current progress (passing/total)
- `feature_get_next` - Get next feature to work on
- `feature_mark_in_progress` - Claim a feature
- `feature_mark_passing` - Mark feature complete
- `feature_skip` - Skip feature (external blockers only)

### ai-dev-tasks Commands
- `/create-prd` - Create Product Requirement Document
- `/generate-tasks` - Generate tasks from PRD
- `/process-task-list` - Process pending tasks
- `/log-task` - Log completed task

## Gemini-Specific Notes

### Command Directories
Gemini CLI uses `.gemini/commands/` for slash commands. Agent commands should be placed there in addition to `.claude/commands/`.

### File Handling
Gemini CLI has similar file reading/writing capabilities to Claude Code. Use the same patterns for managing output folders.

## Git Commit Protocol

- Commit after each feature is verified and marked passing
- Include in message: what changed, test status, feature ID
- Update `claude-progress.txt` before session ends
- Never commit with uncommitted changes or broken features
