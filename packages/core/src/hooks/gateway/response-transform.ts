/**
 * Response Transform Hook (#2)
 *
 * Transforms responses from the LLM provider before returning to the caller.
 * Use cases: format conversion, content filtering, metadata extraction.
 */

import type {
  HookHandler,
  HookResult,
  ResponseTransformInput,
  ResponseTransformOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default response transform handler - passes through unchanged
 */
export const defaultResponseTransformHandler: HookHandler<
  ResponseTransformInput,
  ResponseTransformOutput
> = async (input, _context): Promise<HookResult<ResponseTransformOutput>> => {
  return {
    success: true,
    data: {
      response: input.response,
      transformed: false,
    },
  };
};

/**
 * Creates a response transform handler that trims whitespace from content
 */
export function createContentTrimmer(): HookHandler<
  ResponseTransformInput,
  ResponseTransformOutput
> {
  return async (input, _context): Promise<HookResult<ResponseTransformOutput>> => {
    const trimmedContent = input.response.content.trim();
    const transformed = trimmedContent !== input.response.content;

    return {
      success: true,
      data: {
        response: {
          ...input.response,
          content: trimmedContent,
        },
        transformed,
      },
    };
  };
}

/**
 * Creates a response transform handler that extracts JSON from markdown code blocks
 */
export function createJsonExtractor(): HookHandler<
  ResponseTransformInput,
  ResponseTransformOutput
> {
  return async (input, _context): Promise<HookResult<ResponseTransformOutput>> => {
    const jsonMatch = input.response.content.match(/```(?:json)?\s*([\s\S]*?)```/);

    if (jsonMatch?.[1]) {
      return {
        success: true,
        data: {
          response: {
            ...input.response,
            content: jsonMatch[1].trim(),
          },
          transformed: true,
        },
        metadata: { extractedFrom: 'code-block' },
      };
    }

    return {
      success: true,
      data: {
        response: input.response,
        transformed: false,
      },
    };
  };
}

/**
 * Creates a response transform handler that adds metadata
 */
export function createMetadataEnricher(
  enricher: (response: ResponseTransformInput) => Record<string, unknown>
): HookHandler<ResponseTransformInput, ResponseTransformOutput> {
  return async (input, _context): Promise<HookResult<ResponseTransformOutput>> => {
    return {
      success: true,
      data: {
        response: input.response,
        transformed: false,
      },
      metadata: enricher(input),
    };
  };
}

/**
 * Register the default response transform hook
 */
export function registerDefaultResponseTransform(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.RESPONSE_TRANSFORM,
    {
      id: 'default-response-transform',
      name: 'Default Response Transform',
      priority: 'normal',
      description: 'Pass-through response transform handler',
    },
    defaultResponseTransformHandler
  );
}
