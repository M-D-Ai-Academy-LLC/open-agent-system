# /content edit

Edit and polish a draft article for publication.

## Arguments

- `$ARGUMENTS` - Path to the draft file to edit

## Instructions

1. Read the Editor agent definition from `open-agents/agents/editor.md`
2. Follow the agent's Core Behaviors:
   - Read the entire draft first
   - Review structure and flow
   - Perform line editing for clarity
   - Enhance quality and specificity
   - Apply final polish

## Usage Examples

```
/content edit output-drafts/product-launch-draft.md
/content edit output-drafts/quarterly-review-draft.md
```

## Expected Output

A polished, edited article saved to:
`open-agents/output-drafts/[name]-edited.md`

The edited version should include:
- YAML frontmatter with edit summary
- Improved clarity and flow
- Fixed grammar and style issues
- Editorial notes for any remaining concerns
- Summary of changes made

$ARGUMENTS
