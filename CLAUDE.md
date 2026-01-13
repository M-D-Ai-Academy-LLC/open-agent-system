**CRITICAL: Read `open-agents/INSTRUCTIONS.md` immediately.**

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The **Open Agent System** is a framework for repurposing AI coding assistants (Claude Code, Gemini CLI, Codex) as general-purpose agent hosts. Instead of writing code, agents manage files, perform research, transform content, and execute domain-specific workflows—all defined in markdown.

**Core Insight:** Claude Code, Gemini CLI, and similar tools are general-purpose agent frameworks that happen to be configured for coding by default. Their file reading/writing, instruction following, and tool usage capabilities work for any file-based workflow.

## Repository Structure

```
open-agent-system/
├── OpenAgentDefinition.md      # Complete specification for building Open Agent Systems
├── prompts/                    # Agent system prompts for autonomous development
│   ├── initializer_prompt.md   # First-session agent: creates features, init.sh, project structure
│   └── coding_prompt.md        # Coding agent: implements features iteratively
├── ai-dev-tasks/               # Enterprise workflow templates (git submodule)
│   ├── .claude/commands/       # Slash commands for structured development
│   └── workflow/               # PRD and task generation templates
└── features.db                 # SQLite database for feature tracking (MCP server)
```

## Key Concepts

### The Pointer Pattern
Open Agent Systems use a three-layer architecture:
1. **Entry Points** (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`) - Tool-specific files that point to instructions
2. **Index** (`open-agents/INSTRUCTIONS.md`) - Agent catalog, routing logic, loaded at conversation start
3. **Agents** (`open-agents/agents/*.md`) - Full agent definitions, loaded on-demand

### Mandatory Read Directive
Entry point files MUST include at the top:
```markdown
**CRITICAL: Read `open-agents/INSTRUCTIONS.md` immediately.**
```

## Agent System Prompts

### Initializer Agent (`prompts/initializer_prompt.md`)
First session of autonomous development. Responsibilities:
1. Read `app_spec.txt` for project requirements
2. Create features using `feature_create_bulk` MCP tool (must match `feature_count` from spec)
3. Create `init.sh` for environment setup
4. Initialize git repository
5. Set up project structure

### Coding Agent (`prompts/coding_prompt.md`)
Subsequent sessions. Workflow:
1. **Get Bearings**: Read `app_spec.txt`, `claude-progress.txt`, check `git log`
2. **Check Stats**: Use `feature_get_stats` MCP tool
3. **Regression Test**: Use `feature_get_for_regression` to verify passing features still work
4. **Get Next Feature**: Use `feature_get_next`, then `feature_mark_in_progress`
5. **Implement & Test**: Use browser automation to verify through actual UI
6. **Mark Passing**: Use `feature_mark_passing` only after thorough verification
7. **Commit & Document**: Update `claude-progress.txt`

## Feature MCP Tools

```
feature_get_stats         # Get passing/in_progress/total counts
feature_get_next          # Get highest-priority pending feature
feature_mark_in_progress  # Claim a feature (prevents concurrent work)
feature_mark_passing      # Mark feature complete (after verification)
feature_get_for_regression # Get random passing features for testing
feature_skip              # Move feature to end of queue (external blockers only)
feature_clear_in_progress # Abandon a feature
feature_create_bulk       # Create multiple features (initializer only)
feature_create            # Create single feature
```

## Critical Rules for Coding Agents

### Test-Driven Development
Features are **test cases** that drive development:
- If functionality doesn't exist to test a feature → **BUILD IT**
- "Page doesn't exist" is never a valid skip reason—create the page
- "API endpoint missing" means implement the endpoint

### Skip Sparingly
Only skip for truly external blockers:
- ✅ Third-party API credentials not configured
- ✅ External service unavailable
- ❌ "Page not built yet" → build it
- ❌ "Database table missing" → create migration
- ❌ "Component not ready" → build the component

### Verification Requirements
Before marking ANY feature as passing:
1. Test through actual UI with browser automation
2. Create unique test data (e.g., "TEST_12345_VERIFY_ME")
3. Verify data persists after refresh
4. Check for console errors
5. Verify security (auth, permissions)
6. Take screenshots

### No Mock Data
- Never use hardcoded arrays, `mockData`, `fakeData` variables
- All data must come from real database queries
- Dashboard counts must reflect actual records

## Browser Automation Tools

```
browser_navigate          # Navigate to URL
browser_click             # Click elements (has auto-wait)
browser_type              # Type text into fields
browser_fill_form         # Fill multiple form fields
browser_take_screenshot   # Capture for verification
browser_console_messages  # Check for JavaScript errors
browser_network_requests  # Monitor API calls
```

## ai-dev-tasks Submodule

Enterprise workflow templates for structured development:
- `/create-prd` - Create Product Requirement Documents
- `/generate-tasks` - Convert PRD to actionable tasks
- `/process-task-list` - Implement tasks systematically
- `/log-task` - Record task completion for audit trail

**Important:** ai-dev-tasks is READ-ONLY. Project PRDs/tasks go in your project's `docs/` directory.

## Creating an Open Agent System

1. Create folder structure:
   ```bash
   mkdir -p open-agents/{agents,tools,source,output-drafts,output-refined,output-final}
   mkdir -p .claude/commands/{domain}
   mkdir -p .gemini/commands/{domain}
   ```

2. Create `open-agents/INSTRUCTIONS.md` with agent catalog and routing logic

3. Create agent files in `open-agents/agents/*.md` following anatomy:
   - Purpose
   - When to Use This Agent
   - Core Behaviors
   - Output Format
   - Output Location

4. Create command files in both `.claude/commands/` and `.gemini/commands/`

5. Add mandatory read directive to entry point files

## Git Commit Protocol

- Commit after each feature is verified and marked passing
- Include in message: what changed, test status, feature ID
- Update `claude-progress.txt` before session ends
- Never commit with uncommitted changes or broken features

## Quick Reference: Available Agents

| Agent | Description | Triggers |
|-------|-------------|----------|
| *None yet* | *Agents are defined in `open-agents/agents/`* | *See INSTRUCTIONS.md* |

> **Note:** See `open-agents/INSTRUCTIONS.md` for the full agent catalog and routing logic.

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
