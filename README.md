# open-agent-system

![Maturity](https://img.shields.io/badge/maturity-Beta-yellow) ![Language](https://img.shields.io/badge/language-TypeScript-blue) ![GitHub stars](https://img.shields.io/github/stars/M-D-Ai-Academy-LLC/open-agent-system) ![GitHub issues](https://img.shields.io/github/issues/M-D-Ai-Academy-LLC/open-agent-system)

> A framework for building LLM-agnostic multi-agent systems with 50 extensibility hooks

**Organization:** [M-D-Ai-Academy-LLC](https://github.com/M-D-Ai-Academy-LLC)  
**Language:** TypeScript  
**Maturity:** Beta  
**Category:** Education  
**Target Market:** B2C



---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Contributing](#contributing)
- [License](#license)
- [Project Status](#project-status)

---

## Overview

open-agent-system is tracked by the FutureTranz portfolio pipeline.

A framework for building LLM-agnostic multi-agent systems with 50 extensibility hooks

### Problem Statement

Teams need consistent, auditable repository documentation and inventory data.

### Solution

This repository is synchronized with portfolio metadata and generated documentation artifacts.

---

## Features

- Maintains open-agent-system metadata synchronized from Notion Projects Inventory V2.
- Tracks operational and financial metrics in repository docs.
- Publishes machine-readable catalog and inventory artifacts.
- Keeps contribution and changelog files aligned with current status.

---

## Quick Start

```bash
# Clone and run
git clone <repo-url>
cd <repo>
# Follow project-specific setup in docs/ or README sections below
```

---

## Installation

1. Clone the repository.
2. Install dependencies documented in the repo.
3. Run tests or checks before changes.

---

## Usage

See project scripts and source files in this repository.

---

## Architecture

Repository structure snapshot:

```
./
  .agent.lock
  .claude_assistant_settings.json
  .claude_settings.json
  .gitignore
  .gitmodules
  .prettierrc
  AGENTS.md
  CLAUDE.md
  CONTRIBUTING.md
  GEMINI.md
  INVENTORY.yaml
  LICENSE
  OpenAgentDefinition.md
  README.md
  claude-progress.txt
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  tsconfig.json
  turbo.json
  typedoc.json
  vitest.config.ts
open-agents/
  INSTRUCTIONS.md
  README.md
open-agents/tools/
  .gitkeep
  README.md
  template.py
  template.sh
open-agents/output-refined/
  .gitkeep
  README.md
open-agents/source/
  .gitkeep
  README.md
  example-research.stub.md
  example-summary.stub.md
  template.request.md
  template.stub.md
open-agents/agents/
  .gitkeep
  coding.md
  initializer.md
  project-assistant.md
  publisher.md
  researcher.md
  reviewer.md
  transformer.md
open-agents/output-drafts/
  .gitkeep
  README.md
open-agents/output-final/
  .gitkeep
  README.md
.gemini/
.gemini/commands/
  .gitkeep
.gemini/commands/agents/
  .gitkeep
  code.md
  init.md
  list.md
  status.md
test/
  mocks.ts
  setup.ts
  utils.ts
.claude/
.claude/commands/
  .gitkeep
.claude/commands/agents/
  .gitkeep
  chain.md
  code.md
  init.md
  list.md
  publish.md
  research.md
  review.md
  status.md
  transform.md
ai-dev-tasks/
docs/
docs/catalog/
  M-D-Ai-Academy-LLC-open-agent-system-catalog.json
examples/
examples/history-research/
  CLAUDE.md
  GEMINI.md
  README.md
examples/history-research/open-agents/
  INSTRUCTIONS.md
  README.md
examples/history-research/.gemini/
examples/history-research/.claude/
examples/content-pipeline/
  CLAUDE.md
  GEMINI.md
  README.md
examples/content-pipeline/open-agents/
  INSTRUCTIONS.md
  README.md
examples/content-pipeline/.gemini/
examples/content-pipeline/.claude/
packages/
packages/core/
  package.json
  tsconfig.json
packages/core/tests/
packages/core/src/
  index.ts
packages/mcp-server/
  README.md
  package.json
  tsconfig.json
packages/mcp-server/src/
  cli.ts
  index.ts
  protocol.ts
  server.ts
  tool-registry.ts
  transport.ts
  types.ts
packages/cli/
  package.json
  tsconfig.json
packages/cli/src/
  bin.ts
  index.ts
packages/adapters/
packages/adapters/openrouter/
  package.json
  tsconfig.json
packages/adapters/anthropic/
  README.md
  package.json
  tsconfig.json
packages/adapters/openai/
  README.md
  package.json
  tsconfig.json
packages/mcp-client/
  README.md
  package.json
  tsconfig.json
packages/mcp-client/src/
  client.ts
  index.ts
  pool.ts
  transport.ts
  types.ts
.github/
.github/workflows/
  ci.yml
  pr-checks.yml
  release.yml
prompts/
  app_spec.txt
  coding_prompt.md
  coding_prompt_yolo.md
  initializer_prompt.md
.git/
  FETCH_HEAD
  HEAD
  config
  description
  index
  packed-refs
.git/objects/
.git/objects/pack/
  pack-1e9734288c808929b22c34e35ac12a47e793670f.idx
  pack-1e9734288c808929b22c34e35ac12a47e793670f.pack
  pack-1e9734288c808929b22c34e35ac12a47e793670f.rev
.git/objects/info/
.git/info/
  exclude
.git/logs/
  HEAD
.git/logs/refs/
.git/hooks/
  applypatch-msg.sample
  commit-msg.sample
  fsmonitor-watchman.sample
  post-update.sample
  pre-applypatch.sample
  pre-commit.sample
  pre-merge-commit.sample
  pre-push.sample
  pre-rebase.sample
  pre-receive.sample
  prepare-commit-msg.sample
  push-to-checkout.sample
  sendemail-validate.sample
  update.sample
.git/refs/
.git/refs/heads/
  main
  victor
.git/refs/tags/
.git/refs/remotes/
```

---

## Configuration

Use environment variables documented by the project. Do not commit secrets.

---

## API Reference

See source code and existing docs for endpoints and interfaces.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

---

## License

See LICENSE file in this repository (or project default if absent).

---

## Project Status

| Metric | Value |
|--------|-------|
| Maturity | Beta |
| Activity Score | 55.0 |
| Stars | 1.0 |
| Contributors | 3.0 |
| Open Issues | 0 |
| Last Activity | 2026-02-19 |
| Velocity | High |



---

<sub>Auto-generated by [FutureTranz Portfolio Pipeline](https://github.com/FutureTranz-Inc/github-portfolio-tracker) — synced from Notion Projects Inventory V2 on 2026-02-27</sub>