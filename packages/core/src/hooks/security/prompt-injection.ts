/**
 * Prompt Injection Protection Hook (#46)
 *
 * Detects and prevents prompt injection attacks.
 * Use cases: security, input validation, attack prevention.
 */

import type {
  HookHandler,
  HookResult,
  PromptInjectionInput,
  PromptInjectionOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Known prompt injection patterns
 */
export const InjectionPatterns = {
  // Role override attempts
  roleOverride: [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /disregard\s+(all\s+)?prior\s+instructions/i,
    /forget\s+(everything|all)\s+(you\s+were\s+told|instructions)/i,
    /you\s+are\s+now\s+(?:a|an)\s+/i,
    /pretend\s+you\s+are\s+/i,
    /act\s+as\s+(?:if\s+)?you\s+are/i,
    /your\s+new\s+(?:instructions|role|persona)\s+(?:is|are)/i,
  ],

  // System prompt extraction
  systemPromptExtraction: [
    /(?:what|show|reveal|tell)\s+(?:me\s+)?(?:your|the)\s+(?:system|initial)\s+(?:prompt|instructions)/i,
    /repeat\s+(?:your|the)\s+(?:system|initial)\s+(?:prompt|instructions)/i,
    /output\s+(?:your|the)\s+(?:system|initial)\s+(?:prompt|instructions)/i,
  ],

  // Delimiter injection
  delimiterInjection: [
    /```system/i,
    /\[system\]/i,
    /<system>/i,
    /\[\[system\]\]/i,
    /system:\s*$/im,
    /assistant:\s*$/im,
    /user:\s*$/im,
  ],

  // Jailbreak attempts
  jailbreak: [
    /DAN\s+mode/i,
    /developer\s+mode/i,
    /bypass\s+(?:your\s+)?(?:restrictions|safety|filters)/i,
    /unlock\s+(?:your\s+)?(?:restrictions|safety|filters)/i,
    /disable\s+(?:your\s+)?(?:restrictions|safety|filters)/i,
    /you\s+(?:can|must)\s+do\s+anything/i,
    /no\s+(?:restrictions|rules|limitations)\s+(?:apply|exist)/i,
  ],

  // Output manipulation
  outputManipulation: [
    /respond\s+only\s+with/i,
    /your\s+(?:only\s+)?response\s+(?:should|must)\s+be/i,
    /do\s+not\s+(?:say|mention|include)\s+anything\s+(?:else|other)/i,
    /begin\s+(?:your\s+)?(?:response|output)\s+with/i,
  ],

  // Encoding tricks
  encodingTricks: [
    /base64:/i,
    /\\x[0-9a-f]{2}/i,
    /&#x?[0-9a-f]+;/i,
    /\\u[0-9a-f]{4}/i,
  ],
};

/**
 * Default prompt injection detection handler
 */
export const defaultPromptInjectionHandler: HookHandler<
  PromptInjectionInput,
  PromptInjectionOutput
> = async (input, _context): Promise<HookResult<PromptInjectionOutput>> => {
  const detectedPatterns: string[] = [];
  let maxConfidence = 0;

  // Check all pattern categories
  for (const [category, patterns] of Object.entries(InjectionPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(input.content)) {
        detectedPatterns.push(category);
        maxConfidence = Math.max(maxConfidence, getCategoryConfidence(category));
      }
    }
  }

  // Check custom known patterns
  if (input.knownPatterns) {
    for (const pattern of input.knownPatterns) {
      if (input.content.toLowerCase().includes(pattern.toLowerCase())) {
        detectedPatterns.push(`custom:${pattern}`);
        maxConfidence = Math.max(maxConfidence, 0.9);
      }
    }
  }

  // Adjust confidence based on source
  let sourceMultiplier = 1;
  switch (input.source) {
    case 'user':
      sourceMultiplier = 1;
      break;
    case 'tool':
      sourceMultiplier = 0.8; // Tool output is less likely to be malicious
      break;
    case 'external':
      sourceMultiplier = 1.2; // External data is more risky
      break;
  }

  const confidence = Math.min(maxConfidence * sourceMultiplier, 1);
  const detected = detectedPatterns.length > 0;

  // Determine action
  let action: PromptInjectionOutput['action'] = 'allow';
  if (confidence >= 0.8) {
    action = 'block';
  } else if (confidence >= 0.5) {
    action = 'warn';
  }

  return {
    success: true,
    data: {
      detected,
      confidence,
      patterns: [...new Set(detectedPatterns)],
      action,
    },
  };
};

/**
 * Get confidence score for a pattern category
 */
function getCategoryConfidence(category: string): number {
  switch (category) {
    case 'roleOverride':
      return 0.9;
    case 'systemPromptExtraction':
      return 0.85;
    case 'delimiterInjection':
      return 0.8;
    case 'jailbreak':
      return 0.95;
    case 'outputManipulation':
      return 0.7;
    case 'encodingTricks':
      return 0.6;
    default:
      return 0.5;
  }
}

/**
 * Creates a prompt injection handler with custom patterns
 */
export function createCustomPatternInjectionHandler(
  customPatterns: Record<string, RegExp[]>
): HookHandler<PromptInjectionInput, PromptInjectionOutput> {
  const allPatterns = { ...InjectionPatterns, ...customPatterns };

  return async (input, _context): Promise<HookResult<PromptInjectionOutput>> => {
    const detectedPatterns: string[] = [];
    let maxConfidence = 0;

    for (const [category, patterns] of Object.entries(allPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(input.content)) {
          detectedPatterns.push(category);
          maxConfidence = Math.max(maxConfidence, getCategoryConfidence(category));
        }
      }
    }

    const confidence = maxConfidence;
    const detected = detectedPatterns.length > 0;

    let action: PromptInjectionOutput['action'] = 'allow';
    if (confidence >= 0.8) {
      action = 'block';
    } else if (confidence >= 0.5) {
      action = 'warn';
    }

    return {
      success: true,
      data: {
        detected,
        confidence,
        patterns: [...new Set(detectedPatterns)],
        action,
      },
    };
  };
}

/**
 * Creates a prompt injection handler with configurable thresholds
 */
export function createThresholdInjectionHandler(
  warnThreshold: number = 0.5,
  blockThreshold: number = 0.8
): HookHandler<PromptInjectionInput, PromptInjectionOutput> {
  return async (input, _context): Promise<HookResult<PromptInjectionOutput>> => {
    const detectedPatterns: string[] = [];
    let maxConfidence = 0;

    for (const [category, patterns] of Object.entries(InjectionPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(input.content)) {
          detectedPatterns.push(category);
          maxConfidence = Math.max(maxConfidence, getCategoryConfidence(category));
        }
      }
    }

    const confidence = maxConfidence;
    const detected = detectedPatterns.length > 0;

    let action: PromptInjectionOutput['action'] = 'allow';
    if (confidence >= blockThreshold) {
      action = 'block';
    } else if (confidence >= warnThreshold) {
      action = 'warn';
    }

    return {
      success: true,
      data: {
        detected,
        confidence,
        patterns: [...new Set(detectedPatterns)],
        action,
      },
      metadata: {
        warnThreshold,
        blockThreshold,
      },
    };
  };
}

/**
 * Creates a prompt injection handler with heuristic analysis
 */
export function createHeuristicInjectionHandler(): HookHandler<
  PromptInjectionInput,
  PromptInjectionOutput
> {
  return async (input, _context): Promise<HookResult<PromptInjectionOutput>> => {
    const detectedPatterns: string[] = [];
    let confidence = 0;

    // Pattern-based detection
    for (const [category, patterns] of Object.entries(InjectionPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(input.content)) {
          detectedPatterns.push(category);
          confidence = Math.max(confidence, getCategoryConfidence(category));
        }
      }
    }

    // Heuristic analysis
    const heuristics = analyzeHeuristics(input.content);
    confidence = Math.max(confidence, heuristics.confidence);
    detectedPatterns.push(...heuristics.patterns);

    const detected = detectedPatterns.length > 0;

    let action: PromptInjectionOutput['action'] = 'allow';
    if (confidence >= 0.8) {
      action = 'block';
    } else if (confidence >= 0.5) {
      action = 'warn';
    }

    return {
      success: true,
      data: {
        detected,
        confidence,
        patterns: [...new Set(detectedPatterns)],
        action,
      },
      metadata: {
        heuristics: heuristics.details,
      },
    };
  };
}

/**
 * Analyze content using heuristics
 */
function analyzeHeuristics(content: string): {
  confidence: number;
  patterns: string[];
  details: Record<string, unknown>;
} {
  const patterns: string[] = [];
  let confidence = 0;
  const details: Record<string, unknown> = {};

  // Check for unusual character ratios
  const uppercaseRatio = (content.match(/[A-Z]/g) || []).length / content.length;
  if (uppercaseRatio > 0.5) {
    patterns.push('high-uppercase-ratio');
    confidence = Math.max(confidence, 0.3);
    details['uppercaseRatio'] = uppercaseRatio;
  }

  // Check for suspicious keywords frequency
  const suspiciousKeywords = ['ignore', 'disregard', 'forget', 'pretend', 'bypass'];
  const keywordCount = suspiciousKeywords.reduce((count, keyword) => {
    const regex = new RegExp(keyword, 'gi');
    return count + (content.match(regex) || []).length;
  }, 0);

  if (keywordCount >= 2) {
    patterns.push('multiple-suspicious-keywords');
    confidence = Math.max(confidence, 0.5 + keywordCount * 0.1);
    details['suspiciousKeywordCount'] = keywordCount;
  }

  // Check for role markers
  const roleMarkers = ['system:', 'assistant:', 'user:', '[INST]', '[/INST]'];
  const hasRoleMarkers = roleMarkers.some((marker) =>
    content.toLowerCase().includes(marker.toLowerCase())
  );

  if (hasRoleMarkers) {
    patterns.push('role-markers');
    confidence = Math.max(confidence, 0.6);
    details['hasRoleMarkers'] = true;
  }

  // Check for instruction-like patterns
  const instructionPatterns = /^(?:you\s+(?:must|should|will)|(?:always|never)\s+)/im;
  if (instructionPatterns.test(content)) {
    patterns.push('instruction-patterns');
    confidence = Math.max(confidence, 0.4);
    details['hasInstructionPatterns'] = true;
  }

  // Check for unusual whitespace or hidden characters
  const hiddenChars = (content.match(/[\u200B-\u200D\uFEFF\u00A0]/g) || []).length;
  if (hiddenChars > 0) {
    patterns.push('hidden-characters');
    confidence = Math.max(confidence, 0.5);
    details['hiddenCharCount'] = hiddenChars;
  }

  return { confidence: Math.min(confidence, 1), patterns, details };
}

/**
 * Creates a prompt injection handler with blocklist
 */
export function createBlocklistInjectionHandler(
  blocklist: string[]
): HookHandler<PromptInjectionInput, PromptInjectionOutput> {
  return async (input, _context): Promise<HookResult<PromptInjectionOutput>> => {
    const detectedPatterns: string[] = [];
    const contentLower = input.content.toLowerCase();

    for (const blocked of blocklist) {
      if (contentLower.includes(blocked.toLowerCase())) {
        detectedPatterns.push(`blocklist:${blocked}`);
      }
    }

    const detected = detectedPatterns.length > 0;
    const confidence = detected ? 1.0 : 0;

    return {
      success: true,
      data: {
        detected,
        confidence,
        patterns: detectedPatterns,
        action: detected ? 'block' : 'allow',
      },
    };
  };
}

/**
 * Creates a prompt injection handler with rate limiting
 */
export function createRateLimitingInjectionHandler(
  maxDetectionsPerWindow: number = 3,
  windowMs: number = 60000
): HookHandler<PromptInjectionInput, PromptInjectionOutput> {
  const detectionHistory = new Map<string, number[]>();

  return async (input, context): Promise<HookResult<PromptInjectionOutput>> => {
    const userId = (context.metadata['userId'] as string) ?? 'default';
    const now = Date.now();

    // Get detection history for user
    let history = detectionHistory.get(userId) ?? [];

    // Remove old entries
    history = history.filter((t) => now - t < windowMs);
    detectionHistory.set(userId, history);

    // Run standard detection
    const result = await defaultPromptInjectionHandler(input, context);

    if (result.success && result.data.detected) {
      history.push(now);

      // Check if rate limit exceeded
      if (history.length >= maxDetectionsPerWindow) {
        return {
          success: true,
          data: {
            detected: true,
            confidence: 1.0,
            patterns: [...result.data.patterns, 'rate-limit-exceeded'],
            action: 'block',
          },
          metadata: {
            rateLimited: true,
            detectionCount: history.length,
            windowMs,
          },
        };
      }
    }

    return result;
  };
}

/**
 * Creates a logging prompt injection handler
 */
export function createLoggingInjectionHandler(
  logger: {
    info: (message: string, context: Record<string, unknown>) => void;
    warn: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<PromptInjectionInput, PromptInjectionOutput>
): HookHandler<PromptInjectionInput, PromptInjectionOutput> {
  return async (input, context): Promise<HookResult<PromptInjectionOutput>> => {
    const handler = innerHandler ?? defaultPromptInjectionHandler;
    const result = await handler(input, context);

    if (result.success && result.data.detected) {
      const logFn = result.data.action === 'block' ? logger.warn : logger.info;
      logFn(`Prompt injection ${result.data.action}ed`, {
        source: input.source,
        confidence: result.data.confidence,
        patterns: result.data.patterns,
        action: result.data.action,
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Register the default prompt injection hook
 */
export function registerDefaultPromptInjection(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.PROMPT_INJECTION,
    {
      id: 'default-prompt-injection',
      name: 'Default Prompt Injection',
      priority: 'critical',
      description: 'Basic prompt injection detection handler',
    },
    defaultPromptInjectionHandler
  );
}
