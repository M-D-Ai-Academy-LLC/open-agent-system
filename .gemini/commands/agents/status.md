# /agents/status

Show feature completion status and overall project progress.

## Instructions

1. Call the `feature_get_stats` MCP tool to get current counts
2. Display the results in a clear format:

   ```
   ## Feature Progress

   **Status:** X/Y passing (Z%)

   - Passing: X features
   - In Progress: N features
   - Pending: M features
   ```

3. If there are in-progress features, list them
4. Optionally show the next feature in queue

## Usage

```
/agents/status              # Show current feature status
```

## Example Output

```
## Feature Progress

**Status:** 14/50 passing (28%)

- Passing: 14 features
- In Progress: 1 feature
- Pending: 35 features

**Currently In Progress:**
- Feature #15: Create /agents/status command

**Next Up:**
- Feature #16: Create /agents/skip command
```

## Related Commands

- `/agents/list` - List all available agents
- `/agents/code` - Start implementing the next feature
- `/agents/init` - Initialize a new project
