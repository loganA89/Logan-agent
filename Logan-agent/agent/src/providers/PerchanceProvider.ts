import { AIProvider, CompletionOptions, CompletionResult, ProviderConfig, StreamChunk } from './types';
import { LoganLogger } from '../utils';

/**
 * Decoupled, modular adapter for Perchance.org community text and image generators.
 * Queries public endpoints without requiring API credentials or subscription accounts.
 */
export class PerchanceProvider implements AIProvider {
  public readonly providerName: string = 'Perchance';
  private readonly defaultGenerator: string;

  constructor(config: ProviderConfig) {
    this.defaultGenerator = config.defaultModel || 'ai-text-plugin';
  }

  public async complete(_prompt: string, options?: CompletionOptions): Promise<CompletionResult> {
    const generatorName = options?.model || this.defaultGenerator;
    const url = `https://perchance.org/api/generateList.php?generator=${encodeURIComponent(generatorName)}&count=1`;

    LoganLogger.getInstance().logInfo(`Querying Perchance public generator: ${generatorName}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LoganAgent/0.2.5',
      },
      signal: options?.abortSignal || options?.signal,
    });

    if (!response.ok) {
      throw new Error(`[PerchanceProvider] Public generator request failed with HTTP status ${response.status}`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error(`[PerchanceProvider] Failed to parse JSON response from generator "${generatorName}". Server may be offline or rate limited.`);
    }

    if (!Array.isArray(data) || data.length === 0 || typeof data[0] !== 'string') {
      throw new Error(`[PerchanceProvider] Generator "${generatorName}" returned empty or malformed data array.`);
    }

    const output = data[0];
    LoganLogger.getInstance().logRawLLM({ generator: generatorName, url }, output);
    return { content: output, toolCalls: [] };
  }

  public async *stream(prompt: string, options?: CompletionOptions): AsyncIterable<StreamChunk> {
    const result = await this.complete(prompt, options);
    if (result.content) {
      if (options?.onContentDelta) options.onContentDelta(result.content);
      yield { contentDelta: result.content };
    }
    yield { finishReason: 'stop' };
  }
}
