# @open-agent/adapter-anthropic

Anthropic Claude adapter for the Open Agent System. Provides direct integration with Anthropic's API including Claude Opus 4, Sonnet 4, and Haiku models.

## Installation

```bash
npm install @open-agent/adapter-anthropic
```

## Quick Start

```typescript
import { createAnthropicAdapter } from '@open-agent/adapter-anthropic';

const adapter = createAnthropicAdapter({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Message completion
const response = await adapter.complete({
  model: 'claude-sonnet-4-20250514',
  messages: [
    { role: 'user', content: 'Hello!' },
  ],
  system: 'You are a helpful assistant.',
});

console.log(response.content);
```

## Configuration

```typescript
const adapter = createAnthropicAdapter({
  // Required
  apiKey: 'sk-ant-...',

  // Optional
  baseURL: 'https://api.anthropic.com', // Custom endpoint
  defaultModel: 'claude-sonnet-4-20250514',
  timeoutMs: 60000,
  maxRetries: 2,
});
```

## Message Completions

### Basic Completion

```typescript
const response = await adapter.complete({
  model: 'claude-sonnet-4-20250514',
  messages: [
    { role: 'user', content: 'What is the capital of France?' },
  ],
  system: 'You are a geography expert.',
  temperature: 0.7,
  maxTokens: 1000,
});

console.log(response.content); // "Paris is the capital of France..."
console.log(response.usage);   // { promptTokens, completionTokens, totalTokens }
```

### Tool Use

```typescript
const response = await adapter.complete({
  model: 'claude-sonnet-4-20250514',
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

    // Handle tool result
    const toolResult = await executeToolCall(call);

    // Continue conversation with tool result
    const followUp = await adapter.complete({
      messages: [
        { role: 'user', content: 'What is the weather in Paris?' },
        {
          role: 'assistant',
          content: response.content,
          toolCalls: response.toolCalls,
        },
        {
          role: 'tool',
          toolCallId: call.id,
          content: JSON.stringify(toolResult),
        },
      ],
    });
  }
}
```

## Streaming

```typescript
for await (const chunk of adapter.stream({
  model: 'claude-sonnet-4-20250514',
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

## Available Models

| Model | Context | Input Cost | Output Cost | Capabilities |
|-------|---------|------------|-------------|--------------|
| claude-opus-4-20250514 | 200K | $15/1M | $75/1M | chat, tools, vision, reasoning |
| claude-sonnet-4-20250514 | 200K | $3/1M | $15/1M | chat, tools, vision |
| claude-3-5-haiku-20241022 | 200K | $0.80/1M | $4/1M | chat, tools, vision |
| claude-3-5-sonnet-20241022 | 200K | $3/1M | $15/1M | chat, tools, vision |
| claude-3-opus-20240229 | 200K | $15/1M | $75/1M | chat, tools, vision |

## Extended Thinking (Opus 4)

Claude Opus 4 supports extended thinking for complex reasoning:

```typescript
const response = await adapter.complete({
  model: 'claude-opus-4-20250514',
  messages: [
    {
      role: 'user',
      content: 'Solve this complex logic puzzle: ...',
    },
  ],
  // Extended thinking is automatic for complex tasks
});
```

## Hooks Integration

The adapter automatically integrates with the Open Agent hook system:

```typescript
import { registerAnthropicHooks } from '@open-agent/adapter-anthropic';

// Register Anthropic-specific hooks
registerAnthropicHooks();
```

Registered hooks:
- `anthropic-provider-routing` - Routes requests to Anthropic
- `anthropic-rate-limit` - Handles rate limiting
- `anthropic-fallback` - Handles model fallback

## Error Handling

```typescript
import { AnthropicAdapter } from '@open-agent/adapter-anthropic';

try {
  const response = await adapter.complete({ ... });
} catch (error) {
  if (error.message.includes('rate_limit')) {
    // Handle rate limiting (429)
  } else if (error.message.includes('overloaded')) {
    // Handle overloaded (529)
  } else if (error.message.includes('invalid_api_key')) {
    // Handle authentication error
  } else if (error.message.includes('context_length')) {
    // Handle context length exceeded
  }
}
```

## Vision Support

Claude supports analyzing images:

```typescript
const response = await adapter.complete({
  model: 'claude-sonnet-4-20250514',
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this image' },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: base64ImageData,
          },
        },
      ],
    },
  ],
});
```

## Token Counting

Estimate token count for text:

```typescript
const tokens = await adapter.countTokens('Hello, world!');
console.log(tokens); // Estimated token count
```

## Bedrock Support

For AWS Bedrock, use the `baseURL` option:

```typescript
const adapter = createAnthropicAdapter({
  apiKey: 'aws-credentials', // Or use AWS SDK credential chain
  baseURL: 'https://bedrock-runtime.us-east-1.amazonaws.com',
});
```

## License

MIT
