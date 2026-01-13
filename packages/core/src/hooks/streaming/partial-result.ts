/**
 * Partial Result Hook (#35)
 *
 * Handles partial result extraction from streams.
 * Use cases: incremental parsing, progressive rendering, early termination.
 */

import type {
  HookHandler,
  HookResult,
  PartialResultInput,
  PartialResultOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default partial result handler
 */
export const defaultPartialResultHandler: HookHandler<
  PartialResultInput,
  PartialResultOutput
> = async (input, _context): Promise<HookResult<PartialResultOutput>> => {
  // Basic structure detection
  const structure = input.structureDetected ?? detectStructure(input.accumulatedContent);

  return {
    success: true,
    data: {
      parsedPartial: undefined,
      confidence: structure === 'text' ? 0.5 : 0.3,
      suggestions: structure !== 'text' ? [`Consider using ${structure}-specific parser`] : undefined,
    },
  };
};

/**
 * Detect content structure from accumulated content
 */
export function detectStructure(content: string): 'json' | 'code' | 'markdown' | 'text' {
  const trimmed = content.trim();

  // JSON detection
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json';
  }

  // Markdown detection
  if (
    trimmed.startsWith('#') ||
    trimmed.includes('\n##') ||
    trimmed.includes('\n- ') ||
    trimmed.includes('\n* ') ||
    trimmed.includes('```')
  ) {
    return 'markdown';
  }

  // Code detection (common patterns)
  if (
    trimmed.includes('function ') ||
    trimmed.includes('const ') ||
    trimmed.includes('import ') ||
    trimmed.includes('class ') ||
    trimmed.includes('def ') ||
    trimmed.includes('async ') ||
    /^\s*(public|private|protected)\s/.test(trimmed)
  ) {
    return 'code';
  }

  return 'text';
}

/**
 * Partial result cache for incremental parsing
 */
export interface PartialResultCache {
  cache: Map<string, {
    lastContent: string;
    lastResult: PartialResultOutput;
    parseAttempts: number;
  }>;
  get: (streamId: string) => PartialResultOutput | undefined;
  set: (streamId: string, content: string, result: PartialResultOutput) => void;
  clear: (streamId: string) => void;
  getParseAttempts: (streamId: string) => number;
}

/**
 * Creates a partial result cache
 */
export function createPartialResultCache(): PartialResultCache {
  const cache = new Map<string, {
    lastContent: string;
    lastResult: PartialResultOutput;
    parseAttempts: number;
  }>();

  return {
    cache,
    get: (streamId) => cache.get(streamId)?.lastResult,
    set: (streamId, content, result) => {
      const existing = cache.get(streamId);
      cache.set(streamId, {
        lastContent: content,
        lastResult: result,
        parseAttempts: (existing?.parseAttempts ?? 0) + 1,
      });
    },
    clear: (streamId) => {
      cache.delete(streamId);
    },
    getParseAttempts: (streamId) => cache.get(streamId)?.parseAttempts ?? 0,
  };
}

/**
 * Creates a JSON partial result handler
 */
export function createJsonPartialResultHandler(): HookHandler<
  PartialResultInput,
  PartialResultOutput
> {
  return async (input, _context): Promise<HookResult<PartialResultOutput>> => {
    const content = input.accumulatedContent.trim();

    // Try to parse as complete JSON first
    try {
      const parsed = JSON.parse(content);
      return {
        success: true,
        data: {
          parsedPartial: parsed,
          confidence: 1.0,
        },
      };
    } catch {
      // Not complete JSON yet
    }

    // Try to extract partial JSON structure
    const partialResult = tryParsePartialJson(content);

    return {
      success: true,
      data: {
        parsedPartial: partialResult.value,
        confidence: partialResult.confidence,
        suggestions: partialResult.suggestions,
      },
    };
  };
}

/**
 * Try to parse partial JSON content
 */
function tryParsePartialJson(content: string): {
  value: unknown;
  confidence: number;
  suggestions?: string[];
} {
  // Count brackets to estimate completeness
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  const openBrackets = (content.match(/\[/g) || []).length;
  const closeBrackets = (content.match(/\]/g) || []).length;

  const bracketBalance = (openBraces - closeBraces) + (openBrackets - closeBrackets);

  // Try to close open brackets and parse
  if (bracketBalance > 0) {
    const closers = '}]'.repeat(bracketBalance);
    for (let i = 0; i < closers.length; i++) {
      const attempt = content + closers.substring(0, i + 1);
      try {
        const parsed = JSON.parse(attempt);
        return {
          value: parsed,
          confidence: Math.max(0.3, 1 - (i + 1) * 0.1),
          suggestions: [`Partial JSON, ${bracketBalance} brackets unclosed`],
        };
      } catch {
        // Continue trying
      }
    }
  }

  // Extract key-value pairs we can identify
  const keyValuePattern = /"([^"]+)":\s*("([^"\\]|\\.)*"|[\d.]+|true|false|null)/g;
  const matches = content.match(keyValuePattern);

  if (matches && matches.length > 0) {
    try {
      const partialObject: Record<string, unknown> = {};
      for (const match of matches) {
        const [key, value] = match.split(':').map((s) => s.trim());
        if (key && value) {
          const cleanKey = key.replace(/"/g, '');
          partialObject[cleanKey] = JSON.parse(value);
        }
      }
      return {
        value: partialObject,
        confidence: 0.4,
        suggestions: ['Extracted partial key-value pairs'],
      };
    } catch {
      // Fall through
    }
  }

  return {
    value: undefined,
    confidence: 0.1,
    suggestions: ['Unable to parse partial JSON'],
  };
}

/**
 * Creates a markdown partial result handler
 */
export function createMarkdownPartialResultHandler(): HookHandler<
  PartialResultInput,
  PartialResultOutput
> {
  return async (input, _context): Promise<HookResult<PartialResultOutput>> => {
    const content = input.accumulatedContent;

    // Parse markdown structure
    const structure = parseMarkdownStructure(content);

    return {
      success: true,
      data: {
        parsedPartial: structure,
        confidence: structure.complete ? 1.0 : 0.7,
        suggestions: structure.incomplete.length > 0
          ? [`Incomplete sections: ${structure.incomplete.join(', ')}`]
          : undefined,
      },
    };
  };
}

/**
 * Parse markdown structure
 */
function parseMarkdownStructure(content: string): {
  headings: string[];
  codeBlocks: number;
  lists: number;
  complete: boolean;
  incomplete: string[];
} {
  const lines = content.split('\n');
  const headings: string[] = [];
  let codeBlocks = 0;
  let lists = 0;
  let inCodeBlock = false;
  const incomplete: string[] = [];

  for (const line of lines) {
    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      headings.push(headingMatch[2]!);
    }

    // Code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        codeBlocks++;
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
    }

    // Lists
    if (/^[\s]*[-*+]\s/.test(line) || /^[\s]*\d+\.\s/.test(line)) {
      lists++;
    }
  }

  if (inCodeBlock) {
    incomplete.push('code block');
  }

  return {
    headings,
    codeBlocks,
    lists,
    complete: incomplete.length === 0,
    incomplete,
  };
}

/**
 * Creates a code partial result handler
 */
export function createCodePartialResultHandler(): HookHandler<
  PartialResultInput,
  PartialResultOutput
> {
  return async (input, _context): Promise<HookResult<PartialResultOutput>> => {
    const content = input.accumulatedContent;

    // Analyze code structure
    const analysis = analyzeCodeStructure(content);

    return {
      success: true,
      data: {
        parsedPartial: analysis,
        confidence: analysis.balanced ? 0.8 : 0.5,
        suggestions: analysis.issues.length > 0 ? analysis.issues : undefined,
      },
    };
  };
}

/**
 * Analyze code structure
 */
function analyzeCodeStructure(content: string): {
  functions: number;
  classes: number;
  imports: number;
  balanced: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Count structures
  const functions = (content.match(/function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\(/g) || []).length;
  const classes = (content.match(/class\s+\w+/g) || []).length;
  const imports = (content.match(/import\s+/g) || []).length;

  // Check balance
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  const openParens = (content.match(/\(/g) || []).length;
  const closeParens = (content.match(/\)/g) || []).length;

  const braceBalance = openBraces - closeBraces;
  const parenBalance = openParens - closeParens;

  if (braceBalance !== 0) {
    issues.push(`Unbalanced braces: ${braceBalance > 0 ? 'missing ' + braceBalance + ' }' : 'extra ' + Math.abs(braceBalance) + ' }'}`);
  }
  if (parenBalance !== 0) {
    issues.push(`Unbalanced parens: ${parenBalance > 0 ? 'missing ' + parenBalance + ' )' : 'extra ' + Math.abs(parenBalance) + ' )'}`);
  }

  return {
    functions,
    classes,
    imports,
    balanced: braceBalance === 0 && parenBalance === 0,
    issues,
  };
}

/**
 * Creates a progressive rendering handler
 */
export function createProgressiveRenderHandler(
  renderCallback: (partial: PartialResultOutput) => void
): HookHandler<PartialResultInput, PartialResultOutput> {
  return async (input, _context): Promise<HookResult<PartialResultOutput>> => {
    const structure = input.structureDetected ?? detectStructure(input.accumulatedContent);

    let result: PartialResultOutput;

    switch (structure) {
      case 'json':
        result = tryParsePartialJson(input.accumulatedContent);
        break;

      case 'markdown':
        result = {
          parsedPartial: parseMarkdownStructure(input.accumulatedContent),
          confidence: 0.8,
        };
        break;

      case 'code':
        result = {
          parsedPartial: analyzeCodeStructure(input.accumulatedContent),
          confidence: 0.7,
        };
        break;

      default:
        result = {
          parsedPartial: input.accumulatedContent,
          confidence: 1.0,
        };
    }

    // Invoke render callback
    renderCallback(result);

    return {
      success: true,
      data: result,
      metadata: {
        structure,
        contentLength: input.accumulatedContent.length,
      },
    };
  };
}

/**
 * Creates a threshold-based partial result handler
 */
export function createThresholdPartialResultHandler(
  confidenceThreshold: number = 0.7,
  innerHandler?: HookHandler<PartialResultInput, PartialResultOutput>
): HookHandler<PartialResultInput, PartialResultOutput> {
  return async (input, context): Promise<HookResult<PartialResultOutput>> => {
    const handler = innerHandler ?? defaultPartialResultHandler;
    const result = await handler(input, context);

    if (result.success && result.data.confidence < confidenceThreshold) {
      return {
        success: true,
        data: {
          ...result.data,
          suggestions: [
            ...(result.data.suggestions ?? []),
            `Confidence ${result.data.confidence.toFixed(2)} below threshold ${confidenceThreshold}`,
          ],
        },
        metadata: {
          belowThreshold: true,
        },
      };
    }

    return result;
  };
}

/**
 * Creates a cached partial result handler
 */
export function createCachedPartialResultHandler(
  cache: PartialResultCache,
  minContentDelta: number = 100,
  innerHandler?: HookHandler<PartialResultInput, PartialResultOutput>
): HookHandler<PartialResultInput, PartialResultOutput> {
  return async (input, context): Promise<HookResult<PartialResultOutput>> => {
    const cached = cache.cache.get(input.streamId);

    // Return cached if content hasn't changed enough
    if (cached) {
      const contentDelta = input.accumulatedContent.length - cached.lastContent.length;
      if (contentDelta < minContentDelta && contentDelta >= 0) {
        return {
          success: true,
          data: cached.lastResult,
          metadata: {
            cached: true,
            contentDelta,
          },
        };
      }
    }

    const handler = innerHandler ?? defaultPartialResultHandler;
    const result = await handler(input, context);

    if (result.success) {
      cache.set(input.streamId, input.accumulatedContent, result.data);
    }

    return result;
  };
}

/**
 * Creates a logging partial result handler
 */
export function createLoggingPartialResultHandler(
  logger: {
    debug: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<PartialResultInput, PartialResultOutput>
): HookHandler<PartialResultInput, PartialResultOutput> {
  return async (input, context): Promise<HookResult<PartialResultOutput>> => {
    logger.debug(`Processing partial result for stream: ${input.streamId}`, {
      streamId: input.streamId,
      contentLength: input.accumulatedContent.length,
      structureDetected: input.structureDetected,
      requestId: context.requestId,
    });

    const handler = innerHandler ?? defaultPartialResultHandler;
    const result = await handler(input, context);

    if (result.success) {
      logger.debug(`Partial result processed: ${input.streamId}`, {
        streamId: input.streamId,
        confidence: result.data.confidence,
        hasParsedPartial: result.data.parsedPartial !== undefined,
        suggestions: result.data.suggestions,
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Creates a composite partial result handler
 */
export function createCompositePartialResultHandler(
  handlers: Map<'json' | 'code' | 'markdown' | 'text', HookHandler<PartialResultInput, PartialResultOutput>>,
  defaultHandler?: HookHandler<PartialResultInput, PartialResultOutput>
): HookHandler<PartialResultInput, PartialResultOutput> {
  return async (input, context): Promise<HookResult<PartialResultOutput>> => {
    const structure = input.structureDetected ?? detectStructure(input.accumulatedContent);
    const handler = handlers.get(structure) ?? defaultHandler ?? defaultPartialResultHandler;

    return handler(input, context);
  };
}

/**
 * Register the default partial result hook
 */
export function registerDefaultPartialResult(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.PARTIAL_RESULT,
    {
      id: 'default-partial-result',
      name: 'Default Partial Result',
      priority: 'normal',
      description: 'Basic partial result handler',
    },
    defaultPartialResultHandler
  );
}
