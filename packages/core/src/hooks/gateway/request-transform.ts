/**
 * Request Transform Hook (#1)
 *
 * Transforms outgoing requests before they are sent to the LLM provider.
 * Use cases: prompt injection, context injection, format normalization.
 */

import type {
  HookHandler,
  HookResult,
  RequestTransformInput,
  RequestTransformOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default request transform handler - passes through unchanged
 */
export const defaultRequestTransformHandler: HookHandler<
  RequestTransformInput,
  RequestTransformOutput
> = async (input, _context): Promise<HookResult<RequestTransformOutput>> => {
  return {
    success: true,
    data: {
      ...input,
      transformed: false,
    },
  };
};

/**
 * Creates a request transform handler that injects a system message
 */
export function createSystemPromptInjector(
  systemPrompt: string
): HookHandler<RequestTransformInput, RequestTransformOutput> {
  return async (input, _context): Promise<HookResult<RequestTransformOutput>> => {
    const hasSystemMessage = input.messages.some((m) => m.role === 'system');

    if (hasSystemMessage) {
      // Prepend to existing system message
      const messages = input.messages.map((m) => {
        if (m.role === 'system') {
          return { ...m, content: `${systemPrompt}\n\n${m.content}` };
        }
        return m;
      });

      return {
        success: true,
        data: {
          ...input,
          messages,
          transformed: true,
        },
      };
    }

    // Add new system message at the beginning
    return {
      success: true,
      data: {
        ...input,
        messages: [{ role: 'system', content: systemPrompt }, ...input.messages],
        transformed: true,
      },
    };
  };
}

/**
 * Creates a handler that normalizes message formats
 */
export function createMessageNormalizer(): HookHandler<
  RequestTransformInput,
  RequestTransformOutput
> {
  return async (input, _context): Promise<HookResult<RequestTransformOutput>> => {
    const messages = input.messages.map((m) => ({
      ...m,
      content: m.content.trim(),
    }));

    return {
      success: true,
      data: {
        ...input,
        messages,
        transformed: messages.some((m, i) => m.content !== input.messages[i]?.content),
      },
    };
  };
}

/**
 * Register the default request transform hook
 */
export function registerDefaultRequestTransform(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.REQUEST_TRANSFORM,
    {
      id: 'default-request-transform',
      name: 'Default Request Transform',
      priority: 'normal',
      description: 'Pass-through request transform handler',
    },
    defaultRequestTransformHandler
  );
}
