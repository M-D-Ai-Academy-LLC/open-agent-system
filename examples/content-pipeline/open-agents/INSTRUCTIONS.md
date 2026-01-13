# Content Pipeline - Agent Instructions

**Load this file at the start of every conversation.**

## Overview

This is a content creation pipeline that transforms rough notes into polished, published articles through a series of specialized agents.

## Pipeline Flow

```
Raw Notes → Note Processor → Draft Writer → Editor → Publisher
    ↓            ↓               ↓            ↓          ↓
 source/    output-notes/   output-drafts/  (review)  output-published/
```

## Agent Catalog

| Agent | File | Purpose |
|-------|------|---------|
| Note Processor | `agents/note-processor.md` | Transform raw notes into structured outlines |
| Draft Writer | `agents/draft-writer.md` | Expand outlines into full draft articles |
| Editor | `agents/editor.md` | Review and polish drafts for publication |
| Publisher | `agents/publisher.md` | Format and prepare final content |

## Slash Commands

| Command | Description |
|---------|-------------|
| `/content process [file]` | Process raw notes into structured outline |
| `/content draft [file]` | Write draft from outline |
| `/content edit [file]` | Edit and polish a draft |
| `/content publish [file]` | Prepare final version for publication |
| `/content pipeline [file]` | Run full pipeline on a source file |

## Task Type Detection

When the user requests content work, route to the appropriate agent:

| User Request Pattern | Route To |
|---------------------|----------|
| "process notes", "structure this", "outline" | Note Processor |
| "write draft", "expand this", "flesh out" | Draft Writer |
| "edit", "review", "polish", "improve" | Editor |
| "publish", "finalize", "prepare for release" | Publisher |
| "full pipeline", "process everything" | Chain all agents |

## Agent Chaining

Run the full pipeline with arrow syntax:

```
/content pipeline source/my-notes.md
```

This executes:
```
Note Processor → Draft Writer → Editor → Publisher
```

Each stage automatically passes output to the next agent.

## Output Conventions

### Naming Patterns
- Notes output: `output-notes/[name]-outline.md`
- Draft output: `output-drafts/[name]-draft.md`
- Edited output: `output-drafts/[name]-edited.md`
- Published output: `output-published/[name]-final.md`

### Metadata Headers
Each output file includes YAML frontmatter:
```yaml
---
title: Article Title
source: path/to/source.md
stage: outline|draft|edited|published
processed_at: ISO-8601 timestamp
agent: note-processor|draft-writer|editor|publisher
---
```

## Quality Gates

Before promoting content to the next stage:

1. **Notes → Draft**: Outline must have clear structure with sections
2. **Draft → Edit**: Draft must be complete (no TODO markers)
3. **Edit → Publish**: Must pass editorial checklist (grammar, clarity, flow)
4. **Publish**: Final review for formatting and consistency

## Getting Started

1. Add raw notes to `source/`
2. Run `/content process source/your-notes.md`
3. Review outline in `output-notes/`
4. Continue with `/content draft`, `/content edit`, `/content publish`

Or run the full pipeline:
```
/content pipeline source/your-notes.md
```
