# Open Agent System - Instructions

**CRITICAL: This file is loaded at the start of every conversation. Read it fully before proceeding with any task.**

## System Description

This is an **Open Agent System** - a framework for repurposing AI coding assistants as general-purpose agent hosts. Instead of writing code, agents follow markdown-defined workflows to accomplish file-based tasks like:

- Document organization and transformation
- Research synthesis and analysis
- Content production workflows
- Domain-specific business processes

## How This System Works

### The Pointer Pattern

This system uses a three-layer architecture to minimize context usage:

1. **Entry Points** (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`)
   - Tool-specific files in the repository root
   - Contain only a pointer: "Read `open-agents/INSTRUCTIONS.md` immediately"
   - Ensures instructions are loaded regardless of which AI tool is used

2. **Index** (`INSTRUCTIONS.md` - this file)
   - Agent catalog and routing logic
   - Loaded at conversation start
   - Contains enough information to route requests to the right agent

3. **Agents** (`agents/*.md`)
   - Full agent definitions with detailed behaviors
   - Loaded on-demand when invoked
   - Each file defines one specialized agent

### Workflow

1. User starts conversation → Entry point directs to INSTRUCTIONS.md
2. User describes task → System identifies appropriate agent from catalog
3. Agent file is loaded → Full agent definition provides detailed guidance
4. Agent executes workflow → Outputs placed in appropriate folders
5. User reviews output → Feedback incorporated, final version approved

## Project Structure

```
open-agents/
├── INSTRUCTIONS.md     # This file - agent index and routing
├── README.md           # Human-readable overview
├── agents/             # Agent definitions (one per .md file)
├── tools/              # Custom tool configurations
├── source/             # Input files for processing
├── output-drafts/      # Initial agent outputs
├── output-refined/     # Revised outputs after feedback
└── output-final/       # Approved final deliverables
```

### Folder Purposes

| Folder | Purpose | Typical Contents |
|--------|---------|------------------|
| `agents/` | Agent definitions | `researcher.md`, `editor.md`, etc. |
| `tools/` | Tool configs | API settings, templates, schemas |
| `source/` | Input material | Documents to process, data files |
| `output-drafts/` | First pass | Raw agent output, needs review |
| `output-refined/` | Iteration | Improved after feedback |
| `output-final/` | Complete | Approved deliverables |

## Available Agents

*Agents will be added here as they are created. Each entry should include:*
- Agent name and file path
- One-line description
- Trigger keywords/phrases

### Available Agent Catalog

| Agent | File | Description | Triggers |
|-------|------|-------------|----------|
| Project Assistant | `agents/project-assistant.md` | Codebase navigation, feature backlog management, progress tracking | "what does this do", "show progress", "add a feature", "what should I work on" |
| Initializer | `agents/initializer.md` | Sets up new projects from app_spec.txt, creates feature backlog | "initialize project", "set up from spec", "create features from spec" |
| Coding | `agents/coding.md` | Implements features with verification, drives autonomous development | "implement next feature", "start coding", "build the [feature]", "continue development" |

## Routing Logic

When a user request comes in, use this logic to determine the appropriate agent:

### Task Type Detection

| Task Type | Signals | Route To |
|-----------|---------|----------|
| Navigation | "what does this do", "show progress", "where is", "explain" | Project Assistant |
| Initialization | "initialize", "set up", "create from spec", "start new project" | Initializer |
| Development | "implement", "build", "code", "fix", "continue development" | Coding Agent |
| Backlog | "add feature", "what should I work on", "feature status" | Project Assistant |
| Research | "find", "search", "what is", "summarize" | Research Agent |
| Document | "write", "draft", "edit", "format" | Editor Agent |
| Organization | "sort", "organize", "categorize", "file" | Organizer Agent |
| Analysis | "analyze", "compare", "evaluate" | Analyst Agent |

### Routing Rules

1. **Explicit invocation wins**: If user names an agent, use that agent
2. **Keyword matching**: Use signals from the table above
3. **Ambiguous requests**: Ask user to clarify which agent to use
4. **Multi-agent tasks**: Break into subtasks, route each separately

## Git Commit Protocol

All changes to this system should follow these commit conventions:

### Commit Message Format

```
type(scope): description

- Detail 1
- Detail 2

Agent: agent-name (if applicable)
```

### Commit Types

| Type | Use For |
|------|---------|
| `feat` | New agent, new capability |
| `fix` | Bug fixes, corrections |
| `docs` | Documentation updates |
| `refactor` | Restructuring without behavior change |
| `chore` | Maintenance tasks |

### When to Commit

- After completing a discrete unit of work
- After receiving user approval on output
- Before switching agents or contexts
- At natural stopping points

## File Naming Conventions

### Agent Files

- Format: `kebab-case.md`
- Examples: `research-analyst.md`, `document-editor.md`
- Always end with `.md` extension

### Output Files

- Include date prefix: `YYYY-MM-DD-description.ext`
- Include version suffix for iterations: `-v1`, `-v2`
- Example: `2025-01-13-market-analysis-v2.docx`

### Source Files

- Keep original filenames when possible
- Add descriptive prefix if needed: `input-original-filename.ext`

## Managing This System

### Adding a New Agent

1. Create new file in `agents/` following naming convention
2. Use the standard agent template (see below)
3. Add entry to "Available Agents" table above
4. Add routing keywords to "Routing Logic" table
5. Commit with `feat(agents): add agent-name`

### Agent File Template

```markdown
# Agent Name

## Purpose
One sentence describing what this agent does.

## When to Use This Agent
- Bullet list of appropriate use cases
- Keywords that trigger this agent

## Core Behaviors
1. Numbered list of how the agent operates
2. Step-by-step workflow
3. Decision criteria

## Output Format
- Expected format of deliverables
- File naming conventions
- Quality standards

## Output Location
Where to place outputs: `output-drafts/`, `output-refined/`, or `output-final/`
```

### Editing an Agent

1. Read current agent definition fully
2. Make targeted changes
3. Update version notes if the agent tracks them
4. Commit with `fix(agents): update agent-name - description`

### Removing an Agent

1. Remove agent file from `agents/`
2. Remove entry from "Available Agents" table
3. Remove routing keywords
4. Commit with `chore(agents): remove agent-name`

## Emergency Procedures

### Agent Conflict
If two agents claim the same task:
1. Check explicit user preference first
2. Default to more specialized agent
3. Ask user to clarify if truly ambiguous

### Output Error
If agent produces incorrect output:
1. Do NOT delete - move to `output-drafts/` with `-error` suffix
2. Document what went wrong
3. Re-run with corrections
4. Keep audit trail

### System Reset
If system enters bad state:
1. Commit all current work
2. Re-read INSTRUCTIONS.md from scratch
3. Start fresh conversation if needed
