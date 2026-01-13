# /agents/publish

Publish approved content from output-final/ to designated targets.

## Arguments

- `$ARGUMENTS` - File or directory to publish and optional target, e.g., "output-final/report.pdf to reports"

## Instructions

1. Read the Publisher agent definition from `open-agents/agents/publisher.md`
2. Follow the agent's Core Behaviors:
   - Validate content is in `output-final/` (approved status)
   - Prepare content for the target platform
   - Execute publication to designated location
   - Create publication record and verify success

## Argument Formats

```
# Publish single file to default location
/agents/publish output-final/report.pdf

# Publish to specific target
/agents/publish output-final/report.pdf to reports
/agents/publish output-final/newsletter.md to archive

# Create export package
/agents/publish output-final/client-project/ as package

# Batch publish
/agents/publish output-final/*.pdf to reports
```

## Usage Examples

```
/agents/publish output-final/quarterly-report.pdf            # Default target
/agents/publish output-final/report.pdf to /shared/reports/  # Specific path
/agents/publish output-final/delivery/ as package            # Create ZIP
/agents/publish output-final/newsletter.md to archive        # Archive copy
```

## Expected Output

After running this command, you should have:
- Content deployed to target location
- Publication record in `open-agents/records/`
- Publication log entry
- Verification that content is accessible

## Publication Targets

### Built-in Targets
- `reports` - Company reports directory
- `archive` - Dated archive folder
- `exports` - Export packages directory

### Custom Targets
Configure in `open-agents/config/publish-targets.json`

## Validation

Before publishing:
- [ ] Content is in `output-final/` (approved)
- [ ] No sensitive data for public targets
- [ ] Target location is correct

After publishing:
- [ ] File exists at target
- [ ] Checksum verified (if applicable)
- [ ] Publication logged
