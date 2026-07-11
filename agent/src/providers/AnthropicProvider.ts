import { AIProvider, CompletionOptions, ProviderConfig } from './types';
import { LoganLogger } from '../utils';

/**
 * Adapter for Anthropic Messages API. Features explicit support for native prompt caching
 * via ephemeral cache_control headers.
 */
export class AnthropicProvider implements AIProvider {
  public readonly providerName: string = 'Anthropic';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly customHeaders: Record<string, string>;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    this.defaultModel = config.defaultModel || 'claude-3-5-sonnet-20241022';
    this.customHeaders = config.customHeaders || {};
  }

  private buildSystemPayload(options?: CompletionOptions): Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> | undefined {
    if (!options?.systemPrompt) {
      return undefined;
    }

    const block: { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } } = {
      type: 'text',
      text: options.systemPrompt,
    };

    if (options.cacheBreakpoints) {
      block.cache_control = { type: 'ephemeral' };
    }

    return [block];
  }

  private buildMessagesArray(prompt: string, options?: CompletionOptions): Array<{ role: string; content: string }> {
    if (options?.messages && options.messages.length > 0) {
      return options.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));
    }
    return [{ role: 'user', content: prompt }];
  }

  public async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const url = `${this.baseUrl}/v1/messages`;
    const model = options?.model || this.defaultModel;
    const maxTokens = options?.maxTokens || 4096;
    const messages = this.buildMessagesArray(prompt, options);

    const payload: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages,
      stream: false,
    };

    const systemBlock = this.buildSystemPayload(options);
    if (systemBlock) {
      payload.system = systemBlock;
    }
    if (options?.temperature !== undefined) {
      payload.temperature = options.temperature;
    }
    if (options?.topP !== undefined) {
      payload.top_p = options.topP;
    }
    if (options?.stopSequences && options.stopSequences.length > 0) {
      payload.stop_sequences = options.stopSequences;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      ...this.customHeaders,
    };

    if (options?.cacheBreakpoints) {
      headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: options?.abortSignal || options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[AnthropicProvider] API Request Failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
    };

    if (data.usage && options?.onUsageMetrics) {
      const inputTokens = data.usage.input_tokens || 0;
      const outputTokens = data.usage.output_tokens || 0;
      const cachedInputTokens = (data.usage.cache_creation_input_tokens || 0) + (data.usage.cache_read_input_tokens || 0);
      options.onUsageMetrics({
        inputTokens,
        outputTokens,
        cachedInputTokens,
        totalTokens: inputTokens + outputTokens + cachedInputTokens,
      });
    }

    if (!data.content || data.content.length === 0) {
      return '';
    }

    let textOutput = '';
    for (const block of data.content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        textOutput += block.text;
      } else if (block.type === 'tool_use' && block.name) {
        const serialized = JSON.stringify({ name: block.name, arguments: block.input || {} });
        textOutput += `\n<tool_call>${serialized}</tool_call>`;
      }
    }

    LoganLogger.getInstance().logRawLLM(payload, textOutput);
    return textOutput;
  }

  public async *stream(prompt: string, options?: CompletionOptions): AsyncIterable<string> {
    const url = `${this.baseUrl}/v1/messages`;
    const model = options?.model || this.defaultModel;
    const maxTokens = options?.maxTokens || 4096;
    const messages = this.buildMessagesArray(prompt, options);

    const payload: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages,
      stream: true,
    };

    const systemBlock = this.buildSystemPayload(options);
    if (systemBlock) {
      payload.system = systemBlock;
    }
    if (options?.temperature !== undefined) {
      payload.temperature = options.temperature;
    }
    if (options?.topP !== undefined) {
      payload.top_p = options.topP;
    }
    if (options?.stopSequences && options.stopSequences.length > 0) {
      payload.stop_sequences = options.stopSequences;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      ...this.customHeaders,
    };

    if (options?.cacheBreakpoints) {
      headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: options?.abortSignal || options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[AnthropicProvider] Streaming API Request Failed (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('[AnthropicProvider] Streaming response body is null or undefined.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullOutput = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) {
            continue;
          }

          const jsonStr = trimmed.slice(6).trim();
          if (jsonStr === '') {
            continue;
          }

          try {
            const eventData = JSON.parse(jsonStr) as {
              type?: string;
              delta?: { type?: string; text?: string };
              content_block?: { type?: string; name?: string; input?: Record<string, unknown> };
              message?: {
                usage?: {
                  input_tokens?: number;
                  output_tokens?: number;
                  cache_creation_input_tokens?: number;
                  cache_read_input_tokens?: number;
                };
              };
              usage?: {
                output_tokens?: number;
              };
            };

            if (eventData.type === 'message_start' && eventData.message?.usage && options?.onUsageMetrics) {
              const u = eventData.message.usage;
              const inputTokens = u.input_tokens || 0;
              const cachedInputTokens = (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
              options.onUsageMetrics({
                inputTokens,
                outputTokens: 0,
                cachedInputTokens,
                totalTokens: inputTokens + cachedInputTokens,
              });
            }

            if (eventData.type === 'message_delta' && eventData.usage && options?.onUsageMetrics) {
              const outputTokens = eventData.usage.output_tokens || 0;
              options.onUsageMetrics({
                inputTokens: 0,
                outputTokens,
                totalTokens: outputTokens,
              });
            }

            if (eventData.type === 'content_block_delta' && eventData.delta?.type === 'text_delta' && eventData.delta.text) {
              fullOutput += eventData.delta.text;
              yield eventData.delta.text;
            }
          } catch {
            // Ignore malformed partial SSE blocks
          }
        }
      }
    } finally {
      reader.releaseLock();
      LoganLogger.getInstance().logRawLLM(payload, fullOutput);
    }
  }
}
