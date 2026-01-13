# /agents/transform

Transform content between different formats (markdown to HTML, JSON to CSV, etc.).

## Arguments

- `$ARGUMENTS` - Source file path and target format, e.g., "source/readme.md to HTML"

## Instructions

1. Read the Transformer agent definition from `open-agents/agents/transformer.md`
2. Follow the agent's Core Behaviors:
   - Parse the source file and target format from arguments
   - Detect and validate the source format
   - Perform the transformation
   - Preserve structure and data integrity
   - Output to appropriate location with transformation report

## Argument Formats

```
# Single file with target format
/agents/transform source/readme.md to HTML
/agents/transform source/data.json to CSV
/agents/transform config.yaml to JSON

# With options
/agents/transform source/doc.md to HTML --include-toc
/agents/transform source/users.json to CSV --flatten-nested

# Batch conversion
/agents/transform source/docs/*.md to HTML
```

## Usage Examples

```
/agents/transform source/readme.md to HTML           # Markdown to HTML
/agents/transform source/data.json to CSV            # JSON to CSV
/agents/transform source/config.yaml to JSON         # YAML to JSON
/agents/transform source/api-spec.json to Markdown   # JSON to docs
```

## Expected Output

After running this command, you should have:
- Transformed file in `output-drafts/YYYY-MM-DD-[name].[ext]`
- Transformation report showing what was converted
- Any warnings about data loss or conversion issues

## Supported Conversions

### Documents
- Markdown ↔ HTML
- Markdown → Plain Text
- RST → Markdown

### Data
- JSON ↔ CSV
- JSON ↔ YAML
- XML ↔ JSON

### Config
- .env ↔ JSON
- TOML ↔ JSON
- INI → JSON

## Validation

After transformation:
- Check that output file exists and is valid
- Review transformation report for any warnings
- Verify data integrity if converting data formats
