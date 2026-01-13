# /content draft

Write a full draft article from a structured outline.

## Arguments

- `$ARGUMENTS` - Path to the outline file to expand

## Instructions

1. Read the Draft Writer agent definition from `open-agents/agents/draft-writer.md`
2. Follow the agent's Core Behaviors:
   - Review the outline completely
   - Establish appropriate voice and tone
   - Write full prose for each section
   - Create compelling intro and conclusion

## Usage Examples

```
/content draft output-notes/product-launch-outline.md
/content draft output-notes/quarterly-review-outline.md
```

## Expected Output

A complete draft article saved to:
`open-agents/output-drafts/[name]-draft.md`

The draft should include:
- YAML frontmatter with metadata
- Engaging introduction
- Fully developed body sections
- Strong conclusion with call-to-action
- Draft notes for editor

$ARGUMENTS
