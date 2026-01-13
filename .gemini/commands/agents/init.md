# /agents/init

Initialize a new project from an application specification file.

## Arguments

- `$ARGUMENTS` - Path to the specification file (default: `app_spec.txt`)

## Instructions

1. Read the Initializer agent definition from `open-agents/agents/initializer.md`
2. Follow the agent's Core Behaviors exactly:
   - Read the specification file at `$ARGUMENTS` (or `app_spec.txt` if not provided)
   - Parse the `feature_count` field
   - Create features using `feature_create_bulk`
   - Create `init.sh` script
   - Initialize git if needed
   - Create project structure based on tech stack

## Usage Examples

```
/agents/init                    # Uses default app_spec.txt
/agents/init my_project.txt     # Uses custom spec file
/agents/init specs/app.txt      # Uses spec file in subdirectory
```

## Expected Output

After running this command, you should have:
- Features created in `features.db` (matching `feature_count`)
- `init.sh` script for environment setup
- Initial project structure
- Git repository initialized (if not already)

## Validation

After initialization, verify with:
```
feature_get_stats  # Should show 0/N passing where N = feature_count
```
