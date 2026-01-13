/**
 * Alert Trigger Hook (#40)
 *
 * Triggers alerts based on conditions.
 * Use cases: SLO monitoring, anomaly detection, incident management.
 */

import type {
  HookHandler,
  HookResult,
  AlertTriggerInput,
  AlertTriggerOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Generate a unique alert ID
 */
function generateAlertId(): string {
  return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Default alert trigger handler
 */
export const defaultAlertTriggerHandler: HookHandler<
  AlertTriggerInput,
  AlertTriggerOutput
> = async (input, _context): Promise<HookResult<AlertTriggerOutput>> => {
  const triggered = input.currentValue > input.threshold;

  return {
    success: true,
    data: {
      triggered,
      alertId: triggered ? generateAlertId() : undefined,
    },
  };
};

/**
 * Alert state
 */
export type AlertState = 'inactive' | 'pending' | 'firing' | 'resolved';

/**
 * Alert definition
 */
export interface AlertDefinition {
  name: string;
  condition: string;
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  for?: number; // Duration in ms before firing
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  notificationChannels?: string[];
}

/**
 * Alert instance
 */
export interface AlertInstance {
  id: string;
  definition: AlertDefinition;
  state: AlertState;
  currentValue: number;
  startTime: number;
  lastEvaluation: number;
  pendingSince?: number;
  firedAt?: number;
  resolvedAt?: number;
  notificationsSent: string[];
}

/**
 * Alert manager interface
 */
export interface AlertManager {
  alerts: Map<string, AlertInstance>;
  definitions: Map<string, AlertDefinition>;
  registerAlert: (definition: AlertDefinition) => void;
  evaluate: (alertName: string, currentValue: number) => AlertInstance;
  getAlert: (alertName: string) => AlertInstance | undefined;
  getActiveAlerts: () => AlertInstance[];
  resolveAlert: (alertName: string) => void;
}

/**
 * Creates an alert manager
 */
export function createAlertManager(): AlertManager {
  const alerts = new Map<string, AlertInstance>();
  const definitions = new Map<string, AlertDefinition>();

  return {
    alerts,
    definitions,
    registerAlert: (definition) => {
      definitions.set(definition.name, definition);
    },
    evaluate: (alertName, currentValue) => {
      const definition = definitions.get(alertName);
      if (!definition) {
        throw new Error(`Unknown alert: ${alertName}`);
      }

      const now = Date.now();
      let instance = alerts.get(alertName);

      if (!instance) {
        instance = {
          id: generateAlertId(),
          definition,
          state: 'inactive',
          currentValue,
          startTime: now,
          lastEvaluation: now,
          notificationsSent: [],
        };
        alerts.set(alertName, instance);
      }

      instance.currentValue = currentValue;
      instance.lastEvaluation = now;

      // Evaluate condition
      const exceeded = currentValue > definition.threshold;

      switch (instance.state) {
        case 'inactive':
          if (exceeded) {
            if (definition.for) {
              instance.state = 'pending';
              instance.pendingSince = now;
            } else {
              instance.state = 'firing';
              instance.firedAt = now;
            }
          }
          break;

        case 'pending':
          if (!exceeded) {
            instance.state = 'inactive';
            instance.pendingSince = undefined;
          } else if (instance.pendingSince && now - instance.pendingSince >= (definition.for ?? 0)) {
            instance.state = 'firing';
            instance.firedAt = now;
          }
          break;

        case 'firing':
          if (!exceeded) {
            instance.state = 'resolved';
            instance.resolvedAt = now;
          }
          break;

        case 'resolved':
          if (exceeded) {
            if (definition.for) {
              instance.state = 'pending';
              instance.pendingSince = now;
            } else {
              instance.state = 'firing';
              instance.firedAt = now;
              instance.resolvedAt = undefined;
            }
          } else {
            // Reset to inactive after being resolved
            instance.state = 'inactive';
          }
          break;
      }

      return instance;
    },
    getAlert: (alertName) => alerts.get(alertName),
    getActiveAlerts: () => {
      return Array.from(alerts.values()).filter(
        (a) => a.state === 'pending' || a.state === 'firing'
      );
    },
    resolveAlert: (alertName) => {
      const instance = alerts.get(alertName);
      if (instance && instance.state === 'firing') {
        instance.state = 'resolved';
        instance.resolvedAt = Date.now();
      }
    },
  };
}

/**
 * Notification channel interface
 */
export interface NotificationChannel {
  name: string;
  send: (alert: AlertInstance) => Promise<boolean>;
}

/**
 * Creates an alert trigger handler with alert manager
 */
export function createManagedAlertHandler(
  manager: AlertManager
): HookHandler<AlertTriggerInput, AlertTriggerOutput> {
  return async (input, _context): Promise<HookResult<AlertTriggerOutput>> => {
    // Register alert if not exists
    if (!manager.definitions.has(input.alertName)) {
      manager.registerAlert({
        name: input.alertName,
        condition: input.condition,
        threshold: input.threshold,
        severity: input.severity,
      });
    }

    const instance = manager.evaluate(input.alertName, input.currentValue);

    return {
      success: true,
      data: {
        triggered: instance.state === 'firing',
        alertId: instance.state === 'firing' ? instance.id : undefined,
      },
      metadata: {
        state: instance.state,
        duration: instance.firedAt ? Date.now() - instance.firedAt : undefined,
      },
    };
  };
}

/**
 * Creates an alert trigger handler with notifications
 */
export function createNotifyingAlertHandler(
  channels: NotificationChannel[],
  manager?: AlertManager
): HookHandler<AlertTriggerInput, AlertTriggerOutput> {
  const alertManager = manager ?? createAlertManager();

  return async (input, _context): Promise<HookResult<AlertTriggerOutput>> => {
    // Register alert if not exists
    if (!alertManager.definitions.has(input.alertName)) {
      alertManager.registerAlert({
        name: input.alertName,
        condition: input.condition,
        threshold: input.threshold,
        severity: input.severity,
        notificationChannels: channels.map((c) => c.name),
      });
    }

    const instance = alertManager.evaluate(input.alertName, input.currentValue);
    const notificationsSent: string[] = [];

    // Send notifications if firing and not already notified
    if (instance.state === 'firing') {
      for (const channel of channels) {
        if (!instance.notificationsSent.includes(channel.name)) {
          const sent = await channel.send(instance);
          if (sent) {
            instance.notificationsSent.push(channel.name);
            notificationsSent.push(channel.name);
          }
        }
      }
    }

    return {
      success: true,
      data: {
        triggered: instance.state === 'firing',
        alertId: instance.state === 'firing' ? instance.id : undefined,
        notificationsSent: notificationsSent.length > 0 ? notificationsSent : undefined,
      },
    };
  };
}

/**
 * Creates an alert trigger handler with hysteresis
 */
export function createHysteresisAlertHandler(
  upperThreshold: number,
  lowerThreshold: number
): HookHandler<AlertTriggerInput, AlertTriggerOutput> {
  const state = new Map<string, { firing: boolean; alertId?: string }>();

  return async (input, _context): Promise<HookResult<AlertTriggerOutput>> => {
    const current = state.get(input.alertName) ?? { firing: false };

    if (current.firing) {
      // Only resolve if below lower threshold
      if (input.currentValue < lowerThreshold) {
        current.firing = false;
        current.alertId = undefined;
      }
    } else {
      // Only fire if above upper threshold
      if (input.currentValue > upperThreshold) {
        current.firing = true;
        current.alertId = generateAlertId();
      }
    }

    state.set(input.alertName, current);

    return {
      success: true,
      data: {
        triggered: current.firing,
        alertId: current.alertId,
      },
      metadata: {
        upperThreshold,
        lowerThreshold,
        hysteresis: upperThreshold - lowerThreshold,
      },
    };
  };
}

/**
 * Creates an alert trigger handler with aggregation
 */
export function createAggregatingAlertHandler(
  windowMs: number = 60000,
  aggregation: 'avg' | 'max' | 'min' | 'sum' | 'count'
): HookHandler<AlertTriggerInput, AlertTriggerOutput> {
  const windows = new Map<string, Array<{ value: number; timestamp: number }>>();

  return async (input, _context): Promise<HookResult<AlertTriggerOutput>> => {
    const now = Date.now();

    if (!windows.has(input.alertName)) {
      windows.set(input.alertName, []);
    }

    const window = windows.get(input.alertName)!;
    window.push({ value: input.currentValue, timestamp: now });

    // Remove old entries
    while (window.length > 0 && now - window[0]!.timestamp > windowMs) {
      window.shift();
    }

    // Calculate aggregated value
    let aggregatedValue: number;

    switch (aggregation) {
      case 'avg':
        aggregatedValue = window.reduce((sum, e) => sum + e.value, 0) / window.length;
        break;
      case 'max':
        aggregatedValue = Math.max(...window.map((e) => e.value));
        break;
      case 'min':
        aggregatedValue = Math.min(...window.map((e) => e.value));
        break;
      case 'sum':
        aggregatedValue = window.reduce((sum, e) => sum + e.value, 0);
        break;
      case 'count':
        aggregatedValue = window.length;
        break;
    }

    const triggered = aggregatedValue > input.threshold;

    return {
      success: true,
      data: {
        triggered,
        alertId: triggered ? generateAlertId() : undefined,
      },
      metadata: {
        aggregation,
        windowMs,
        samplesInWindow: window.length,
        aggregatedValue,
      },
    };
  };
}

/**
 * Creates an alert trigger handler with rate limiting
 */
export function createRateLimitedAlertHandler(
  cooldownMs: number = 300000,
  innerHandler?: HookHandler<AlertTriggerInput, AlertTriggerOutput>
): HookHandler<AlertTriggerInput, AlertTriggerOutput> {
  const lastFired = new Map<string, number>();

  return async (input, context): Promise<HookResult<AlertTriggerOutput>> => {
    const handler = innerHandler ?? defaultAlertTriggerHandler;
    const result = await handler(input, context);

    if (result.success && result.data.triggered) {
      const last = lastFired.get(input.alertName);
      const now = Date.now();

      if (last && now - last < cooldownMs) {
        return {
          success: true,
          data: {
            triggered: false,
          },
          metadata: {
            suppressed: true,
            reason: 'cooldown',
            remainingCooldown: cooldownMs - (now - last),
          },
        };
      }

      lastFired.set(input.alertName, now);
    }

    return result;
  };
}

/**
 * Creates an alert trigger handler with severity escalation
 */
export function createEscalatingAlertHandler(
  escalationThresholds: Array<{
    severity: 'info' | 'warning' | 'critical';
    duration: number;
  }>
): HookHandler<AlertTriggerInput, AlertTriggerOutput> {
  const firingAlerts = new Map<string, { firedAt: number; currentSeverity: string }>();

  return async (input, _context): Promise<HookResult<AlertTriggerOutput>> => {
    const triggered = input.currentValue > input.threshold;
    const now = Date.now();

    if (!triggered) {
      firingAlerts.delete(input.alertName);
      return {
        success: true,
        data: {
          triggered: false,
        },
      };
    }

    let firing = firingAlerts.get(input.alertName);

    if (!firing) {
      firing = { firedAt: now, currentSeverity: input.severity };
      firingAlerts.set(input.alertName, firing);
    }

    // Check for escalation
    const duration = now - firing.firedAt;
    let escalatedSeverity = input.severity;

    for (const threshold of escalationThresholds) {
      if (duration >= threshold.duration) {
        escalatedSeverity = threshold.severity;
      }
    }

    firing.currentSeverity = escalatedSeverity;

    return {
      success: true,
      data: {
        triggered: true,
        alertId: generateAlertId(),
      },
      metadata: {
        originalSeverity: input.severity,
        currentSeverity: escalatedSeverity,
        duration,
        escalated: escalatedSeverity !== input.severity,
      },
    };
  };
}

/**
 * Creates a logging alert handler
 */
export function createLoggingAlertHandler(
  logger: {
    info: (message: string, context: Record<string, unknown>) => void;
    warn: (message: string, context: Record<string, unknown>) => void;
    error: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<AlertTriggerInput, AlertTriggerOutput>
): HookHandler<AlertTriggerInput, AlertTriggerOutput> {
  return async (input, context): Promise<HookResult<AlertTriggerOutput>> => {
    const handler = innerHandler ?? defaultAlertTriggerHandler;
    const result = await handler(input, context);

    if (result.success && result.data.triggered) {
      const logFn = input.severity === 'critical' ? logger.error
        : input.severity === 'warning' ? logger.warn
        : logger.info;

      logFn(`Alert triggered: ${input.alertName}`, {
        alertName: input.alertName,
        severity: input.severity,
        currentValue: input.currentValue,
        threshold: input.threshold,
        alertId: result.data.alertId,
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Register the default alert trigger hook
 */
export function registerDefaultAlertTrigger(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.ALERT_TRIGGER,
    {
      id: 'default-alert-trigger',
      name: 'Default Alert Trigger',
      priority: 'high',
      description: 'Basic alert trigger handler',
    },
    defaultAlertTriggerHandler
  );
}
