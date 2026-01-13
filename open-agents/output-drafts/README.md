# Output Drafts

This folder contains **first-pass agent outputs** that require review before use.

## Purpose

The `output-drafts/` folder is the first stage of the output pipeline:

```
source/ → agent processing → [output-drafts/] → output-refined/ → output-final/
                                    ↑
                              YOU ARE HERE
```

Files here are:
- Initial agent outputs
- Unreviewed and potentially imperfect
- Ready for human feedback
- Not approved for distribution

## What Belongs Here

| Content | Examples |
|---------|----------|
| First attempts | Initial document drafts, raw analysis |
| Unverified outputs | Research findings, generated content |
| Work in progress | Partial completions, incomplete tasks |
| Outputs needing review | Any agent-generated deliverable |

## File Naming Convention

All draft files should follow this pattern:

```
YYYY-MM-DD-description-v1.ext
```

**Examples:**
- `2025-01-13-market-analysis-v1.md`
- `2025-01-13-api-documentation-v1.md`
- `2025-01-13-quarterly-summary-v1.pdf`

**Rules:**
- Always include date prefix
- Use descriptive names (kebab-case)
- Start version at `v1`
- Use appropriate file extension

## Status Markers

Optionally add status to filenames:

| Marker | Meaning |
|--------|---------|
| `-draft` | Standard first pass |
| `-wip` | Work in progress, incomplete |
| `-error` | Has known issues to fix |
| `-review` | Ready for human review |

**Examples:**
- `2025-01-13-report-v1-draft.md`
- `2025-01-13-analysis-v1-wip.md`
- `2025-01-13-summary-v1-error.md`

## Review Process

### For Reviewers

1. **Read the draft** completely before making changes
2. **Check against requirements** from the original source/request
3. **Note feedback** in a `-feedback.md` file or inline comments
4. **Decide next step**:
   - Minor fixes → Edit and move to `output-refined/`
   - Major issues → Keep here, request agent revision
   - Acceptable → Move directly to `output-final/`

### Feedback File Format

```markdown
<!-- 2025-01-13-report-v1-feedback.md -->
# Feedback: Market Report v1

## Status: Needs Revision

## Issues Found
- [ ] Missing Q4 data comparison
- [ ] Charts need labels
- [ ] Executive summary too long

## Suggestions
- Shorten intro paragraph
- Add conclusion section
- Include competitor mention

## Action
Request revision from agent with above feedback.
```

## Promotion to Next Stage

When a draft is reviewed and improved:

```bash
# After review and edits, promote to refined
mv output-drafts/2025-01-13-report-v1.md output-refined/2025-01-13-report-v2.md
```

**Note:** Increment the version number when promoting.

## Cleanup Policy

Drafts should not accumulate indefinitely:

- **Promoted drafts**: Delete after successful promotion
- **Abandoned drafts**: Archive or delete after 30 days
- **Error drafts**: Fix and re-process, then delete

```bash
# Archive old drafts
mkdir -p output-drafts/.archive
mv output-drafts/old-file.md output-drafts/.archive/
```

## Integration with Agents

Agents automatically place outputs here:

```markdown
<!-- In agent instructions -->
Save initial output to: output-drafts/YYYY-MM-DD-description-v1.md
```

When requesting agent work:

```
Generate a summary of source/report.pdf and save to output-drafts/
```

## See Also

- [output-refined/](../output-refined/) - Next stage after review
- [output-final/](../output-final/) - Final approved deliverables
- [INSTRUCTIONS.md](../INSTRUCTIONS.md) - Full workflow documentation
