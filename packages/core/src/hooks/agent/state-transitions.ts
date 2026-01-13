/**
 * State Transitions Hook (#25)
 *
 * Manages agent state machine transitions.
 * Use cases: state validation, side effects, transition logging.
 */

import type {
  HookHandler,
  HookResult,
  StateTransitionInput,
  StateTransitionOutput,
  AgentState,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default state transition handler - allows all transitions
 */
export const defaultStateTransitionHandler: HookHandler<
  StateTransitionInput,
  StateTransitionOutput
> = async (input, _context): Promise<HookResult<StateTransitionOutput>> => {
  return {
    success: true,
    data: {
      allowed: true,
      newState: input.toState,
      sideEffects: [],
    },
  };
};

/**
 * Valid state transitions map
 */
export type TransitionMap = Map<AgentState, AgentState[]>;

/**
 * Creates a default transition map
 */
export function createDefaultTransitionMap(): TransitionMap {
  const map = new Map<AgentState, AgentState[]>();

  // idle -> thinking, waiting, completed, error
  map.set('idle', ['thinking', 'waiting', 'completed', 'error']);

  // thinking -> executing-tool, waiting, delegating, completed, error
  map.set('thinking', ['executing-tool', 'waiting', 'delegating', 'completed', 'error']);

  // executing-tool -> thinking, waiting, error
  map.set('executing-tool', ['thinking', 'waiting', 'error']);

  // waiting -> thinking, idle, error
  map.set('waiting', ['thinking', 'idle', 'error']);

  // delegating -> thinking, waiting, error
  map.set('delegating', ['thinking', 'waiting', 'error']);

  // completed -> idle (for reuse)
  map.set('completed', ['idle']);

  // error -> idle (for recovery)
  map.set('error', ['idle']);

  return map;
}

/**
 * Creates a state transition handler with validation
 */
export function createValidatedTransition(
  transitionMap: TransitionMap
): HookHandler<StateTransitionInput, StateTransitionOutput> {
  return async (input, _context): Promise<HookResult<StateTransitionOutput>> => {
    const allowedTransitions = transitionMap.get(input.fromState) ?? [];
    const allowed = allowedTransitions.includes(input.toState);

    if (!allowed) {
      return {
        success: true,
        data: {
          allowed: false,
          newState: input.fromState,
          sideEffects: [`Invalid transition: ${input.fromState} -> ${input.toState}`],
        },
      };
    }

    return {
      success: true,
      data: {
        allowed: true,
        newState: input.toState,
        sideEffects: [],
      },
    };
  };
}

/**
 * Side effect handler type
 */
export type SideEffectHandler = (
  fromState: AgentState,
  toState: AgentState,
  agentId: string,
  trigger: string
) => Promise<string | null>;

/**
 * Creates a state transition handler with side effects
 */
export function createSideEffectTransition(
  sideEffectHandlers: Map<string, SideEffectHandler>
): HookHandler<StateTransitionInput, StateTransitionOutput> {
  return async (input, _context): Promise<HookResult<StateTransitionOutput>> => {
    const sideEffects: string[] = [];

    // Execute side effects for this transition
    const transitionKey = `${input.fromState}:${input.toState}`;
    const handler = sideEffectHandlers.get(transitionKey);

    if (handler) {
      const effect = await handler(input.fromState, input.toState, input.agentId, input.trigger);
      if (effect) {
        sideEffects.push(effect);
      }
    }

    // Also check for general "entering state" handlers
    const enterHandler = sideEffectHandlers.get(`enter:${input.toState}`);
    if (enterHandler) {
      const effect = await enterHandler(input.fromState, input.toState, input.agentId, input.trigger);
      if (effect) {
        sideEffects.push(effect);
      }
    }

    // Also check for general "leaving state" handlers
    const exitHandler = sideEffectHandlers.get(`exit:${input.fromState}`);
    if (exitHandler) {
      const effect = await exitHandler(input.fromState, input.toState, input.agentId, input.trigger);
      if (effect) {
        sideEffects.push(effect);
      }
    }

    return {
      success: true,
      data: {
        allowed: true,
        newState: input.toState,
        sideEffects: sideEffects.length > 0 ? sideEffects : undefined,
      },
    };
  };
}

/**
 * Creates a state transition handler with guards
 */
export function createGuardedTransition(
  guards: Map<string, (input: StateTransitionInput) => boolean>
): HookHandler<StateTransitionInput, StateTransitionOutput> {
  return async (input, _context): Promise<HookResult<StateTransitionOutput>> => {
    const transitionKey = `${input.fromState}:${input.toState}`;
    const guard = guards.get(transitionKey);

    if (guard && !guard(input)) {
      return {
        success: true,
        data: {
          allowed: false,
          newState: input.fromState,
          sideEffects: [`Guard blocked transition: ${transitionKey}`],
        },
      };
    }

    return {
      success: true,
      data: {
        allowed: true,
        newState: input.toState,
        sideEffects: [],
      },
    };
  };
}

/**
 * Creates a state transition handler with history tracking
 */
export function createHistoryTrackingTransition(
  historyStore: {
    record: (agentId: string, fromState: AgentState, toState: AgentState, trigger: string, timestamp: number) => void;
    getHistory: (agentId: string) => Array<{ fromState: AgentState; toState: AgentState; trigger: string; timestamp: number }>;
  }
): HookHandler<StateTransitionInput, StateTransitionOutput> {
  return async (input, context): Promise<HookResult<StateTransitionOutput>> => {
    historyStore.record(
      input.agentId,
      input.fromState,
      input.toState,
      input.trigger,
      context.timestamp
    );

    return {
      success: true,
      data: {
        allowed: true,
        newState: input.toState,
        sideEffects: [],
      },
      metadata: {
        historyLength: historyStore.getHistory(input.agentId).length,
      },
    };
  };
}

/**
 * Creates a state transition handler with logging
 */
export function createLoggingTransition(
  logger: {
    info: (message: string, context: Record<string, unknown>) => void;
    warn: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<StateTransitionInput, StateTransitionOutput>
): HookHandler<StateTransitionInput, StateTransitionOutput> {
  return async (input, context): Promise<HookResult<StateTransitionOutput>> => {
    logger.info(`State transition requested: ${input.agentId}`, {
      agentId: input.agentId,
      fromState: input.fromState,
      toState: input.toState,
      trigger: input.trigger,
      requestId: context.requestId,
    });

    const handler = innerHandler ?? defaultStateTransitionHandler;
    const result = await handler(input, context);

    if (result.success) {
      if (result.data.allowed) {
        logger.info(`State transition completed: ${input.agentId}`, {
          agentId: input.agentId,
          newState: result.data.newState,
          sideEffects: result.data.sideEffects,
          requestId: context.requestId,
        });
      } else {
        logger.warn(`State transition blocked: ${input.agentId}`, {
          agentId: input.agentId,
          attemptedTransition: `${input.fromState} -> ${input.toState}`,
          reason: result.data.sideEffects,
          requestId: context.requestId,
        });
      }
    }

    return result;
  };
}

/**
 * Creates a composite state transition handler
 */
export function createCompositeTransition(
  handlers: HookHandler<StateTransitionInput, StateTransitionOutput>[]
): HookHandler<StateTransitionInput, StateTransitionOutput> {
  return async (input, context): Promise<HookResult<StateTransitionOutput>> => {
    const allSideEffects: string[] = [];

    for (const handler of handlers) {
      const result = await handler(input, context);

      if (!result.success) {
        return result;
      }

      // If any handler blocks the transition, return immediately
      if (!result.data.allowed) {
        return result;
      }

      if (result.data.sideEffects) {
        allSideEffects.push(...result.data.sideEffects);
      }
    }

    return {
      success: true,
      data: {
        allowed: true,
        newState: input.toState,
        sideEffects: allSideEffects.length > 0 ? allSideEffects : undefined,
      },
    };
  };
}

/**
 * Register the default state transition hook
 */
export function registerDefaultStateTransition(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.STATE_TRANSITION,
    {
      id: 'default-state-transition',
      name: 'Default State Transition',
      priority: 'normal',
      description: 'Basic state transition handler',
    },
    defaultStateTransitionHandler
  );
}
