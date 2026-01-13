/**
 * Permission Check Hook (#10)
 *
 * Validates user permissions for resources and actions.
 * Use cases: RBAC, ABAC, resource-level access control.
 */

import type {
  HookHandler,
  HookResult,
  PermissionCheckInput,
  PermissionCheckOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default permission check handler - allows all
 */
export const defaultPermissionCheckHandler: HookHandler<
  PermissionCheckInput,
  PermissionCheckOutput
> = async (_input, _context): Promise<HookResult<PermissionCheckOutput>> => {
  return {
    success: true,
    data: {
      allowed: true,
    },
  };
};

/**
 * Permission rule definition
 */
export interface PermissionRule {
  resource: string | RegExp;
  action: string | string[];
  allow: boolean;
  conditions?: (context: Record<string, unknown>) => boolean;
}

/**
 * Creates a role-based access control (RBAC) permission checker
 */
export function createRbacPermissionChecker(
  rolePermissions: Record<string, PermissionRule[]>,
  getUserRoles: (userId: string) => Promise<string[]>
): HookHandler<PermissionCheckInput, PermissionCheckOutput> {
  return async (input, _context): Promise<HookResult<PermissionCheckOutput>> => {
    try {
      const userRoles = await getUserRoles(input.userId);

      if (userRoles.length === 0) {
        return {
          success: true,
          data: {
            allowed: false,
            reason: 'no-roles-assigned',
          },
        };
      }

      // Check each role's permissions
      for (const role of userRoles) {
        const rules = rolePermissions[role];
        if (!rules) continue;

        for (const rule of rules) {
          // Check if resource matches
          const resourceMatches =
            rule.resource instanceof RegExp
              ? rule.resource.test(input.resource)
              : rule.resource === input.resource || rule.resource === '*';

          if (!resourceMatches) continue;

          // Check if action matches
          const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
          const actionMatches = actions.includes(input.action) || actions.includes('*');

          if (!actionMatches) continue;

          // Check conditions if present
          if (rule.conditions && !rule.conditions(input.context ?? {})) {
            continue;
          }

          // Found a matching rule
          return {
            success: true,
            data: {
              allowed: rule.allow,
              reason: rule.allow ? undefined : `denied-by-role-${role}`,
            },
            metadata: { matchedRole: role },
          };
        }
      }

      // No matching rule found - deny by default
      return {
        success: true,
        data: {
          allowed: false,
          reason: 'no-matching-permission',
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
 * Creates a simple allow/deny list permission checker
 */
export function createAllowDenyListChecker(config: {
  allowList?: Array<{ resource: string; actions: string[] }>;
  denyList?: Array<{ resource: string; actions: string[] }>;
  defaultAllow?: boolean;
}): HookHandler<PermissionCheckInput, PermissionCheckOutput> {
  const defaultAllow = config.defaultAllow ?? false;

  return async (input, _context): Promise<HookResult<PermissionCheckOutput>> => {
    // Check deny list first (deny takes precedence)
    if (config.denyList) {
      for (const entry of config.denyList) {
        if (entry.resource === input.resource || entry.resource === '*') {
          if (entry.actions.includes(input.action) || entry.actions.includes('*')) {
            return {
              success: true,
              data: {
                allowed: false,
                reason: 'in-deny-list',
              },
            };
          }
        }
      }
    }

    // Check allow list
    if (config.allowList) {
      for (const entry of config.allowList) {
        if (entry.resource === input.resource || entry.resource === '*') {
          if (entry.actions.includes(input.action) || entry.actions.includes('*')) {
            return {
              success: true,
              data: {
                allowed: true,
              },
            };
          }
        }
      }
    }

    // Return default
    return {
      success: true,
      data: {
        allowed: defaultAllow,
        reason: defaultAllow ? undefined : 'not-in-allow-list',
      },
    };
  };
}

/**
 * Creates an attribute-based access control (ABAC) permission checker
 */
export function createAbacPermissionChecker(
  policies: Array<{
    name: string;
    condition: (subject: Record<string, unknown>, resource: string, action: string, context: Record<string, unknown>) => boolean;
    effect: 'allow' | 'deny';
  }>,
  getSubjectAttributes: (userId: string) => Promise<Record<string, unknown>>
): HookHandler<PermissionCheckInput, PermissionCheckOutput> {
  return async (input, _context): Promise<HookResult<PermissionCheckOutput>> => {
    try {
      const subjectAttrs = await getSubjectAttributes(input.userId);
      const restrictions: string[] = [];

      for (const policy of policies) {
        const matches = policy.condition(
          subjectAttrs,
          input.resource,
          input.action,
          input.context ?? {}
        );

        if (matches) {
          if (policy.effect === 'deny') {
            return {
              success: true,
              data: {
                allowed: false,
                reason: `denied-by-policy-${policy.name}`,
                restrictions,
              },
            };
          } else {
            return {
              success: true,
              data: {
                allowed: true,
                restrictions,
              },
              metadata: { matchedPolicy: policy.name },
            };
          }
        }
      }

      // No policy matched - deny by default
      return {
        success: true,
        data: {
          allowed: false,
          reason: 'no-matching-policy',
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
 * Register the default permission check hook
 */
export function registerDefaultPermissionCheck(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.PERMISSION_CHECK,
    {
      id: 'default-permission-check',
      name: 'Default Permission Check',
      priority: 'high',
      description: 'Allows all permissions by default',
    },
    defaultPermissionCheckHandler
  );
}
