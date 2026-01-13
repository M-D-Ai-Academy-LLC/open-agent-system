# Open Agent System

A framework for building LLM-agnostic multi-agent systems — both as a conceptual pattern (markdown-based agent definitions) and a TypeScript implementation (50-hook extensibility system).

---

> **For AI Agents:**
>
> The file you're looking for is [`OpenAgentDefinition.md`](./OpenAgentDefinition.md).
> Read that document to understand and implement the markdown-based agent pattern.

---

## Two Approaches, One Vision

### 1. The Conceptual Pattern (Zero Code)

Tools like **Claude Code**, **Gemini CLI**, and **Codex** aren't really "coding assistants." They're general-purpose agent frameworks that happen to be configured for coding by default. Their core capabilities — reading files, writing files, following instructions, using tools — work for *any* file-based workflow.

An **Open Agent System** is a folder structure and set of markdown files that reconfigures these tools to perform specialized, non-coding tasks. No code required.

See [`OpenAgentDefinition.md`](./OpenAgentDefinition.md) for the complete specification.

### 2. The TypeScript Framework (Full Control)

For developers who want programmatic control, the TypeScript packages provide:

- **🔌 50 Extensibility Hooks** — Complete control over request/response lifecycle
- **🤖 Multi-Agent Orchestration** — Agents that collaborate, delegate, and communicate
- **🔄 Provider Agnostic** — Works with any LLM via adapters
- **🛡️ Security First** — PII detection, prompt injection protection, content moderation
- **📊 Full Observability** — OpenTelemetry-native tracing and cost tracking

## Quick Start (TypeScript)

```bash
# Install globally
npm install -g @open-agent/cli

# Initialize a new project
open-agent init my-project
cd my-project

# Configure your API key
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY

# Install dependencies
pnpm install

# Start chatting
open-agent chat
```

## Quick Start (Markdown Pattern)

1. Read [`OpenAgentDefinition.md`](./OpenAgentDefinition.md) for the complete specification
2. Create an `open-agents/` folder in your project
3. Define your agents in markdown
4. Point your tool's instruction file to `open-agents/INSTRUCTIONS.md`

## Packages

| Package | Description |
|---------|-------------|
| `@open-agent/core` | Core framework with 50-hook system and types |
| `@open-agent/cli` | Command-line interface |
| `@open-agent/adapter-openrouter` | OpenRouter adapter (300+ models) |

## Hook System

The hook system provides 50 extensibility points across 7 categories:

| Category | Hooks | Description |
|----------|-------|-------------|
| Gateway (#1-7) | Request/Response transform, Model selection, Provider routing, Fallback, Retry, Circuit breaker | Control the LLM request lifecycle |
| Auth (#8-14) | API key validation/rotation, Permissions, Rate limits, Quotas, Sessions, Audit logs | Security and access control |
| Tool Calling (#15-21) | Registration, Validation, Execution, Result transform, Error recovery, MCP discovery, Sandboxing | Tool/function calling |
| Agent Lifecycle (#22-28) | Init, Spawn, Termination, State transitions, Message passing, Task delegation, Health checks | Multi-agent coordination |
| Streaming (#29-35) | Start/Complete, Chunk processing, Error handling, Backpressure, Multiplexing, Partial results | Real-time streaming |
| Observability (#36-42) | Metrics, Tracing, Span annotation, Log enrichment, Alerts, Cost tracking, Performance profiling | Monitoring and debugging |
| Security (#43-50) | Input sanitization, Output filtering, PII detection, Prompt injection, Content moderation, Encryption, Compliance, Threat detection | Security guardrails |

## Example: Custom Hook

```typescript
import { getHookRegistry, HOOK_NAMES } from '@open-agent/core';

const registry = getHookRegistry();

// Add cost alerting
registry.register(
  HOOK_NAMES.COST_TRACKING,
  {
    id: 'cost-alert',
    name: 'Cost Alerting',
    priority: 'normal',
  },
  async (input, context) => {
    const { inputTokens, outputTokens } = input;
    const cost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000;

    if (cost > 1.0) {
      console.warn(`High cost request: $${cost.toFixed(2)}`);
    }

    return { success: true, data: { cost, currency: 'USD' } };
  }
);
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Your Application                      │
├─────────────────────────────────────────────────────────┤
│                    @open-agent/core                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Hook Pipeline System                  │  │
│  │  Gateway → Auth → Tools → Agent → Stream → Obs    │  │
│  └───────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│                      Adapters                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │OpenRouter│  │  OpenAI  │  │Anthropic │  │ Custom │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
├─────────────────────────────────────────────────────────┤
│                    LLM Providers                         │
│  Claude • GPT-4 • Gemini • Llama • Mistral • 300+ more  │
└─────────────────────────────────────────────────────────┘
```

## Development

```bash
# Clone the repository
git clone https://github.com/open-agent-system/open-agent-system.git
cd open-agent-system

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Roadmap

### v0.1.0 (Current)
- [x] Core hook system with 50 hooks
- [x] CLI scaffolding
- [x] OpenRouter adapter
- [x] TypeScript types

### v0.2.0
- [ ] Full agent runtime
- [ ] Tool execution framework
- [ ] MCP server/client integration

### v0.3.0
- [ ] Multi-agent orchestration
- [ ] Workflow DSL
- [ ] Web dashboard

## Example Use Cases

- **Research systems** — Agents that research topics, produce articles, transform to HTML
- **Content pipelines** — Ingest raw notes, process through multiple stages, output polished content
- **Data processing** — Extract, transform, validate data across file formats
- **Customer support** — Intelligent routing, response generation, escalation handling
- **Code review** — Automated analysis, security scanning, style enforcement

## License

MIT License. See [LICENSE](./LICENSE) for details.

---

*This is an experiment. Fork it, break it, improve it.*
