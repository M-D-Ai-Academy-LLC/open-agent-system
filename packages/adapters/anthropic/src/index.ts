/**
 * @open-agent/adapter-anthropic
 *
 * Anthropic adapter for Open Agent System.
 * Provides direct integration with Anthropic's Claude API including Claude Opus 4, Sonnet 4, and Haiku.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  Message,
  LLMResponse,
  ToolDefinition,
  ToolCall,
  ModelInfo,
  ProviderInfo,
  HookContext,
  HookResult,
} from '@open-agent/core';

/**
 * Extended message type for assistant messages with tool calls
 */
interface AssistantMessageWithToolCalls extends Message {
  toolCalls?: ToolCall[];
}
import {
  getHookRegistry,
  HOOK_NAMES,
} from '@open-agent/core';

// =============================================================================
// Types
// =============================================================================

export interface AnthropicConfig {
  apiKey: string;
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
  system?: string;
  metadata?: { user_id?: string };
}

export interface StreamChunk {
  id: string;
  content: string;
  isFirst: boolean;
  isLast: boolean;
  tokenCount?: number;
}

// =============================================================================
// Anthropic Adapter
// =============================================================================

export class AnthropicAdapter {
  private client: Anthropic;
  private config: AnthropicConfig;
  private hookRegistry = getHookRegistry();

  constructor(config: AnthropicConfig) {
    this.config = {
      defaultModel: 'claude-sonnet-4-20250514',
      timeoutMs: 60000,
      maxRetries: 2,
      ...config,
    };

    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      timeout: this.config.timeoutMs,
      maxRetries: this.config.maxRetries,
    });
  }

  /**
   * Create a message completion
   */
  async complete(options: CompletionOptions): Promise<LLMResponse> {
    const context = this.createContext();
    const model = options.model ?? this.config.defaultModel ?? 'claude-sonnet-4-20250514';

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

    // Extract system message and convert remaining messages
    const { system, anthropicMessages } = this.convertMessages(transformedRequest.messages);

    // Convert tools to Anthropic format
    const anthropicTools = this.convertTools(transformedRequest.tools);

    // Make the API call
    const response = await this.client.messages.create({
      model: selectedModel,
      messages: anthropicMessages,
      system: options.system ?? system,
      tools: anthropicTools,
      temperature: transformedRequest.temperature,
      max_tokens: transformedRequest.maxTokens ?? 4096,
      metadata: options.metadata,
    });

    // Parse the response
    const content = this.extractContent(response.content);
    const toolCalls = this.extractToolCalls(response.content);

    const llmResponse: LLMResponse = {
      id: response.id,
      model: response.model,
      content,
      toolCalls,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason: this.mapStopReason(response.stop_reason),
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
        provider: 'anthropic',
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
   * Create a streaming message completion
   */
  async *stream(options: CompletionOptions): AsyncGenerator<StreamChunk> {
    const context = this.createContext();
    const model = options.model ?? this.config.defaultModel ?? 'claude-sonnet-4-20250514';

    // Execute stream start hook
    await this.hookRegistry.execute(
      HOOK_NAMES.STREAM_START,
      {
        requestId: context.requestId,
        model,
      },
      context
    );

    // Extract system message and convert remaining messages
    const { system, anthropicMessages } = this.convertMessages(options.messages);

    // Convert tools to Anthropic format
    const anthropicTools = this.convertTools(options.tools);

    const stream = this.client.messages.stream({
      model,
      messages: anthropicMessages,
      system: options.system ?? system,
      tools: anthropicTools,
      temperature: options.temperature,
      max_tokens: options.maxTokens ?? 4096,
    });

    let chunkIndex = 0;
    let isFirst = true;
    let responseId = '';

    try {
      for await (const event of stream) {
        if (event.type === 'message_start') {
          responseId = event.message.id;
          continue;
        }

        if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if (delta.type === 'text_delta') {
            const isLast = false;

            const streamChunk: StreamChunk = {
              id: responseId,
              content: delta.text,
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
        }

        if (event.type === 'message_stop') {
          // Final chunk
          const finalChunk: StreamChunk = {
            id: responseId,
            content: '',
            isFirst: false,
            isLast: true,
          };
          yield finalChunk;
        }
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
        id: 'claude-opus-4-20250514',
        name: 'Claude Opus 4',
        provider: 'anthropic',
        contextLength: 200000,
        inputCostPer1k: 0.015,
        outputCostPer1k: 0.075,
        capabilities: ['chat', 'tools', 'vision', 'reasoning'],
      },
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        provider: 'anthropic',
        contextLength: 200000,
        inputCostPer1k: 0.003,
        outputCostPer1k: 0.015,
        capabilities: ['chat', 'tools', 'vision'],
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        provider: 'anthropic',
        contextLength: 200000,
        inputCostPer1k: 0.0008,
        outputCostPer1k: 0.004,
        capabilities: ['chat', 'tools', 'vision'],
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        contextLength: 200000,
        inputCostPer1k: 0.003,
        outputCostPer1k: 0.015,
        capabilities: ['chat', 'tools', 'vision'],
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        provider: 'anthropic',
        contextLength: 200000,
        inputCostPer1k: 0.015,
        outputCostPer1k: 0.075,
        capabilities: ['chat', 'tools', 'vision'],
      },
    ];
  }

  /**
   * Get provider information
   */
  getProviderInfo(): ProviderInfo {
    return {
      id: 'anthropic',
      name: 'Anthropic',
      status: 'available',
      latency: 0,
      reliability: 0.99,
    };
  }

  /**
   * Count tokens (estimate)
   */
  async countTokens(text: string): Promise<number> {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private createContext(): HookContext {
    return {
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      metadata: {
        provider: 'anthropic',
      },
    };
  }

  private convertMessages(messages: (Message | AssistantMessageWithToolCalls)[]): {
    system: string | undefined;
    anthropicMessages: Anthropic.MessageParam[];
  } {
    let system: string | undefined;
    const anthropicMessages: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = msg.content;
        continue;
      }

      if (msg.role === 'tool') {
        // Tool result
        anthropicMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId ?? '',
              content: msg.content,
            },
          ],
        });
        continue;
      }

      // Check for assistant message with tool calls
      const assistantMsg = msg as AssistantMessageWithToolCalls;
      if (msg.role === 'assistant' && assistantMsg.toolCalls) {
        // Assistant with tool use - use ContentBlockParam for creating messages
        const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];
        if (msg.content) {
          contentBlocks.push({ type: 'text', text: msg.content });
        }
        for (const tc of assistantMsg.toolCalls) {
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }
        anthropicMessages.push({
          role: 'assistant',
          content: contentBlocks,
        });
        continue;
      }

      // Regular message
      anthropicMessages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    return { system, anthropicMessages };
  }

  private convertTools(tools?: ToolDefinition[]): Anthropic.Tool[] | undefined {
    if (!tools || tools.length === 0) {
      return undefined;
    }

    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool.InputSchema,
    }));
  }

  private extractContent(content: Anthropic.ContentBlock[]): string {
    return content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }

  private extractToolCalls(content: Anthropic.ContentBlock[]): ToolCall[] | undefined {
    const toolUses = content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (toolUses.length === 0) {
      return undefined;
    }

    return toolUses.map((tu) => ({
      id: tu.id,
      name: tu.name,
      arguments: tu.input as Record<string, unknown>,
    }));
  }

  private mapStopReason(reason: string | null): string {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      case 'tool_use':
        return 'tool_calls';
      default:
        return reason ?? 'stop';
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createAnthropicAdapter(config: AnthropicConfig): AnthropicAdapter {
  return new AnthropicAdapter(config);
}

// =============================================================================
// Hook Implementations
// =============================================================================

/**
 * Register default Anthropic hooks
 */
export function registerAnthropicHooks(): void {
  const registry = getHookRegistry();

  // Provider routing hook for Anthropic
  registry.register(
    HOOK_NAMES.PROVIDER_ROUTING,
    {
      id: 'anthropic-provider-routing',
      name: 'Anthropic Provider Routing',
      priority: 'normal',
      description: 'Routes requests directly to Anthropic API',
    },
    async (input, _context): Promise<HookResult<{
      provider: string;
      fallbackProviders: string[];
      estimatedLatency?: number;
      estimatedCost?: number;
    }>> => {
      const { model } = input as { model: string };

      // Calculate estimated cost based on model
      let estimatedCost = 0.02;
      if (model.includes('haiku')) {
        estimatedCost = 0.005;
      } else if (model.includes('opus')) {
        estimatedCost = 0.09;
      } else if (model.includes('sonnet')) {
        estimatedCost = 0.02;
      }

      return {
        success: true,
        data: {
          provider: 'anthropic',
          fallbackProviders: ['openrouter'],
          estimatedLatency: 300,
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
      id: 'anthropic-rate-limit',
      name: 'Anthropic Rate Limit Handler',
      priority: 'high',
      description: 'Handles Anthropic rate limiting with exponential backoff',
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
      const waitMs = allowed ? 0 : 60000;

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
      id: 'anthropic-fallback',
      name: 'Anthropic Fallback Handler',
      priority: 'high',
      description: 'Handles model fallback when Anthropic API fails',
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

      const isRateLimited = error.message.includes('rate_limit') || error.message.includes('429');
      const isOverloaded = error.message.includes('overloaded') || error.message.includes('529');
      const isTimeout = error.message.includes('timeout') || error.message.includes('ETIMEDOUT');

      const shouldFallback =
        attemptNumber < 3 &&
        remainingFallbacks.length > 0 &&
        (isRateLimited || isOverloaded || isTimeout);

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
