# Open Agent System: Content Pipeline

A complete content creation pipeline that transforms rough notes into published articles.

## Pipeline Stages

```
Raw Notes → Structured Notes → Draft → Edited → Published
    ↓            ↓                ↓        ↓         ↓
 source/    output-notes/   output-drafts/ (review) output-published/
```

## Agents

- **Note Processor** - Transforms raw notes into structured outlines
- **Draft Writer** - Expands outlines into full draft articles
- **Editor** - Reviews and polishes drafts for publication
- **Publisher** - Formats and prepares final content for distribution

## Getting Started

1. Add raw notes to `source/`
2. Process notes: `/content process source/my-notes.md`
3. Write draft: `/content draft output-notes/my-notes-outline.md`
4. Edit: `/content edit output-drafts/my-notes-draft.md`
5. Publish: `/content publish output-drafts/my-notes-edited.md`

## Quick Commands

```bash
# Full pipeline
/content pipeline source/my-notes.md

# Individual steps
/content process source/notes.md
/content draft output-notes/outline.md
/content edit output-drafts/draft.md
/content publish output-drafts/edited.md
```

## Full Documentation

See `INSTRUCTIONS.md` for complete agent definitions and workflow details.
