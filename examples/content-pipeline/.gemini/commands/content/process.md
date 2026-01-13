# /content process

Process raw notes into a structured outline.

## Arguments

- `$ARGUMENTS` - Path to the raw notes file to process

## Instructions

1. Read the Note Processor agent definition from `open-agents/agents/note-processor.md`
2. Follow the agent's Core Behaviors:
   - Analyze the input notes completely
   - Identify main themes and structure
   - Create a well-organized outline
   - Add metadata and processing notes

## Usage Examples

```
/content process source/product-launch.md
/content process source/quarterly-review.md
```

## Expected Output

A structured outline saved to:
`open-agents/output-notes/[name]-outline.md`

The outline should include:
- YAML frontmatter with metadata
- Clear title and overview
- Organized sections with bullet points
- Processing notes and suggestions

$ARGUMENTS
