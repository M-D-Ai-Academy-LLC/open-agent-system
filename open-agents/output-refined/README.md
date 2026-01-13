# Output Refined

This folder contains **reviewed and improved outputs** that have passed initial review.

## Purpose

The `output-refined/` folder is the second stage of the output pipeline:

```
source/ → agent processing → output-drafts/ → [output-refined/] → output-final/
                                                      ↑
                                                YOU ARE HERE
```

Files here are:
- Reviewed drafts with improvements
- Quality-checked content
- Iterating toward final approval
- May require additional refinement

## What Belongs Here

| Content | Examples |
|---------|----------|
| Reviewed drafts | Drafts with feedback incorporated |
| Second iterations | v2, v3 outputs after revision |
| Near-final content | Close to approval, minor polish needed |
| Collaborative work | Multi-round improvements |

## Promotion Criteria

A file should be promoted from `output-drafts/` to here when:

- [x] Initial review is complete
- [x] Major issues have been addressed
- [x] Content meets basic quality standards
- [x] Ready for final polish or stakeholder review

## File Naming Convention

Continue the naming pattern from drafts:

```
YYYY-MM-DD-description-vN.ext
```

**Rules:**
- Keep the same date prefix (when work started)
- Increment version number (v2, v3, etc.)
- Maintain descriptive name
- Update status markers if used

**Examples:**
- `2025-01-13-market-analysis-v2.md` (promoted from v1)
- `2025-01-13-api-docs-v3.md` (third iteration)
- `2025-01-13-summary-v2-review.md` (awaiting stakeholder review)

## Version Tracking

Track what changed between versions:

```markdown
<!-- At the top of the file or in a separate changelog -->
## Version History

### v3 (2025-01-14)
- Added executive summary
- Fixed data tables
- Shortened introduction

### v2 (2025-01-13)
- Incorporated reviewer feedback
- Added missing charts
- Corrected statistics
```

## Refinement Process

### For Refiners

1. **Compare to original request** in `source/`
2. **Review feedback** from the draft stage
3. **Make improvements**:
   - Correct factual errors
   - Improve clarity and flow
   - Polish formatting
   - Address all feedback items
4. **Self-check** against quality criteria
5. **Request final review** or promote to final

### Quality Checklist

Before promoting to `output-final/`:

- [ ] All original requirements met
- [ ] Feedback items addressed
- [ ] No spelling/grammar errors
- [ ] Formatting is consistent
- [ ] Links and references work
- [ ] Appropriate for intended audience
- [ ] Ready for external distribution

## Iteration Workflow

For complex deliverables requiring multiple rounds:

```
Draft v1 → Review → Refined v2 → Review → Refined v3 → Approval → Final v3
```

**Tip:** Keep version numbers sequential. If v2 needs major rework, create v3 in `output-refined/` rather than going back to `output-drafts/`.

## Promotion to Final

When refinement is complete and approved:

```bash
# Promote to final (no version increment needed)
mv output-refined/2025-01-13-report-v3.md output-final/2025-01-13-report-v3.md

# Or rename to remove version for clean final
mv output-refined/2025-01-13-report-v3.md output-final/2025-01-13-report-final.md
```

## Cleanup Policy

- **Promoted files**: Delete refined version after promotion to final
- **Superseded versions**: Delete v1, v2 after v3 is finalized
- **Abandoned work**: Archive after 60 days

```bash
# Clean up old versions after final is approved
rm output-refined/2025-01-13-report-v1.md
rm output-refined/2025-01-13-report-v2.md
```

## Collaboration Notes

For multi-person review:

```markdown
<!-- In the file or separate review.md -->
## Review Status

| Reviewer | Status | Date |
|----------|--------|------|
| Alice | Approved | 2025-01-14 |
| Bob | Pending | - |
| Charlie | Approved with comments | 2025-01-14 |

## Outstanding Items
- [ ] Bob's review pending
- [x] Address Alice's formatting comments
- [ ] Incorporate Charlie's suggestions
```

## See Also

- [output-drafts/](../output-drafts/) - Previous stage (initial outputs)
- [output-final/](../output-final/) - Next stage (approved deliverables)
- [INSTRUCTIONS.md](../INSTRUCTIONS.md) - Full workflow documentation
