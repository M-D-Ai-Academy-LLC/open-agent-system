/**
 * Hook Pipeline Builder
 *
 * Provides a fluent API for composing and executing hooks in a pipeline.
 */

import type { HookContext, HookResult, HookHandler } from '../types/hooks.js';
import { HookRegistry, type HookName, HOOK_NAMES } from './registry.js';

// =============================================================================
// Pipeline Step Types
// =============================================================================

type PipelineStep<TInput, TOutput> = {
  type: 'hook' | 'transform' | 'tap' | 'conditional';
  execute: (input: TInput, context: HookContext) => Promise<HookResult<TOutput>>;
};

// =============================================================================
// Pipeline Builder
// =============================================================================

export class HookPipeline<TInput, TOutput = TInput> {
  private steps: PipelineStep<unknown, unknown>[] = [];
  private registry: HookRegistry;

  constructor(registry?: HookRegistry) {
    this.registry = registry ?? new HookRegistry();
  }

  /**
   * Add a hook execution step to the pipeline
   */
  hook<TNext>(hookName: HookName): HookPipeline<TInput, TNext> {
    const step: PipelineStep<TOutput, TNext> = {
      type: 'hook',
      execute: async (input, context) => {
        return this.registry.execute<TOutput, TNext>(hookName, input as TOutput, context);
      },
    };

    this.steps.push(step as PipelineStep<unknown, unknown>);
    return this as unknown as HookPipeline<TInput, TNext>;
  }

  /**
   * Add a custom transformation step
   */
  transform<TNext>(
    fn: (input: TOutput, context: HookContext) => Promise<TNext> | TNext
  ): HookPipeline<TInput, TNext> {
    const step: PipelineStep<TOutput, TNext> = {
      type: 'transform',
      execute: async (input, context) => {
        try {
          const result = await fn(input as TOutput, context);
          return { success: true, data: result };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            recoverable: false,
          };
        }
      },
    };

    this.steps.push(step as PipelineStep<unknown, unknown>);
    return this as unknown as HookPipeline<TInput, TNext>;
  }

  /**
   * Add a side-effect step that doesn't modify the data
   */
  tap(fn: (input: TOutput, context: HookContext) => Promise<void> | void): HookPipeline<TInput, TOutput> {
    const step: PipelineStep<TOutput, TOutput> = {
      type: 'tap',
      execute: async (input, context) => {
        try {
          await fn(input as TOutput, context);
          return { success: true, data: input as TOutput };
        } catch (error) {
          // Tap errors don't stop the pipeline by default
          console.error('Tap error:', error);
          return { success: true, data: input as TOutput };
        }
      },
    };

    this.steps.push(step as PipelineStep<unknown, unknown>);
    return this;
  }

  /**
   * Add a conditional branch
   */
  when(
    condition: (input: TOutput, context: HookContext) => boolean | Promise<boolean>,
    thenPipeline: (pipeline: HookPipeline<TOutput, TOutput>) => HookPipeline<TOutput, TOutput>
  ): HookPipeline<TInput, TOutput> {
    const step: PipelineStep<TOutput, TOutput> = {
      type: 'conditional',
      execute: async (input, context) => {
        const shouldExecute = await condition(input as TOutput, context);
        if (shouldExecute) {
          const subPipeline = thenPipeline(new HookPipeline<TOutput, TOutput>(this.registry));
          return subPipeline.execute(input as TOutput, context);
        }
        return { success: true, data: input as TOutput };
      },
    };

    this.steps.push(step as PipelineStep<unknown, unknown>);
    return this;
  }

  /**
   * Add error recovery step
   */
  recover(
    fn: (error: Error, context: HookContext) => Promise<TOutput> | TOutput
  ): HookPipeline<TInput, TOutput> {
    // This modifies the previous step to include recovery
    const lastStep = this.steps[this.steps.length - 1];
    if (lastStep) {
      const originalExecute = lastStep.execute;
      lastStep.execute = async (input, context) => {
        const result = await originalExecute(input, context);
        if (!result.success) {
          try {
            const recovered = await fn(result.error, context);
            return { success: true, data: recovered };
          } catch (recoveryError) {
            return {
              success: false,
              error: recoveryError instanceof Error ? recoveryError : new Error(String(recoveryError)),
              recoverable: false,
            };
          }
        }
        return result;
      };
    }
    return this;
  }

  /**
   * Execute the pipeline
   */
  async execute(input: TInput, context: HookContext): Promise<HookResult<TOutput>> {
    let currentResult: HookResult<unknown> = { success: true, data: input };

    for (const step of this.steps) {
      if (!currentResult.success) {
        return currentResult as HookResult<TOutput>;
      }

      currentResult = await step.execute(currentResult.data, context);
    }

    return currentResult as HookResult<TOutput>;
  }

  /**
   * Get the underlying registry
   */
  getRegistry(): HookRegistry {
    return this.registry;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createPipeline<TInput>(registry?: HookRegistry): HookPipeline<TInput, TInput> {
  return new HookPipeline<TInput, TInput>(registry);
}

// =============================================================================
// Pre-built Pipelines
// =============================================================================

/**
 * Standard request processing pipeline
 */
export function createRequestPipeline(registry: HookRegistry): HookPipeline<unknown, unknown> {
  return createPipeline(registry)
    .hook(HOOK_NAMES.INPUT_SANITIZATION)
    .hook(HOOK_NAMES.PROMPT_INJECTION)
    .hook(HOOK_NAMES.API_KEY_VALIDATION)
    .hook(HOOK_NAMES.PERMISSION_CHECK)
    .hook(HOOK_NAMES.RATE_LIMIT)
    .hook(HOOK_NAMES.QUOTA_CHECK)
    .hook(HOOK_NAMES.REQUEST_TRANSFORM)
    .hook(HOOK_NAMES.MODEL_SELECTION)
    .hook(HOOK_NAMES.PROVIDER_ROUTING);
}

/**
 * Standard response processing pipeline
 */
export function createResponsePipeline(registry: HookRegistry): HookPipeline<unknown, unknown> {
  return createPipeline(registry)
    .hook(HOOK_NAMES.RESPONSE_TRANSFORM)
    .hook(HOOK_NAMES.OUTPUT_FILTERING)
    .hook(HOOK_NAMES.PII_DETECTION)
    .hook(HOOK_NAMES.CONTENT_MODERATION)
    .hook(HOOK_NAMES.COST_TRACKING)
    .hook(HOOK_NAMES.AUDIT_LOG);
}

/**
 * Tool execution pipeline
 */
export function createToolPipeline(registry: HookRegistry): HookPipeline<unknown, unknown> {
  return createPipeline(registry)
    .hook(HOOK_NAMES.TOOL_VALIDATION)
    .hook(HOOK_NAMES.TOOL_SANDBOX)
    .hook(HOOK_NAMES.TOOL_EXECUTION)
    .hook(HOOK_NAMES.TOOL_RESULT_TRANSFORM);
}
