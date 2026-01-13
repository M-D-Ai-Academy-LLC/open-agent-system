/**
 * Hook system exports
 */

export {
  HookRegistry,
  getHookRegistry,
  resetHookRegistry,
  HOOK_NAMES,
  type HookName,
} from './registry.js';

export {
  HookPipeline,
  createPipeline,
  createRequestPipeline,
  createResponsePipeline,
  createToolPipeline,
} from './pipeline.js';

// Gateway Hooks (#1-7)
export * from './gateway/index.js';

// Auth Hooks (#8-14)
export * from './auth/index.js';

// Tool Calling Hooks (#15-21)
export * from './tools/index.js';

// Agent Lifecycle Hooks (#22-28)
export * from './agent/index.js';

// Streaming Hooks (#29-35)
export * from './streaming/index.js';

// Observability Hooks (#36-42)
export * from './observability/index.js';
