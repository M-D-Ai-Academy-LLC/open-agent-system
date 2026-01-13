# /agents/list

List all available agents in this Open Agent System.

## Instructions

1. Read the file `open-agents/INSTRUCTIONS.md`
2. Find the "Available Agent Catalog" section
3. Display the agent table to the user in a clear, formatted way
4. Include for each agent:
   - Agent name
   - File location
   - Brief description
   - Trigger keywords/phrases

## Output Format

```
## Available Agents

| Agent | Description | Triggers |
|-------|-------------|----------|
| [Name] | [Description] | [Triggers] |
...

To invoke an agent, either:
- Use trigger keywords in your message
- Use /agents/invoke [agent-name]

For detailed information about an agent, use /agents/describe [agent-name]
```

## Example Response

```
## Available Agents

| Agent | Description | Triggers |
|-------|-------------|----------|
| Project Assistant | Codebase navigation, feature management | "show progress", "add feature" |
| Initializer | Project setup from specs | "initialize project" |
| Coding | Feature implementation | "implement feature" |

To invoke an agent, either:
- Use trigger keywords in your message
- Use /agents/invoke [agent-name]

For detailed information about an agent, use /agents/describe [agent-name]
```
