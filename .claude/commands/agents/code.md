# /agents/code

Start a coding session to implement the next feature from the backlog.

## Instructions

1. Read the Coding agent definition from `open-agents/agents/coding.md`
2. Follow the agent's Core Behaviors:

   **Step 1: Get Bearings**
   ```bash
   pwd
   ls -la
   cat app_spec.txt
   tail -500 claude-progress.txt
   git log --oneline -20
   ```
   Then: `feature_get_stats` and `feature_get_next`

   **Step 2: Claim Feature**
   - Call `feature_mark_in_progress` immediately after `feature_get_next`

   **Step 3: Implement**
   - Build the feature completely
   - Follow existing code patterns
   - Add proper error handling

   **Step 4: Verify**
   - Test through actual UI (browser automation) or API
   - Create unique test data
   - Check for console errors
   - Only proceed if verification passes

   **Step 5: Mark Passing**
   - Call `feature_mark_passing` after verification succeeds

   **Step 6: Commit and Document**
   - Git commit with feature details
   - Update `claude-progress.txt`

## Workflow

```
/agents/code
  ↓
Get Bearings → Claim Feature → Implement → Verify → Mark Passing → Commit
  ↓
Repeat until session ends
```

## Important Rules

- **Never skip** because functionality isn't built yet - BUILD IT
- **Never mark passing** without actual verification
- **No mock data** - use real database queries
- **One feature at a time** - complete before starting another

## Usage

```
/agents/code                    # Start implementing next feature
/agents/code --yolo             # Use YOLO mode (lint check only, no browser testing)
```

## Expected Behavior

This command initiates a coding session where features are implemented one by one until:
- All features are passing, or
- The session needs to end (commit progress, update notes)
