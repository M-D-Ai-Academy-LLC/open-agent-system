# Contributing to Open Agent System

Thank you for your interest in contributing to the Open Agent System! This document provides guidelines and instructions for contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Development Environment Setup](#development-environment-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Commit Message Format](#commit-message-format)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)
- [Release Process](#release-process)
- [Getting Help](#getting-help)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Development Environment Setup

### Prerequisites

- **Node.js**: Version 20.0.0 or higher
- **pnpm**: Version 9.0.0 or higher (we use pnpm as our package manager)
- **Git**: Latest stable version

### Initial Setup

1. **Fork the repository** on GitHub

2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/open-agent-system.git
   cd open-agent-system
   ```

3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/FutureTranz-Inc/open-agent-system.git
   ```

4. **Install dependencies**:
   ```bash
   pnpm install
   ```

5. **Build all packages**:
   ```bash
   pnpm run build
   ```

6. **Run tests** to verify your setup:
   ```bash
   pnpm run test
   ```

### Useful Development Commands

| Command | Description |
|---------|-------------|
| `pnpm run build` | Build all packages |
| `pnpm run test` | Run all tests |
| `pnpm run test:watch` | Run tests in watch mode |
| `pnpm run test:coverage` | Run tests with coverage report |
| `pnpm run typecheck` | Run TypeScript type checking |
| `pnpm run lint` | Run ESLint |
| `pnpm run format` | Format code with Prettier |
| `pnpm run docs` | Generate API documentation |
| `pnpm run clean` | Clean all build artifacts and node_modules |

## Project Structure

This is a monorepo managed with pnpm workspaces and Turborepo:

```
open-agent-system/
├── packages/
│   ├── core/                 # @open-agent/core - Core library
│   ├── cli/                  # @open-agent/cli - Command-line interface
│   └── adapters/
│       └── openrouter/       # @open-agent/openrouter - OpenRouter adapter
├── examples/                 # Example implementations
│   └── content-pipeline/     # Content transformation pipeline example
├── open-agents/              # Framework agent definitions
├── prompts/                  # System prompts for autonomous development
├── test/                     # Shared test utilities
└── docs/                     # Documentation
```

### Package Descriptions

- **@open-agent/core**: The core library containing the hook registry, pipeline system, and agent definitions
- **@open-agent/cli**: Command-line interface for interacting with agents
- **@open-agent/openrouter**: Adapter for OpenRouter API integration

## Coding Standards

### TypeScript Guidelines

- Use TypeScript for all source code
- Enable strict mode (`"strict": true` in tsconfig.json)
- Always define explicit types for function parameters and return values
- Use interfaces over type aliases when possible
- Prefer `const` over `let`; avoid `var`

### Code Style

We use Prettier and ESLint to enforce consistent code style:

```bash
# Check formatting
pnpm run format --check

# Fix formatting
pnpm run format

# Run linter
pnpm run lint

# Fix lint issues
pnpm run lint:fix
```

### File Naming Conventions

- Use kebab-case for file names: `hook-registry.ts`
- Use PascalCase for class files: `HookRegistry.ts`
- Use `.test.ts` suffix for test files
- Use `.d.ts` suffix for type declaration files

### Import Order

1. External dependencies (e.g., `import { z } from 'zod'`)
2. Internal package imports (e.g., `import { HookRegistry } from '@open-agent/core'`)
3. Relative imports (e.g., `import { utils } from './utils'`)

### Documentation

- Add JSDoc comments to all public APIs
- Include `@param`, `@returns`, and `@throws` tags where applicable
- Document complex algorithms inline

Example:
```typescript
/**
 * Registers a hook handler for the specified hook name.
 * @param hookName - The name of the hook to register
 * @param metadata - Hook metadata including id and priority
 * @param handler - The handler function to execute
 * @returns The registered hook's unique identifier
 * @throws {Error} If the hook name is invalid
 */
register<T, R>(
  hookName: HookName,
  metadata: HookMetadata,
  handler: HookHandler<T, R>
): string
```

## Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes |
| `style` | Code style changes (formatting, etc.) |
| `refactor` | Code refactoring without feature changes |
| `perf` | Performance improvements |
| `test` | Adding or updating tests |
| `build` | Build system or dependency changes |
| `ci` | CI configuration changes |
| `chore` | Other changes that don't modify src or test |

### Scopes

- `core` - Changes to @open-agent/core
- `cli` - Changes to @open-agent/cli
- `openrouter` - Changes to @open-agent/openrouter
- `deps` - Dependency updates
- `docs` - Documentation
- `examples` - Example code

### Examples

```bash
# Feature
feat(core): add hook priority system

# Bug fix
fix(cli): resolve config file path resolution

# Documentation
docs: update contributing guidelines

# Breaking change
feat(core)!: change hook registration API

BREAKING CHANGE: Hook registration now requires metadata object
```

## Pull Request Process

### Before Submitting

1. **Sync your fork** with the upstream repository:
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes** and ensure:
   - All tests pass: `pnpm run test`
   - Type check passes: `pnpm run typecheck`
   - Code is formatted: `pnpm run format`
   - Lint passes: `pnpm run lint`

4. **Commit your changes** following the commit message format

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

### Submitting a Pull Request

1. Open a pull request against the `main` branch
2. Fill out the PR template completely
3. Link any related issues
4. Ensure all CI checks pass
5. Request review from maintainers

### PR Requirements

- **Title**: Use conventional commit format
- **Description**: Clearly explain what and why
- **Tests**: Add tests for new functionality
- **Documentation**: Update relevant documentation
- **Breaking Changes**: Clearly document any breaking changes

### Review Process

- At least one maintainer approval is required
- All CI checks must pass
- Address review feedback promptly
- Squash commits before merging (if requested)

## Testing Requirements

### Running Tests

```bash
# Run all tests
pnpm run test

# Run tests in watch mode (development)
pnpm run test:watch

# Run tests with coverage
pnpm run test:coverage

# Run tests with UI
pnpm run test:ui
```

### Writing Tests

- Use Vitest as the testing framework
- Place tests in `__tests__` directories or use `.test.ts` suffix
- Test files should be co-located with the code they test

### Test Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { YourModule } from '../your-module';

describe('YourModule', () => {
  let instance: YourModule;

  beforeEach(() => {
    instance = new YourModule();
  });

  describe('methodName', () => {
    it('should do something specific', () => {
      const result = instance.methodName();
      expect(result).toBe(expectedValue);
    });

    it('should handle edge case', () => {
      expect(() => instance.methodName(invalidInput)).toThrow();
    });
  });
});
```

### Coverage Requirements

- Aim for 80% code coverage
- Critical paths must have 100% coverage
- Integration tests are required for complex workflows

## Release Process

Releases are managed by maintainers using the following process:

### Versioning

We follow [Semantic Versioning](https://semver.org/):

- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features, backward-compatible
- **Patch** (0.0.1): Bug fixes, backward-compatible

### Release Workflow

1. **Version Bump**: Update version in package.json files
2. **Changelog**: Update CHANGELOG.md
3. **Tag**: Create a git tag (`v1.0.0`)
4. **CI/CD**: GitHub Actions handles npm publish and GitHub release

### Pre-releases

Pre-release versions use suffixes:
- Alpha: `1.0.0-alpha.1`
- Beta: `1.0.0-beta.1`
- Release Candidate: `1.0.0-rc.1`

## Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and community discussions
- **Documentation**: See the `docs/` directory and API documentation

Thank you for contributing to the Open Agent System!
