/**
 * PII Detection Hook (#45)
 *
 * Detects personally identifiable information in content.
 * Use cases: data privacy, compliance checking, data classification.
 */

import type {
  HookHandler,
  HookResult,
  PiiDetectionInput,
  PiiDetectionOutput,
  PiiType,
  PiiMatch,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * PII detection patterns
 */
export const PiiPatterns: Record<PiiType, { pattern: RegExp; confidence: number }> = {
  email: {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    confidence: 0.95,
  },
  phone: {
    pattern: /\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    confidence: 0.85,
  },
  ssn: {
    pattern: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
    confidence: 0.90,
  },
  'credit-card': {
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    confidence: 0.95,
  },
  address: {
    pattern: /\b\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|way|place|pl)\b/gi,
    confidence: 0.70,
  },
  name: {
    pattern: /\b[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g,
    confidence: 0.40, // Low confidence - many false positives
  },
  'ip-address': {
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    confidence: 0.95,
  },
  'date-of-birth': {
    pattern: /\b(?:\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{4}[-\/]\d{1,2}[-\/]\d{1,2})\b/g,
    confidence: 0.50, // Medium confidence - could be any date
  },
};

/**
 * Default PII detection handler
 */
export const defaultPiiDetectionHandler: HookHandler<
  PiiDetectionInput,
  PiiDetectionOutput
> = async (input, _context): Promise<HookResult<PiiDetectionOutput>> => {
  const detected: PiiMatch[] = [];
  const threshold = input.threshold ?? 0.5;

  for (const piiType of input.piiTypes) {
    const config = PiiPatterns[piiType];
    if (!config || config.confidence < threshold) continue;

    const pattern = new RegExp(config.pattern.source, config.pattern.flags);
    let match;

    while ((match = pattern.exec(input.content)) !== null) {
      detected.push({
        type: piiType,
        value: match[0],
        confidence: config.confidence,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // Calculate risk level
  let risk: PiiDetectionOutput['risk'] = 'none';
  if (detected.length > 0) {
    const maxConfidence = Math.max(...detected.map((d) => d.confidence));
    const hasSensitive = detected.some((d) =>
      ['ssn', 'credit-card'].includes(d.type)
    );

    if (hasSensitive || maxConfidence >= 0.9) {
      risk = 'high';
    } else if (maxConfidence >= 0.7) {
      risk = 'medium';
    } else {
      risk = 'low';
    }
  }

  // Generate recommendations
  const recommendations: string[] = [];
  if (risk !== 'none') {
    const types = [...new Set(detected.map((d) => d.type))];
    recommendations.push(`Detected ${detected.length} potential PII items`);
    recommendations.push(`PII types found: ${types.join(', ')}`);

    if (risk === 'high') {
      recommendations.push('Consider redacting or encrypting this content');
    }
  }

  return {
    success: true,
    data: {
      detected,
      risk,
      recommendations,
    },
  };
};

/**
 * Creates a PII detection handler with custom patterns
 */
export function createCustomPiiDetectionHandler(
  customPatterns: Partial<Record<PiiType, { pattern: RegExp; confidence: number }>>
): HookHandler<PiiDetectionInput, PiiDetectionOutput> {
  const patterns = { ...PiiPatterns, ...customPatterns };

  return async (input, _context): Promise<HookResult<PiiDetectionOutput>> => {
    const detected: PiiMatch[] = [];
    const threshold = input.threshold ?? 0.5;

    for (const piiType of input.piiTypes) {
      const config = patterns[piiType];
      if (!config || config.confidence < threshold) continue;

      const pattern = new RegExp(config.pattern.source, config.pattern.flags);
      let match;

      while ((match = pattern.exec(input.content)) !== null) {
        detected.push({
          type: piiType,
          value: match[0],
          confidence: config.confidence,
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }

    const risk = calculateRisk(detected);
    const recommendations = generateRecommendations(detected, risk);

    return {
      success: true,
      data: {
        detected,
        risk,
        recommendations,
      },
    };
  };
}

/**
 * Calculate risk level from detected PII
 */
function calculateRisk(detected: PiiMatch[]): PiiDetectionOutput['risk'] {
  if (detected.length === 0) return 'none';

  const maxConfidence = Math.max(...detected.map((d) => d.confidence));
  const hasSensitive = detected.some((d) =>
    ['ssn', 'credit-card'].includes(d.type)
  );

  if (hasSensitive || maxConfidence >= 0.9) return 'high';
  if (maxConfidence >= 0.7) return 'medium';
  return 'low';
}

/**
 * Generate recommendations based on detected PII
 */
function generateRecommendations(
  detected: PiiMatch[],
  risk: PiiDetectionOutput['risk']
): string[] {
  const recommendations: string[] = [];

  if (risk === 'none') return recommendations;

  const types = [...new Set(detected.map((d) => d.type))];
  recommendations.push(`Detected ${detected.length} potential PII items`);
  recommendations.push(`PII types found: ${types.join(', ')}`);

  if (risk === 'high') {
    recommendations.push('URGENT: Consider immediate redaction or encryption');
    recommendations.push('Review data handling policies');
  } else if (risk === 'medium') {
    recommendations.push('Consider redacting sensitive information');
  }

  return recommendations;
}

/**
 * Creates a PII detection handler with validation
 */
export function createValidatingPiiDetectionHandler(): HookHandler<
  PiiDetectionInput,
  PiiDetectionOutput
> {
  return async (input, _context): Promise<HookResult<PiiDetectionOutput>> => {
    const detected: PiiMatch[] = [];
    const threshold = input.threshold ?? 0.5;

    for (const piiType of input.piiTypes) {
      const config = PiiPatterns[piiType];
      if (!config) continue;

      const pattern = new RegExp(config.pattern.source, config.pattern.flags);
      let match;

      while ((match = pattern.exec(input.content)) !== null) {
        const value = match[0];
        let confidence = config.confidence;

        // Validate and adjust confidence
        switch (piiType) {
          case 'email':
            // Check for valid TLD
            if (!/\.(com|org|net|edu|gov|io|co|uk|de|fr)$/i.test(value)) {
              confidence *= 0.8;
            }
            break;

          case 'phone':
            // Check for reasonable phone number
            const digits = value.replace(/\D/g, '');
            if (digits.length < 10 || digits.length > 15) {
              confidence *= 0.6;
            }
            break;

          case 'ssn':
            // SSN validation
            const ssnDigits = value.replace(/\D/g, '');
            if (ssnDigits.startsWith('000') || ssnDigits.startsWith('666')) {
              confidence *= 0.3; // Invalid SSN
            }
            break;

          case 'credit-card':
            // Luhn check
            if (!luhnCheck(value.replace(/\D/g, ''))) {
              confidence *= 0.4;
            }
            break;

          case 'ip-address':
            // Check for valid IP
            const octets = value.split('.').map(Number);
            if (octets.some((o) => o > 255)) {
              continue; // Skip invalid IPs
            }
            break;
        }

        if (confidence >= threshold) {
          detected.push({
            type: piiType,
            value,
            confidence,
            start: match.index,
            end: match.index + match[0].length,
          });
        }
      }
    }

    const risk = calculateRisk(detected);
    const recommendations = generateRecommendations(detected, risk);

    return {
      success: true,
      data: {
        detected,
        risk,
        recommendations,
      },
      metadata: {
        validated: true,
      },
    };
  };
}

/**
 * Luhn algorithm for credit card validation
 */
function luhnCheck(cardNumber: string): boolean {
  const digits = cardNumber.split('').map(Number).reverse();
  let sum = 0;

  for (let i = 0; i < digits.length; i++) {
    let digit = digits[i]!;
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }

  return sum % 10 === 0;
}

/**
 * Creates a PII detection handler with context awareness
 */
export function createContextAwarePiiDetectionHandler(
  contextRules: Array<{
    context: Record<string, unknown>;
    piiTypes: PiiType[];
    threshold?: number;
  }>
): HookHandler<PiiDetectionInput, PiiDetectionOutput> {
  return async (input, context): Promise<HookResult<PiiDetectionOutput>> => {
    // Find matching context rule
    let piiTypes = input.piiTypes;
    let threshold = input.threshold ?? 0.5;

    for (const rule of contextRules) {
      const matches = Object.entries(rule.context).every(
        ([key, value]) => context.metadata[key] === value
      );

      if (matches) {
        piiTypes = rule.piiTypes;
        threshold = rule.threshold ?? threshold;
        break;
      }
    }

    const detected: PiiMatch[] = [];

    for (const piiType of piiTypes) {
      const config = PiiPatterns[piiType];
      if (!config || config.confidence < threshold) continue;

      const pattern = new RegExp(config.pattern.source, config.pattern.flags);
      let match;

      while ((match = pattern.exec(input.content)) !== null) {
        detected.push({
          type: piiType,
          value: match[0],
          confidence: config.confidence,
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }

    const risk = calculateRisk(detected);
    const recommendations = generateRecommendations(detected, risk);

    return {
      success: true,
      data: {
        detected,
        risk,
        recommendations,
      },
    };
  };
}

/**
 * Creates a PII detection handler with caching
 */
export function createCachingPiiDetectionHandler(
  cacheSize: number = 1000,
  innerHandler?: HookHandler<PiiDetectionInput, PiiDetectionOutput>
): HookHandler<PiiDetectionInput, PiiDetectionOutput> {
  const cache = new Map<string, PiiDetectionOutput>();

  return async (input, context): Promise<HookResult<PiiDetectionOutput>> => {
    const cacheKey = `${input.content}::${input.piiTypes.join(',')}::${input.threshold}`;

    if (cache.has(cacheKey)) {
      return {
        success: true,
        data: cache.get(cacheKey)!,
        metadata: { cached: true },
      };
    }

    const handler = innerHandler ?? defaultPiiDetectionHandler;
    const result = await handler(input, context);

    if (result.success) {
      if (cache.size >= cacheSize) {
        const firstKey = cache.keys().next().value;
        if (firstKey) cache.delete(firstKey);
      }
      cache.set(cacheKey, result.data);
    }

    return result;
  };
}

/**
 * Creates a logging PII detection handler
 */
export function createLoggingPiiDetectionHandler(
  logger: {
    info: (message: string, context: Record<string, unknown>) => void;
    warn: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<PiiDetectionInput, PiiDetectionOutput>
): HookHandler<PiiDetectionInput, PiiDetectionOutput> {
  return async (input, context): Promise<HookResult<PiiDetectionOutput>> => {
    const handler = innerHandler ?? defaultPiiDetectionHandler;
    const result = await handler(input, context);

    if (result.success) {
      const logFn = result.data.risk === 'high' ? logger.warn : logger.info;
      logFn(`PII detection completed`, {
        detectedCount: result.data.detected.length,
        risk: result.data.risk,
        piiTypesScanned: input.piiTypes,
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Register the default PII detection hook
 */
export function registerDefaultPiiDetection(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.PII_DETECTION,
    {
      id: 'default-pii-detection',
      name: 'Default PII Detection',
      priority: 'high',
      description: 'Basic PII detection handler',
    },
    defaultPiiDetectionHandler
  );
}
