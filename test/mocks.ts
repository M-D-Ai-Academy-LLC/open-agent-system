/**
 * Mock implementations for testing
 *
 * Common mocks for external services and dependencies.
 */

import { vi } from 'vitest';

/**
 * Mock OpenRouter API client
 */
export const mockOpenRouterClient = {
  chat: {
    completions: {
      create: vi.fn().mockResolvedValue({
        id: 'chatcmpl-mock',
        object: 'chat.completion',
        created: Date.now(),
        model: 'openai/gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Mock response',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      }),
    },
  },
};

/**
 * Mock Anthropic API client
 */
export const mockAnthropicClient = {
  messages: {
    create: vi.fn().mockResolvedValue({
      id: 'msg-mock',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Mock response',
        },
      ],
      model: 'claude-3-opus-20240229',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 10,
        output_tokens: 5,
      },
    }),
  },
};

/**
 * Mock OpenAI API client
 */
export const mockOpenAIClient = {
  chat: {
    completions: {
      create: vi.fn().mockResolvedValue({
        id: 'chatcmpl-mock',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Mock response',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      }),
    },
  },
};

/**
 * Mock MCP server
 */
export const mockMCPServer = {
  tools: {
    list: vi.fn().mockResolvedValue({
      tools: [
        {
          name: 'mock_tool',
          description: 'A mock tool for testing',
          inputSchema: {
            type: 'object',
            properties: {
              input: { type: 'string' },
            },
          },
        },
      ],
    }),
    call: vi.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: 'Mock tool result',
        },
      ],
    }),
  },
  resources: {
    list: vi.fn().mockResolvedValue({ resources: [] }),
    read: vi.fn().mockResolvedValue({ contents: [] }),
  },
  prompts: {
    list: vi.fn().mockResolvedValue({ prompts: [] }),
    get: vi.fn().mockResolvedValue({ messages: [] }),
  },
};

/**
 * Mock file system operations
 */
export const mockFS = {
  readFile: vi.fn().mockResolvedValue('mock file content'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue(['file1.md', 'file2.md']),
  stat: vi.fn().mockResolvedValue({
    isFile: () => true,
    isDirectory: () => false,
    size: 1024,
    mtime: new Date(),
  }),
  exists: vi.fn().mockResolvedValue(true),
  mkdir: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
};

/**
 * Mock HTTP fetch
 */
export const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: () => Promise.resolve({}),
  text: () => Promise.resolve(''),
  headers: new Headers(),
});

/**
 * Reset all mocks
 */
export function resetAllMocks() {
  mockOpenRouterClient.chat.completions.create.mockClear();
  mockAnthropicClient.messages.create.mockClear();
  mockOpenAIClient.chat.completions.create.mockClear();
  mockMCPServer.tools.list.mockClear();
  mockMCPServer.tools.call.mockClear();
  mockMCPServer.resources.list.mockClear();
  mockMCPServer.resources.read.mockClear();
  mockMCPServer.prompts.list.mockClear();
  mockMCPServer.prompts.get.mockClear();
  mockFS.readFile.mockClear();
  mockFS.writeFile.mockClear();
  mockFS.readdir.mockClear();
  mockFS.stat.mockClear();
  mockFS.exists.mockClear();
  mockFS.mkdir.mockClear();
  mockFS.rm.mockClear();
  mockFetch.mockClear();
}
