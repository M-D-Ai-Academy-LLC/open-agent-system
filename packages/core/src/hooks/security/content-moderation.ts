/**
 * Content Moderation Hook (#47)
 *
 * Moderates content for harmful or inappropriate material.
 * Use cases: hate speech detection, violence detection, NSFW filtering.
 */

import type {
  HookHandler,
  HookResult,
  ContentModerationInput,
  ContentModerationOutput,
  ModerationCategory,
  ModerationViolation,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default patterns for content moderation categories
 */
export const ModerationPatterns: Record<ModerationCategory, RegExp[]> = {
  hate: [
    /\b(hate|despise)\s+(all\s+)?(blacks?|whites?|jews?|muslims?|christians?|asians?)\b/i,
    /\b(racial|ethnic)\s+(slurs?|epithets?)\b/i,
    /\b(white|black)\s+supremacy\b/i,
    /\bnazi\b/i,
    /\bgenocide\b/i,
  ],
  violence: [
    /\b(kill|murder|assassinate|slaughter)\s+(him|her|them|everyone|people)\b/i,
    /\b(bomb|shoot|stab)\s+(the|a)\s+/i,
    /\bmass\s+(shooting|murder|killing)\b/i,
    /\bterrorist\s+attack\b/i,
    /\bhow\s+to\s+(make|build)\s+(a\s+)?(bomb|weapon|explosive)\b/i,
  ],
  sexual: [
    /\bexplicit\s+sexual\s+content\b/i,
    /\bpornographic\b/i,
    /\bchild\s+(porn|pornography|exploitation)\b/i,
    /\bcsam\b/i,
  ],
  'self-harm': [
    /\b(how\s+to\s+)?(commit\s+)?suicide\b/i,
    /\bkill\s+(myself|yourself)\b/i,
    /\bself[\s-]?harm\b/i,
    /\bcut(ting)?\s+(myself|yourself)\b/i,
    /\b(best|easy)\s+way\s+to\s+die\b/i,
  ],
  illegal: [
    /\bhow\s+to\s+(hack|break\s+into)\b/i,
    /\b(buy|sell)\s+(drugs?|cocaine|heroin|meth)\b/i,
    /\b(steal|rob|burglarize)\b/i,
    /\b(launder|laundering)\s+money\b/i,
    /\bfraud\s+(scheme|tutorial)\b/i,
  ],
  harassment: [
    /\b(stalk|stalking|dox|doxxing)\b/i,
    /\bbully(ing)?\b/i,
    /\bthreat(en|ening)?\b/i,
    /\b(i('ll|\s+will)\s+)?(find|hunt)\s+(you|them)\s+down\b/i,
    /\b(you|they)\s+(deserve|should)\s+(to\s+)?(die|suffer)\b/i,
  ],
};

/**
 * Category severity weights
 */
export const CategorySeverityWeights: Record<ModerationCategory, number> = {
  hate: 0.9,
  violence: 0.95,
  sexual: 0.85,
  'self-harm': 0.9,
  illegal: 0.8,
  harassment: 0.75,
};

/**
 * Default content moderation handler
 */
export const defaultContentModerationHandler: HookHandler<
  ContentModerationInput,
  ContentModerationOutput
> = async (input, _context): Promise<HookResult<ContentModerationOutput>> => {
  const violations: ModerationViolation[] = [];
  const scores: Record<string, number> = {};

  // Check each requested category
  for (const category of input.categories) {
    const patterns = ModerationPatterns[category] ?? [];
    let categoryScore = 0;

    for (const pattern of patterns) {
      const matches = input.content.match(pattern);
      if (matches) {
        const snippet = extractSnippet(input.content, matches.index ?? 0);
        violations.push({
          category,
          severity: determineSeverity(category, input.strictness),
          snippet,
          explanation: `Content matches ${category} pattern`,
        });
        categoryScore = Math.max(categoryScore, CategorySeverityWeights[category] ?? 0.5);
      }
    }

    scores[category] = categoryScore;
  }

  // Determine if content passes based on strictness
  const passed = determinePass(violations, input.strictness);

  return {
    success: true,
    data: {
      passed,
      violations,
      scores,
    },
  };
};

/**
 * Extract snippet around match for context
 */
function extractSnippet(content: string, matchIndex: number, contextSize: number = 50): string {
  const start = Math.max(0, matchIndex - contextSize);
  const end = Math.min(content.length, matchIndex + contextSize);
  let snippet = content.slice(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';

  return snippet;
}

/**
 * Determine violation severity based on category and strictness
 */
function determineSeverity(
  category: ModerationCategory,
  strictness: ContentModerationInput['strictness']
): ModerationViolation['severity'] {
  const baseWeight = CategorySeverityWeights[category] ?? 0.5;

  // Adjust based on strictness
  let adjustedWeight = baseWeight;
  switch (strictness) {
    case 'lenient':
      adjustedWeight = baseWeight * 0.7;
      break;
    case 'moderate':
      adjustedWeight = baseWeight;
      break;
    case 'strict':
      adjustedWeight = baseWeight * 1.3;
      break;
  }

  if (adjustedWeight >= 0.9) return 'high';
  if (adjustedWeight >= 0.6) return 'medium';
  return 'low';
}

/**
 * Determine if content passes moderation
 */
function determinePass(
  violations: ModerationViolation[],
  strictness: ContentModerationInput['strictness']
): boolean {
  if (violations.length === 0) return true;

  switch (strictness) {
    case 'lenient':
      // Only fail on high severity
      return !violations.some((v) => v.severity === 'high');
    case 'moderate':
      // Fail on high or multiple medium
      return !violations.some((v) => v.severity === 'high') &&
        violations.filter((v) => v.severity === 'medium').length < 2;
    case 'strict':
      // Fail on any violation
      return false;
    default:
      return violations.length === 0;
  }
}

/**
 * Creates a content moderation handler with custom patterns
 */
export function createCustomModerationHandler(
  customPatterns: Partial<Record<ModerationCategory, RegExp[]>>
): HookHandler<ContentModerationInput, ContentModerationOutput> {
  const allPatterns = { ...ModerationPatterns };
  for (const [category, patterns] of Object.entries(customPatterns)) {
    const cat = category as ModerationCategory;
    allPatterns[cat] = [...(allPatterns[cat] ?? []), ...(patterns ?? [])];
  }

  return async (input, _context): Promise<HookResult<ContentModerationOutput>> => {
    const violations: ModerationViolation[] = [];
    const scores: Record<string, number> = {};

    for (const category of input.categories) {
      const patterns = allPatterns[category] ?? [];
      let categoryScore = 0;

      for (const pattern of patterns) {
        const matches = input.content.match(pattern);
        if (matches) {
          const snippet = extractSnippet(input.content, matches.index ?? 0);
          violations.push({
            category,
            severity: determineSeverity(category, input.strictness),
            snippet,
            explanation: `Content matches ${category} pattern`,
          });
          categoryScore = Math.max(categoryScore, CategorySeverityWeights[category] ?? 0.5);
        }
      }

      scores[category] = categoryScore;
    }

    return {
      success: true,
      data: {
        passed: determinePass(violations, input.strictness),
        violations,
        scores,
      },
    };
  };
}

/**
 * Creates a content moderation handler with ML-style scoring
 */
export function createScoringModerationHandler(
  threshold: number = 0.7
): HookHandler<ContentModerationInput, ContentModerationOutput> {
  return async (input, _context): Promise<HookResult<ContentModerationOutput>> => {
    const violations: ModerationViolation[] = [];
    const scores: Record<string, number> = {};

    for (const category of input.categories) {
      const patterns = ModerationPatterns[category] ?? [];
      let categoryScore = 0;
      let matchCount = 0;

      for (const pattern of patterns) {
        const matches = input.content.match(new RegExp(pattern, 'gi'));
        if (matches) {
          matchCount += matches.length;
        }
      }

      // Score based on number of matches and category weight
      if (matchCount > 0) {
        categoryScore = Math.min(
          1,
          (matchCount * 0.2) + (CategorySeverityWeights[category] ?? 0.5)
        );

        if (categoryScore >= threshold) {
          violations.push({
            category,
            severity: categoryScore >= 0.9 ? 'high' : categoryScore >= 0.7 ? 'medium' : 'low',
            snippet: input.content.slice(0, 100),
            explanation: `Category score ${categoryScore.toFixed(2)} exceeds threshold`,
          });
        }
      }

      scores[category] = categoryScore;
    }

    // Adjust threshold based on strictness
    let effectiveThreshold = threshold;
    switch (input.strictness) {
      case 'lenient':
        effectiveThreshold = threshold * 1.3;
        break;
      case 'strict':
        effectiveThreshold = threshold * 0.7;
        break;
    }

    const maxScore = Math.max(...Object.values(scores));

    return {
      success: true,
      data: {
        passed: maxScore < effectiveThreshold,
        violations,
        scores,
      },
      metadata: {
        threshold: effectiveThreshold,
        maxScore,
      },
    };
  };
}

/**
 * Creates a content moderation handler with keyword allowlist
 */
export function createAllowlistModerationHandler(
  allowlist: string[]
): HookHandler<ContentModerationInput, ContentModerationOutput> {
  const allowSet = new Set(allowlist.map((w) => w.toLowerCase()));

  return async (input, context): Promise<HookResult<ContentModerationOutput>> => {
    // First run standard moderation
    const result = await defaultContentModerationHandler(input, context);

    if (!result.success) return result;

    // Filter out violations that match allowlist
    const filteredViolations = result.data.violations.filter((v) => {
      const words = v.snippet.toLowerCase().split(/\s+/);
      return !words.some((w) => allowSet.has(w));
    });

    return {
      success: true,
      data: {
        passed: filteredViolations.length === 0 || result.data.passed,
        violations: filteredViolations,
        scores: result.data.scores,
      },
      metadata: {
        allowlistApplied: true,
        originalViolationCount: result.data.violations.length,
        filteredViolationCount: filteredViolations.length,
      },
    };
  };
}

/**
 * Creates a tiered content moderation handler
 */
export function createTieredModerationHandler(
  tiers: {
    category: ModerationCategory;
    patterns: RegExp[];
    blockThreshold: number;
    warnThreshold: number;
  }[]
): HookHandler<ContentModerationInput, ContentModerationOutput> {
  return async (input, _context): Promise<HookResult<ContentModerationOutput>> => {
    const violations: ModerationViolation[] = [];
    const scores: Record<string, number> = {};
    let shouldBlock = false;
    const warnings: string[] = [];

    for (const tier of tiers) {
      if (!input.categories.includes(tier.category)) continue;

      let categoryScore = 0;
      for (const pattern of tier.patterns) {
        const matches = input.content.match(new RegExp(pattern, 'gi'));
        if (matches) {
          categoryScore += matches.length * 0.2;
        }
      }
      categoryScore = Math.min(1, categoryScore);
      scores[tier.category] = categoryScore;

      if (categoryScore >= tier.blockThreshold) {
        shouldBlock = true;
        violations.push({
          category: tier.category,
          severity: 'high',
          snippet: input.content.slice(0, 100),
          explanation: `Score ${categoryScore.toFixed(2)} exceeds block threshold ${tier.blockThreshold}`,
        });
      } else if (categoryScore >= tier.warnThreshold) {
        warnings.push(`${tier.category}: score ${categoryScore.toFixed(2)}`);
        violations.push({
          category: tier.category,
          severity: 'medium',
          snippet: input.content.slice(0, 100),
          explanation: `Score ${categoryScore.toFixed(2)} exceeds warn threshold ${tier.warnThreshold}`,
        });
      }
    }

    return {
      success: true,
      data: {
        passed: !shouldBlock,
        violations,
        scores,
      },
      metadata: {
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    };
  };
}

/**
 * Creates a logging content moderation handler
 */
export function createLoggingModerationHandler(
  logger: {
    info: (message: string, context: Record<string, unknown>) => void;
    warn: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<ContentModerationInput, ContentModerationOutput>
): HookHandler<ContentModerationInput, ContentModerationOutput> {
  return async (input, context): Promise<HookResult<ContentModerationOutput>> => {
    const handler = innerHandler ?? defaultContentModerationHandler;
    const result = await handler(input, context);

    if (result.success) {
      const logFn = result.data.passed ? logger.info : logger.warn;
      logFn(`Content moderation ${result.data.passed ? 'passed' : 'failed'}`, {
        categories: input.categories,
        strictness: input.strictness,
        passed: result.data.passed,
        violationCount: result.data.violations.length,
        scores: result.data.scores,
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Register the default content moderation hook
 */
export function registerDefaultContentModeration(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.CONTENT_MODERATION,
    {
      id: 'default-content-moderation',
      name: 'Default Content Moderation',
      priority: 'critical',
      description: 'Basic content moderation handler',
    },
    defaultContentModerationHandler
  );
}
