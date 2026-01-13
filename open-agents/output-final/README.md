# Output Final

This folder contains **approved deliverables** ready for use and distribution.

## Purpose

The `output-final/` folder is the last stage of the output pipeline:

```
source/ → agent processing → output-drafts/ → output-refined/ → [output-final/]
                                                                       ↑
                                                                 YOU ARE HERE
```

Files here are:
- Fully reviewed and approved
- Quality-checked and polished
- Ready for external distribution
- The definitive version of each deliverable

## What Belongs Here

| Content | Examples |
|---------|----------|
| Approved deliverables | Finalized reports, documents |
| Published content | Blog posts, articles ready to post |
| Signed-off artifacts | Reviewed and approved by stakeholders |
| Production-ready outputs | Code docs, user guides, specs |

## Approval Criteria

A file should only be promoted here when:

- [x] All refinement iterations complete
- [x] All review feedback addressed
- [x] Quality checklist passed
- [x] Stakeholder approval received (if required)
- [x] Ready for intended use/distribution

## File Naming Convention

Final outputs use clean, professional names:

```
YYYY-MM-DD-description.ext
```

**Options:**
- Keep version: `2025-01-13-market-analysis-v3.md`
- Use "final": `2025-01-13-market-analysis-final.md`
- Clean name: `2025-01-13-market-analysis.md`

**Examples:**
- `2025-01-13-q1-sales-report.pdf`
- `2025-01-13-api-documentation.md`
- `2025-01-13-product-roadmap-final.pptx`

## Organization

For multiple deliverables, use subdirectories:

```
output-final/
├── reports/
│   ├── 2025-01-quarterly-report.pdf
│   └── 2025-01-competitor-analysis.md
├── documentation/
│   ├── api-reference.md
│   └── user-guide.pdf
└── content/
    ├── blog-post-ai-trends.md
    └── newsletter-january.html
```

## Immutability

**Files in `output-final/` should not be edited.**

If changes are needed:
1. Copy back to `output-refined/`
2. Make changes there
3. Increment version
4. Re-approve
5. Promote new version to `output-final/`
6. Archive or delete old version

## Metadata (Optional)

For tracking, include a metadata header:

```markdown
---
title: Q1 2025 Market Analysis
version: 3.0
approved_by: Jane Smith
approved_date: 2025-01-15
source_request: source/market-analysis.request.md
---

# Q1 2025 Market Analysis

[Content here...]
```

## Distribution Checklist

Before distributing finalized content:

- [ ] Verify this is the correct version
- [ ] Check all links and references work
- [ ] Confirm no confidential data if sharing externally
- [ ] Note the distribution in a log (if required)

## Archive Policy

Finals are kept longer than drafts/refined:

- **Active deliverables**: Keep indefinitely
- **Superseded versions**: Archive to `.archive/` after replacement
- **Outdated content**: Review annually, archive if obsolete

```bash
# Archive superseded version
mkdir -p output-final/.archive
mv output-final/2024-q4-report.pdf output-final/.archive/
```

## Audit Trail

For compliance or record-keeping, maintain an index:

```markdown
<!-- output-final/INDEX.md -->
# Final Deliverables Index

| Date | File | Version | Approved By | Notes |
|------|------|---------|-------------|-------|
| 2025-01-15 | q1-report.pdf | 3.0 | J. Smith | Quarterly board report |
| 2025-01-10 | api-docs.md | 2.0 | T. Developer | Public API documentation |
```

## Recovery

If a final file is accidentally modified:

1. Check git history: `git log -- output-final/filename.ext`
2. Restore: `git checkout <commit> -- output-final/filename.ext`
3. Or restore from the approved `output-refined/` version

## See Also

- [output-drafts/](../output-drafts/) - First stage (initial outputs)
- [output-refined/](../output-refined/) - Second stage (reviewed outputs)
- [INSTRUCTIONS.md](../INSTRUCTIONS.md) - Full workflow documentation
