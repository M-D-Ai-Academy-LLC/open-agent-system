/**
 * Compliance Check Hook (#49)
 *
 * Checks operations against regulatory requirements.
 * Use cases: GDPR compliance, HIPAA compliance, SOX compliance, CCPA compliance.
 */

import type {
  HookHandler,
  HookResult,
  ComplianceCheckInput,
  ComplianceCheckOutput,
  ComplianceViolation,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Regulation type
 */
export type Regulation = 'gdpr' | 'hipaa' | 'ccpa' | 'sox';

/**
 * Compliance rules for each regulation
 */
export interface ComplianceRule {
  id: string;
  regulation: Regulation;
  requirement: string;
  check: (operation: string, data?: unknown) => { passed: boolean; violation?: string };
  severity: ComplianceViolation['severity'];
}

/**
 * Default GDPR compliance rules
 */
export const GdprRules: ComplianceRule[] = [
  {
    id: 'gdpr-1',
    regulation: 'gdpr',
    requirement: 'Data minimization - only process necessary data',
    check: (operation, data) => {
      if (operation.includes('collect') && data && typeof data === 'object') {
        const fields = Object.keys(data as object);
        if (fields.length > 20) {
          return { passed: false, violation: 'Collecting excessive data fields' };
        }
      }
      return { passed: true };
    },
    severity: 'major',
  },
  {
    id: 'gdpr-2',
    regulation: 'gdpr',
    requirement: 'Purpose limitation - data processed for specified purposes',
    check: (operation) => {
      const purposeKeywords = ['marketing', 'analytics', 'profiling', 'tracking'];
      if (purposeKeywords.some((k) => operation.toLowerCase().includes(k))) {
        return {
          passed: false,
          violation: 'Operation may require explicit consent',
        };
      }
      return { passed: true };
    },
    severity: 'major',
  },
  {
    id: 'gdpr-3',
    regulation: 'gdpr',
    requirement: 'Data subject rights - support access, rectification, erasure',
    check: (operation) => {
      const blockedOps = ['permanent-delete', 'hard-delete', 'irreversible'];
      if (blockedOps.some((op) => operation.toLowerCase().includes(op))) {
        return {
          passed: false,
          violation: 'Operation may prevent data subject rights',
        };
      }
      return { passed: true };
    },
    severity: 'critical',
  },
  {
    id: 'gdpr-4',
    regulation: 'gdpr',
    requirement: 'Cross-border transfers require adequacy decision or safeguards',
    check: (operation) => {
      if (operation.toLowerCase().includes('transfer') ||
          operation.toLowerCase().includes('export')) {
        return {
          passed: false,
          violation: 'Cross-border transfer may require safeguards',
        };
      }
      return { passed: true };
    },
    severity: 'major',
  },
];

/**
 * Default HIPAA compliance rules
 */
export const HipaaRules: ComplianceRule[] = [
  {
    id: 'hipaa-1',
    regulation: 'hipaa',
    requirement: 'PHI must be encrypted at rest and in transit',
    check: (operation, data) => {
      const phiKeywords = ['medical', 'health', 'diagnosis', 'patient', 'treatment'];
      const hasPhiContext = phiKeywords.some((k) =>
        operation.toLowerCase().includes(k) ||
        (data && JSON.stringify(data).toLowerCase().includes(k))
      );

      if (hasPhiContext && !operation.toLowerCase().includes('encrypt')) {
        return {
          passed: false,
          violation: 'PHI data operations must use encryption',
        };
      }
      return { passed: true };
    },
    severity: 'critical',
  },
  {
    id: 'hipaa-2',
    regulation: 'hipaa',
    requirement: 'Access to PHI must be logged',
    check: (operation) => {
      const accessOps = ['read', 'view', 'access', 'retrieve', 'fetch'];
      if (accessOps.some((op) => operation.toLowerCase().includes(op))) {
        // This is a warning - audit logging should be implemented
        return { passed: true };
      }
      return { passed: true };
    },
    severity: 'major',
  },
  {
    id: 'hipaa-3',
    regulation: 'hipaa',
    requirement: 'Minimum necessary principle - access only required PHI',
    check: (operation) => {
      if (operation.toLowerCase().includes('all-records') ||
          operation.toLowerCase().includes('bulk-export')) {
        return {
          passed: false,
          violation: 'Bulk access to PHI may violate minimum necessary',
        };
      }
      return { passed: true };
    },
    severity: 'major',
  },
  {
    id: 'hipaa-4',
    regulation: 'hipaa',
    requirement: 'Business associate agreements required for third parties',
    check: (operation) => {
      if (operation.toLowerCase().includes('third-party') ||
          operation.toLowerCase().includes('external-api')) {
        return {
          passed: false,
          violation: 'Third-party PHI access requires BAA',
        };
      }
      return { passed: true };
    },
    severity: 'critical',
  },
];

/**
 * Default CCPA compliance rules
 */
export const CcpaRules: ComplianceRule[] = [
  {
    id: 'ccpa-1',
    regulation: 'ccpa',
    requirement: 'Right to know - consumers can request data disclosure',
    check: (operation) => {
      if (operation.toLowerCase().includes('collect')) {
        return { passed: true }; // Warning: must support disclosure requests
      }
      return { passed: true };
    },
    severity: 'major',
  },
  {
    id: 'ccpa-2',
    regulation: 'ccpa',
    requirement: 'Right to delete - consumers can request deletion',
    check: (operation) => {
      const deleteOps = ['permanent', 'irreversible', 'no-recovery'];
      if (deleteOps.some((op) => operation.toLowerCase().includes(op))) {
        return {
          passed: false,
          violation: 'Deletion must be reversible for compliance verification',
        };
      }
      return { passed: true };
    },
    severity: 'major',
  },
  {
    id: 'ccpa-3',
    regulation: 'ccpa',
    requirement: 'Right to opt-out of sale of personal information',
    check: (operation) => {
      if (operation.toLowerCase().includes('sell') ||
          operation.toLowerCase().includes('share-with-partner')) {
        return {
          passed: false,
          violation: 'Data sale requires opt-out mechanism',
        };
      }
      return { passed: true };
    },
    severity: 'critical',
  },
  {
    id: 'ccpa-4',
    regulation: 'ccpa',
    requirement: 'Non-discrimination - no penalty for exercising rights',
    check: () => {
      return { passed: true }; // Policy-level check
    },
    severity: 'minor',
  },
];

/**
 * Default SOX compliance rules
 */
export const SoxRules: ComplianceRule[] = [
  {
    id: 'sox-1',
    regulation: 'sox',
    requirement: 'Financial data integrity - prevent unauthorized modifications',
    check: (operation) => {
      const financialOps = ['ledger', 'financial', 'accounting', 'transaction'];
      const modifyOps = ['update', 'modify', 'delete', 'alter'];

      const isFinancial = financialOps.some((k) => operation.toLowerCase().includes(k));
      const isModify = modifyOps.some((k) => operation.toLowerCase().includes(k));

      if (isFinancial && isModify) {
        return {
          passed: false,
          violation: 'Financial data modification requires audit trail',
        };
      }
      return { passed: true };
    },
    severity: 'critical',
  },
  {
    id: 'sox-2',
    regulation: 'sox',
    requirement: 'Audit trail - all financial changes must be logged',
    check: (operation) => {
      if (operation.toLowerCase().includes('financial') ||
          operation.toLowerCase().includes('accounting')) {
        // Reminder: must have audit logging
        return { passed: true };
      }
      return { passed: true };
    },
    severity: 'major',
  },
  {
    id: 'sox-3',
    regulation: 'sox',
    requirement: 'Access controls - segregation of duties',
    check: (operation) => {
      const privilegedOps = ['approve-and-submit', 'create-and-authorize'];
      if (privilegedOps.some((op) => operation.toLowerCase().includes(op))) {
        return {
          passed: false,
          violation: 'Operation violates segregation of duties',
        };
      }
      return { passed: true };
    },
    severity: 'critical',
  },
  {
    id: 'sox-4',
    regulation: 'sox',
    requirement: 'Document retention - financial records must be retained',
    check: (operation) => {
      if (operation.toLowerCase().includes('delete-financial') ||
          operation.toLowerCase().includes('purge-records')) {
        return {
          passed: false,
          violation: 'Financial records deletion may violate retention policy',
        };
      }
      return { passed: true };
    },
    severity: 'critical',
  },
];

/**
 * All default rules by regulation
 */
export const DefaultRulesByRegulation: Record<Regulation, ComplianceRule[]> = {
  gdpr: GdprRules,
  hipaa: HipaaRules,
  ccpa: CcpaRules,
  sox: SoxRules,
};

/**
 * Default compliance check handler
 */
export const defaultComplianceCheckHandler: HookHandler<
  ComplianceCheckInput,
  ComplianceCheckOutput
> = async (input, _context): Promise<HookResult<ComplianceCheckOutput>> => {
  const violations: ComplianceViolation[] = [];
  const requiredActions: string[] = [];

  for (const regulation of input.regulations) {
    const rules = DefaultRulesByRegulation[regulation] ?? [];

    for (const rule of rules) {
      const result = rule.check(input.operation, input.data);

      if (!result.passed && result.violation) {
        violations.push({
          regulation,
          requirement: rule.requirement,
          violation: result.violation,
          severity: rule.severity,
        });

        // Generate required actions
        requiredActions.push(getRequiredAction(rule));
      }
    }
  }

  return {
    success: true,
    data: {
      compliant: violations.length === 0,
      violations,
      requiredActions: requiredActions.length > 0 ? requiredActions : undefined,
    },
  };
};

/**
 * Generate required action from rule
 */
function getRequiredAction(rule: ComplianceRule): string {
  switch (rule.regulation) {
    case 'gdpr':
      return `Review GDPR Article related to: ${rule.requirement}`;
    case 'hipaa':
      return `Ensure HIPAA compliance for: ${rule.requirement}`;
    case 'ccpa':
      return `Implement CCPA requirement: ${rule.requirement}`;
    case 'sox':
      return `Verify SOX control: ${rule.requirement}`;
    default:
      return `Address: ${rule.requirement}`;
  }
}

/**
 * Creates a compliance handler with custom rules
 */
export function createCustomComplianceHandler(
  customRules: ComplianceRule[]
): HookHandler<ComplianceCheckInput, ComplianceCheckOutput> {
  return async (input, _context): Promise<HookResult<ComplianceCheckOutput>> => {
    const violations: ComplianceViolation[] = [];
    const requiredActions: string[] = [];

    for (const regulation of input.regulations) {
      // Get default rules
      const defaultRules = DefaultRulesByRegulation[regulation] ?? [];
      // Get custom rules for this regulation
      const regCustomRules = customRules.filter((r) => r.regulation === regulation);
      // Combine rules
      const allRules = [...defaultRules, ...regCustomRules];

      for (const rule of allRules) {
        const result = rule.check(input.operation, input.data);

        if (!result.passed && result.violation) {
          violations.push({
            regulation,
            requirement: rule.requirement,
            violation: result.violation,
            severity: rule.severity,
          });
          requiredActions.push(getRequiredAction(rule));
        }
      }
    }

    return {
      success: true,
      data: {
        compliant: violations.length === 0,
        violations,
        requiredActions: requiredActions.length > 0 ? requiredActions : undefined,
      },
    };
  };
}

/**
 * Creates a compliance handler with severity filtering
 */
export function createFilteredComplianceHandler(
  minSeverity: ComplianceViolation['severity'] = 'minor'
): HookHandler<ComplianceCheckInput, ComplianceCheckOutput> {
  const severityOrder: ComplianceViolation['severity'][] = ['minor', 'major', 'critical'];
  const minIndex = severityOrder.indexOf(minSeverity);

  return async (input, context): Promise<HookResult<ComplianceCheckOutput>> => {
    const result = await defaultComplianceCheckHandler(input, context);

    if (!result.success) return result;

    // Filter violations by severity
    const filteredViolations = result.data.violations.filter((v) => {
      const severityIndex = severityOrder.indexOf(v.severity);
      return severityIndex >= minIndex;
    });

    return {
      success: true,
      data: {
        compliant: filteredViolations.length === 0,
        violations: filteredViolations,
        requiredActions: result.data.requiredActions,
      },
      metadata: {
        minSeverity,
        originalViolationCount: result.data.violations.length,
        filteredViolationCount: filteredViolations.length,
      },
    };
  };
}

/**
 * Creates a compliance handler with operation allowlist
 */
export function createAllowlistComplianceHandler(
  allowlist: string[]
): HookHandler<ComplianceCheckInput, ComplianceCheckOutput> {
  const allowSet = new Set(allowlist.map((op) => op.toLowerCase()));

  return async (input, context): Promise<HookResult<ComplianceCheckOutput>> => {
    // Skip compliance check for allowlisted operations
    if (allowSet.has(input.operation.toLowerCase())) {
      return {
        success: true,
        data: {
          compliant: true,
          violations: [],
        },
        metadata: {
          allowlisted: true,
        },
      };
    }

    return defaultComplianceCheckHandler(input, context);
  };
}

/**
 * Creates a compliance handler with operation blocklist
 */
export function createBlocklistComplianceHandler(
  blocklist: { operation: string; regulation: Regulation; reason: string }[]
): HookHandler<ComplianceCheckInput, ComplianceCheckOutput> {
  return async (input, context): Promise<HookResult<ComplianceCheckOutput>> => {
    const violations: ComplianceViolation[] = [];

    // Check blocklist
    for (const blocked of blocklist) {
      if (input.operation.toLowerCase().includes(blocked.operation.toLowerCase()) &&
          input.regulations.includes(blocked.regulation)) {
        violations.push({
          regulation: blocked.regulation,
          requirement: 'Blocklisted operation',
          violation: blocked.reason,
          severity: 'critical',
        });
      }
    }

    // Also run default checks
    const defaultResult = await defaultComplianceCheckHandler(input, context);

    if (!defaultResult.success) return defaultResult;

    return {
      success: true,
      data: {
        compliant: violations.length === 0 && defaultResult.data.compliant,
        violations: [...violations, ...defaultResult.data.violations],
        requiredActions: defaultResult.data.requiredActions,
      },
    };
  };
}

/**
 * Creates a compliance handler with data classification
 */
export function createDataClassificationComplianceHandler(
  classifyData: (data: unknown) => 'public' | 'internal' | 'confidential' | 'restricted'
): HookHandler<ComplianceCheckInput, ComplianceCheckOutput> {
  return async (input, context): Promise<HookResult<ComplianceCheckOutput>> => {
    const classification = input.data ? classifyData(input.data) : 'public';
    const violations: ComplianceViolation[] = [];

    // Add classification-based checks
    if (classification === 'restricted') {
      for (const regulation of input.regulations) {
        violations.push({
          regulation,
          requirement: 'Restricted data handling',
          violation: 'Restricted data requires explicit authorization',
          severity: 'critical',
        });
      }
    } else if (classification === 'confidential') {
      for (const regulation of input.regulations) {
        if (regulation === 'hipaa' || regulation === 'gdpr') {
          violations.push({
            regulation,
            requirement: 'Confidential data handling',
            violation: 'Confidential data may require additional safeguards',
            severity: 'major',
          });
        }
      }
    }

    // Also run default checks
    const defaultResult = await defaultComplianceCheckHandler(input, context);

    if (!defaultResult.success) return defaultResult;

    return {
      success: true,
      data: {
        compliant: violations.length === 0 && defaultResult.data.compliant,
        violations: [...violations, ...defaultResult.data.violations],
        requiredActions: defaultResult.data.requiredActions,
      },
      metadata: {
        dataClassification: classification,
      },
    };
  };
}

/**
 * Creates a logging compliance handler
 */
export function createLoggingComplianceHandler(
  logger: {
    info: (message: string, context: Record<string, unknown>) => void;
    warn: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<ComplianceCheckInput, ComplianceCheckOutput>
): HookHandler<ComplianceCheckInput, ComplianceCheckOutput> {
  return async (input, context): Promise<HookResult<ComplianceCheckOutput>> => {
    logger.info('Checking compliance', {
      operation: input.operation,
      regulations: input.regulations,
      hasData: input.data !== undefined,
      requestId: context.requestId,
    });

    const handler = innerHandler ?? defaultComplianceCheckHandler;
    const result = await handler(input, context);

    if (result.success) {
      const logFn = result.data.compliant ? logger.info : logger.warn;
      logFn(`Compliance check ${result.data.compliant ? 'passed' : 'failed'}`, {
        operation: input.operation,
        regulations: input.regulations,
        compliant: result.data.compliant,
        violationCount: result.data.violations.length,
        violations: result.data.violations.map((v) => ({
          regulation: v.regulation,
          severity: v.severity,
        })),
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Register the default compliance check hook
 */
export function registerDefaultComplianceCheck(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.COMPLIANCE_CHECK,
    {
      id: 'default-compliance-check',
      name: 'Default Compliance Check',
      priority: 'critical',
      description: 'Basic compliance check handler',
    },
    defaultComplianceCheckHandler
  );
}
