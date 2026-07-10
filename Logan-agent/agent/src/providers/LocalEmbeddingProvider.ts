import * as vscode from 'vscode';
import { AIProvider, CompletionOptions, CompletionResult, StreamChunk } from './types';
import { LoganLogger } from '../utils';

/**
 * Local on-device embedding provider using transformers.js (Xenova)
 * Model: Xenova/all-MiniLM-L6-v2 - 384 dimensions, fast, zero-cost, offline
 */
export class LocalEmbeddingProvider implements AIProvider {
  public readonly providerName = 'LocalEmbedding';
  private pipeline: any = null;
  private loadingPromise: Promise<any> | null = null;
  private readonly modelId: string;

  constructor(modelId = 'Xenova/all-MiniLM-L6-v2') {
    this.modelId = modelId;
  }

  private async getPipeline() {
    if (this.pipeline) return this.pipeline;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      const logger = LoganLogger.getInstance();
      logger.logInfo(`[LocalEmbedding] Loading local embedding model: ${this.modelId}`);
      
      // Dynamic import so extension works even if @xenova/transformers is not installed
      let transformers: any;
      try {
        transformers = await import('@xenova/transformers');
      } catch (e) {
        throw new Error('[LocalEmbedding] @xenova/transformers not installed. Run: npm install @xenova/transformers');
      }

      // Disable local model check, allow remote download on first run
      transformers.env.allowLocalModels = true;
      transformers.env.allowRemoteModels = true;
      
      // Store models in extension global storage
      try {
        const ext = vscode.extensions.getExtension('logan-team.logan-agent');
        if (ext) {
          const cacheDir = vscode.Uri.joinPath(ext.extensionUri, '.cache', 'transformers').fsPath;
          transformers.env.cacheDir = cacheDir;
        }
      } catch {}

      const pipe = await transformers.pipeline('feature-extraction', this.modelId, {
        quantized: true,
      });
      this.pipeline = pipe;
      logger.logInfo('[LocalEmbedding] Model loaded successfully');
      return pipe;
    })();

    return this.loadingPromise;
  }

  public async complete(prompt: string, _options?: CompletionOptions): Promise<CompletionResult> {
    // Embedding provider does not do chat completion, just echo
    return { content: prompt, toolCalls: [] };
  }

  public async *stream(prompt: string, options?: CompletionOptions): AsyncIterable<StreamChunk> {
    if (options?.onContentDelta) options.onContentDelta(prompt);
    yield { contentDelta: prompt, finishReason: 'stop' };
  }

  public async embed(texts: string[], _options?: CompletionOptions): Promise<number[][]> {
    if (texts.length === 0) return [];
    const pipe = await this.getPipeline();
    
    const results: number[][] = [];
    // Batch in small groups to avoid OOM
    const batchSize = 32;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const output = await pipe(batch, { pooling: 'mean', normalize: true });
      // output is a Tensor, convert to arrays
      const batchEmbeddings: number[][] = output.tolist();
      results.push(...batchEmbeddings);
    }
    return results;
  }
}
