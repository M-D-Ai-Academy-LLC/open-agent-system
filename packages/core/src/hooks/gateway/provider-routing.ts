/**
 * Provider Routing Hook (#4)
 *
 * Routes requests to the optimal provider based on availability, latency, and cost.
 * Use cases: load balancing, failover, cost optimization, geographic routing.
 */

import type {
  HookHandler,
  HookResult,
  ProviderRoutingInput,
  ProviderRoutingOutput,
  ProviderInfo,
  ProviderPreferences,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default provider routing handler - selects the first available provider
 */
export const defaultProviderRoutingHandler: HookHandler<
  ProviderRoutingInput,
  ProviderRoutingOutput
> = async (input, _context): Promise<HookResult<ProviderRoutingOutput>> => {
  const availableProviders = input.availableProviders.filter(
    (p) => p.status === 'available'
  );

  if (availableProviders.length === 0) {
    return {
      success: false,
      error: new Error('No providers available'),
      recoverable: false,
    };
  }

  const selectedProvider = availableProviders[0]!;
  const fallbackProviders = availableProviders.slice(1).map((p) => p.id);

  return {
    success: true,
    data: {
      provider: selectedProvider.id,
      fallbackProviders,
      estimatedLatency: selectedProvider.latency,
    },
  };
};

/**
 * Creates a latency-optimized provider router
 */
export function createLatencyOptimizedRouter(): HookHandler<
  ProviderRoutingInput,
  ProviderRoutingOutput
> {
  return async (input, _context): Promise<HookResult<ProviderRoutingOutput>> => {
    const availableProviders = filterByPreferences(
      input.availableProviders.filter((p) => p.status === 'available'),
      input.preferences
    );

    if (availableProviders.length === 0) {
      return {
        success: false,
        error: new Error('No providers available matching preferences'),
        recoverable: true,
      };
    }

    // Sort by latency (lowest first)
    const sorted = [...availableProviders].sort((a, b) => a.latency - b.latency);

    const selectedProvider = sorted[0]!;
    const fallbackProviders = sorted.slice(1).map((p) => p.id);

    return {
      success: true,
      data: {
        provider: selectedProvider.id,
        fallbackProviders,
        estimatedLatency: selectedProvider.latency,
      },
    };
  };
}

/**
 * Creates a reliability-optimized provider router
 */
export function createReliabilityOptimizedRouter(): HookHandler<
  ProviderRoutingInput,
  ProviderRoutingOutput
> {
  return async (input, _context): Promise<HookResult<ProviderRoutingOutput>> => {
    const availableProviders = filterByPreferences(
      input.availableProviders.filter((p) => p.status === 'available'),
      input.preferences
    );

    if (availableProviders.length === 0) {
      return {
        success: false,
        error: new Error('No providers available matching preferences'),
        recoverable: true,
      };
    }

    // Sort by reliability (highest first)
    const sorted = [...availableProviders].sort((a, b) => b.reliability - a.reliability);

    const selectedProvider = sorted[0]!;
    const fallbackProviders = sorted.slice(1).map((p) => p.id);

    return {
      success: true,
      data: {
        provider: selectedProvider.id,
        fallbackProviders,
        estimatedLatency: selectedProvider.latency,
      },
    };
  };
}

/**
 * Creates a weighted score provider router
 */
export function createWeightedScoreRouter(weights?: {
  latency?: number;
  reliability?: number;
}): HookHandler<ProviderRoutingInput, ProviderRoutingOutput> {
  const latencyWeight = weights?.latency ?? 0.5;
  const reliabilityWeight = weights?.reliability ?? 0.5;

  return async (input, _context): Promise<HookResult<ProviderRoutingOutput>> => {
    const availableProviders = filterByPreferences(
      input.availableProviders.filter((p) => p.status === 'available'),
      input.preferences
    );

    if (availableProviders.length === 0) {
      return {
        success: false,
        error: new Error('No providers available matching preferences'),
        recoverable: true,
      };
    }

    // Normalize values and calculate weighted scores
    const maxLatency = Math.max(...availableProviders.map((p) => p.latency));
    const minLatency = Math.min(...availableProviders.map((p) => p.latency));
    const latencyRange = maxLatency - minLatency || 1;

    const scored = availableProviders.map((provider) => {
      // Lower latency = higher score (invert the scale)
      const normalizedLatency = 1 - (provider.latency - minLatency) / latencyRange;
      // Higher reliability = higher score (already 0-1)
      const normalizedReliability = provider.reliability;

      const score =
        normalizedLatency * latencyWeight + normalizedReliability * reliabilityWeight;

      return { provider, score };
    });

    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);

    const selectedProvider = scored[0]!.provider;
    const fallbackProviders = scored.slice(1).map((s) => s.provider.id);

    return {
      success: true,
      data: {
        provider: selectedProvider.id,
        fallbackProviders,
        estimatedLatency: selectedProvider.latency,
      },
    };
  };
}

/**
 * Creates a round-robin provider router
 */
export function createRoundRobinRouter(): HookHandler<
  ProviderRoutingInput,
  ProviderRoutingOutput
> {
  let currentIndex = 0;

  return async (input, _context): Promise<HookResult<ProviderRoutingOutput>> => {
    const availableProviders = filterByPreferences(
      input.availableProviders.filter((p) => p.status === 'available'),
      input.preferences
    );

    if (availableProviders.length === 0) {
      return {
        success: false,
        error: new Error('No providers available matching preferences'),
        recoverable: true,
      };
    }

    // Round-robin selection
    const index = currentIndex % availableProviders.length;
    currentIndex++;

    const selectedProvider = availableProviders[index]!;

    // Build fallback list starting from next in rotation
    const fallbackProviders: string[] = [];
    for (let i = 1; i < availableProviders.length; i++) {
      const fallbackIndex = (index + i) % availableProviders.length;
      fallbackProviders.push(availableProviders[fallbackIndex]!.id);
    }

    return {
      success: true,
      data: {
        provider: selectedProvider.id,
        fallbackProviders,
        estimatedLatency: selectedProvider.latency,
      },
    };
  };
}

/**
 * Helper function to filter providers by preferences
 */
function filterByPreferences(
  providers: ProviderInfo[],
  preferences?: ProviderPreferences
): ProviderInfo[] {
  if (!preferences) return providers;

  let filtered = providers;

  // Exclude specific providers
  if (preferences.excluded && preferences.excluded.length > 0) {
    filtered = filtered.filter((p) => !preferences.excluded!.includes(p.id));
  }

  // If preferred providers are specified, prioritize them
  if (preferences.preferred && preferences.preferred.length > 0) {
    const preferred = filtered.filter((p) => preferences.preferred!.includes(p.id));
    const others = filtered.filter((p) => !preferences.preferred!.includes(p.id));
    filtered = [...preferred, ...others];
  }

  return filtered;
}

/**
 * Register the default provider routing hook
 */
export function registerDefaultProviderRouting(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.PROVIDER_ROUTING,
    {
      id: 'default-provider-routing',
      name: 'Default Provider Routing',
      priority: 'normal',
      description: 'Routes to the first available provider',
    },
    defaultProviderRoutingHandler
  );
}
