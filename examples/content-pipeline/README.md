# Content Pipeline - Example Open Agent System

This directory contains a complete example Open Agent System for content creation, demonstrating a multi-stage pipeline from rough notes to published articles.

## Overview

This example demonstrates:
- Linear pipeline architecture (notes → outline → draft → edited → published)
- Four specialized agents working in sequence
- Stage-specific output directories
- Quality gates between stages
- Full pipeline automation with `/content pipeline`

## Project Structure

```
examples/content-pipeline/
├── CLAUDE.md                    # Entry point for Claude Code
├── GEMINI.md                    # Entry point for Gemini CLI
├── README.md                    # This file
│
├── .claude/commands/content/
│   ├── process.md               # /content process command
│   ├── draft.md                 # /content draft command
│   ├── edit.md                  # /content edit command
│   ├── publish.md               # /content publish command
│   └── pipeline.md              # /content pipeline command
│
├── .gemini/commands/content/    # Same commands for Gemini
│
└── open-agents/
    ├── README.md                # Human-readable overview
    ├── INSTRUCTIONS.md          # Agent index and routing
    │
    ├── agents/
    │   ├── note-processor.md    # Raw notes → structured outline
    │   ├── draft-writer.md      # Outline → full draft
    │   ├── editor.md            # Draft → polished draft
    │   └── publisher.md         # Edited → publication-ready
    │
    ├── source/                  # Raw input notes
    │   ├── product-launch.md    # Example: product announcement
    │   └── quarterly-review.md  # Example: business review
    │
    ├── output-notes/            # Structured outlines
    ├── output-drafts/           # Drafts and edited versions
    └── output-published/        # Final, ready-to-publish content
```

## Pipeline Stages

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   source/   │────▶│output-notes/│────▶│output-drafts│────▶│  output-    │
│  Raw Notes  │     │  Outlines   │     │   Drafts    │     │  published/ │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
  Note Processor     Draft Writer          Editor            Publisher
```

## Available Commands

| Command | Description |
|---------|-------------|
| `/content process [file]` | Process raw notes into structured outline |
| `/content draft [file]` | Expand outline into full draft article |
| `/content edit [file]` | Review and polish draft |
| `/content publish [file]` | Prepare final publication-ready version |
| `/content pipeline [file]` | Run all stages automatically |

## Workflow Example

### 1. Start with Raw Notes

Create or use existing notes in `source/`:

```markdown
# Product Launch Notes

- new features coming
- dark mode (users requested)
- pdf export
- integrations with slack, quickbooks
- price: $29/month (competitors $50+)
- target: small business
- launch: next month
```

### 2. Process into Outline

```
/content process source/product-launch.md
```

Output: `output-notes/product-launch-outline.md`

### 3. Write the Draft

```
/content draft output-notes/product-launch-outline.md
```

Output: `output-drafts/product-launch-draft.md`

### 4. Edit and Polish

```
/content edit output-drafts/product-launch-draft.md
```

Output: `output-drafts/product-launch-edited.md`

### 5. Publish

```
/content publish output-drafts/product-launch-edited.md
```

Output: `output-published/product-launch-final.md`

### Or: Run Full Pipeline

```
/content pipeline source/product-launch.md
```

Runs all four stages automatically, outputting the final version.

## Agent Descriptions

### Note Processor
Transforms raw, unstructured notes into well-organized outlines. Identifies themes, creates logical sections, and prepares content for writing.

### Draft Writer
Expands outlines into full prose. Writes engaging introductions, develops body sections, creates conclusions, and maintains consistent tone throughout.

### Editor
Reviews drafts for grammar, clarity, flow, and style. Strengthens weak language, removes redundancy, improves structure, and ensures publication quality.

### Publisher
Prepares final content for distribution. Adds metadata, creates social snippets, generates excerpts, and packages content for various platforms.

## Using This Example

### With Claude Code

1. Open this directory in your editor
2. Start Claude Code
3. Claude will read CLAUDE.md and load INSTRUCTIONS.md
4. Use `/content` commands or natural language

### With Gemini CLI

1. Navigate to this directory
2. Run Gemini CLI
3. Gemini will read GEMINI.md and load INSTRUCTIONS.md
4. Use `/content` commands or natural language

## Customization

### Adjust Pipeline Stages

Modify `INSTRUCTIONS.md` to:
- Add intermediate review stages
- Skip stages for certain content types
- Add parallel processing branches

### Add Content Types

Create specialized agents for:
- Blog posts vs. documentation
- Marketing vs. technical content
- Long-form vs. short-form

### Integrate with External Tools

Extend publisher agent to:
- Post directly to CMS
- Schedule social media
- Generate email campaigns

## Quality Gates

Content moves between stages only when:

1. **Notes → Outline**: Notes contain enough material for meaningful structure
2. **Outline → Draft**: Outline has clear sections and logical flow
3. **Draft → Edited**: Draft is complete with no TODO markers
4. **Edited → Published**: Passes editorial checklist (grammar, clarity, accuracy)

## Related

- [OpenAgentDefinition.md](../../OpenAgentDefinition.md) - Full specification
- [History Research Example](../history-research/) - Research-focused pipeline
- [open-agents/](../../open-agents/) - Main system agents
