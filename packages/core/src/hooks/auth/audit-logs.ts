/**
 * Audit Log Hook (#14)
 *
 * Records audit events for compliance and security monitoring.
 * Use cases: compliance logging, security auditing, access tracking.
 */

import type {
  HookHandler,
  HookResult,
  AuditLogInput,
  AuditLogOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default audit log handler - logs to console
 */
export const defaultAuditLogHandler: HookHandler<
  AuditLogInput,
  AuditLogOutput
> = async (input, context): Promise<HookResult<AuditLogOutput>> => {
  const timestamp = Date.now();
  const auditId = generateAuditId();

  // Default implementation logs to console
  console.log('[AUDIT]', JSON.stringify({
    auditId,
    timestamp,
    requestId: context.requestId,
    event: input.event,
    userId: input.userId,
    resource: input.resource,
    action: input.action,
    outcome: input.outcome,
    metadata: input.metadata,
  }));

  return {
    success: true,
    data: {
      logged: true,
      auditId,
      timestamp,
    },
  };
};

/**
 * Audit log entry
 */
export interface AuditEntry {
  auditId: string;
  timestamp: number;
  requestId: string;
  event: string;
  userId?: string;
  resource?: string;
  action: string;
  outcome: 'success' | 'failure' | 'denied';
  metadata?: Record<string, unknown>;
}

/**
 * Creates an audit logger with a custom sink
 */
export function createCustomAuditLogger(
  sink: (entry: AuditEntry) => Promise<void>,
  options?: {
    includeContext?: boolean;
    sensitiveFields?: string[];
    filterEvents?: string[];
  }
): HookHandler<AuditLogInput, AuditLogOutput> {
  const sensitiveFields = options?.sensitiveFields ?? ['password', 'apiKey', 'token', 'secret'];
  const filterEvents = options?.filterEvents;

  return async (input, context): Promise<HookResult<AuditLogOutput>> => {
    // Filter events if configured
    if (filterEvents && !filterEvents.includes(input.event)) {
      return {
        success: true,
        data: {
          logged: false,
          auditId: '',
          timestamp: Date.now(),
        },
        metadata: { filtered: true },
      };
    }

    const timestamp = Date.now();
    const auditId = generateAuditId();

    // Redact sensitive fields from metadata
    const sanitizedMetadata = input.metadata
      ? sanitizeMetadata(input.metadata, sensitiveFields)
      : undefined;

    const entry: AuditEntry = {
      auditId,
      timestamp,
      requestId: context.requestId,
      event: input.event,
      userId: input.userId,
      resource: input.resource,
      action: input.action,
      outcome: input.outcome,
      metadata: options?.includeContext
        ? { ...sanitizedMetadata, traceId: context.traceId }
        : sanitizedMetadata,
    };

    try {
      await sink(entry);

      return {
        success: true,
        data: {
          logged: true,
          auditId,
          timestamp,
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
 * Creates an in-memory audit logger for testing
 */
export function createInMemoryAuditLogger(
  maxEntries: number = 10000
): {
  handler: HookHandler<AuditLogInput, AuditLogOutput>;
  getEntries: (filter?: Partial<AuditEntry>) => AuditEntry[];
  clear: () => void;
} {
  const entries: AuditEntry[] = [];

  const handler: HookHandler<AuditLogInput, AuditLogOutput> = async (
    input,
    context
  ): Promise<HookResult<AuditLogOutput>> => {
    const timestamp = Date.now();
    const auditId = generateAuditId();

    const entry: AuditEntry = {
      auditId,
      timestamp,
      requestId: context.requestId,
      event: input.event,
      userId: input.userId,
      resource: input.resource,
      action: input.action,
      outcome: input.outcome,
      metadata: input.metadata,
    };

    entries.push(entry);

    // Trim if over max
    if (entries.length > maxEntries) {
      entries.shift();
    }

    return {
      success: true,
      data: {
        logged: true,
        auditId,
        timestamp,
      },
    };
  };

  const getEntries = (filter?: Partial<AuditEntry>): AuditEntry[] => {
    if (!filter) return [...entries];

    return entries.filter((entry) => {
      for (const [key, value] of Object.entries(filter)) {
        if (entry[key as keyof AuditEntry] !== value) {
          return false;
        }
      }
      return true;
    });
  };

  const clear = (): void => {
    entries.length = 0;
  };

  return { handler, getEntries, clear };
}

/**
 * Creates a batched audit logger for high-throughput scenarios
 */
export function createBatchedAuditLogger(
  sink: (entries: AuditEntry[]) => Promise<void>,
  options?: {
    batchSize?: number;
    flushIntervalMs?: number;
  }
): {
  handler: HookHandler<AuditLogInput, AuditLogOutput>;
  flush: () => Promise<void>;
} {
  const batchSize = options?.batchSize ?? 100;
  const flushInterval = options?.flushIntervalMs ?? 5000;
  const pending: AuditEntry[] = [];
  let flushTimer: NodeJS.Timeout | null = null;

  const flush = async (): Promise<void> => {
    if (pending.length === 0) return;

    const batch = pending.splice(0, pending.length);
    await sink(batch);
  };

  const scheduleFlush = (): void => {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      await flush();
    }, flushInterval);
  };

  const handler: HookHandler<AuditLogInput, AuditLogOutput> = async (
    input,
    context
  ): Promise<HookResult<AuditLogOutput>> => {
    const timestamp = Date.now();
    const auditId = generateAuditId();

    const entry: AuditEntry = {
      auditId,
      timestamp,
      requestId: context.requestId,
      event: input.event,
      userId: input.userId,
      resource: input.resource,
      action: input.action,
      outcome: input.outcome,
      metadata: input.metadata,
    };

    pending.push(entry);

    if (pending.length >= batchSize) {
      await flush();
    } else {
      scheduleFlush();
    }

    return {
      success: true,
      data: {
        logged: true,
        auditId,
        timestamp,
      },
    };
  };

  return { handler, flush };
}

/**
 * Creates a structured audit logger for compliance
 */
export function createComplianceAuditLogger(
  sink: (entry: AuditEntry) => Promise<void>,
  regulations: ('gdpr' | 'hipaa' | 'sox')[]
): HookHandler<AuditLogInput, AuditLogOutput> {
  return async (input, context): Promise<HookResult<AuditLogOutput>> => {
    const timestamp = Date.now();
    const auditId = generateAuditId();

    // Add compliance-specific fields
    const complianceMetadata: Record<string, unknown> = {
      ...(input.metadata ?? {}),
      regulations,
      timestamp,
      immutable: true,
    };

    // GDPR: Include data subject info if available
    if (regulations.includes('gdpr') && input.userId) {
      complianceMetadata['dataSubjectId'] = input.userId;
      complianceMetadata['processingBasis'] = input.metadata?.['processingBasis'] ?? 'legitimate-interest';
    }

    // HIPAA: Include PHI access tracking
    if (regulations.includes('hipaa')) {
      complianceMetadata['phiAccessed'] = input.metadata?.['phiAccessed'] ?? false;
      complianceMetadata['accessPurpose'] = input.metadata?.['accessPurpose'] ?? 'operations';
    }

    // SOX: Include financial data tracking
    if (regulations.includes('sox')) {
      complianceMetadata['financialImpact'] = input.metadata?.['financialImpact'] ?? false;
      complianceMetadata['controlId'] = input.metadata?.['controlId'];
    }

    const entry: AuditEntry = {
      auditId,
      timestamp,
      requestId: context.requestId,
      event: input.event,
      userId: input.userId,
      resource: input.resource,
      action: input.action,
      outcome: input.outcome,
      metadata: complianceMetadata,
    };

    try {
      await sink(entry);

      return {
        success: true,
        data: {
          logged: true,
          auditId,
          timestamp,
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
 * Generate a unique audit ID
 */
function generateAuditId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `aud_${timestamp}_${random}`;
}

/**
 * Sanitize metadata by redacting sensitive fields
 */
function sanitizeMetadata(
  metadata: Record<string, unknown>,
  sensitiveFields: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (sensitiveFields.some((f) => key.toLowerCase().includes(f.toLowerCase()))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeMetadata(value as Record<string, unknown>, sensitiveFields);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Register the default audit log hook
 */
export function registerDefaultAuditLog(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.AUDIT_LOG,
    {
      id: 'default-audit-log',
      name: 'Default Audit Log',
      priority: 'low',
      description: 'Console-based audit logging',
    },
    defaultAuditLogHandler
  );
}
