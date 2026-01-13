/**
 * Tool Result Transform Hook (#18)
 *
 * Transforms tool execution results to expected formats.
 * Use cases: result formatting, data normalization, output conversion.
 */

import type {
  HookHandler,
  HookResult,
  ToolResultTransformInput,
  ToolResultTransformOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default tool result transform handler - pass through
 */
export const defaultToolResultTransformHandler: HookHandler<
  ToolResultTransformInput,
  ToolResultTransformOutput
> = async (input, _context): Promise<HookResult<ToolResultTransformOutput>> => {
  return {
    success: true,
    data: {
      result: input.rawResult,
      transformed: false,
      format: input.expectedFormat ?? 'raw',
    },
  };
};

/**
 * Creates a result transform handler with format conversion
 */
export function createFormatTransform(
  formatters: Map<string, (result: unknown) => unknown>
): HookHandler<ToolResultTransformInput, ToolResultTransformOutput> {
  return async (input, _context): Promise<HookResult<ToolResultTransformOutput>> => {
    const format = input.expectedFormat ?? 'raw';
    const formatter = formatters.get(format);

    if (!formatter) {
      return {
        success: true,
        data: {
          result: input.rawResult,
          transformed: false,
          format: 'raw',
        },
      };
    }

    try {
      const result = formatter(input.rawResult);
      return {
        success: true,
        data: {
          result,
          transformed: true,
          format,
        },
      };
    } catch (error) {
      return {
        success: true,
        data: {
          result: input.rawResult,
          transformed: false,
          format: 'raw',
        },
        metadata: {
          transformError: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

/**
 * Creates a result transform handler with size limiting
 */
export function createSizeLimitedTransform(
  options?: {
    maxStringLength?: number;
    maxArrayLength?: number;
    maxObjectDepth?: number;
  }
): HookHandler<ToolResultTransformInput, ToolResultTransformOutput> {
  const maxStringLength = options?.maxStringLength ?? 10000;
  const maxArrayLength = options?.maxArrayLength ?? 100;
  const maxObjectDepth = options?.maxObjectDepth ?? 10;

  const truncate = (value: unknown, depth: number = 0): unknown => {
    if (depth > maxObjectDepth) {
      return '[max depth exceeded]';
    }

    if (typeof value === 'string') {
      if (value.length > maxStringLength) {
        return value.substring(0, maxStringLength) + `... [truncated ${value.length - maxStringLength} chars]`;
      }
      return value;
    }

    if (Array.isArray(value)) {
      if (value.length > maxArrayLength) {
        return [
          ...value.slice(0, maxArrayLength).map((item) => truncate(item, depth + 1)),
          `... [${value.length - maxArrayLength} more items]`,
        ];
      }
      return value.map((item) => truncate(item, depth + 1));
    }

    if (typeof value === 'object' && value !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = truncate(val, depth + 1);
      }
      return result;
    }

    return value;
  };

  return async (input, _context): Promise<HookResult<ToolResultTransformOutput>> => {
    const result = truncate(input.rawResult);
    const wasTransformed = JSON.stringify(result) !== JSON.stringify(input.rawResult);

    return {
      success: true,
      data: {
        result,
        transformed: wasTransformed,
        format: input.expectedFormat ?? 'truncated',
      },
    };
  };
}

/**
 * Creates a result transform handler for JSON output
 */
export function createJsonTransform(): HookHandler<ToolResultTransformInput, ToolResultTransformOutput> {
  return async (input, _context): Promise<HookResult<ToolResultTransformOutput>> => {
    try {
      // If already an object, just return it
      if (typeof input.rawResult === 'object') {
        return {
          success: true,
          data: {
            result: input.rawResult,
            transformed: false,
            format: 'json',
          },
        };
      }

      // Try to parse string as JSON
      if (typeof input.rawResult === 'string') {
        const parsed = JSON.parse(input.rawResult);
        return {
          success: true,
          data: {
            result: parsed,
            transformed: true,
            format: 'json',
          },
        };
      }

      // Wrap primitive in object
      return {
        success: true,
        data: {
          result: { value: input.rawResult },
          transformed: true,
          format: 'json',
        },
      };
    } catch {
      return {
        success: true,
        data: {
          result: { raw: String(input.rawResult) },
          transformed: true,
          format: 'json',
        },
      };
    }
  };
}

/**
 * Creates a result transform handler for markdown output
 */
export function createMarkdownTransform(): HookHandler<ToolResultTransformInput, ToolResultTransformOutput> {
  const toMarkdown = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '_null_';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    // Format arrays of objects as tables
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      const keys = Object.keys(value[0]);
      let table = '| ' + keys.join(' | ') + ' |\n';
      table += '| ' + keys.map(() => '---').join(' | ') + ' |\n';

      for (const item of value.slice(0, 50)) {
        const row = keys.map((key) => {
          const val = (item as Record<string, unknown>)[key];
          return String(val ?? '').substring(0, 50);
        });
        table += '| ' + row.join(' | ') + ' |\n';
      }

      if (value.length > 50) {
        table += `\n_...and ${value.length - 50} more rows_\n`;
      }

      return table;
    }

    // Format other arrays as lists
    if (Array.isArray(value)) {
      return value.map((item, i) => `${i + 1}. ${toMarkdown(item)}`).join('\n');
    }

    // Format objects as code blocks
    if (typeof value === 'object') {
      return '```json\n' + JSON.stringify(value, null, 2) + '\n```';
    }

    return String(value);
  };

  return async (input, _context): Promise<HookResult<ToolResultTransformOutput>> => {
    const result = toMarkdown(input.rawResult);

    return {
      success: true,
      data: {
        result,
        transformed: true,
        format: 'markdown',
      },
    };
  };
}

/**
 * Creates a result transform handler that redacts sensitive data
 */
export function createRedactionTransform(
  patterns: Array<{ pattern: RegExp; replacement?: string }>
): HookHandler<ToolResultTransformInput, ToolResultTransformOutput> {
  const redact = (value: unknown): unknown => {
    if (typeof value === 'string') {
      let result = value;
      for (const { pattern, replacement } of patterns) {
        result = result.replace(pattern, replacement ?? '[REDACTED]');
      }
      return result;
    }

    if (Array.isArray(value)) {
      return value.map(redact);
    }

    if (typeof value === 'object' && value !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = redact(val);
      }
      return result;
    }

    return value;
  };

  return async (input, _context): Promise<HookResult<ToolResultTransformOutput>> => {
    const result = redact(input.rawResult);
    const wasTransformed = JSON.stringify(result) !== JSON.stringify(input.rawResult);

    return {
      success: true,
      data: {
        result,
        transformed: wasTransformed,
        format: input.expectedFormat ?? 'redacted',
      },
    };
  };
}

/**
 * Creates a transform pipeline
 */
export function createTransformPipeline(
  transforms: HookHandler<ToolResultTransformInput, ToolResultTransformOutput>[]
): HookHandler<ToolResultTransformInput, ToolResultTransformOutput> {
  return async (input, context): Promise<HookResult<ToolResultTransformOutput>> => {
    let currentResult = input.rawResult;
    let wasTransformed = false;
    let format = input.expectedFormat ?? 'raw';

    for (const transform of transforms) {
      const result = await transform(
        { ...input, rawResult: currentResult },
        context
      );

      if (!result.success) {
        return result;
      }

      currentResult = result.data.result;
      wasTransformed = wasTransformed || result.data.transformed;
      format = result.data.format;
    }

    return {
      success: true,
      data: {
        result: currentResult,
        transformed: wasTransformed,
        format,
      },
    };
  };
}

/**
 * Register the default tool result transform hook
 */
export function registerDefaultToolResultTransform(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.TOOL_RESULT_TRANSFORM,
    {
      id: 'default-tool-result-transform',
      name: 'Default Tool Result Transform',
      priority: 'normal',
      description: 'Pass-through result transformer',
    },
    defaultToolResultTransformHandler
  );
}
