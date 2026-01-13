# /agents/chain

Execute a sequence of agents where each agent's output feeds into the next.

## Arguments

- `$ARGUMENTS` - Chain definition using arrow syntax: `agent1 [args] → agent2 [args] → agent3 [args]`

## Instructions

1. Parse the chain from `$ARGUMENTS`:
   - Split on arrow operators (`→`, `->`, `then`, `and then`)
   - Identify each agent and its arguments
   - Validate all agents exist

2. Execute the chain sequentially:
   - Run first agent with provided input
   - Pass output to next agent as input
   - Continue until chain completes or fails

3. Track chain status:
   - Log each step to `open-agents/logs/chain-YYYY-MM-DD.log`
   - Report progress after each step
   - Stop on failure and report error

4. Handle errors gracefully:
   - Report which step failed
   - Preserve partial outputs
   - Suggest recovery options

## Chain Syntax

```
# Using arrow operators
/agents/chain research "topic" → transform to HTML → publish

# Using 'then' keyword
/agents/chain research "topic" then review then publish

# With agent-specific options
/agents/chain research "AI trends" → review --deep → transform to PDF → publish to reports
```

## Usage Examples

```
# Research pipeline
/agents/chain research "market trends" → transform to HTML → publish

# Quality-gated publication
/agents/chain output-drafts/report.md → review --gate → publish

# Full content pipeline
/agents/chain source/topic.stub.md → research → review → transform to PDF → publish

# Resume interrupted chain
/agents/chain --resume chain-2025-01-13-001
```

## Common Chain Patterns

| Pattern | Chain | Use Case |
|---------|-------|----------|
| Research & Publish | `research → publish` | Quick research output |
| Verified Research | `research → review → publish` | QA-gated research |
| Content Production | `research → transform → publish` | Formatted content |
| Full Pipeline | `research → review → transform → publish` | Complete workflow |

## Expected Output

During execution:
- Progress updates for each step
- Intermediate outputs saved to appropriate folders

After completion:
- Final output at destination
- Chain log entry with full history
- Summary of all steps

## Chain Log Format

Logs are written to `open-agents/logs/chain-YYYY-MM-DD.log`:

```json
{
  "chain_id": "chain-2025-01-13-001",
  "steps": [
    {"agent": "Researcher", "status": "completed", "output": "..."},
    {"agent": "Transformer", "status": "completed", "output": "..."}
  ],
  "status": "completed"
}
```

## Error Handling

If a step fails:
1. Chain stops execution
2. Error is logged with details
3. Partial outputs are preserved
4. Recovery options are suggested

## Options

| Option | Description |
|--------|-------------|
| `--resume <id>` | Resume an interrupted chain |
| `--dry-run` | Show what would execute without running |
| `--verbose` | Show detailed progress |
| `--skip <agent>` | Skip a specific agent in chain |

## Validation

Before starting:
- All agents in chain must exist
- Input for first agent must be valid
- Chain must have at least 2 agents

After completion:
- Verify final output exists
- Check chain log for any warnings
- Confirm all steps completed successfully
