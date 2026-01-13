/**
 * Tool Registry
 *
 * Central registry for managing tool definitions, handlers, and metadata.
 */

import { EventEmitter } from 'eventemitter3';
import type { ToolDefinition } from '../types/hooks.js';
import type {
  RegisteredTool,
  ToolHandler,
  ToolValidator,
  ToolOptions,
  ToolEvents,
} from './types.js';

// =============================================================================
// Tool Registry Implementation
// =============================================================================

export class ToolRegistry extends EventEmitter<ToolEvents> {
  private tools: Map<string, RegisteredTool> = new Map();
  private categories: Map<string, Set<string>> = new Map();

  /**
   * Register a tool with its handler
   */
  register(
    definition: ToolDefinition,
    handler: ToolHandler,
    options: ToolOptions = {},
    validator?: ToolValidator
  ): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool already registered: ${definition.name}`);
    }

    const registeredTool: RegisteredTool = {
      definition,
      handler,
      validator,
      options,
      registeredAt: Date.now(),
      executionCount: 0,
      errorCount: 0,
    };

    this.tools.set(definition.name, registeredTool);

    // Track by category if provided in options
    if (options.category) {
      if (!this.categories.has(options.category)) {
        this.categories.set(options.category, new Set());
      }
      this.categories.get(options.category)!.add(definition.name);
    }

    this.emit('tool:registered', definition.name, definition);
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) {
      return false;
    }

    // Remove from category tracking
    if (tool.options.category) {
      const categoryTools = this.categories.get(tool.options.category);
      if (categoryTools) {
        categoryTools.delete(name);
        if (categoryTools.size === 0) {
          this.categories.delete(tool.options.category);
        }
      }
    }

    this.tools.delete(name);
    this.emit('tool:unregistered', name);
    return true;
  }

  /**
   * Get a registered tool
   */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all tool definitions
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /**
   * Get tool definitions by category
   */
  getDefinitionsByCategory(category: string): ToolDefinition[] {
    const toolNames = this.categories.get(category);
    if (!toolNames) {
      return [];
    }

    return Array.from(toolNames)
      .map((name) => this.tools.get(name)?.definition)
      .filter((d): d is ToolDefinition => d !== undefined);
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Get tool handler
   */
  getHandler(name: string): ToolHandler | undefined {
    return this.tools.get(name)?.handler;
  }

  /**
   * Get tool validator
   */
  getValidator(name: string): ToolValidator | undefined {
    return this.tools.get(name)?.validator;
  }

  /**
   * Get tool options
   */
  getOptions(name: string): ToolOptions | undefined {
    return this.tools.get(name)?.options;
  }

  /**
   * Update tool options
   */
  updateOptions(name: string, options: Partial<ToolOptions>): boolean {
    const tool = this.tools.get(name);
    if (!tool) {
      return false;
    }

    tool.options = { ...tool.options, ...options };
    return true;
  }

  /**
   * Record tool execution
   */
  recordExecution(name: string, success: boolean): void {
    const tool = this.tools.get(name);
    if (!tool) {
      return;
    }

    tool.executionCount++;
    tool.lastExecutedAt = Date.now();
    if (!success) {
      tool.errorCount++;
    }
  }

  /**
   * Get execution statistics for a tool
   */
  getStats(name: string): Pick<RegisteredTool, 'executionCount' | 'errorCount' | 'lastExecutedAt'> | undefined {
    const tool = this.tools.get(name);
    if (!tool) {
      return undefined;
    }

    return {
      executionCount: tool.executionCount,
      errorCount: tool.errorCount,
      lastExecutedAt: tool.lastExecutedAt,
    };
  }

  /**
   * Get all statistics
   */
  getAllStats(): Map<string, Pick<RegisteredTool, 'executionCount' | 'errorCount' | 'lastExecutedAt'>> {
    const stats = new Map<string, Pick<RegisteredTool, 'executionCount' | 'errorCount' | 'lastExecutedAt'>>();

    for (const [name, tool] of this.tools) {
      stats.set(name, {
        executionCount: tool.executionCount,
        errorCount: tool.errorCount,
        lastExecutedAt: tool.lastExecutedAt,
      });
    }

    return stats;
  }

  /**
   * Get deprecated tools
   */
  getDeprecatedTools(): ToolDefinition[] {
    return Array.from(this.tools.values())
      .filter((t) => t.options.deprecated)
      .map((t) => t.definition);
  }

  /**
   * Get tools requiring specific permission
   */
  getToolsRequiringPermission(permission: string): ToolDefinition[] {
    return Array.from(this.tools.values())
      .filter((t) => t.options.requiredPermissions?.includes(permission))
      .map((t) => t.definition);
  }

  /**
   * Find tools by name pattern
   */
  findByPattern(pattern: RegExp): ToolDefinition[] {
    return Array.from(this.tools.values())
      .filter((t) => pattern.test(t.definition.name))
      .map((t) => t.definition);
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    this.categories.clear();
  }

  /**
   * Get registry size
   */
  get size(): number {
    return this.tools.size;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a tool registry
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}

// =============================================================================
// Default Validators
// =============================================================================

/**
 * Create a JSON Schema validator
 */
export function createSchemaValidator(): ToolValidator {
  return (args, definition) => {
    const errors: Array<{ path: string; message: string; expected?: string; received?: unknown }> = [];

    // Basic type validation against schema (using parameters as the schema)
    const schema = definition.parameters as Record<string, { type?: string; required?: boolean }> | undefined;
    if (schema) {
      for (const [key, paramSchema] of Object.entries(schema)) {
        const value = args[key];

        // Check required
        if (paramSchema.required && value === undefined) {
          errors.push({
            path: key,
            message: `Required field missing: ${key}`,
          });
          continue;
        }

        // Skip if optional and not provided
        if (value === undefined) {
          continue;
        }

        // Type check
        const expectedType = paramSchema.type;
        if (expectedType) {
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          if (actualType !== expectedType) {
            errors.push({
              path: key,
              message: `Type mismatch for ${key}`,
              expected: expectedType,
              received: actualType,
            });
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  };
}

/**
 * Create a custom validator from validation rules
 */
export function createCustomValidator(
  rules: Record<string, (value: unknown) => string | undefined>
): ToolValidator {
  return (args, _definition) => {
    const errors: Array<{ path: string; message: string }> = [];

    for (const [key, rule] of Object.entries(rules)) {
      const error = rule(args[key]);
      if (error) {
        errors.push({ path: key, message: error });
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  };
}
