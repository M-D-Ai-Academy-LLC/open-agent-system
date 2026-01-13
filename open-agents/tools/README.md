# Open Agent Tools

This directory contains custom tools (scripts and utilities) that agents can use to perform tasks. Tools extend agent capabilities beyond basic file operations and LLM interactions.

## Overview

Tools are executable scripts that agents can invoke to:
- Automate repetitive tasks
- Integrate with external services
- Process data in ways LLMs cannot
- Perform system operations safely

## Tool Types

### 1. Shell Scripts (`.sh`)
Simple bash scripts for command-line operations.

```bash
# Example: tools/git-summary.sh
#!/bin/bash
git log --oneline -10
git status --short
```

### 2. Python Scripts (`.py`)
More complex tools with logic and API integrations.

```python
# Example: tools/fetch_url.py
#!/usr/bin/env python3
import sys
import requests

url = sys.argv[1] if len(sys.argv) > 1 else ""
response = requests.get(url)
print(response.text)
```

### 3. Node.js Scripts (`.mjs`)
TypeScript/JavaScript tools for web-related tasks.

```javascript
// Example: tools/parse_json.mjs
#!/usr/bin/env node
import { readFileSync } from 'fs';

const file = process.argv[2];
const data = JSON.parse(readFileSync(file, 'utf-8'));
console.log(JSON.stringify(data, null, 2));
```

## Naming Conventions

| Convention | Example | Description |
|------------|---------|-------------|
| `verb-noun` | `fetch-url.py` | Action-oriented names |
| `lowercase` | `parse-json.mjs` | Always lowercase |
| `hyphen-separated` | `git-summary.sh` | Use hyphens, not underscores |
| `descriptive` | `convert-markdown-to-html.py` | Clear purpose |

## Creating a Tool

### Step 1: Create the Script

```bash
# Create a new shell tool
cat > tools/my-tool.sh << 'EOF'
#!/bin/bash
# Description: Brief description of what this tool does
# Usage: ./my-tool.sh [arg1] [arg2]

echo "Running my-tool with args: $@"
EOF
chmod +x tools/my-tool.sh
```

### Step 2: Add Documentation Header

Every tool should have a documentation header:

```bash
#!/bin/bash
# =============================================================================
# Tool: my-tool
# Description: Brief description of what this tool does
# Author: Agent name or "system"
# Created: YYYY-MM-DD
#
# Usage:
#   ./my-tool.sh <required_arg> [optional_arg]
#
# Arguments:
#   required_arg  - Description of required argument
#   optional_arg  - Description of optional argument (default: "value")
#
# Examples:
#   ./my-tool.sh input.txt
#   ./my-tool.sh input.txt output.json
#
# Exit Codes:
#   0 - Success
#   1 - Invalid arguments
#   2 - File not found
# =============================================================================
```

### Step 3: Make Executable

```bash
chmod +x tools/my-tool.sh
```

## Tool Guidelines

### Security

- **Never hardcode credentials** - Use environment variables
- **Validate inputs** - Check arguments before using
- **Limit scope** - Tools should do one thing well
- **Avoid destructive operations** - Or require confirmation

### Error Handling

```bash
#!/bin/bash
set -e  # Exit on error
set -u  # Error on undefined variables

if [ $# -lt 1 ]; then
    echo "Error: Missing required argument" >&2
    exit 1
fi
```

### Output Formats

For agent consumption, prefer structured output:

```bash
# JSON output (preferred for complex data)
echo '{"status": "success", "count": 42}'

# Simple text for single values
echo "42"

# Tab-separated for tables
echo -e "name\tvalue\nfoo\t42"
```

## Standard Tools

The following tools are recommended for any Open Agent System:

| Tool | Purpose | Language |
|------|---------|----------|
| `fetch-url.py` | Fetch and parse web pages | Python |
| `search-files.sh` | Search file contents | Bash |
| `git-summary.sh` | Git repository summary | Bash |
| `json-query.mjs` | Query JSON with jq-like syntax | Node.js |
| `convert-format.py` | Convert between formats | Python |

## Integration with Agents

Agents can invoke tools using the run_command capability:

```markdown
<!-- In agent instructions -->
When you need to fetch a URL, use the fetch-url tool:
```bash
./tools/fetch-url.py "https://example.com"
```
```

## Environment Variables

Tools can access these standard environment variables:

| Variable | Description |
|----------|-------------|
| `OPEN_AGENT_ROOT` | Root directory of the agent system |
| `OPEN_AGENT_WORKSPACE` | Current working directory |
| `OPEN_AGENT_OUTPUT` | Default output directory |
| `OPEN_AGENT_DEBUG` | Enable debug output (0/1) |

## Testing Tools

Always test tools before use:

```bash
# Test with example input
./tools/my-tool.sh test-input.txt

# Test error handling
./tools/my-tool.sh  # Should show usage

# Test with edge cases
./tools/my-tool.sh ""  # Empty input
```

## Tool Registry

For tools to be discoverable by agents, register them in `tools/registry.json`:

```json
{
  "tools": [
    {
      "name": "fetch-url",
      "script": "fetch-url.py",
      "description": "Fetch content from a URL",
      "args": [
        { "name": "url", "required": true, "description": "URL to fetch" }
      ]
    }
  ]
}
```

## License

Tools in this directory follow the same license as the parent project unless otherwise specified in the tool's header.
