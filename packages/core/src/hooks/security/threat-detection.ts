/**
 * Threat Detection Hook (#50)
 *
 * Detects potential security threats and anomalies.
 * Use cases: intrusion detection, anomaly detection, abuse prevention.
 */

import type {
  HookHandler,
  HookResult,
  ThreatDetectionInput,
  ThreatDetectionOutput,
  ActivityLog,
  ThreatPattern,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default threat patterns
 */
export const DefaultThreatPatterns: ThreatPattern[] = [
  // Brute force attacks
  {
    name: 'brute-force-login',
    pattern: 'multiple-failed-logins',
    severity: 'high',
    indicators: ['login-failed', 'authentication-error', 'invalid-credentials'],
  },
  {
    name: 'brute-force-api',
    pattern: 'rapid-api-calls',
    severity: 'medium',
    indicators: ['rate-exceeded', 'too-many-requests', 'api-abuse'],
  },
  // Enumeration attacks
  {
    name: 'user-enumeration',
    pattern: 'sequential-user-lookup',
    severity: 'medium',
    indicators: ['user-lookup', 'profile-access', 'account-check'],
  },
  {
    name: 'resource-enumeration',
    pattern: 'sequential-resource-access',
    severity: 'medium',
    indicators: ['resource-not-found', 'access-denied', 'sequential-id'],
  },
  // Injection attempts
  {
    name: 'sql-injection',
    pattern: 'sql-pattern-detected',
    severity: 'critical',
    indicators: ['union', 'select', 'drop', 'insert', 'delete', 'update'],
  },
  {
    name: 'xss-attempt',
    pattern: 'script-injection',
    severity: 'high',
    indicators: ['script', 'onclick', 'onerror', 'javascript:'],
  },
  // Privilege escalation
  {
    name: 'privilege-escalation',
    pattern: 'unauthorized-admin-access',
    severity: 'critical',
    indicators: ['admin', 'root', 'sudo', 'privilege', 'role-change'],
  },
  // Data exfiltration
  {
    name: 'data-exfiltration',
    pattern: 'bulk-data-access',
    severity: 'critical',
    indicators: ['bulk-export', 'all-records', 'database-dump', 'full-backup'],
  },
  // Account takeover
  {
    name: 'account-takeover',
    pattern: 'suspicious-account-change',
    severity: 'high',
    indicators: ['password-change', 'email-change', 'mfa-disable', 'recovery-change'],
  },
  // API abuse
  {
    name: 'api-abuse',
    pattern: 'unusual-api-pattern',
    severity: 'medium',
    indicators: ['malformed-request', 'invalid-parameter', 'unexpected-method'],
  },
];

/**
 * Threat level weights for pattern severities
 */
const SeverityWeights: Record<ThreatPattern['severity'], number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1.0,
};

/**
 * Default threat detection handler
 */
export const defaultThreatDetectionHandler: HookHandler<
  ThreatDetectionInput,
  ThreatDetectionOutput
> = async (input, _context): Promise<HookResult<ThreatDetectionOutput>> => {
  const patterns = input.patterns ?? DefaultThreatPatterns;
  const indicators: string[] = [];
  const detectedPatterns: ThreatPattern[] = [];
  let maxSeverity: ThreatPattern['severity'] = 'low';

  // Check current activity against patterns
  for (const pattern of patterns) {
    const matches = checkPattern(input.activity, pattern);
    if (matches.detected) {
      detectedPatterns.push(pattern);
      indicators.push(...matches.indicators);
      maxSeverity = compareSeverity(maxSeverity, pattern.severity);
    }
  }

  // Check historical patterns if provided
  if (input.historical && input.historical.length > 0) {
    const historicalAnalysis = analyzeHistorical(input.activity, input.historical, patterns);
    indicators.push(...historicalAnalysis.indicators);
    if (historicalAnalysis.elevated) {
      maxSeverity = compareSeverity(maxSeverity, 'high');
    }
  }

  const threatDetected = detectedPatterns.length > 0;
  const recommendedActions = threatDetected
    ? generateRecommendations(detectedPatterns, maxSeverity)
    : [];

  return {
    success: true,
    data: {
      threatDetected,
      threatLevel: threatDetected ? mapSeverityToLevel(maxSeverity) : 'none',
      indicators: [...new Set(indicators)],
      recommendedActions,
    },
    metadata: {
      patternsChecked: patterns.length,
      patternsMatched: detectedPatterns.length,
      historicalEventsAnalyzed: input.historical?.length ?? 0,
    },
  };
};

/**
 * Check if activity matches a threat pattern
 */
function checkPattern(
  activity: ActivityLog,
  pattern: ThreatPattern
): { detected: boolean; indicators: string[] } {
  const indicators: string[] = [];
  const actionLower = activity.action.toLowerCase();
  const metadataStr = JSON.stringify(activity.metadata ?? {}).toLowerCase();

  for (const indicator of pattern.indicators) {
    if (actionLower.includes(indicator.toLowerCase()) ||
        metadataStr.includes(indicator.toLowerCase())) {
      indicators.push(indicator);
    }
  }

  return {
    detected: indicators.length > 0,
    indicators,
  };
}

/**
 * Compare severities and return the higher one
 */
function compareSeverity(
  a: ThreatPattern['severity'],
  b: ThreatPattern['severity']
): ThreatPattern['severity'] {
  return SeverityWeights[a] >= SeverityWeights[b] ? a : b;
}

/**
 * Map severity to threat level
 */
function mapSeverityToLevel(
  severity: ThreatPattern['severity']
): ThreatDetectionOutput['threatLevel'] {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'none';
  }
}

/**
 * Analyze historical activity for patterns
 */
function analyzeHistorical(
  current: ActivityLog,
  historical: ActivityLog[],
  _patterns: ThreatPattern[]
): { elevated: boolean; indicators: string[] } {
  const indicators: string[] = [];
  let elevated = false;

  // Check for rapid successive actions (brute force pattern)
  const recentActions = historical.filter(
    (h) => current.timestamp - h.timestamp < 60000 && h.actor === current.actor
  );

  if (recentActions.length >= 5) {
    indicators.push('rapid-successive-actions');
    elevated = true;
  }

  // Check for same action from same actor
  const sameActions = historical.filter(
    (h) => h.action === current.action && h.actor === current.actor
  );

  if (sameActions.length >= 10) {
    indicators.push('repeated-action-pattern');
    elevated = true;
  }

  // Check for failed actions followed by success (potential brute force success)
  const failedActions = historical.filter(
    (h) => h.action.includes('failed') && h.actor === current.actor
  );

  if (failedActions.length >= 3 && current.action.includes('success')) {
    indicators.push('success-after-failures');
    elevated = true;
  }

  // Check for unusual time pattern
  const hour = new Date(current.timestamp).getHours();
  if (hour >= 1 && hour <= 5) {
    // Unusual hours (1 AM - 5 AM)
    const normalHourActions = historical.filter((h) => {
      const hHour = new Date(h.timestamp).getHours();
      return hHour >= 8 && hHour <= 18;
    });

    if (normalHourActions.length > historical.length * 0.9) {
      indicators.push('unusual-time-activity');
    }
  }

  return { elevated, indicators };
}

/**
 * Generate recommended actions based on detected threats
 */
function generateRecommendations(
  patterns: ThreatPattern[],
  maxSeverity: ThreatPattern['severity']
): string[] {
  const recommendations: string[] = [];

  // General recommendations based on severity
  if (maxSeverity === 'critical') {
    recommendations.push('Block request immediately');
    recommendations.push('Alert security team');
    recommendations.push('Initiate incident response');
  } else if (maxSeverity === 'high') {
    recommendations.push('Apply rate limiting');
    recommendations.push('Require additional authentication');
    recommendations.push('Log for security review');
  } else if (maxSeverity === 'medium') {
    recommendations.push('Increase monitoring');
    recommendations.push('Flag for review');
  }

  // Pattern-specific recommendations
  for (const pattern of patterns) {
    switch (pattern.name) {
      case 'brute-force-login':
        recommendations.push('Implement account lockout');
        recommendations.push('Enable CAPTCHA');
        break;
      case 'sql-injection':
      case 'xss-attempt':
        recommendations.push('Sanitize all inputs');
        recommendations.push('Use prepared statements');
        break;
      case 'privilege-escalation':
        recommendations.push('Review user permissions');
        recommendations.push('Audit recent role changes');
        break;
      case 'data-exfiltration':
        recommendations.push('Limit export sizes');
        recommendations.push('Require approval for bulk access');
        break;
      case 'account-takeover':
        recommendations.push('Notify account owner');
        recommendations.push('Require identity verification');
        break;
    }
  }

  return [...new Set(recommendations)];
}

/**
 * Creates a threat detection handler with velocity tracking
 */
export function createVelocityTrackingHandler(
  velocityThresholds: {
    action: string;
    maxPerMinute: number;
    maxPerHour: number;
  }[]
): HookHandler<ThreatDetectionInput, ThreatDetectionOutput> {
  const velocityStore = new Map<string, number[]>();

  return async (input, _context): Promise<HookResult<ThreatDetectionOutput>> => {
    const indicators: string[] = [];
    let threatLevel: ThreatDetectionOutput['threatLevel'] = 'none';
    const recommendedActions: string[] = [];

    const actorKey = `${input.activity.actor}:${input.activity.action}`;
    const now = input.activity.timestamp;

    // Get or create velocity history
    let history = velocityStore.get(actorKey) ?? [];
    history.push(now);

    // Clean old entries (keep last hour)
    history = history.filter((t) => now - t < 3600000);
    velocityStore.set(actorKey, history);

    // Check thresholds
    for (const threshold of velocityThresholds) {
      if (input.activity.action.includes(threshold.action)) {
        const lastMinute = history.filter((t) => now - t < 60000).length;
        const lastHour = history.length;

        if (lastMinute > threshold.maxPerMinute) {
          indicators.push(`velocity-exceeded-per-minute:${threshold.action}`);
          threatLevel = 'high';
          recommendedActions.push('Apply rate limiting');
        } else if (lastHour > threshold.maxPerHour) {
          indicators.push(`velocity-exceeded-per-hour:${threshold.action}`);
          threatLevel = threatLevel === 'none' ? 'medium' : threatLevel;
          recommendedActions.push('Monitor for abuse');
        }
      }
    }

    // Also run default detection
    const defaultResult = await defaultThreatDetectionHandler(input, _context);

    if (!defaultResult.success) return defaultResult;

    return {
      success: true,
      data: {
        threatDetected: indicators.length > 0 || defaultResult.data.threatDetected,
        threatLevel: compareSeverityLevels(threatLevel, defaultResult.data.threatLevel),
        indicators: [...indicators, ...defaultResult.data.indicators],
        recommendedActions: [...recommendedActions, ...defaultResult.data.recommendedActions],
      },
      metadata: {
        velocityTracked: true,
        actorHistory: history.length,
      },
    };
  };
}

/**
 * Compare threat levels
 */
function compareSeverityLevels(
  a: ThreatDetectionOutput['threatLevel'],
  b: ThreatDetectionOutput['threatLevel']
): ThreatDetectionOutput['threatLevel'] {
  const levels: ThreatDetectionOutput['threatLevel'][] = ['none', 'low', 'medium', 'high', 'critical'];
  const aIndex = levels.indexOf(a);
  const bIndex = levels.indexOf(b);
  return aIndex >= bIndex ? a : b;
}

/**
 * Creates a threat detection handler with IP reputation
 */
export function createIpReputationHandler(
  ipReputationDb: Map<string, { reputation: number; lastSeen: number; flags: string[] }>
): HookHandler<ThreatDetectionInput, ThreatDetectionOutput> {
  return async (input, context): Promise<HookResult<ThreatDetectionOutput>> => {
    const ip = input.activity.metadata?.['ip'] as string | undefined;
    const indicators: string[] = [];
    let threatLevel: ThreatDetectionOutput['threatLevel'] = 'none';
    const recommendedActions: string[] = [];

    if (ip) {
      const reputation = ipReputationDb.get(ip);

      if (reputation) {
        if (reputation.reputation < 0.3) {
          indicators.push('low-ip-reputation');
          threatLevel = 'high';
          recommendedActions.push('Block or challenge request');
          indicators.push(...reputation.flags);
        } else if (reputation.reputation < 0.6) {
          indicators.push('medium-ip-reputation');
          threatLevel = 'medium';
          recommendedActions.push('Apply stricter rate limiting');
        }
      }
    }

    // Also run default detection
    const defaultResult = await defaultThreatDetectionHandler(input, context);

    if (!defaultResult.success) return defaultResult;

    return {
      success: true,
      data: {
        threatDetected: indicators.length > 0 || defaultResult.data.threatDetected,
        threatLevel: compareSeverityLevels(threatLevel, defaultResult.data.threatLevel),
        indicators: [...indicators, ...defaultResult.data.indicators],
        recommendedActions: [...recommendedActions, ...defaultResult.data.recommendedActions],
      },
      metadata: {
        ipChecked: ip !== undefined,
      },
    };
  };
}

/**
 * Creates a threat detection handler with anomaly detection
 */
export function createAnomalyDetectionHandler(
  baselineWindow: number = 7 * 24 * 60 * 60 * 1000 // 7 days
): HookHandler<ThreatDetectionInput, ThreatDetectionOutput> {
  const actorBaselines = new Map<string, { actions: Map<string, number>; lastUpdated: number }>();

  return async (input, context): Promise<HookResult<ThreatDetectionOutput>> => {
    const indicators: string[] = [];
    let threatLevel: ThreatDetectionOutput['threatLevel'] = 'none';
    const recommendedActions: string[] = [];

    const actor = input.activity.actor;
    const action = input.activity.action;
    const now = input.activity.timestamp;

    // Get or create baseline
    let baseline = actorBaselines.get(actor);
    if (!baseline || now - baseline.lastUpdated > baselineWindow) {
      // Initialize or reset baseline
      baseline = { actions: new Map(), lastUpdated: now };

      // Build baseline from historical data
      if (input.historical) {
        for (const hist of input.historical) {
          if (hist.actor === actor) {
            const count = baseline.actions.get(hist.action) ?? 0;
            baseline.actions.set(hist.action, count + 1);
          }
        }
      }

      actorBaselines.set(actor, baseline);
    }

    // Check if current action is unusual
    const baselineCount = baseline.actions.get(action) ?? 0;
    const totalActions = Array.from(baseline.actions.values()).reduce((a, b) => a + b, 0);

    if (totalActions > 10) {
      const actionFrequency = baselineCount / totalActions;

      // Action is unusual if it represents less than 1% of baseline
      if (actionFrequency < 0.01 && baselineCount < 3) {
        indicators.push('unusual-action-for-actor');
        threatLevel = 'medium';
        recommendedActions.push('Verify actor identity');
      }
    }

    // Update baseline
    baseline.actions.set(action, baselineCount + 1);

    // Also run default detection
    const defaultResult = await defaultThreatDetectionHandler(input, context);

    if (!defaultResult.success) return defaultResult;

    return {
      success: true,
      data: {
        threatDetected: indicators.length > 0 || defaultResult.data.threatDetected,
        threatLevel: compareSeverityLevels(threatLevel, defaultResult.data.threatLevel),
        indicators: [...indicators, ...defaultResult.data.indicators],
        recommendedActions: [...recommendedActions, ...defaultResult.data.recommendedActions],
      },
      metadata: {
        anomalyDetection: true,
        baselineActions: totalActions,
      },
    };
  };
}

/**
 * Creates a threat detection handler with geo-location tracking
 */
export function createGeoLocationHandler(
  geoLookup: (ip: string) => { country: string; city?: string; isTor?: boolean; isProxy?: boolean } | undefined,
  allowedCountries?: string[]
): HookHandler<ThreatDetectionInput, ThreatDetectionOutput> {
  return async (input, context): Promise<HookResult<ThreatDetectionOutput>> => {
    const ip = input.activity.metadata?.['ip'] as string | undefined;
    const indicators: string[] = [];
    let threatLevel: ThreatDetectionOutput['threatLevel'] = 'none';
    const recommendedActions: string[] = [];

    if (ip) {
      const geo = geoLookup(ip);

      if (geo) {
        if (geo.isTor) {
          indicators.push('tor-exit-node');
          threatLevel = 'medium';
          recommendedActions.push('Require additional verification');
        }

        if (geo.isProxy) {
          indicators.push('proxy-detected');
          threatLevel = threatLevel === 'none' ? 'low' : threatLevel;
        }

        if (allowedCountries && !allowedCountries.includes(geo.country)) {
          indicators.push(`restricted-country:${geo.country}`);
          threatLevel = 'high';
          recommendedActions.push('Block or verify request');
        }
      }
    }

    // Also run default detection
    const defaultResult = await defaultThreatDetectionHandler(input, context);

    if (!defaultResult.success) return defaultResult;

    return {
      success: true,
      data: {
        threatDetected: indicators.length > 0 || defaultResult.data.threatDetected,
        threatLevel: compareSeverityLevels(threatLevel, defaultResult.data.threatLevel),
        indicators: [...indicators, ...defaultResult.data.indicators],
        recommendedActions: [...recommendedActions, ...defaultResult.data.recommendedActions],
      },
      metadata: {
        geoChecked: ip !== undefined,
      },
    };
  };
}

/**
 * Creates a logging threat detection handler
 */
export function createLoggingThreatDetectionHandler(
  logger: {
    info: (message: string, context: Record<string, unknown>) => void;
    warn: (message: string, context: Record<string, unknown>) => void;
    error: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<ThreatDetectionInput, ThreatDetectionOutput>
): HookHandler<ThreatDetectionInput, ThreatDetectionOutput> {
  return async (input, context): Promise<HookResult<ThreatDetectionOutput>> => {
    const handler = innerHandler ?? defaultThreatDetectionHandler;
    const result = await handler(input, context);

    if (result.success) {
      const { threatDetected, threatLevel, indicators } = result.data;

      if (threatDetected) {
        const logFn = threatLevel === 'critical' || threatLevel === 'high'
          ? logger.error
          : threatLevel === 'medium'
            ? logger.warn
            : logger.info;

        logFn(`Threat detected: ${threatLevel}`, {
          activity: input.activity,
          threatLevel,
          indicators,
          recommendedActions: result.data.recommendedActions,
          requestId: context.requestId,
        });
      } else {
        logger.info('No threat detected', {
          activity: input.activity.action,
          actor: input.activity.actor,
          requestId: context.requestId,
        });
      }
    }

    return result;
  };
}

/**
 * Register the default threat detection hook
 */
export function registerDefaultThreatDetection(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.THREAT_DETECTION,
    {
      id: 'default-threat-detection',
      name: 'Default Threat Detection',
      priority: 'critical',
      description: 'Basic threat detection handler',
    },
    defaultThreatDetectionHandler
  );
}
