/**
 * Model Selection Hook (#3)
 *
 * Selects the optimal model based on request characteristics and constraints.
 * Use cases: cost optimization, capability matching, load balancing.
 */

import type {
  HookHandler,
  HookResult,
  ModelSelectionInput,
  ModelSelectionOutput,
  ModelInfo,
  ModelConstraints,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default model selection handler - selects the first available model
 */
export const defaultModelSelectionHandler: HookHandler<
  ModelSelectionInput,
  ModelSelectionOutput
> = async (input, _context): Promise<HookResult<ModelSelectionOutput>> => {
  if (input.availableModels.length === 0) {
    return {
      success: false,
      error: new Error('No models available for selection'),
      recoverable: false,
    };
  }

  const selectedModel = input.availableModels[0]!;
  const fallbackModels = input.availableModels.slice(1).map((m) => m.id);

  return {
    success: true,
    data: {
      selectedModel: selectedModel.id,
      fallbackModels,
      reason: 'Selected first available model',
    },
  };
};

/**
 * Creates a cost-optimized model selector
 */
export function createCostOptimizedSelector(): HookHandler<
  ModelSelectionInput,
  ModelSelectionOutput
> {
  return async (input, _context): Promise<HookResult<ModelSelectionOutput>> => {
    if (input.availableModels.length === 0) {
      return {
        success: false,
        error: new Error('No models available for selection'),
        recoverable: false,
      };
    }

    const filteredModels = filterByConstraints(input.availableModels, input.constraints);

    if (filteredModels.length === 0) {
      return {
        success: false,
        error: new Error('No models match the specified constraints'),
        recoverable: true,
      };
    }

    // Sort by cost (input + output combined)
    const sortedByCost = [...filteredModels].sort(
      (a, b) => a.inputCostPer1k + a.outputCostPer1k - (b.inputCostPer1k + b.outputCostPer1k)
    );

    const selectedModel = sortedByCost[0]!;
    const fallbackModels = sortedByCost.slice(1).map((m) => m.id);

    return {
      success: true,
      data: {
        selectedModel: selectedModel.id,
        fallbackModels,
        reason: `Selected cheapest model: $${(selectedModel.inputCostPer1k + selectedModel.outputCostPer1k).toFixed(4)}/1k tokens`,
      },
    };
  };
}

/**
 * Creates a capability-matched model selector
 */
export function createCapabilityMatchedSelector(
  requiredCapabilities: string[]
): HookHandler<ModelSelectionInput, ModelSelectionOutput> {
  return async (input, _context): Promise<HookResult<ModelSelectionOutput>> => {
    if (input.availableModels.length === 0) {
      return {
        success: false,
        error: new Error('No models available for selection'),
        recoverable: false,
      };
    }

    // Filter models that have all required capabilities
    const capableModels = input.availableModels.filter((model) =>
      requiredCapabilities.every((cap) => model.capabilities.includes(cap))
    );

    if (capableModels.length === 0) {
      return {
        success: false,
        error: new Error(
          `No models have required capabilities: ${requiredCapabilities.join(', ')}`
        ),
        recoverable: true,
      };
    }

    // Sort by number of capabilities (more capable = higher priority)
    const sorted = [...capableModels].sort(
      (a, b) => b.capabilities.length - a.capabilities.length
    );

    const selectedModel = sorted[0]!;
    const fallbackModels = sorted.slice(1).map((m) => m.id);

    return {
      success: true,
      data: {
        selectedModel: selectedModel.id,
        fallbackModels,
        reason: `Selected model with ${selectedModel.capabilities.length} capabilities`,
      },
    };
  };
}

/**
 * Creates a context-length aware model selector
 */
export function createContextLengthSelector(
  estimatedTokens: number
): HookHandler<ModelSelectionInput, ModelSelectionOutput> {
  return async (input, _context): Promise<HookResult<ModelSelectionOutput>> => {
    if (input.availableModels.length === 0) {
      return {
        success: false,
        error: new Error('No models available for selection'),
        recoverable: false,
      };
    }

    // Filter models with sufficient context length (with 20% buffer)
    const requiredContext = Math.ceil(estimatedTokens * 1.2);
    const suitableModels = input.availableModels.filter(
      (model) => model.contextLength >= requiredContext
    );

    if (suitableModels.length === 0) {
      return {
        success: false,
        error: new Error(
          `No models have sufficient context length for ${estimatedTokens} tokens`
        ),
        recoverable: true,
      };
    }

    // Select smallest context that fits (cost optimization)
    const sorted = [...suitableModels].sort((a, b) => a.contextLength - b.contextLength);

    const selectedModel = sorted[0]!;
    const fallbackModels = sorted.slice(1).map((m) => m.id);

    return {
      success: true,
      data: {
        selectedModel: selectedModel.id,
        fallbackModels,
        reason: `Selected model with ${selectedModel.contextLength} context (need ${requiredContext})`,
      },
    };
  };
}

/**
 * Helper function to filter models by constraints
 */
function filterByConstraints(
  models: ModelInfo[],
  constraints?: ModelConstraints
): ModelInfo[] {
  if (!constraints) return models;

  return models.filter((model) => {
    if (
      constraints.maxCost &&
      model.inputCostPer1k + model.outputCostPer1k > constraints.maxCost
    ) {
      return false;
    }

    if (constraints.excludeProviders?.includes(model.provider)) {
      return false;
    }

    if (constraints.requiredCapabilities) {
      const hasAllCapabilities = constraints.requiredCapabilities.every((cap) =>
        model.capabilities.includes(cap)
      );
      if (!hasAllCapabilities) return false;
    }

    return true;
  });
}

/**
 * Register the default model selection hook
 */
export function registerDefaultModelSelection(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.MODEL_SELECTION,
    {
      id: 'default-model-selection',
      name: 'Default Model Selection',
      priority: 'normal',
      description: 'Selects the first available model',
    },
    defaultModelSelectionHandler
  );
}
