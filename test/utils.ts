/**
 * Test utilities for Open Agent System
 *
 * Common helpers, fixtures, and mocks used across test suites.
 */

import { vi } from 'vitest';

/**
 * Create a mock LLM response
 */
export function createMockLLMResponse(content: string, options?: { model?: string; tokens?: number }) {
  return {
    id: `mock-${Date.now()}`,
    model: options?.model ?? 'mock-model',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant' as const,
          content,
        },
        finish_reason: 'stop' as const,
      },
    ],
    usage: {
      prompt_tokens: options?.tokens ?? 100,
      completion_tokens: options?.tokens ?? 50,
      total_tokens: (options?.tokens ?? 100) + (options?.tokens ?? 50),
    },
    created: Date.now(),
  };
}

/**
 * Create a mock agent definition
 */
export function createMockAgent(overrides?: Partial<MockAgentDefinition>): MockAgentDefinition {
  return {
    name: 'test-agent',
    description: 'A test agent for unit testing',
    systemPrompt: 'You are a helpful test assistant.',
    tools: [],
    ...overrides,
  };
}

interface MockAgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
}

/**
 * Create a mock message
 */
export function createMockMessage(
  role: 'user' | 'assistant' | 'system',
  content: string
) {
  return {
    role,
    content,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a mock conversation
 */
export function createMockConversation(messageCount: number = 3) {
  const messages = [];
  for (let i = 0; i < messageCount; i++) {
    const role = i % 2 === 0 ? 'user' : 'assistant';
    messages.push(createMockMessage(role as 'user' | 'assistant', `Message ${i + 1}`));
  }
  return messages;
}

/**
 * Wait for a specified duration
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a mock fetch function
 */
export function createMockFetch(responses: Array<{ url: RegExp; response: unknown }>) {
  return vi.fn().mockImplementation((url: string) => {
    const match = responses.find((r) => r.url.test(url));
    if (match) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(match.response),
        text: () => Promise.resolve(JSON.stringify(match.response)),
      });
    }
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Not found' }),
    });
  });
}

/**
 * Create a spy on console methods
 */
export function spyOnConsole() {
  return {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
  };
}

/**
 * Restore console methods
 */
export function restoreConsole(spies: ReturnType<typeof spyOnConsole>) {
  spies.log.mockRestore();
  spies.warn.mockRestore();
  spies.error.mockRestore();
  spies.info.mockRestore();
}

/**
 * Generate a unique test ID
 */
export function generateTestId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Assert that a function throws an error with a specific message
 */
export async function expectAsyncError(
  fn: () => Promise<unknown>,
  expectedMessage?: string | RegExp
): Promise<Error> {
  let error: Error | null = null;
  try {
    await fn();
  } catch (e) {
    error = e as Error;
  }

  if (!error) {
    throw new Error('Expected function to throw an error');
  }

  if (expectedMessage) {
    if (typeof expectedMessage === 'string') {
      if (!error.message.includes(expectedMessage)) {
        throw new Error(
          `Expected error message to include "${expectedMessage}" but got "${error.message}"`
        );
      }
    } else if (!expectedMessage.test(error.message)) {
      throw new Error(
        `Expected error message to match ${expectedMessage} but got "${error.message}"`
      );
    }
  }

  return error;
}
