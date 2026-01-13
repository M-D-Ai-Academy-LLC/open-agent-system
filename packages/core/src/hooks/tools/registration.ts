/**
 * Tool Registration Hook (#15)
 *
 * Manages tool registration and conflict resolution.
 * Use cases: plugin systems, dynamic tool loading, capability management.
 */

import type {
  HookHandler,
  HookResult,
  ToolRegistrationInput,
  ToolRegistrationOutput,
  ToolDefinition,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default tool registration handler - simple registration
 */
export const defaultToolRegistrationHandler: HookHandler<
  ToolRegistrationInput,
  ToolRegistrationOutput
> = async (input, _context): Promise<HookResult<ToolRegistrationOutput>> => {
  // Generate a unique tool ID
  const toolId = `${input.source}:${input.tool.name}`;

  return {
    success: true,
    data: {
      registered: true,
      toolId,
    },
  };
};

/**
 * Tool registry for tracking registered tools
 */
export interface ToolRegistry {
  tools: Map<string, { tool: ToolDefinition; source: string; registeredAt: number }>;
  register: (id: string, tool: ToolDefinition, source: string) => boolean;
  unregister: (id: string) => boolean;
  get: (id: string) => ToolDefinition | undefined;
  list: () => Array<{ id: string; tool: ToolDefinition; source: string }>;
}

/**
 * Creates a tool registry
 */
export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, { tool: ToolDefinition; source: string; registeredAt: number }>();

  return {
    tools,
    register: (id: string, tool: ToolDefinition, source: string): boolean => {
      if (tools.has(id)) {
        return false;
      }
      tools.set(id, { tool, source, registeredAt: Date.now() });
      return true;
    },
    unregister: (id: string): boolean => {
      return tools.delete(id);
    },
    get: (id: string): ToolDefinition | undefined => {
      return tools.get(id)?.tool;
    },
    list: (): Array<{ id: string; tool: ToolDefinition; source: string }> => {
      return Array.from(tools.entries()).map(([id, entry]) => ({
        id,
        tool: entry.tool,
        source: entry.source,
      }));
    },
  };
}

/**
 * Creates a registration handler with conflict detection
 */
export function createConflictAwareRegistration(
  registry: ToolRegistry,
  conflictStrategy: 'reject' | 'replace' | 'rename' = 'reject'
): HookHandler<ToolRegistrationInput, ToolRegistrationOutput> {
  return async (input, _context): Promise<HookResult<ToolRegistrationOutput>> => {
    const baseId = `${input.source}:${input.tool.name}`;
    let toolId = baseId;
    const conflicts: string[] = [];

    // Check for existing tool with same name
    const existing = registry.get(baseId);
    if (existing) {
      conflicts.push(baseId);

      switch (conflictStrategy) {
        case 'reject':
          return {
            success: true,
            data: {
              registered: false,
              toolId: '',
              conflicts,
            },
            metadata: { reason: 'conflict-rejected' },
          };

        case 'replace':
          registry.unregister(baseId);
          break;

        case 'rename':
          // Generate unique name
          let counter = 1;
          while (registry.get(`${baseId}_${counter}`)) {
            counter++;
          }
          toolId = `${baseId}_${counter}`;
          break;
      }
    }

    const registered = registry.register(toolId, input.tool, input.source);

    return {
      success: true,
      data: {
        registered,
        toolId: registered ? toolId : '',
        conflicts: conflicts.length > 0 ? conflicts : undefined,
      },
    };
  };
}

/**
 * Creates a registration handler with capability filtering
 */
export function createCapabilityFilteredRegistration(
  allowedCapabilities: string[],
  registry: ToolRegistry
): HookHandler<ToolRegistrationInput, ToolRegistrationOutput> {
  return async (input, _context): Promise<HookResult<ToolRegistrationOutput>> => {
    // Check if tool has any required capabilities
    // For this example, we check the tool name against allowed patterns
    const isAllowed = allowedCapabilities.some(
      (cap) => input.tool.name.includes(cap) || cap === '*'
    );

    if (!isAllowed) {
      return {
        success: true,
        data: {
          registered: false,
          toolId: '',
          conflicts: undefined,
        },
        metadata: { reason: 'capability-not-allowed' },
      };
    }

    const toolId = `${input.source}:${input.tool.name}`;
    const registered = registry.register(toolId, input.tool, input.source);

    return {
      success: true,
      data: {
        registered,
        toolId: registered ? toolId : '',
      },
    };
  };
}

/**
 * Creates a registration handler with source priority
 */
export function createPriorityBasedRegistration(
  sourcePriority: string[],
  registry: ToolRegistry
): HookHandler<ToolRegistrationInput, ToolRegistrationOutput> {
  return async (input, _context): Promise<HookResult<ToolRegistrationOutput>> => {
    const toolId = `${input.source}:${input.tool.name}`;
    const baseName = input.tool.name;

    // Find existing tool with same base name
    const existingTools = registry.list().filter((t) => t.tool.name === baseName);

    if (existingTools.length > 0) {
      // Check priority
      const existingPriority = sourcePriority.indexOf(existingTools[0]!.source);
      const newPriority = sourcePriority.indexOf(input.source);

      // Lower index = higher priority
      if (existingPriority !== -1 && (newPriority === -1 || existingPriority < newPriority)) {
        return {
          success: true,
          data: {
            registered: false,
            toolId: '',
            conflicts: [existingTools[0]!.id],
          },
          metadata: { reason: 'lower-priority-source' },
        };
      }

      // Remove existing lower priority tool
      for (const existing of existingTools) {
        registry.unregister(existing.id);
      }
    }

    const registered = registry.register(toolId, input.tool, input.source);

    return {
      success: true,
      data: {
        registered,
        toolId: registered ? toolId : '',
      },
    };
  };
}

/**
 * Register the default tool registration hook
 */
export function registerDefaultToolRegistration(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.TOOL_REGISTRATION,
    {
      id: 'default-tool-registration',
      name: 'Default Tool Registration',
      priority: 'normal',
      description: 'Simple tool registration handler',
    },
    defaultToolRegistrationHandler
  );
}
