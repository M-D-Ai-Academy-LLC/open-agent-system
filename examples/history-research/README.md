# History Research - Example Open Agent System

This directory contains a complete example Open Agent System for researching historical topics and producing multiple output formats.

## Overview

This example demonstrates:
- Complete folder structure for an Open Agent System
- Three specialized agents (Researcher, HTML Generator, Data Extractor)
- Domain-specific slash commands (`/history`)
- Multi-tool compatibility (Claude Code, Gemini CLI)
- Full workflow from stub to published outputs

## Project Structure

```
examples/history-research/
├── CLAUDE.md                    # Entry point for Claude Code
├── GEMINI.md                    # Entry point for Gemini CLI
├── README.md                    # This file
│
├── .claude/commands/
│   └── history/
│       ├── research.md          # /history research command
│       ├── html.md              # /history html command
│       └── extract.md           # /history extract command
│
├── .gemini/commands/
│   └── history/                 # Same commands for Gemini
│
└── open-agents/
    ├── README.md                # Human-readable overview
    ├── INSTRUCTIONS.md          # Agent index and routing
    │
    ├── agents/
    │   ├── researcher.md        # Research agent definition
    │   ├── html_generator.md    # HTML generation agent
    │   └── data_extractor.md    # Data extraction agent
    │
    ├── source/
    │   ├── disney_animation.md  # Stub file
    │   ├── video_games.md       # Stub file
    │   └── manga_origins.md     # Stub file
    │
    ├── output-articles/         # Markdown articles
    ├── output-html/             # HTML pages
    └── output-data/             # JSON data files
```

## Available Commands

| Command | Description |
|---------|-------------|
| `/history research [topic]` | Research a topic and create article |
| `/history html [file]` | Generate HTML from article |
| `/history extract [file]` | Extract structured JSON |

## Workflow Example

### 1. Start with a Stub

Check existing stubs or create one:

```markdown
# The History of [Your Topic]

> Brief description.

## Key Questions
- Question 1?
- Question 2?

<!-- Stub file. Ask the Researcher to expand this. -->
```

### 2. Research the Topic

```
/history research Disney animation
```

Output: `open-agents/output-articles/disney_animation-article.md`

### 3. Create HTML Version

```
/history html output-articles/disney_animation-article.md
```

Output: `open-agents/output-html/disney_animation.html`

### 4. Extract Structured Data

```
/history extract output-articles/disney_animation-article.md
```

Output: `open-agents/output-data/disney_animation.json`

## Agent Descriptions

### Researcher
Creates comprehensive markdown articles from historical topics. Includes timelines, key figures, and cited sources.

### HTML Generator
Transforms markdown articles into themed HTML pages with era-appropriate styling, responsive layout, and accessibility features.

### Data Extractor
Extracts structured JSON data including timelines, key figures, and metadata for use in applications or databases.

## Using This Example

### With Claude Code

1. Open this directory in your editor
2. Start Claude Code
3. Claude will read CLAUDE.md and load INSTRUCTIONS.md
4. Use `/history` commands or natural language

### With Gemini CLI

1. Navigate to this directory
2. Run Gemini CLI
3. Gemini will read GEMINI.md and load INSTRUCTIONS.md
4. Use `/history` commands or natural language

## Customization

### Add New Agents

1. Create new file in `open-agents/agents/`
2. Add to routing table in `INSTRUCTIONS.md`
3. Create command file in `.claude/commands/history/`
4. Copy command to `.gemini/commands/history/`

### Add New Stub Topics

1. Create new `.md` file in `open-agents/source/`
2. Follow the stub template format
3. Research using `/history research source/your_topic.md`

## Related

- [OpenAgentDefinition.md](../../OpenAgentDefinition.md) - Full specification
- [open-agents/](../../open-agents/) - Main system agents
