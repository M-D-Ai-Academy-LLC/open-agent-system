# Open Agent System: History Research

This folder contains an Open Agent System for researching historical topics and transforming them into multiple output formats.

## Agents

- **Researcher** - Creates comprehensive markdown articles from historical topics
- **HTML Generator** - Transforms articles into themed webpages
- **Data Extractor** - Extracts structured JSON from articles

## Getting Started

1. Add a stub file to `source/` with your topic
2. Ask the Researcher to expand it: "Research the history of [topic]"
3. Transform to HTML: "Create HTML from [filename]"
4. Extract data: "Extract data from [filename]"

## Example Workflow

```bash
# Start with a stub file
cat > source/topic.md << 'EOF'
# The History of [Topic]

> Brief description of the topic.

<!-- Stub file. Ask the Researcher to expand this. -->
EOF

# Research the topic
/history research [topic]

# Create HTML version
/history html [filename]

# Extract structured data
/history extract [filename]
```

## Output Locations

| Format | Location |
|--------|----------|
| Markdown articles | `output-articles/` |
| HTML pages | `output-html/` |
| JSON data | `output-data/` |

## Full Documentation

See `INSTRUCTIONS.md` for complete agent definitions and routing logic.
