/**
 * Hook Registry Tests
 *
 * Unit tests for the HookRegistry class and related functionality.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HookRegistry,
  HOOK_NAMES,
  getHookRegistry,
  resetHookRegistry,
  type HookName,
} from '../hooks/registry.js';
import type { HookContext, HookResult } from '../types/hooks.js';

describe('HookRegistry', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = new HookRegistry();
  });

  describe('initialization', () => {
    it('should initialize with all hook names', () => {
      const hookNames = Object.values(HOOK_NAMES);
      expect(hookNames.length).toBe(50); // 50 hook points

      for (const hookName of hookNames) {
        expect(registry.hasHandlers(hookName)).toBe(false);
        expect(registry.getHandlerCount(hookName)).toBe(0);
      }
    });

    it('should have hook names in correct categories', () => {
      // Gateway hooks
      expect(HOOK_NAMES.REQUEST_TRANSFORM).toBe('gateway:request-transform');
      expect(HOOK_NAMES.MODEL_SELECTION).toBe('gateway:model-selection');

      // Auth hooks
      expect(HOOK_NAMES.API_KEY_VALIDATION).toBe('auth:api-key-validation');
      expect(HOOK_NAMES.RATE_LIMIT).toBe('auth:rate-limit');

      // Tool hooks
      expect(HOOK_NAMES.TOOL_EXECUTION).toBe('tool:execution');

      // Agent hooks
      expect(HOOK_NAMES.AGENT_INIT).toBe('agent:init');

      // Streaming hooks
      expect(HOOK_NAMES.STREAM_START).toBe('stream:start');

      // Observability hooks
      expect(HOOK_NAMES.METRIC_COLLECTION).toBe('observability:metric-collection');

      // Security hooks
      expect(HOOK_NAMES.INPUT_SANITIZATION).toBe('security:input-sanitization');
    });
  });

  describe('register', () => {
    it('should register a hook handler', () => {
      const handler = vi.fn().mockResolvedValue({ success: true, data: 'result' });

      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'test-hook', priority: 'normal' }, handler);

      expect(registry.hasHandlers(HOOK_NAMES.REQUEST_TRANSFORM)).toBe(true);
      expect(registry.getHandlerCount(HOOK_NAMES.REQUEST_TRANSFORM)).toBe(1);
    });

    it('should emit hook:registered event', () => {
      const listener = vi.fn();
      registry.on('hook:registered', listener);

      const handler = vi.fn().mockResolvedValue({ success: true, data: 'result' });
      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'test-hook', priority: 'normal' }, handler);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-hook',
          priority: 'normal',
          category: 'gateway',
        })
      );
    });

    it('should register multiple handlers for the same hook', () => {
      const handler1 = vi.fn().mockResolvedValue({ success: true, data: 'result1' });
      const handler2 = vi.fn().mockResolvedValue({ success: true, data: 'result2' });

      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'hook-1', priority: 'normal' }, handler1);
      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'hook-2', priority: 'high' }, handler2);

      expect(registry.getHandlerCount(HOOK_NAMES.REQUEST_TRANSFORM)).toBe(2);
    });

    it('should throw error for unknown hook name', () => {
      const handler = vi.fn();

      expect(() => {
        registry.register('invalid:hook' as HookName, { id: 'test', priority: 'normal' }, handler);
      }).toThrow('Unknown hook category');
    });
  });

  describe('unregister', () => {
    it('should unregister a hook handler', () => {
      const handler = vi.fn().mockResolvedValue({ success: true, data: 'result' });
      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'test-hook', priority: 'normal' }, handler);

      const result = registry.unregister(HOOK_NAMES.REQUEST_TRANSFORM, 'test-hook');

      expect(result).toBe(true);
      expect(registry.hasHandlers(HOOK_NAMES.REQUEST_TRANSFORM)).toBe(false);
    });

    it('should emit hook:unregistered event', () => {
      const listener = vi.fn();
      registry.on('hook:unregistered', listener);

      const handler = vi.fn().mockResolvedValue({ success: true, data: 'result' });
      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'test-hook', priority: 'normal' }, handler);
      registry.unregister(HOOK_NAMES.REQUEST_TRANSFORM, 'test-hook');

      expect(listener).toHaveBeenCalledWith('test-hook');
    });

    it('should return false for non-existent hook', () => {
      const result = registry.unregister(HOOK_NAMES.REQUEST_TRANSFORM, 'non-existent');

      expect(result).toBe(false);
    });
  });

  describe('enable/disable', () => {
    beforeEach(() => {
      const handler = vi.fn().mockResolvedValue({ success: true, data: 'result' });
      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'test-hook', priority: 'normal' }, handler);
    });

    it('should disable a hook', () => {
      const result = registry.disable(HOOK_NAMES.REQUEST_TRANSFORM, 'test-hook');

      expect(result).toBe(true);
    });

    it('should enable a disabled hook', () => {
      registry.disable(HOOK_NAMES.REQUEST_TRANSFORM, 'test-hook');
      const result = registry.enable(HOOK_NAMES.REQUEST_TRANSFORM, 'test-hook');

      expect(result).toBe(true);
    });

    it('should emit hook:disabled event', () => {
      const listener = vi.fn();
      registry.on('hook:disabled', listener);

      registry.disable(HOOK_NAMES.REQUEST_TRANSFORM, 'test-hook');

      expect(listener).toHaveBeenCalledWith('test-hook');
    });

    it('should emit hook:enabled event', () => {
      const listener = vi.fn();
      registry.on('hook:enabled', listener);

      registry.disable(HOOK_NAMES.REQUEST_TRANSFORM, 'test-hook');
      registry.enable(HOOK_NAMES.REQUEST_TRANSFORM, 'test-hook');

      expect(listener).toHaveBeenCalledWith('test-hook');
    });

    it('should return false for non-existent hook', () => {
      expect(registry.disable(HOOK_NAMES.REQUEST_TRANSFORM, 'non-existent')).toBe(false);
      expect(registry.enable(HOOK_NAMES.REQUEST_TRANSFORM, 'non-existent')).toBe(false);
    });
  });

  describe('execute', () => {
    const createContext = (): HookContext => ({
      requestId: 'test-request-123',
      timestamp: new Date(),
      metadata: {},
    });

    it('should execute a single hook handler', async () => {
      const handler = vi.fn().mockResolvedValue({ success: true, data: 'transformed' });
      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'test-hook', priority: 'normal' }, handler);

      const result = await registry.execute(HOOK_NAMES.REQUEST_TRANSFORM, 'input', createContext());

      expect(result.success).toBe(true);
      expect(result.data).toBe('transformed');
      expect(handler).toHaveBeenCalledWith('input', expect.any(Object));
    });

    it('should execute hooks in priority order', async () => {
      const order: string[] = [];

      const lowHandler = vi.fn().mockImplementation(async (input) => {
        order.push('low');
        return { success: true, data: `${input}-low` };
      });

      const highHandler = vi.fn().mockImplementation(async (input) => {
        order.push('high');
        return { success: true, data: `${input}-high` };
      });

      const criticalHandler = vi.fn().mockImplementation(async (input) => {
        order.push('critical');
        return { success: true, data: `${input}-critical` };
      });

      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'low', priority: 'low' }, lowHandler);
      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'high', priority: 'high' }, highHandler);
      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'critical', priority: 'critical' }, criticalHandler);

      await registry.execute(HOOK_NAMES.REQUEST_TRANSFORM, 'input', createContext());

      expect(order).toEqual(['critical', 'high', 'low']);
    });

    it('should chain hook outputs', async () => {
      const handler1 = vi.fn().mockResolvedValue({ success: true, data: 'step1' });
      const handler2 = vi.fn().mockResolvedValue({ success: true, data: 'step2' });

      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'hook-1', priority: 'high' }, handler1);
      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'hook-2', priority: 'normal' }, handler2);

      const result = await registry.execute(HOOK_NAMES.REQUEST_TRANSFORM, 'input', createContext());

      expect(handler1).toHaveBeenCalledWith('input', expect.any(Object));
      expect(handler2).toHaveBeenCalledWith('step1', expect.any(Object));
      expect(result.data).toBe('step2');
    });

    it('should skip disabled hooks', async () => {
      const handler1 = vi.fn().mockResolvedValue({ success: true, data: 'handler1' });
      const handler2 = vi.fn().mockResolvedValue({ success: true, data: 'handler2' });

      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'hook-1', priority: 'high' }, handler1);
      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'hook-2', priority: 'normal' }, handler2);

      registry.disable(HOOK_NAMES.REQUEST_TRANSFORM, 'hook-1');

      const result = await registry.execute(HOOK_NAMES.REQUEST_TRANSFORM, 'input', createContext());

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(result.data).toBe('handler2');
    });

    it('should stop on non-recoverable failure', async () => {
      const handler1 = vi.fn().mockResolvedValue({
        success: false,
        error: new Error('Failed'),
        recoverable: false,
      });
      const handler2 = vi.fn().mockResolvedValue({ success: true, data: 'handler2' });

      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'hook-1', priority: 'high' }, handler1);
      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'hook-2', priority: 'normal' }, handler2);

      const result = await registry.execute(HOOK_NAMES.REQUEST_TRANSFORM, 'input', createContext());

      expect(result.success).toBe(false);
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should handle thrown errors', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Unexpected error'));

      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'test-hook', priority: 'normal' }, handler);

      const result = await registry.execute(HOOK_NAMES.REQUEST_TRANSFORM, 'input', createContext());

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('Unexpected error');
    });

    it('should pass through when no handlers registered', async () => {
      const result = await registry.execute(HOOK_NAMES.REQUEST_TRANSFORM, 'input', createContext());

      expect(result.success).toBe(true);
      expect(result.data).toBe('input');
      expect(result.metadata?.passthrough).toBe(true);
    });

    it('should emit hook:executed event', async () => {
      const listener = vi.fn();
      registry.on('hook:executed', listener);

      const handler = vi.fn().mockResolvedValue({ success: true, data: 'result' });
      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'test-hook', priority: 'normal' }, handler);

      await registry.execute(HOOK_NAMES.REQUEST_TRANSFORM, 'input', createContext());

      expect(listener).toHaveBeenCalledWith('test-hook', expect.any(Number), true);
    });
  });

  describe('executeParallel', () => {
    const createContext = (): HookContext => ({
      requestId: 'test-request-123',
      timestamp: new Date(),
      metadata: {},
    });

    it('should execute all hooks in parallel', async () => {
      const handler1 = vi.fn().mockResolvedValue({ success: true, data: 'result1' });
      const handler2 = vi.fn().mockResolvedValue({ success: true, data: 'result2' });

      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'hook-1', priority: 'normal' }, handler1);
      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'hook-2', priority: 'normal' }, handler2);

      const results = await registry.executeParallel(HOOK_NAMES.REQUEST_TRANSFORM, 'input', createContext());

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ success: true, data: 'result1' });
      expect(results[1]).toEqual({ success: true, data: 'result2' });
    });

    it('should return empty array when no handlers', async () => {
      const results = await registry.executeParallel(HOOK_NAMES.REQUEST_TRANSFORM, 'input', createContext());

      expect(results).toEqual([]);
    });
  });

  describe('getHooksByCategory', () => {
    it('should return hooks by category', () => {
      const handler = vi.fn().mockResolvedValue({ success: true, data: 'result' });

      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'gateway-hook', priority: 'normal' }, handler);
      registry.register(HOOK_NAMES.API_KEY_VALIDATION, { id: 'auth-hook', priority: 'normal' }, handler);

      const gatewayHooks = registry.getHooksByCategory('gateway');
      const authHooks = registry.getHooksByCategory('auth');

      expect(gatewayHooks).toHaveLength(1);
      expect(gatewayHooks[0].id).toBe('gateway-hook');

      expect(authHooks).toHaveLength(1);
      expect(authHooks[0].id).toBe('auth-hook');
    });
  });

  describe('getAllHooks', () => {
    it('should return all registered hooks', () => {
      const handler = vi.fn().mockResolvedValue({ success: true, data: 'result' });

      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'hook-1', priority: 'normal' }, handler);
      registry.register(HOOK_NAMES.API_KEY_VALIDATION, { id: 'hook-2', priority: 'normal' }, handler);

      const allHooks = registry.getAllHooks();

      expect(allHooks.get(HOOK_NAMES.REQUEST_TRANSFORM)).toHaveLength(1);
      expect(allHooks.get(HOOK_NAMES.API_KEY_VALIDATION)).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('should clear all hooks', () => {
      const handler = vi.fn().mockResolvedValue({ success: true, data: 'result' });

      registry.register(HOOK_NAMES.REQUEST_TRANSFORM, { id: 'hook-1', priority: 'normal' }, handler);
      registry.register(HOOK_NAMES.API_KEY_VALIDATION, { id: 'hook-2', priority: 'normal' }, handler);

      registry.clear();

      expect(registry.hasHandlers(HOOK_NAMES.REQUEST_TRANSFORM)).toBe(false);
      expect(registry.hasHandlers(HOOK_NAMES.API_KEY_VALIDATION)).toBe(false);
    });
  });

  describe('singleton', () => {
    beforeEach(() => {
      resetHookRegistry();
    });

    it('should return the same instance', () => {
      const instance1 = getHookRegistry();
      const instance2 = getHookRegistry();

      expect(instance1).toBe(instance2);
    });

    it('should reset the singleton', () => {
      const instance1 = getHookRegistry();
      resetHookRegistry();
      const instance2 = getHookRegistry();

      expect(instance1).not.toBe(instance2);
    });
  });
});
