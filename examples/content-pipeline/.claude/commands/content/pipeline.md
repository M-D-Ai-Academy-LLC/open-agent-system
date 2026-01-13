# /content pipeline

Run the full content pipeline on a source file.

## Arguments

- `$ARGUMENTS` - Path to the raw notes file to process through the entire pipeline

## Instructions

Execute all four pipeline stages in sequence:

1. **Note Processor** - Read `open-agents/agents/note-processor.md`
   - Process raw notes into structured outline
   - Output to `output-notes/[name]-outline.md`

2. **Draft Writer** - Read `open-agents/agents/draft-writer.md`
   - Expand outline into full draft
   - Output to `output-drafts/[name]-draft.md`

3. **Editor** - Read `open-agents/agents/editor.md`
   - Polish and improve the draft
   - Output to `output-drafts/[name]-edited.md`

4. **Publisher** - Read `open-agents/agents/publisher.md`
   - Prepare final publication-ready version
   - Output to `output-published/[name]-final.md`

## Usage Examples

```
/content pipeline source/product-launch.md
/content pipeline source/quarterly-review.md
```

## Expected Output

Four files created through the pipeline:
1. `output-notes/[name]-outline.md` - Structured outline
2. `output-drafts/[name]-draft.md` - Full draft article
3. `output-drafts/[name]-edited.md` - Polished draft
4. `output-published/[name]-final.md` - Publication-ready version

## Pipeline Flow

```
$ARGUMENTS
    │
    ▼
┌───────────────┐
│ Note Processor│ → output-notes/[name]-outline.md
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Draft Writer  │ → output-drafts/[name]-draft.md
└───────┬───────┘
        │
        ▼
┌───────────────┐
│    Editor     │ → output-drafts/[name]-edited.md
└───────┬───────┘
        │
        ▼
┌───────────────┐
│   Publisher   │ → output-published/[name]-final.md
└───────────────┘
```

$ARGUMENTS
