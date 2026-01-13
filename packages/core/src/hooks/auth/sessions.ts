/**
 * Session Validation Hook (#13)
 *
 * Validates user sessions for stateful authentication.
 * Use cases: session management, token validation, session refresh.
 */

import type {
  HookHandler,
  HookResult,
  SessionValidationInput,
  SessionValidationOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default session validation handler - validates session exists
 */
export const defaultSessionValidationHandler: HookHandler<
  SessionValidationInput,
  SessionValidationOutput
> = async (input, _context): Promise<HookResult<SessionValidationOutput>> => {
  // Basic validation - session ID exists
  if (!input.sessionId || input.sessionId.length < 10) {
    return {
      success: true,
      data: {
        valid: false,
        userId: '',
        permissions: [],
        expiresAt: 0,
      },
    };
  }

  return {
    success: true,
    data: {
      valid: true,
      userId: input.userId ?? 'anonymous',
      permissions: ['*'],
      expiresAt: Date.now() + 3600000, // 1 hour
    },
  };
};

/**
 * Session data structure
 */
export interface SessionData {
  userId: string;
  permissions: string[];
  createdAt: number;
  expiresAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Creates a session validator with a session store
 */
export function createSessionStoreValidator(
  sessionStore: {
    get: (sessionId: string) => Promise<SessionData | null>;
    refresh?: (sessionId: string, newExpiresAt: number) => Promise<void>;
  },
  options?: {
    refreshThresholdMs?: number;
    extendByMs?: number;
  }
): HookHandler<SessionValidationInput, SessionValidationOutput> {
  const refreshThreshold = options?.refreshThresholdMs ?? 300000; // 5 minutes
  const extendBy = options?.extendByMs ?? 3600000; // 1 hour

  return async (input, _context): Promise<HookResult<SessionValidationOutput>> => {
    try {
      const session = await sessionStore.get(input.sessionId);

      if (!session) {
        return {
          success: true,
          data: {
            valid: false,
            userId: '',
            permissions: [],
            expiresAt: 0,
          },
          metadata: { reason: 'session-not-found' },
        };
      }

      const now = Date.now();

      // Check expiration
      if (session.expiresAt < now) {
        return {
          success: true,
          data: {
            valid: false,
            userId: session.userId,
            permissions: [],
            expiresAt: session.expiresAt,
          },
          metadata: { reason: 'session-expired' },
        };
      }

      // Check if userId matches (if provided)
      if (input.userId && input.userId !== session.userId) {
        return {
          success: true,
          data: {
            valid: false,
            userId: session.userId,
            permissions: [],
            expiresAt: session.expiresAt,
          },
          metadata: { reason: 'user-mismatch' },
        };
      }

      // Refresh session if close to expiration
      let newExpiresAt = session.expiresAt;
      if (sessionStore.refresh && session.expiresAt - now < refreshThreshold) {
        newExpiresAt = now + extendBy;
        await sessionStore.refresh(input.sessionId, newExpiresAt);
      }

      return {
        success: true,
        data: {
          valid: true,
          userId: session.userId,
          permissions: session.permissions,
          expiresAt: newExpiresAt,
        },
        metadata: {
          refreshed: newExpiresAt !== session.expiresAt,
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
 * Creates an in-memory session validator
 */
export function createInMemorySessionValidator(
  defaultTtlMs: number = 3600000
): {
  validator: HookHandler<SessionValidationInput, SessionValidationOutput>;
  createSession: (userId: string, permissions: string[], metadata?: Record<string, unknown>) => string;
  destroySession: (sessionId: string) => boolean;
} {
  const sessions = new Map<string, SessionData>();

  const createSession = (
    userId: string,
    permissions: string[],
    metadata?: Record<string, unknown>
  ): string => {
    const sessionId = generateSessionId();
    const now = Date.now();

    sessions.set(sessionId, {
      userId,
      permissions,
      createdAt: now,
      expiresAt: now + defaultTtlMs,
      metadata,
    });

    return sessionId;
  };

  const destroySession = (sessionId: string): boolean => {
    return sessions.delete(sessionId);
  };

  const validator: HookHandler<SessionValidationInput, SessionValidationOutput> = async (
    input,
    _context
  ): Promise<HookResult<SessionValidationOutput>> => {
    const session = sessions.get(input.sessionId);

    if (!session) {
      return {
        success: true,
        data: {
          valid: false,
          userId: '',
          permissions: [],
          expiresAt: 0,
        },
      };
    }

    const now = Date.now();

    if (session.expiresAt < now) {
      sessions.delete(input.sessionId);
      return {
        success: true,
        data: {
          valid: false,
          userId: session.userId,
          permissions: [],
          expiresAt: session.expiresAt,
        },
      };
    }

    // Extend session on use
    session.expiresAt = now + defaultTtlMs;

    return {
      success: true,
      data: {
        valid: true,
        userId: session.userId,
        permissions: session.permissions,
        expiresAt: session.expiresAt,
      },
    };
  };

  return { validator, createSession, destroySession };
}

/**
 * Creates a JWT-based session validator
 */
export function createJwtSessionValidator(
  verifyToken: (token: string) => Promise<{
    valid: boolean;
    userId?: string;
    permissions?: string[];
    exp?: number;
  }>
): HookHandler<SessionValidationInput, SessionValidationOutput> {
  return async (input, _context): Promise<HookResult<SessionValidationOutput>> => {
    try {
      const decoded = await verifyToken(input.sessionId);

      if (!decoded.valid) {
        return {
          success: true,
          data: {
            valid: false,
            userId: '',
            permissions: [],
            expiresAt: 0,
          },
          metadata: { reason: 'invalid-token' },
        };
      }

      return {
        success: true,
        data: {
          valid: true,
          userId: decoded.userId ?? '',
          permissions: decoded.permissions ?? [],
          expiresAt: decoded.exp ? decoded.exp * 1000 : Date.now() + 3600000,
        },
      };
    } catch (error) {
      return {
        success: true,
        data: {
          valid: false,
          userId: '',
          permissions: [],
          expiresAt: 0,
        },
        metadata: { reason: 'token-verification-failed' },
      };
    }
  };
}

/**
 * Generate a random session ID
 */
function generateSessionId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'sess_';
  for (let i = 0; i < 32; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * Register the default session validation hook
 */
export function registerDefaultSessionValidation(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.SESSION_VALIDATION,
    {
      id: 'default-session-validation',
      name: 'Default Session Validation',
      priority: 'high',
      description: 'Basic session ID validation',
    },
    defaultSessionValidationHandler
  );
}
