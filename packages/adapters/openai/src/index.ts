/**
 * @open-agent/adapter-openai
 *
 * OpenAI adapter for Open Agent System.
 * Provides direct integration with OpenAI's API including GPT-4, GPT-4o, o1, and other models.
 */

import OpenAI from 'openai';
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

export interface OpenAIConfig {
  apiKey: string;
  organization?: string;
  baseURL?: string;
  defaultModel?: string;
  timeoutMs?: number;
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
  responseFormat?: { type: 'text' | 'json_object' };
  seed?: number;
  user?: string;
}

export interface StreamChunk {
  id: string;
  content: string;
  isFirst: boolean;
  isLast: boolean;
  tokenCount?: number;
}

// =============================================================================
// OpenAI Adapter
// =============================================================================

export class OpenAIAdapter {
  private client: OpenAI;
  private config: OpenAIConfig;
  private hookRegistry = getHookRegistry();

  constructor(config: OpenAIConfig) {
    this.config = {
      defaultModel: 'gpt-4o',
      timeoutMs: 60000,
      maxRetries: 2,
      ...config,
    };

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      organization: this.config.organization,
      baseURL: this.config.baseURL,
      timeout: this.config.timeoutMs,
      maxRetries: this.config.maxRetries,
    });
  }

  /**
   * Create a chat completion
   */
  async complete(options: CompletionOptions): Promise<LLMResponse> {
    const context = this.createContext();
    const model = options.model ?? this.config.defaultModel ?? 'gpt-4o';

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

    // Convert messages to OpenAI format
    const openAIMessages: OpenAI.Chat.ChatCompletionMessageParam[] = transformedRequest.messages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool' as const,
          tool_call_id: m.toolCallId ?? '',
          content: m.content,
        };
      }
      return {
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
        name: m.name,
      };
    });

    // Convert tools to OpenAI format
    const openAITools: OpenAI.Chat.ChatCompletionTool[] | undefined = transformedRequest.tools?.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as Record<string, unknown>,
      },
    }));

    // Make the API call
    const response = await this.client.chat.completions.create({
      model: selectedModel,
      messages: openAIMessages,
      tools: openAITools,
      temperature: transformedRequest.temperature,
      max_tokens: transformedRequest.maxTokens,
      response_format: options.responseFormat,
      seed: options.seed,
      user: options.user,
    });

    // Parse the response
    const choice = response.choices[0];
    const content = choice?.message?.content ?? '';

    const llmResponse: LLMResponse = {
      id: response.id,
      model: response.model,
      content,
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
        provider: 'openai',
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
    const model = options.model ?? this.config.defaultModel ?? 'gpt-4o';

    // Execute stream start hook
    await this.hookRegistry.execute(
      HOOK_NAMES.STREAM_START,
      {
        requestId: context.requestId,
        model,
      },
      context
    );

    // Convert messages to OpenAI format
    const openAIMessages: OpenAI.Chat.ChatCompletionMessageParam[] = options.messages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool' as const,
          tool_call_id: m.toolCallId ?? '',
          content: m.content,
        };
      }
      return {
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
        name: m.name,
      };
    });

    // Convert tools to OpenAI format
    const openAITools: OpenAI.Chat.ChatCompletionTool[] | undefined = options.tools?.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as Record<string, unknown>,
      },
    }));

    const stream = await this.client.chat.completions.create({
      model,
      messages: openAIMessages,
      tools: openAITools,
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
          totalTokens: 0,
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
   * Get available models
   */
  async getAvailableModels(): Promise<ModelInfo[]> {
    return [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        contextLength: 128000,
        inputCostPer1k: 0.005,
        outputCostPer1k: 0.015,
        capabilities: ['chat', 'tools', 'vision'],
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'openai',
        contextLength: 128000,
        inputCostPer1k: 0.00015,
        outputCostPer1k: 0.0006,
        capabilities: ['chat', 'tools', 'vision'],
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        provider: 'openai',
        contextLength: 128000,
        inputCostPer1k: 0.01,
        outputCostPer1k: 0.03,
        capabilities: ['chat', 'tools', 'vision'],
      },
      {
        id: 'o1',
        name: 'o1',
        provider: 'openai',
        contextLength: 200000,
        inputCostPer1k: 0.015,
        outputCostPer1k: 0.06,
        capabilities: ['chat', 'reasoning'],
      },
      {
        id: 'o1-mini',
        name: 'o1-mini',
        provider: 'openai',
        contextLength: 128000,
        inputCostPer1k: 0.003,
        outputCostPer1k: 0.012,
        capabilities: ['chat', 'reasoning'],
      },
      {
        id: 'o1-pro',
        name: 'o1-pro',
        provider: 'openai',
        contextLength: 200000,
        inputCostPer1k: 0.15,
        outputCostPer1k: 0.6,
        capabilities: ['chat', 'reasoning', 'tools'],
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        contextLength: 16385,
        inputCostPer1k: 0.0005,
        outputCostPer1k: 0.0015,
        capabilities: ['chat', 'tools'],
      },
    ];
  }

  /**
   * Get provider information
   */
  getProviderInfo(): ProviderInfo {
    return {
      id: 'openai',
      name: 'OpenAI',
      status: 'available',
      latency: 0,
      reliability: 0.99,
    };
  }

  /**
   * Create embeddings
   */
  async createEmbeddings(
    input: string | string[],
    model: string = 'text-embedding-3-small'
  ): Promise<{ embeddings: number[][]; usage: { promptTokens: number; totalTokens: number } }> {
    const response = await this.client.embeddings.create({
      model,
      input,
    });

    return {
      embeddings: response.data.map((d) => d.embedding),
      usage: {
        promptTokens: response.usage.prompt_tokens,
        totalTokens: response.usage.total_tokens,
      },
    };
  }

  /**
   * Moderate content
   */
  async moderateContent(input: string | string[]): Promise<{
    flagged: boolean;
    categories: Record<string, boolean>;
    scores: Record<string, number>;
  }[]> {
    const response = await this.client.moderations.create({
      input,
    });

    return response.results.map((r) => ({
      flagged: r.flagged,
      categories: r.categories as unknown as Record<string, boolean>,
      scores: r.category_scores as unknown as Record<string, number>,
    }));
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private createContext(): HookContext {
    return {
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      metadata: {
        provider: 'openai',
      },
    };
  }

  private parseToolCalls(toolCalls?: OpenAI.Chat.ChatCompletionMessageToolCall[]): ToolCall[] | undefined {
    if (!toolCalls || toolCalls.length === 0) {
      return undefined;
    }

    return toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));
  }

  private parseUsage(usage?: OpenAI.CompletionUsage): TokenUsage {
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

export function createOpenAIAdapter(config: OpenAIConfig): OpenAIAdapter {
  return new OpenAIAdapter(config);
}

// =============================================================================
// Hook Implementations
// =============================================================================

/**
 * Register default OpenAI hooks
 */
export function registerOpenAIHooks(): void {
  const registry = getHookRegistry();

  // Provider routing hook for OpenAI
  registry.register(
    HOOK_NAMES.PROVIDER_ROUTING,
    {
      id: 'openai-provider-routing',
      name: 'OpenAI Provider Routing',
      priority: 'normal',
      description: 'Routes requests directly to OpenAI API',
    },
    async (input, _context): Promise<HookResult<{
      provider: string;
      fallbackProviders: string[];
      estimatedLatency?: number;
      estimatedCost?: number;
    }>> => {
      const { model } = input as { model: string };

      // Calculate estimated cost based on model
      let estimatedCost = 0.01;
      if (model.includes('gpt-4o-mini')) {
        estimatedCost = 0.001;
      } else if (model.includes('gpt-4o')) {
        estimatedCost = 0.02;
      } else if (model.includes('o1')) {
        estimatedCost = 0.05;
      }

      return {
        success: true,
        data: {
          provider: 'openai',
          fallbackProviders: ['openrouter'],
          estimatedLatency: 400,
          estimatedCost,
        },
        metadata: {
          model,
          routedAt: Date.now(),
        },
      };
    }
  );

  // Rate limit handler hook
  registry.register(
    HOOK_NAMES.RATE_LIMIT,
    {
      id: 'openai-rate-limit',
      name: 'OpenAI Rate Limit Handler',
      priority: 'high',
      description: 'Handles OpenAI rate limiting with exponential backoff',
    },
    async (input, _context): Promise<HookResult<{
      allowed: boolean;
      waitMs?: number;
      quotaRemaining?: number;
    }>> => {
      const { currentUsage, limit } = input as {
        currentUsage: { requestsPerMinute: number; tokensPerMinute: number };
        limit: { requestsPerMinute: number; tokensPerMinute: number };
      };

      const requestsRemaining = limit.requestsPerMinute - currentUsage.requestsPerMinute;
      const tokensRemaining = limit.tokensPerMinute - currentUsage.tokensPerMinute;

      const allowed = requestsRemaining > 0 && tokensRemaining > 0;
      const waitMs = allowed ? 0 : 60000; // Wait 1 minute if rate limited

      return {
        success: true,
        data: {
          allowed,
          waitMs,
          quotaRemaining: Math.min(requestsRemaining, tokensRemaining),
        },
      };
    }
  );

  // Fallback trigger hook
  registry.register(
    HOOK_NAMES.FALLBACK_TRIGGER,
    {
      id: 'openai-fallback',
      name: 'OpenAI Fallback Handler',
      priority: 'high',
      description: 'Handles model fallback when OpenAI API fails',
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
      const isRateLimited = error.message.includes('rate_limit') || error.message.includes('429');
      const isOverloaded = error.message.includes('overloaded') || error.message.includes('503');
      const isTimeout = error.message.includes('timeout') || error.message.includes('ETIMEDOUT');

      const shouldFallback =
        attemptNumber < 3 &&
        remainingFallbacks.length > 0 &&
        (isRateLimited || isOverloaded || isTimeout);

      // Use exponential backoff for delay
      const delay = shouldFallback ? Math.min(1000 * Math.pow(2, attemptNumber), 30000) : undefined;

      return {
        success: true,
        data: {
          shouldFallback,
          nextModel: remainingFallbacks[0],
          delay,
        },
      };
    }
  );
}
