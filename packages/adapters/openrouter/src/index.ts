/**
 * @open-agent/adapter-openrouter
 *
 * OpenRouter adapter for Open Agent System.
 * Provides access to 300+ LLM models through a unified interface.
 */

import OpenRouter from '@openrouter/sdk';
import type {
  Message,
  LLMResponse,
  ToolDefinition,
  ToolCall,
  TokenUsage,
  ModelInfo,
  ProviderInfo,
  HookContext,
  HookResult,
} from '@open-agent/core';
import {
  getHookRegistry,
  HOOK_NAMES,
} from '@open-agent/core';

// =============================================================================
// Types
// =============================================================================

export interface OpenRouterConfig {
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
  defaultHeaders?: Record<string, string>;
  timeout?: number;
  maxRetries?: number;
}

export interface CompletionOptions {
  model?: string;
  messages: Message[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
}

export interface StreamChunk {
  id: string;
  content: string;
  isFirst: boolean;
  isLast: boolean;
  tokenCount?: number;
}

// =============================================================================
// OpenRouter Adapter
// =============================================================================

export class OpenRouterAdapter {
  private client: OpenRouter;
  private config: OpenRouterConfig;
  private hookRegistry = getHookRegistry();

  constructor(config: OpenRouterConfig) {
    this.config = {
      defaultModel: 'anthropic/claude-sonnet-4',
      maxRetries: 3,
      timeout: 60000,
      ...config,
    };

    this.client = new OpenRouter({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      defaultHeaders: {
        'HTTP-Referer': 'https://open-agent-system.dev',
        'X-Title': 'Open Agent System',
        ...this.config.defaultHeaders,
      },
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
    });
  }

  /**
   * Create a chat completion
   */
  async complete(options: CompletionOptions): Promise<LLMResponse> {
    const context = this.createContext();
    const model = options.model ?? this.config.defaultModel ?? 'anthropic/claude-sonnet-4';

    // Execute request transform hook
    const transformResult = await this.hookRegistry.execute(
      HOOK_NAMES.REQUEST_TRANSFORM,
      {
        messages: options.messages,
        model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        tools: options.tools,
      },
      context
    );

    if (!transformResult.success) {
      throw transformResult.error;
    }

    const transformedRequest = transformResult.data as CompletionOptions;

    // Execute model selection hook
    const modelResult = await this.hookRegistry.execute(
      HOOK_NAMES.MODEL_SELECTION,
      {
        request: transformedRequest,
        availableModels: await this.getAvailableModels(),
        constraints: {},
      },
      context
    );

    const selectedModel = modelResult.success
      ? (modelResult.data as { selectedModel: string }).selectedModel
      : model;

    // Make the API call
    const response = await this.client.chat.completions.create({
      model: selectedModel,
      messages: transformedRequest.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
        name: m.name,
      })),
      tools: transformedRequest.tools?.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      temperature: transformedRequest.temperature,
      max_tokens: transformedRequest.maxTokens,
    });

    // Parse the response
    const choice = response.choices[0];
    const llmResponse: LLMResponse = {
      id: response.id,
      model: response.model,
      content: choice?.message?.content ?? '',
      toolCalls: this.parseToolCalls(choice?.message?.tool_calls),
      usage: this.parseUsage(response.usage),
      finishReason: choice?.finish_reason ?? 'stop',
    };

    // Execute response transform hook
    const responseResult = await this.hookRegistry.execute(
      HOOK_NAMES.RESPONSE_TRANSFORM,
      {
        response: llmResponse,
        originalRequest: transformedRequest,
      },
      context
    );

    if (!responseResult.success) {
      throw responseResult.error;
    }

    // Execute cost tracking hook
    await this.hookRegistry.execute(
      HOOK_NAMES.COST_TRACKING,
      {
        provider: 'openrouter',
        model: selectedModel,
        inputTokens: llmResponse.usage.promptTokens,
        outputTokens: llmResponse.usage.completionTokens,
        cached: false,
      },
      context
    );

    return (responseResult.data as { response: LLMResponse }).response;
  }

  /**
   * Create a streaming chat completion
   */
  async *stream(options: CompletionOptions): AsyncGenerator<StreamChunk> {
    const context = this.createContext();
    const model = options.model ?? this.config.defaultModel ?? 'anthropic/claude-sonnet-4';

    // Execute stream start hook
    await this.hookRegistry.execute(
      HOOK_NAMES.STREAM_START,
      {
        requestId: context.requestId,
        model,
      },
      context
    );

    const stream = await this.client.chat.completions.create({
      model,
      messages: options.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
        name: m.name,
      })),
      tools: options.tools?.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
    });

    let chunkIndex = 0;
    let isFirst = true;

    try {
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content ?? '';
        const isLast = chunk.choices[0]?.finish_reason !== null;

        const streamChunk: StreamChunk = {
          id: chunk.id,
          content,
          isFirst,
          isLast,
        };

        // Execute chunk process hook
        const chunkResult = await this.hookRegistry.execute(
          HOOK_NAMES.CHUNK_PROCESS,
          {
            streamId: context.requestId,
            chunk: streamChunk,
            chunkIndex,
          },
          context
        );

        if (chunkResult.success) {
          yield (chunkResult.data as { transformedChunk?: StreamChunk }).transformedChunk ?? streamChunk;
        } else {
          yield streamChunk;
        }

        isFirst = false;
        chunkIndex++;
      }

      // Execute stream complete hook
      await this.hookRegistry.execute(
        HOOK_NAMES.STREAM_COMPLETE,
        {
          streamId: context.requestId,
          totalChunks: chunkIndex,
          totalTokens: 0, // Would need to track this
          duration: Date.now() - context.timestamp,
        },
        context
      );
    } catch (error) {
      // Execute stream error hook
      await this.hookRegistry.execute(
        HOOK_NAMES.STREAM_ERROR,
        {
          streamId: context.requestId,
          error: error instanceof Error ? error : new Error(String(error)),
          chunksReceived: chunkIndex,
        },
        context
      );
      throw error;
    }
  }

  /**
   * Get available models from OpenRouter
   */
  async getAvailableModels(): Promise<ModelInfo[]> {
    // OpenRouter provides a models endpoint
    // For now, return a curated list of popular models
    return [
      {
        id: 'anthropic/claude-sonnet-4',
        name: 'Claude Sonnet 4',
        provider: 'anthropic',
        contextLength: 200000,
        inputCostPer1k: 0.003,
        outputCostPer1k: 0.015,
        capabilities: ['chat', 'tools', 'vision'],
      },
      {
        id: 'anthropic/claude-opus-4',
        name: 'Claude Opus 4',
        provider: 'anthropic',
        contextLength: 200000,
        inputCostPer1k: 0.015,
        outputCostPer1k: 0.075,
        capabilities: ['chat', 'tools', 'vision', 'reasoning'],
      },
      {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        contextLength: 128000,
        inputCostPer1k: 0.005,
        outputCostPer1k: 0.015,
        capabilities: ['chat', 'tools', 'vision'],
      },
      {
        id: 'google/gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        provider: 'google',
        contextLength: 1000000,
        inputCostPer1k: 0.0001,
        outputCostPer1k: 0.0004,
        capabilities: ['chat', 'tools', 'vision'],
      },
      {
        id: 'meta-llama/llama-3.3-70b-instruct',
        name: 'Llama 3.3 70B',
        provider: 'meta',
        contextLength: 128000,
        inputCostPer1k: 0.0004,
        outputCostPer1k: 0.0004,
        capabilities: ['chat', 'tools'],
      },
    ];
  }

  /**
   * Get provider information
   */
  getProviderInfo(): ProviderInfo {
    return {
      id: 'openrouter',
      name: 'OpenRouter',
      status: 'available',
      latency: 0, // Would be calculated from actual requests
      reliability: 0.99,
    };
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private createContext(): HookContext {
    return {
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      metadata: {
        provider: 'openrouter',
      },
    };
  }

  private parseToolCalls(toolCalls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>): ToolCall[] | undefined {
    if (!toolCalls || toolCalls.length === 0) {
      return undefined;
    }

    return toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));
  }

  private parseUsage(usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  }): TokenUsage {
    return {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createOpenRouterAdapter(config: OpenRouterConfig): OpenRouterAdapter {
  return new OpenRouterAdapter(config);
}

// =============================================================================
// Hook Implementations
// =============================================================================

/**
 * Register default OpenRouter hooks
 */
export function registerOpenRouterHooks(): void {
  const registry = getHookRegistry();

  // Provider routing hook for OpenRouter
  registry.register(
    HOOK_NAMES.PROVIDER_ROUTING,
    {
      id: 'openrouter-provider-routing',
      name: 'OpenRouter Provider Routing',
      priority: 'normal',
      description: 'Routes requests through OpenRouter with automatic fallback',
    },
    async (input, _context): Promise<HookResult<{
      provider: string;
      fallbackProviders: string[];
      estimatedLatency?: number;
      estimatedCost?: number;
    }>> => {
      const { model } = input as { model: string };

      // OpenRouter handles provider routing internally
      return {
        success: true,
        data: {
          provider: 'openrouter',
          fallbackProviders: [],
          estimatedLatency: 500, // ms
          estimatedCost: 0.01, // Placeholder
        },
        metadata: {
          model,
          routedAt: Date.now(),
        },
      };
    }
  );

  // Fallback trigger hook
  registry.register(
    HOOK_NAMES.FALLBACK_TRIGGER,
    {
      id: 'openrouter-fallback',
      name: 'OpenRouter Fallback Handler',
      priority: 'high',
      description: 'Handles model fallback when primary model fails',
    },
    async (input, _context): Promise<HookResult<{
      shouldFallback: boolean;
      nextModel?: string;
      delay?: number;
    }>> => {
      const { error, attemptNumber, remainingFallbacks } = input as {
        error: Error;
        attemptNumber: number;
        remainingFallbacks: string[];
      };

      // Determine if we should fallback based on error type
      const shouldFallback =
        attemptNumber < 3 &&
        remainingFallbacks.length > 0 &&
        (error.message.includes('rate_limit') ||
          error.message.includes('overloaded') ||
          error.message.includes('timeout'));

      return {
        success: true,
        data: {
          shouldFallback,
          nextModel: remainingFallbacks[0],
          delay: shouldFallback ? 1000 * attemptNumber : undefined,
        },
      };
    }
  );
}
