# Open Agent System

This folder contains an **Open Agent System** - a framework for repurposing AI coding assistants (Claude Code, Gemini CLI, Codex) as general-purpose agent hosts.

## What is an Open Agent System?

An Open Agent System transforms AI coding assistants into versatile agents that can:

- **Manage files and content** - Organize documents, transform formats, maintain archives
- **Perform research** - Gather information from multiple sources, synthesize findings
- **Execute domain-specific workflows** - Legal document review, financial analysis, content production
- **Route between specialized agents** - Automatically select the right agent for each task

Instead of writing code, agents follow markdown-defined workflows to accomplish any file-based task.

## Folder Structure

```
open-agents/
├── README.md           # You are here
├── INSTRUCTIONS.md     # Agent catalog and routing logic (loaded at conversation start)
├── agents/             # Individual agent definitions (loaded on-demand)
│   └── *.md            # Each file defines one specialized agent
├── tools/              # Custom tool definitions and configurations
├── source/             # Input files for processing
├── output-drafts/      # Initial agent outputs
├── output-refined/     # Revised/improved outputs
└── output-final/       # Approved final deliverables
```

## Quick Start

1. **Read the Instructions**: Start by reading `INSTRUCTIONS.md` to understand what agents are available and how they work.

2. **Add Source Material**: Place any files you want agents to work with in the `source/` folder.

3. **Invoke an Agent**: In your AI assistant, reference an agent by name or describe your task - the system will route to the appropriate agent.

4. **Review Output**: Check `output-drafts/` for initial results, provide feedback, and find polished deliverables in `output-final/`.

## The Pointer Pattern

Open Agent Systems use a three-layer architecture:

1. **Entry Points** (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`) - Tool-specific files that point to instructions
2. **Index** (`INSTRUCTIONS.md`) - Agent catalog and routing logic, loaded at conversation start
3. **Agents** (`agents/*.md`) - Full agent definitions, loaded on-demand when invoked

This pattern minimizes context usage while maintaining full capability.

## Learn More

- See `INSTRUCTIONS.md` for the full agent catalog
- See `../OpenAgentDefinition.md` for the complete specification
- See `../docs/` for additional documentation
