/**
 * Represents pricing and token usage metrics returned by AI providers.
 */
export interface TokenUsageMetrics {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  totalTokens: number;
  estimatedCostUSD?: number;
}

/**
 * Cache control configuration for Anthropic and compatible providers.
 */
export interface CacheBreakpoint {
  type: 'ephemeral';
}

/**
 * Configuration options for completion and streaming requests.
 */
export interface CompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  systemPrompt?: string;
  cacheBreakpoints?: boolean | CacheBreakpoint;
  stopSequences?: string[];
  signal?: AbortSignal;
  abortSignal?: AbortSignal;
  onUsageMetrics?: (metrics: TokenUsageMetrics) => void;
  onReasoningDelta?: (delta: string) => void;
  messages?: Array<{ role: string; content: string }>;
  tools?: Array<{ name: string; description: string; inputSchema: unknown }>;
}

/**
 * Common configuration parameters for initializing AI provider adapters.
 */
export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  customHeaders?: Record<string, string>;
}

/**
 * Normalized interface required for all AI provider adapters in Logan Agent.
 */
export interface AIProvider {
  readonly providerName: string;

  /**
   * Execute a synchronous (buffered) text completion request.
   *
   * @param prompt The incoming prompt or user instruction string.
   * @param options Optional configuration and override options.
   */
  complete(prompt: string, options?: CompletionOptions): Promise<string>;

  /**
   * Execute an asynchronous streaming completion request.
   *
   * @param prompt The incoming prompt or user instruction string.
   * @param options Optional configuration and override options.
   */
  stream(prompt: string, options?: CompletionOptions): AsyncIterable<string>;

  /**
   * Generate dense numerical embedding vectors for code or query text strings.
   *
   * @param texts Array of strings to embed.
   * @param options Optional configuration containing embedding model identifier.
   */
  embed?(texts: string[], options?: CompletionOptions): Promise<number[][]>;
}
