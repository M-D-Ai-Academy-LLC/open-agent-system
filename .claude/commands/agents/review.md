# /agents/review

Review content, documents, or code and provide structured feedback.

## Arguments

- `$ARGUMENTS` - File path to review and optional review level, e.g., "output-drafts/report.md" or "src/api.ts --deep"

## Instructions

1. Read the Reviewer agent definition from `open-agents/agents/reviewer.md`
2. Follow the agent's Core Behaviors:
   - Locate original requirements if reviewing an output
   - Evaluate against all relevant quality criteria
   - Identify strengths and issues
   - Provide actionable feedback
   - Recommend next steps

## Argument Formats

```
# Standard review
/agents/review output-drafts/market-analysis.md

# Quick review
/agents/review output-drafts/summary.md --quick

# Deep review
/agents/review src/api/users.ts --deep

# Pre-publication gate review
/agents/review output-refined/report-v3.md --gate
```

## Usage Examples

```
/agents/review output-drafts/research-v1.md           # Standard review
/agents/review src/components/Button.tsx              # Code review
/agents/review output-refined/report.md --deep        # Deep review
/agents/review output-refined/newsletter.md --gate    # Publication gate
```

## Expected Output

After running this command, you should have:
- Review report at `[original-path]-review.md`
- Clear recommendation (Approve/Revise/Reject)
- Prioritized list of issues
- Actionable suggestions

## Review Levels

| Level | Flag | Time | Depth |
|-------|------|------|-------|
| Quick | `--quick` | ~5 min | Basic checks only |
| Standard | (default) | ~15-30 min | Full quality criteria |
| Deep | `--deep` | ~1-2 hr | Technical + strategic |
| Gate | `--gate` | ~30 min | Publication checklist |

## Review Output

Standard review includes:
- Overall recommendation with scores
- Strengths and issues
- Comparison to requirements
- Specific suggestions
- Clear next steps

## Validation

After review:
- Check that all major issues are addressed before promotion
- Use review report to guide revisions
- Re-review after significant changes
