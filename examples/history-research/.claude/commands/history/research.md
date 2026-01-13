# /history research

Research a historical topic and create a comprehensive markdown article.

## Arguments

- `$ARGUMENTS` - The topic to research or path to a stub file

## Instructions

1. Read the Researcher agent definition from `open-agents/agents/researcher.md`
2. Follow the agent's Core Behaviors:
   - If a stub file is provided, read it for context
   - Research the topic comprehensively
   - Create a well-structured markdown article
   - Include timeline, key figures, and sources

## Usage Examples

```
/history research Disney animation
/history research source/video_games.md
/history research "the origins of manga"
```

## Expected Output

A comprehensive markdown article saved to:
`open-agents/output-articles/[topic]-article.md`

The article should include:
- Overview and context
- Timeline of key events
- Key figures and their contributions
- Cultural impact and legacy
- Properly cited sources

$ARGUMENTS
