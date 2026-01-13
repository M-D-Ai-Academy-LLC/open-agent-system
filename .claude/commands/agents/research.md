# /agents/research

Conduct research on a topic and produce a comprehensive markdown article.

## Arguments

- `$ARGUMENTS` - The research topic or path to a stub/request file in `source/`

## Instructions

1. Read the Researcher agent definition from `open-agents/agents/researcher.md`
2. Follow the agent's Core Behaviors:
   - If `$ARGUMENTS` is a file path (ends in `.stub.md` or `.request.md`), process that file
   - Otherwise, treat `$ARGUMENTS` as a research topic
   - Gather information from web sources and any relevant files in `source/`
   - Synthesize into a well-structured markdown article
   - Include citations for all sources

## Usage Examples

```
/agents/research AI code assistants                    # Research a topic
/agents/research source/market-analysis.stub.md       # Process a stub file
/agents/research "REST vs GraphQL comparison"         # Topic with spaces
```

## Expected Output

After running this command, you should have:
- Research article saved to `output-drafts/YYYY-MM-DD-[topic]-research-v1.md`
- All sources cited with URLs or file paths
- Executive summary, key findings, and detailed analysis

## Output Format

The output will follow the standard research article format:
- Executive Summary
- Key Findings
- Detailed Analysis
- Comparison Table (if applicable)
- Conclusions
- Sources list

## Validation

After research is complete:
- Verify all claims have citations
- Check that sources are credible and recent
- Ensure the output matches the requested format
