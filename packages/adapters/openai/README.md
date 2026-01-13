# @open-agent/adapter-openai

OpenAI adapter for the Open Agent System. Provides direct integration with OpenAI's API including GPT-4o, o1, and other models.

## Installation

```bash
npm install @open-agent/adapter-openai
```

## Quick Start

```typescript
import { createOpenAIAdapter } from '@open-agent/adapter-openai';

const adapter = createOpenAIAdapter({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Chat completion
const response = await adapter.complete({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' },
  ],
});

console.log(response.content);
```

## Configuration

```typescript
const adapter = createOpenAIAdapter({
  // Required
  apiKey: 'sk-...',

  // Optional
  organization: 'org-...',
  baseURL: 'https://api.openai.com/v1', // Custom endpoint
  defaultModel: 'gpt-4o',
  timeoutMs: 60000,
  maxRetries: 2,
});
```

## Chat Completions

### Basic Completion

```typescript
const response = await adapter.complete({
  model: 'gpt-4o',
  messages: [
    { role: 'user', content: 'What is the capital of France?' },
  ],
  temperature: 0.7,
  maxTokens: 1000,
});

console.log(response.content); // "Paris is the capital of France..."
console.log(response.usage);   // { promptTokens, completionTokens, totalTokens }
```

### JSON Mode

```typescript
const response = await adapter.complete({
  model: 'gpt-4o',
  messages: [
    { role: 'user', content: 'List 3 colors as JSON' },
  ],
  responseFormat: { type: 'json_object' },
});

const data = JSON.parse(response.content);
```

### Tool Calling

```typescript
const response = await adapter.complete({
  model: 'gpt-4o',
  messages: [
    { role: 'user', content: 'What is the weather in Paris?' },
  ],
  tools: [
    {
      name: 'get_weather',
      description: 'Get current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City name' },
        },
        required: ['location'],
      },
    },
  ],
});

if (response.toolCalls) {
  for (const call of response.toolCalls) {
    console.log(`Tool: ${call.name}`);
    console.log(`Args: ${JSON.stringify(call.arguments)}`);
  }
}
```

## Streaming

```typescript
for await (const chunk of adapter.stream({
  model: 'gpt-4o',
  messages: [
    { role: 'user', content: 'Write a poem about AI' },
  ],
})) {
  process.stdout.write(chunk.content);

  if (chunk.isLast) {
    console.log('\n--- Stream complete ---');
  }
}
```

## Embeddings

```typescript
const result = await adapter.createEmbeddings(
  ['Hello world', 'Goodbye world'],
  'text-embedding-3-small'
);

console.log(result.embeddings[0].length); // 1536 dimensions
console.log(result.usage); // { promptTokens, totalTokens }
```

## Content Moderation

```typescript
const results = await adapter.moderateContent([
  'This is a normal message',
  'Some other text',
]);

for (const result of results) {
  console.log('Flagged:', result.flagged);
  console.log('Categories:', result.categories);
  console.log('Scores:', result.scores);
}
```

## Available Models

| Model | Context | Input Cost | Output Cost | Capabilities |
|-------|---------|------------|-------------|--------------|
| gpt-4o | 128K | $5/1M | $15/1M | chat, tools, vision |
| gpt-4o-mini | 128K | $0.15/1M | $0.60/1M | chat, tools, vision |
| gpt-4-turbo | 128K | $10/1M | $30/1M | chat, tools, vision |
| o1 | 200K | $15/1M | $60/1M | chat, reasoning |
| o1-mini | 128K | $3/1M | $12/1M | chat, reasoning |
| o1-pro | 200K | $150/1M | $600/1M | chat, reasoning, tools |
| gpt-3.5-turbo | 16K | $0.50/1M | $1.50/1M | chat, tools |

## Hooks Integration

The adapter automatically integrates with the Open Agent hook system:

```typescript
import { registerOpenAIHooks } from '@open-agent/adapter-openai';

// Register OpenAI-specific hooks
registerOpenAIHooks();
```

Registered hooks:
- `openai-provider-routing` - Routes requests to OpenAI
- `openai-rate-limit` - Handles rate limiting
- `openai-fallback` - Handles model fallback

## Error Handling

```typescript
import { OpenAIAdapter } from '@open-agent/adapter-openai';

try {
  const response = await adapter.complete({ ... });
} catch (error) {
  if (error.message.includes('rate_limit')) {
    // Handle rate limiting
  } else if (error.message.includes('insufficient_quota')) {
    // Handle quota exceeded
  } else if (error.message.includes('invalid_api_key')) {
    // Handle authentication error
  }
}
```

## Azure OpenAI

Use the `baseURL` option for Azure OpenAI:

```typescript
const adapter = createOpenAIAdapter({
  apiKey: 'your-azure-key',
  baseURL: 'https://your-resource.openai.azure.com/openai/deployments/your-deployment',
});
```

## License

MIT
