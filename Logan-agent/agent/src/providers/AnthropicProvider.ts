import { AIProvider, CompletionOptions, CompletionResult, ProviderConfig, ToolCall, StreamChunk } from './types';
import { LoganLogger } from '../utils';
import { ToolRegistry } from '../tools';

/**
 * Adapter for Anthropic Messages API. Features explicit support for native prompt caching
 * via ephemeral cache_control headers and auto-retaining tool checks.
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

  private preparePayloadToolsAndMessages(prompt: string, options?: CompletionOptions): {
    messages: Array<any>;
    tools?: Array<{ name: string; description: string; input_schema: unknown }>;
  } {
    let formattedTools: Array<{ name: string; description: string; input_schema: unknown }> | undefined = options?.tools && options.tools.length > 0
      ? options.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema || { type: 'object', properties: {} },
        }))
      : undefined;

    const hasHistoricalTools = options?.messages?.some((m) => m.role === 'tool');

    if (!formattedTools && hasHistoricalTools) {
      const regTools = ToolRegistry.getInstance().getToolDefinitions();
      if (regTools.length > 0) {
        formattedTools = regTools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema || { type: 'object', properties: {} },
        }));
      }
    }

    const rawMsgs = options?.messages && options.messages.length > 0
      ? options.messages
      : [{ role: 'user', content: prompt }];

    // Convert to Anthropic format with proper tool_result blocks
    const messages: any[] = [];
    for (const m of rawMsgs as any[]) {
      if (m.role === 'tool') {
        messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: m.tool_call_id || 'tool_1',
            content: m.content
          }]
        });
        continue;
      }
      if (m.role === 'assistant' && m.tool_calls) {
        const content: any[] = [];
        if (m.content) content.push({ type: 'text', text: m.content });
        for (const tc of m.tool_calls) {
          content.push({ type: 'tool_use', id: tc.id || `toolu_${Math.random().toString(36).slice(2)}`, name: tc.name, input: tc.arguments });
        }
        messages.push({ role: 'assistant', content });
        continue;
      }
      messages.push({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.content,
      });
    }

    // Prompt Caching: inject cache_control into last 2 large messages + system
    if (options?.cacheBreakpoints && messages.length > 2) {
      let cached = 0;
      for (let i = messages.length - 1; i >= 0 && cached < 2; i--) {
        const msg = messages[i];
        const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        if (contentStr.length > 800) {
          if (typeof msg.content === 'string') {
            messages[i] = {
              role: msg.role,
              content: [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }]
            };
          } else if (Array.isArray(msg.content)) {
            const lastBlock = msg.content[msg.content.length - 1];
            if (lastBlock && typeof lastBlock === 'object') {
              lastBlock.cache_control = { type: 'ephemeral' };
            }
          }
          cached++;
        }
      }
    }

    return { messages, tools: formattedTools };
  }

  public async complete(prompt: string, options?: CompletionOptions): Promise<CompletionResult> {
    const url = `${this.baseUrl}/v1/messages`;
    const model = options?.model || this.defaultModel;
    const maxTokens = options?.maxTokens || 4096;
    const { messages, tools } = this.preparePayloadToolsAndMessages(prompt, { ...options, cacheBreakpoints: true });

    const payload: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages,
      stream: false,
    };

    if (tools && tools.length > 0) {
      payload.tools = tools;
    }

    const systemBlock = this.buildSystemPayload({ ...options, cacheBreakpoints: true });
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

    headers['anthropic-beta'] = 'prompt-caching-2024-07-31';

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
      content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown>; id?: string }>;
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
      return { content: '', toolCalls: [] };
    }

    let textOutput = '';
    const toolCalls: ToolCall[] = [];
    for (const block of data.content as any[]) {
      if (block.type === 'text' && typeof block.text === 'string') {
        textOutput += block.text;
      } else if (block.type === 'tool_use' && block.name) {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: (block.input as Record<string, unknown>) || {},
        });
      }
    }

    LoganLogger.getInstance().logRawLLM(payload, textOutput + (toolCalls.length ? ` [${toolCalls.length} tool_calls]` : ''));
    return { content: textOutput, toolCalls, finishReason: toolCalls.length ? 'tool_calls' : 'stop' };
  }

  public async *stream(prompt: string, options?: CompletionOptions): AsyncIterable<StreamChunk> {
    // For now, use non-streaming complete and emit as single chunk (to satisfy interface)
    // Full SSE tool_use streaming can be added later
    const result = await this.complete(prompt, { ...options, cacheBreakpoints: true });
    if (result.content) {
      if (options?.onContentDelta) options.onContentDelta(result.content);
      yield { contentDelta: result.content };
    }
    // Simulate tool_calls streaming
    for (let i = 0; i < result.toolCalls.length; i++) {
      const tc = result.toolCalls[i];
      yield {
        toolCallDelta: {
          index: i,
          id: tc.id,
          name: tc.name,
          argumentsDelta: JSON.stringify(tc.arguments)
        }
      };
    }
    yield { finishReason: result.finishReason };
  }
}
