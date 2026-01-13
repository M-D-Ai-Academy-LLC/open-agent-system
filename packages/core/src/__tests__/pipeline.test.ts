/**
 * Hook Pipeline Tests
 *
 * Unit tests for the HookPipeline class and pipeline builder utilities.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HookPipeline,
  createPipeline,
  createRequestPipeline,
  createResponsePipeline,
  createToolPipeline,
} from '../hooks/pipeline.js';
import { HookRegistry, HOOK_NAMES } from '../hooks/registry.js';
import type { HookContext } from '../types/hooks.js';

describe('HookPipeline', () => {
  let registry: HookRegistry;

  const createContext = (): HookContext => ({
    requestId: 'test-request-123',
    timestamp: new Date(),
    metadata: {},
  });

  beforeEach(() => {
    registry = new HookRegistry();
  });

  describe('constructor', () => {
    it('should create pipeline with provided registry', () => {
      const pipeline = new HookPipeline(registry);

      expect(pipeline.getRegistry()).toBe(registry);
    });

    it('should create pipeline with new registry if not provided', () => {
      const pipeline = new HookPipeline();

      expect(pipeline.getRegistry()).toBeInstanceOf(HookRegistry);
    });
  });

  describe('hook', () => {
    it('should add hook step to pipeline', async () => {
      const handler = vi.fn().mockResolvedValue({ success: true, data: 'transformed' });
      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'test', priority: 'normal' }, handler);

      const pipeline = new HookPipeline<string>(registry).hook(HOOK_NAMES.REQUEST_TRANSFORM);

      const result = await pipeline.execute('input', createContext());

      expect(result.success).toBe(true);
      expect(result.data).toBe('transformed');
    });

    it('should chain multiple hooks', async () => {
      const handler1 = vi.fn().mockResolvedValue({ success: true, data: 'step1' });
      const handler2 = vi.fn().mockResolvedValue({ success: true, data: 'step2' });

      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'h1', priority: 'normal' }, handler1);
      registry.register(HOOK_NAMES.RESPONSE_TRANSFORM, { id: 'h2', priority: 'normal' }, handler2);

      const pipeline = new HookPipeline<string>(registry)
        .hook(HOOK_NAMES.REQUEST_TRANSFORM)
        .hook(HOOK_NAMES.RESPONSE_TRANSFORM);

      const result = await pipeline.execute('input', createContext());

      expect(result.success).toBe(true);
      expect(result.data).toBe('step2');
    });
  });

  describe('transform', () => {
    it('should add transform step to pipeline', async () => {
      const pipeline = new HookPipeline<string>(registry).transform((input) => input.toUpperCase());

      const result = await pipeline.execute('hello', createContext());

      expect(result.success).toBe(true);
      expect(result.data).toBe('HELLO');
    });

    it('should handle async transforms', async () => {
      const pipeline = new HookPipeline<string>(registry).transform(async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return input.toUpperCase();
      });

      const result = await pipeline.execute('hello', createContext());

      expect(result.success).toBe(true);
      expect(result.data).toBe('HELLO');
    });

    it('should handle transform errors', async () => {
      const pipeline = new HookPipeline<string>(registry).transform(() => {
        throw new Error('Transform failed');
      });

      const result = await pipeline.execute('hello', createContext());

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Transform failed');
    });

    it('should chain transforms', async () => {
      const pipeline = new HookPipeline<string>(registry)
        .transform((input) => input.toUpperCase())
        .transform((input) => `[${input}]`);

      const result = await pipeline.execute('hello', createContext());

      expect(result.success).toBe(true);
      expect(result.data).toBe('[HELLO]');
    });
  });

  describe('tap', () => {
    it('should execute side effect without modifying data', async () => {
      const sideEffect = vi.fn();

      const pipeline = new HookPipeline<string>(registry).tap((input) => {
        sideEffect(input);
      });

      const result = await pipeline.execute('hello', createContext());

      expect(result.success).toBe(true);
      expect(result.data).toBe('hello');
      expect(sideEffect).toHaveBeenCalledWith('hello');
    });

    it('should handle async side effects', async () => {
      const sideEffect = vi.fn();

      const pipeline = new HookPipeline<string>(registry).tap(async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        sideEffect(input);
      });

      const result = await pipeline.execute('hello', createContext());

      expect(result.success).toBe(true);
      expect(sideEffect).toHaveBeenCalledWith('hello');
    });

    it('should continue pipeline even if tap throws', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const pipeline = new HookPipeline<string>(registry)
        .tap(() => {
          throw new Error('Tap error');
        })
        .transform((input) => input.toUpperCase());

      const result = await pipeline.execute('hello', createContext());

      expect(result.success).toBe(true);
      expect(result.data).toBe('HELLO');

      consoleSpy.mockRestore();
    });
  });

  describe('when', () => {
    it('should execute sub-pipeline when condition is true', async () => {
      const pipeline = new HookPipeline<string>(registry).when(
        (input) => input.startsWith('h'),
        (p) => p.transform((input) => input.toUpperCase())
      );

      const result = await pipeline.execute('hello', createContext());

      expect(result.success).toBe(true);
      expect(result.data).toBe('HELLO');
    });

    it('should skip sub-pipeline when condition is false', async () => {
      const pipeline = new HookPipeline<string>(registry).when(
        (input) => input.startsWith('x'),
        (p) => p.transform((input) => input.toUpperCase())
      );

      const result = await pipeline.execute('hello', createContext());

      expect(result.success).toBe(true);
      expect(result.data).toBe('hello');
    });

    it('should handle async conditions', async () => {
      const pipeline = new HookPipeline<string>(registry).when(
        async (input) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return input.length > 3;
        },
        (p) => p.transform((input) => input.toUpperCase())
      );

      const result = await pipeline.execute('hello', createContext());

      expect(result.success).toBe(true);
      expect(result.data).toBe('HELLO');
    });
  });

  describe('recover', () => {
    it('should recover from transform errors', async () => {
      const pipeline = new HookPipeline<string>(registry)
        .transform(() => {
          throw new Error('Transform failed');
        })
        .recover(() => 'recovered');

      const result = await pipeline.execute('hello', createContext());

      expect(result.success).toBe(true);
      expect(result.data).toBe('recovered');
    });

    it('should not affect successful transforms', async () => {
      const pipeline = new HookPipeline<string>(registry)
        .transform((input) => input.toUpperCase())
        .recover(() => 'recovered');

      const result = await pipeline.execute('hello', createContext());

      expect(result.success).toBe(true);
      expect(result.data).toBe('HELLO');
    });

    it('should handle recovery errors', async () => {
      const pipeline = new HookPipeline<string>(registry)
        .transform(() => {
          throw new Error('Transform failed');
        })
        .recover(() => {
          throw new Error('Recovery failed');
        });

      const result = await pipeline.execute('hello', createContext());

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Recovery failed');
    });
  });

  describe('execute', () => {
    it('should execute empty pipeline', async () => {
      const pipeline = new HookPipeline<string>(registry);

      const result = await pipeline.execute('hello', createContext());

      expect(result.success).toBe(true);
      expect(result.data).toBe('hello');
    });

    it('should stop on failure', async () => {
      const secondTransform = vi.fn();

      const pipeline = new HookPipeline<string>(registry)
        .transform(() => {
          throw new Error('First transform failed');
        })
        .transform((input) => {
          secondTransform();
          return input.toUpperCase();
        });

      const result = await pipeline.execute('hello', createContext());

      expect(result.success).toBe(false);
      expect(secondTransform).not.toHaveBeenCalled();
    });

    it('should pass context through all steps', async () => {
      const capturedContexts: HookContext[] = [];

      const pipeline = new HookPipeline<string>(registry)
        .tap((_, ctx) => {
          capturedContexts.push(ctx);
        })
        .transform((input, ctx) => {
          capturedContexts.push(ctx);
          return input.toUpperCase();
        });

      const context = createContext();
      await pipeline.execute('hello', context);

      expect(capturedContexts).toHaveLength(2);
      expect(capturedContexts[0].requestId).toBe(context.requestId);
      expect(capturedContexts[1].requestId).toBe(context.requestId);
    });
  });

  describe('complex pipelines', () => {
    it('should handle mixed hook and transform steps', async () => {
      const handler = vi.fn().mockResolvedValue({ success: true, data: 'hook-result' });
      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'test', priority: 'normal' }, handler);

      const pipeline = new HookPipeline<string>(registry)
        .transform((input) => input.toUpperCase())
        .hook(HOOK_NAMES.REQUEST_TRANSFORM)
        .transform((input) => `[${input}]`);

      const result = await pipeline.execute('hello', createContext());

      expect(result.success).toBe(true);
      expect(result.data).toBe('[hook-result]');
      expect(handler).toHaveBeenCalledWith('HELLO', expect.any(Object));
    });
  });
});

describe('createPipeline', () => {
  it('should create a new pipeline', () => {
    const pipeline = createPipeline<string>();

    expect(pipeline).toBeInstanceOf(HookPipeline);
  });

  it('should accept custom registry', () => {
    const registry = new HookRegistry();
    const pipeline = createPipeline<string>(registry);

    expect(pipeline.getRegistry()).toBe(registry);
  });
});

describe('Pre-built Pipelines', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = new HookRegistry();
  });

  describe('createRequestPipeline', () => {
    it('should create request pipeline with correct hooks', () => {
      const pipeline = createRequestPipeline(registry);

      expect(pipeline).toBeInstanceOf(HookPipeline);
      expect(pipeline.getRegistry()).toBe(registry);
    });
  });

  describe('createResponsePipeline', () => {
    it('should create response pipeline with correct hooks', () => {
      const pipeline = createResponsePipeline(registry);

      expect(pipeline).toBeInstanceOf(HookPipeline);
      expect(pipeline.getRegistry()).toBe(registry);
    });
  });

  describe('createToolPipeline', () => {
    it('should create tool pipeline with correct hooks', () => {
      const pipeline = createToolPipeline(registry);

      expect(pipeline).toBeInstanceOf(HookPipeline);
      expect(pipeline.getRegistry()).toBe(registry);
    });
  });
});
