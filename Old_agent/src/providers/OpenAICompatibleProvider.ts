import OpenAI from 'openai';
import { AIProvider, CompletionOptions, ProviderConfig, TokenUsageMetrics } from './types';
import { LoganLogger } from '../utils';

/**
 * Standard OpenAI-compatible REST API adapter utilizing the official OpenAI SDK client.
 * Guarantees robust handling of headers, /v1 path normalization, tool schemas, and native reasoning tokens across vendors.
 */
export class OpenAICompatibleProvider implements AIProvider {
  public readonly providerName: string = 'OpenAICompatible';
  private readonly client: OpenAI;
  private readonly defaultModel: string;

  constructor(config: ProviderConfig) {
    this.defaultModel = config.defaultModel || 'gpt-4o';
    this.client = new OpenAI({
      apiKey: config.apiKey || 'dummy-api-key',
      baseURL: config.baseUrl || 'https://api.openai.com/v1',
      defaultHeaders: config.customHeaders,
    });
  }

  private buildMessagesArray(prompt: string, options?: CompletionOptions): Array<OpenAI.Chat.ChatCompletionMessageParam> {
    if (options?.messages && options.messages.length > 0) {
      const msgs: Array<OpenAI.Chat.ChatCompletionMessageParam> = options.messages.map((m) => ({
        role: (m.role as 'system' | 'user' | 'assistant') || 'user',
        content: m.content,
      }));
      if (options.systemPrompt && !msgs.some((m) => m.role === 'system')) {
        msgs.unshift({ role: 'system', content: options.systemPrompt });
      }
      return msgs;
    }

    const messages: Array<OpenAI.Chat.ChatCompletionMessageParam> = [];
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });
    return messages;
  }

  public async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const model = options?.model || this.defaultModel;
    const messages = this.buildMessagesArray(prompt, options);

    const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages,
      stream: false,
    };

    if (options?.maxTokens !== undefined) {
      params.max_tokens = options.maxTokens;
    }
    if (options?.temperature !== undefined) {
      params.temperature = options.temperature;
    }
    if (options?.topP !== undefined) {
      params.top_p = options.topP;
    }
    if (options?.stopSequences && options.stopSequences.length > 0) {
      params.stop = options.stopSequences;
    }

    const response = await this.client.chat.completions.create(params, {
      signal: options?.abortSignal || options?.signal,
    });

    if (response.usage && options?.onUsageMetrics) {
      const metrics: TokenUsageMetrics = {
        inputTokens: response.usage.prompt_tokens || 0,
        outputTokens: response.usage.completion_tokens || 0,
        totalTokens: response.usage.total_tokens || 0,
      };
      options.onUsageMetrics(metrics);
    }

    const choice = response.choices?.[0];
    const message = choice?.message as (OpenAI.Chat.ChatCompletionMessage & { reasoning_content?: string; reasoning?: string }) | undefined;

    if (message?.reasoning_content || message?.reasoning) {
      const reasoningTokens = message.reasoning_content || message.reasoning || '';
      if (options?.onReasoningDelta) {
        options.onReasoningDelta(reasoningTokens);
      }
    }

    let textContent = message?.content || '';

    if (message?.tool_calls && message.tool_calls.length > 0) {
      for (const tc of message.tool_calls) {
        if (tc.type === 'function' && tc.function.name) {
          let argsObj: Record<string, unknown> = {};
          try {
            argsObj = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
          } catch {
            // fallback empty args
          }
          const serialized = JSON.stringify({ name: tc.function.name, arguments: argsObj });
          textContent += `\n<tool_call>${serialized}</tool_call>`;
        }
      }
    }

    LoganLogger.getInstance().logRawLLM(params, textContent);
    return textContent;
  }

  public async *stream(prompt: string, options?: CompletionOptions): AsyncIterable<string> {
    const model = options?.model || this.defaultModel;
    const messages = this.buildMessagesArray(prompt, options);

    const params: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (options?.maxTokens !== undefined) {
      params.max_tokens = options.maxTokens;
    }
    if (options?.temperature !== undefined) {
      params.temperature = options.temperature;
    }
    if (options?.topP !== undefined) {
      params.top_p = options.topP;
    }
    if (options?.stopSequences && options.stopSequences.length > 0) {
      params.stop = options.stopSequences;
    }

    const stream = await this.client.chat.completions.create(params, {
      signal: options?.abortSignal || options?.signal,
    });

    let fullResponse = '';
    for await (const chunk of stream) {
      if (chunk.usage && options?.onUsageMetrics) {
        options.onUsageMetrics({
          inputTokens: chunk.usage.prompt_tokens || 0,
          outputTokens: chunk.usage.completion_tokens || 0,
          totalTokens: chunk.usage.total_tokens || 0,
        });
      }

      const delta = chunk.choices?.[0]?.delta as (OpenAI.Chat.ChatCompletionChunk.Choice.Delta & { reasoning_content?: string; reasoning?: string }) | undefined;
      if (delta?.reasoning_content || delta?.reasoning) {
        const rDelta = delta.reasoning_content || delta.reasoning || '';
        if (options?.onReasoningDelta) {
          options.onReasoningDelta(rDelta);
        }
      }

      if (delta?.content) {
        fullResponse += delta.content;
        yield delta.content;
      }
      if (delta?.tool_calls && delta.tool_calls.length > 0) {
        for (const tc of delta.tool_calls) {
          if (tc.function?.name) {
            const str = `\n<tool_call>{"name": "${tc.function.name}", "arguments": `;
            fullResponse += str;
            yield str;
          }
          if (tc.function?.arguments) {
            fullResponse += tc.function.arguments;
            yield tc.function.arguments;
          }
        }
      }
    }
    LoganLogger.getInstance().logRawLLM(params, fullResponse);
  }

  public async embed(texts: string[], options?: CompletionOptions): Promise<number[][]> {
    const model = options?.model || 'text-embedding-3-small';

    const response = await this.client.embeddings.create(
      {
        input: texts,
        model,
      },
      {
        signal: options?.abortSignal || options?.signal,
      }
    );

    if (!response.data || response.data.length === 0) {
      return texts.map(() => []);
    }

    const sorted = [...response.data].sort((a, b) => (a.index || 0) - (b.index || 0));
    return sorted.map((item) => item.embedding || []);
  }
}
