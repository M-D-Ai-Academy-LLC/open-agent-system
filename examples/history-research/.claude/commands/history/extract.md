# /history extract

Extract structured JSON data from a markdown article.

## Arguments

- `$ARGUMENTS` - Path to the markdown article to extract from

## Instructions

1. Read the Data Extractor agent definition from `open-agents/agents/data_extractor.md`
2. Follow the agent's Core Behaviors:
   - Parse the markdown structure
   - Extract timeline events, key figures, and metadata
   - Apply consistent JSON schema
   - Validate and output

## Usage Examples

```
/history extract output-articles/disney_animation-article.md
/history extract output-articles/video_games-article.md
```

## Expected Output

A JSON file saved to:
`open-agents/output-data/[topic].json`

The JSON should include:
- Metadata about the extraction
- Summary information
- Timeline array with dated events
- Key figures with biographical data
- Organizations mentioned
- Extraction statistics

$ARGUMENTS
