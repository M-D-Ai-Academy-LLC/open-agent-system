# /content publish

Prepare edited content for final publication.

## Arguments

- `$ARGUMENTS` - Path to the edited file to publish

## Instructions

1. Read the Publisher agent definition from `open-agents/agents/publisher.md`
2. Follow the agent's Core Behaviors:
   - Verify content readiness
   - Apply final formatting
   - Create publication assets
   - Final quality check
   - Package for distribution

## Usage Examples

```
/content publish output-drafts/product-launch-edited.md
/content publish output-drafts/quarterly-review-edited.md
```

## Expected Output

A publication-ready article saved to:
`open-agents/output-published/[name]-final.md`

The published version should include:
- Complete metadata (word count, reading time, date)
- Final, polished content
- Excerpt for previews
- Social media snippets
- SEO metadata
- Pull quotes
- Image suggestions

$ARGUMENTS
