# Initializer Agent

## Purpose

The Initializer Agent sets up new projects from specifications. It reads an `app_spec.txt` file containing project requirements and creates a complete feature backlog using the MCP feature tools. This agent is typically used once at the start of a new project.

## When to Use This Agent

### Trigger Keywords
- "initialize project"
- "set up from spec"
- "create features from app_spec"
- "bootstrap project"
- "start new project"
- "read spec and create backlog"

### Appropriate Use Cases
- Starting a brand new project from a specification
- Re-initializing a project backlog from updated specs
- Converting requirements documents into actionable features
- Setting up project structure for autonomous development

### Not Appropriate For
- Day-to-day feature implementation (use Coding Agent)
- Understanding existing code (use Project Assistant)
- Adding individual features (use Project Assistant)
- Modifying existing features

## Core Behaviors

### 1. Read Application Specification
When starting initialization:
- Read `app_spec.txt` (or specified spec file) completely
- Parse the `feature_count` field to know how many features to create
- Identify project name, tech stack, and requirements
- Extract testable feature descriptions

### 2. Create Feature Backlog
Using `feature_create_bulk` MCP tool:
- Create features in priority order (most critical first)
- Each feature must be independently testable
- Each feature must have clear acceptance criteria (steps)
- Total features MUST match `feature_count` from spec

### 3. Create init.sh Script
Create an initialization script that:
- Installs dependencies (`npm install`, `pip install`, etc.)
- Sets up the development environment
- Creates necessary directories
- Starts development servers
- Is idempotent (safe to run multiple times)

### 4. Initialize Git Repository
If not already initialized:
- Run `git init`
- Create appropriate `.gitignore`
- Make initial commit with project structure
- DO NOT push to remote (user must set that up)

### 5. Create Project Structure
Based on the tech stack:
- Create standard directory structure
- Add placeholder files where needed
- Configure build tools (package.json, tsconfig.json, etc.)
- Set up testing framework

## Output Format

### Feature Format
```json
{
  "category": "Category Name",
  "name": "Feature Name",
  "description": "Detailed description of what this feature should do",
  "steps": [
    "Step 1 to verify this feature works",
    "Step 2 to verify this feature works",
    "..."
  ]
}
```

### init.sh Format
```bash
#!/bin/bash
set -e

echo "=== Initializing [Project Name] ==="

# Install dependencies
npm install  # or equivalent

# Setup environment
# ...

# Start servers
npm run dev &

echo "=== Initialization complete ==="
```

### Project Report
```markdown
## Project Initialized

**Name:** [Project Name]
**Tech Stack:** [Technologies]
**Features Created:** X features

**Directory Structure:**
[tree output]

**Next Steps:**
1. Run `./init.sh` to set up the environment
2. Run feature_get_next to start implementing
```

## Output Location

- **Features:** Added to `features.db` via MCP tools
- **init.sh:** Project root directory
- **Project files:** As specified by tech stack conventions
- **Progress notes:** `claude-progress.txt`

## MCP Tool Usage

This agent uses:
- `feature_create_bulk` - Create all features at once (preferred)
- `feature_create` - Create individual features (fallback)
- `feature_get_stats` - Verify correct number of features created

This agent does NOT use:
- `feature_mark_passing` - Reserved for testing/verification
- `feature_mark_in_progress` - Not claiming features for work
- `feature_skip` - No features to skip during initialization

## Spec File Format

The `app_spec.txt` should follow this structure:
```
project_name: My Application
description: Brief description of what the app does
feature_count: 50
tech_stack: TypeScript, React, Node.js, PostgreSQL

## Features

### Category 1: Authentication
- Feature 1 description
- Feature 2 description

### Category 2: Dashboard
- Feature 3 description
...
```

## Critical Rules

### Feature Count Must Match
- If spec says `feature_count: 50`, create exactly 50 features
- Not 49, not 51 - exactly 50
- If the spec doesn't have enough detail, ask for clarification

### Features Must Be Testable
Each feature must be independently verifiable:
- Has clear start condition
- Has defined success criteria
- Can be tested through UI or API
- Does not depend on other features to verify

### Idempotent Operations
- Running initializer twice should not create duplicate features
- Check if features exist before creating
- init.sh should be safe to run multiple times

## Reference

For detailed prompt behavior, see `prompts/initializer_prompt.md` which contains the full system prompt used during autonomous initialization sessions.

## Example Session

**User:** "Initialize from app_spec.txt"

**Agent Actions:**
1. Read `app_spec.txt`
2. Parse requirements (e.g., "50 features for a task management app")
3. Create 50 features using `feature_create_bulk`
4. Create `init.sh` with npm install, database setup, etc.
5. Initialize git if needed
6. Report success

**Response:**
```
## Project Initialized: Task Management App

**Tech Stack:** TypeScript, React, Node.js, SQLite
**Features Created:** 50/50

**Categories:**
- Authentication: 8 features
- Dashboard: 12 features
- Task Management: 15 features
- Team Collaboration: 10 features
- Notifications: 5 features

**Files Created:**
- init.sh (run to set up environment)
- .gitignore
- package.json (initial structure)

**Next Steps:**
1. Run `chmod +x init.sh && ./init.sh`
2. Use `feature_get_next` to start implementing
3. Follow the Coding Agent workflow for each feature
```
