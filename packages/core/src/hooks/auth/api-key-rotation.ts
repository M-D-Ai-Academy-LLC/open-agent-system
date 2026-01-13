/**
 * API Key Rotation Hook (#9)
 *
 * Handles API key rotation for security and compliance.
 * Use cases: scheduled rotation, security-triggered rotation, key refresh.
 */

import type {
  HookHandler,
  HookResult,
  ApiKeyRotationInput,
  ApiKeyRotationOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default API key rotation handler - generates a new key
 */
export const defaultApiKeyRotationHandler: HookHandler<
  ApiKeyRotationInput,
  ApiKeyRotationOutput
> = async (input, _context): Promise<HookResult<ApiKeyRotationOutput>> => {
  // Generate a simple new key (in production, use crypto)
  const newKey = generateApiKey(input.provider);
  const now = Date.now();

  return {
    success: true,
    data: {
      newKey,
      validFrom: now,
      // Keep old key valid for 24 hours
      oldKeyValidUntil: now + 24 * 60 * 60 * 1000,
    },
  };
};

/**
 * Generate a random API key
 */
function generateApiKey(provider: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const prefix = provider.substring(0, 3).toLowerCase();
  let key = `${prefix}_`;

  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return key;
}

/**
 * Creates a rotation handler with custom key generation
 */
export function createCustomRotationHandler(
  generator: (provider: string, reason: string) => Promise<string>,
  options?: {
    gracePeriodMs?: number;
    notifyOnRotation?: (oldKey: string, newKey: string, provider: string) => Promise<void>;
  }
): HookHandler<ApiKeyRotationInput, ApiKeyRotationOutput> {
  const gracePeriod = options?.gracePeriodMs ?? 24 * 60 * 60 * 1000;

  return async (input, _context): Promise<HookResult<ApiKeyRotationOutput>> => {
    try {
      const newKey = await generator(input.provider, input.reason);
      const now = Date.now();

      // Notify if configured
      if (options?.notifyOnRotation) {
        await options.notifyOnRotation(input.currentKey, newKey, input.provider);
      }

      return {
        success: true,
        data: {
          newKey,
          validFrom: now,
          oldKeyValidUntil: now + gracePeriod,
        },
        metadata: {
          reason: input.reason,
          provider: input.provider,
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
 * Creates a rotation handler with key store integration
 */
export function createKeyStoreRotationHandler(
  keyStore: {
    generateKey: (provider: string) => Promise<string>;
    storeKey: (provider: string, key: string, expiresAt?: number) => Promise<void>;
    invalidateKey: (provider: string, key: string, invalidAt: number) => Promise<void>;
  },
  options?: {
    gracePeriodMs?: number;
  }
): HookHandler<ApiKeyRotationInput, ApiKeyRotationOutput> {
  const gracePeriod = options?.gracePeriodMs ?? 24 * 60 * 60 * 1000;

  return async (input, _context): Promise<HookResult<ApiKeyRotationOutput>> => {
    try {
      const now = Date.now();
      const newKey = await keyStore.generateKey(input.provider);

      // Store new key
      await keyStore.storeKey(input.provider, newKey);

      // Schedule old key invalidation
      const oldKeyValidUntil = now + gracePeriod;
      await keyStore.invalidateKey(input.provider, input.currentKey, oldKeyValidUntil);

      return {
        success: true,
        data: {
          newKey,
          validFrom: now,
          oldKeyValidUntil,
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
 * Creates a scheduled rotation handler
 */
export function createScheduledRotationHandler(
  rotationIntervalMs: number,
  generator: (provider: string) => Promise<string>
): HookHandler<ApiKeyRotationInput, ApiKeyRotationOutput> {
  const lastRotation = new Map<string, number>();

  return async (input, _context): Promise<HookResult<ApiKeyRotationOutput>> => {
    const now = Date.now();
    const lastRotated = lastRotation.get(input.provider) ?? 0;

    // Check if rotation is due
    if (input.reason === 'scheduled' && now - lastRotated < rotationIntervalMs) {
      return {
        success: true,
        data: {
          newKey: input.currentKey, // Keep current key
          validFrom: lastRotated,
        },
        metadata: {
          skipped: true,
          reason: 'rotation-not-due',
          nextRotation: lastRotated + rotationIntervalMs,
        },
      };
    }

    try {
      const newKey = await generator(input.provider);
      lastRotation.set(input.provider, now);

      return {
        success: true,
        data: {
          newKey,
          validFrom: now,
          oldKeyValidUntil: now + 24 * 60 * 60 * 1000,
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
 * Register the default API key rotation hook
 */
export function registerDefaultApiKeyRotation(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.API_KEY_ROTATION,
    {
      id: 'default-api-key-rotation',
      name: 'Default API Key Rotation',
      priority: 'normal',
      description: 'Generates new API keys with 24-hour grace period',
    },
    defaultApiKeyRotationHandler
  );
}
