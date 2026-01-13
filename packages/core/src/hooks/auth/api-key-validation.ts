/**
 * API Key Validation Hook (#8)
 *
 * Validates API keys for authentication and authorization.
 * Use cases: key format validation, scope verification, expiration checks.
 */

import type {
  HookHandler,
  HookResult,
  ApiKeyValidationInput,
  ApiKeyValidationOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default API key validation handler - validates basic format
 */
export const defaultApiKeyValidationHandler: HookHandler<
  ApiKeyValidationInput,
  ApiKeyValidationOutput
> = async (input, _context): Promise<HookResult<ApiKeyValidationOutput>> => {
  // Basic validation - key exists and has minimum length
  if (!input.apiKey || input.apiKey.length < 10) {
    return {
      success: true,
      data: {
        valid: false,
        scopes: [],
      },
    };
  }

  return {
    success: true,
    data: {
      valid: true,
      scopes: ['*'], // Default to all scopes
    },
  };
};

/**
 * Creates a validator with a key lookup function
 */
export function createKeyLookupValidator(
  lookupFn: (key: string, provider: string) => Promise<{
    valid: boolean;
    scopes: string[];
    expiresAt?: number;
    metadata?: Record<string, unknown>;
  } | null>
): HookHandler<ApiKeyValidationInput, ApiKeyValidationOutput> {
  return async (input, _context): Promise<HookResult<ApiKeyValidationOutput>> => {
    try {
      const result = await lookupFn(input.apiKey, input.provider);

      if (!result) {
        return {
          success: true,
          data: {
            valid: false,
            scopes: [],
          },
          metadata: { reason: 'key-not-found' },
        };
      }

      // Check expiration
      if (result.expiresAt && result.expiresAt < Date.now()) {
        return {
          success: true,
          data: {
            valid: false,
            scopes: [],
          },
          metadata: { reason: 'key-expired' },
        };
      }

      // Check requested scopes
      if (input.requestedScopes && input.requestedScopes.length > 0) {
        const hasAllScopes = input.requestedScopes.every(
          (scope) => result.scopes.includes('*') || result.scopes.includes(scope)
        );

        if (!hasAllScopes) {
          return {
            success: true,
            data: {
              valid: false,
              scopes: result.scopes,
            },
            metadata: { reason: 'insufficient-scopes' },
          };
        }
      }

      return {
        success: true,
        data: {
          valid: true,
          scopes: result.scopes,
          expiresAt: result.expiresAt,
          metadata: result.metadata,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        recoverable: true,
      };
    }
  };
}

/**
 * Creates a validator with prefix-based provider matching
 */
export function createPrefixValidator(
  prefixMap: Record<string, { provider: string; minLength: number }>
): HookHandler<ApiKeyValidationInput, ApiKeyValidationOutput> {
  return async (input, _context): Promise<HookResult<ApiKeyValidationOutput>> => {
    for (const [prefix, config] of Object.entries(prefixMap)) {
      if (input.apiKey.startsWith(prefix)) {
        // Check provider match
        if (config.provider !== input.provider && config.provider !== '*') {
          continue;
        }

        // Check length
        if (input.apiKey.length < config.minLength) {
          return {
            success: true,
            data: {
              valid: false,
              scopes: [],
            },
            metadata: { reason: 'key-too-short', expectedPrefix: prefix },
          };
        }

        return {
          success: true,
          data: {
            valid: true,
            scopes: ['*'],
          },
          metadata: { matchedPrefix: prefix },
        };
      }
    }

    return {
      success: true,
      data: {
        valid: false,
        scopes: [],
      },
      metadata: { reason: 'no-matching-prefix' },
    };
  };
}

/**
 * Creates a validator that caches results
 */
export function createCachedValidator(
  validator: HookHandler<ApiKeyValidationInput, ApiKeyValidationOutput>,
  ttlMs: number = 60000
): HookHandler<ApiKeyValidationInput, ApiKeyValidationOutput> {
  const cache = new Map<string, { result: HookResult<ApiKeyValidationOutput>; timestamp: number }>();

  return async (input, context): Promise<HookResult<ApiKeyValidationOutput>> => {
    const cacheKey = `${input.provider}:${input.apiKey}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < ttlMs) {
      return cached.result;
    }

    const result = await validator(input, context);
    cache.set(cacheKey, { result, timestamp: Date.now() });

    // Clean old entries periodically
    if (cache.size > 1000) {
      const cutoff = Date.now() - ttlMs;
      for (const [key, value] of cache.entries()) {
        if (value.timestamp < cutoff) {
          cache.delete(key);
        }
      }
    }

    return result;
  };
}

/**
 * Register the default API key validation hook
 */
export function registerDefaultApiKeyValidation(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.API_KEY_VALIDATION,
    {
      id: 'default-api-key-validation',
      name: 'Default API Key Validation',
      priority: 'high',
      description: 'Basic API key format validation',
    },
    defaultApiKeyValidationHandler
  );
}
