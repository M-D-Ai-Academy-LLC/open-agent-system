/**
 * Tool Validation Hook (#16)
 *
 * Validates tool definitions before registration.
 * Use cases: schema validation, tool definition verification.
 */

import type {
  HookHandler,
  HookResult,
  ToolValidationInput,
  ToolValidationOutput,
  ValidationError,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default tool validation handler - basic validation
 */
export const defaultToolValidationHandler: HookHandler<
  ToolValidationInput,
  ToolValidationOutput
> = async (input, _context): Promise<HookResult<ToolValidationOutput>> => {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // Validate tool name
  if (!input.tool.name || typeof input.tool.name !== 'string') {
    errors.push({
      path: 'tool.name',
      message: 'Tool name is required and must be a string',
      code: 'INVALID_TOOL_NAME',
    });
  } else if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(input.tool.name)) {
    errors.push({
      path: 'tool.name',
      message: 'Tool name must start with a letter and contain only alphanumeric characters, underscores, and hyphens',
      code: 'INVALID_TOOL_NAME_FORMAT',
    });
  }

  // Validate description
  if (!input.tool.description) {
    warnings.push('Tool description is recommended for better discoverability');
  }

  // Validate parameters
  if (input.tool.parameters && typeof input.tool.parameters !== 'object') {
    errors.push({
      path: 'tool.parameters',
      message: 'Tool parameters must be an object',
      code: 'INVALID_PARAMETERS',
    });
  }

  return {
    success: true,
    data: {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
  };
};

/**
 * Creates a schema-based validator using Zod
 */
export function createSchemaValidator(
  toolSchemas: Map<string, { validate: (tool: unknown) => { success: boolean; errors?: ValidationError[] } }>
): HookHandler<ToolValidationInput, ToolValidationOutput> {
  return async (input, _context): Promise<HookResult<ToolValidationOutput>> => {
    const schema = toolSchemas.get(input.tool.name);

    if (!schema) {
      return {
        success: true,
        data: {
          valid: true,
          warnings: [`No schema defined for tool: ${input.tool.name}`],
        },
      };
    }

    const result = schema.validate(input.tool);

    return {
      success: true,
      data: {
        valid: result.success,
        errors: result.errors,
      },
    };
  };
}

/**
 * Creates a validation handler with custom rules
 */
export function createCustomValidator(
  rules: Array<{
    name: string;
    validate: (tool: ToolValidationInput['tool']) => { valid: boolean; error?: string };
  }>
): HookHandler<ToolValidationInput, ToolValidationOutput> {
  return async (input, _context): Promise<HookResult<ToolValidationOutput>> => {
    const errors: ValidationError[] = [];

    for (const rule of rules) {
      const result = rule.validate(input.tool);
      if (!result.valid && result.error) {
        errors.push({
          path: `rule:${rule.name}`,
          message: result.error,
          code: 'CUSTOM_VALIDATION_FAILED',
        });
      }
    }

    return {
      success: true,
      data: {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
      },
    };
  };
}

/**
 * Creates a validator that checks for required capabilities
 */
export function createCapabilityValidator(
  requiredCapabilities: Map<string, string[]>
): HookHandler<ToolValidationInput, ToolValidationOutput> {
  return async (input, _context): Promise<HookResult<ToolValidationOutput>> => {
    const required = requiredCapabilities.get(input.tool.name);

    if (!required || required.length === 0) {
      return {
        success: true,
        data: {
          valid: true,
        },
      };
    }

    // Check if tool has metadata with capabilities
    const toolCapabilities = (input.tool as { capabilities?: string[] }).capabilities ?? [];
    const missing = required.filter((cap) => !toolCapabilities.includes(cap));

    if (missing.length > 0) {
      return {
        success: true,
        data: {
          valid: false,
          errors: [
            {
              path: 'tool.capabilities',
              message: `Missing required capabilities: ${missing.join(', ')}`,
              code: 'MISSING_CAPABILITIES',
            },
          ],
        },
      };
    }

    return {
      success: true,
      data: {
        valid: true,
      },
    };
  };
}

/**
 * Creates a validator pipeline that runs multiple validators
 */
export function createValidatorPipeline(
  validators: HookHandler<ToolValidationInput, ToolValidationOutput>[]
): HookHandler<ToolValidationInput, ToolValidationOutput> {
  return async (input, context): Promise<HookResult<ToolValidationOutput>> => {
    const allErrors: ValidationError[] = [];
    const allWarnings: string[] = [];

    for (const validator of validators) {
      const result = await validator(input, context);

      if (!result.success) {
        return result;
      }

      if (result.data.errors) {
        allErrors.push(...result.data.errors);
      }
      if (result.data.warnings) {
        allWarnings.push(...result.data.warnings);
      }
    }

    return {
      success: true,
      data: {
        valid: allErrors.length === 0,
        errors: allErrors.length > 0 ? allErrors : undefined,
        warnings: allWarnings.length > 0 ? allWarnings : undefined,
      },
    };
  };
}

/**
 * Register the default tool validation hook
 */
export function registerDefaultToolValidation(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.TOOL_VALIDATION,
    {
      id: 'default-tool-validation',
      name: 'Default Tool Validation',
      priority: 'high',
      description: 'Basic tool definition validation',
    },
    defaultToolValidationHandler
  );
}
