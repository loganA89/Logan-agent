import { Tool, ToolParameterSchema } from './types';
import { VectorStore, CodeChunk } from '../rag';
import { PlanRouter } from '../providers';

/**
 * Hybrid codebase semantic and keyword retrieval tool enabling Logan Agent to search local workspace code.
 */
export class SearchCodebaseTool implements Tool {
  public readonly name = 'search_codebase';
  public readonly description = 'Execute a hybrid semantic vector and keyword search across the indexed workspace codebase. Uses local embeddings (all-MiniLM-L6-v2) by default, falls back to OpenAI text-embedding-3-small if configured.';
  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language search query or specific symbol name (e.g. "user login authentication flow").',
      },
      topK: {
        type: 'number',
        description: 'Number of top code chunks to retrieve (default 8, max 20).',
      },
    },
    required: ['query'],
  };

  /**
   * Computes lightweight keyword density match score for lexical ranking.
   */
  private computeLexicalScore(chunk: CodeChunk, queryTokens: string[]): number {
    if (queryTokens.length === 0) {
      return 0;
    }

    const contentLower = chunk.content.toLowerCase();
    const pathLower = chunk.filePath.toLowerCase();
    let matches = 0;

    for (const token of queryTokens) {
      if (pathLower.includes(token)) {
        matches += 3; // Boost symbol or file name matches
      }
      const regex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const count = (contentLower.match(regex) || []).length;
      matches += Math.min(count, 5);
    }

    return matches / (queryTokens.length * 5);
  }

  public async execute(args: Record<string, unknown>): Promise<string> {
    const query = typeof args.query === 'string' ? args.query : undefined;
    if (!query) {
      throw new Error('[search_codebase] Missing required parameter "query".');
    }

    const topK = typeof args.topK === 'number' ? Math.min(Math.max(1, args.topK), 20) : 8;
    const store = VectorStore.getInstance();
    const allChunks = await store.getAllChunks();

    if (allChunks.length === 0) {
      return `Codebase index is currently empty. Run a task first to trigger JIT indexing, or check EMBEDDING tier configuration (currently defaults to local transformers.js). No code chunks matched query "${query}".`;
    }

    const queryTokens = query
      .toLowerCase()
      .split(/\W+/)
      .filter((token) => token.length > 2);

    let queryEmbedding: number[] | undefined;
    let embeddingModel = 'lexical-only';
    try {
      const router = PlanRouter.getInstance();
      const { provider, model } = router.routeTask('EMBEDDING');
      if (provider.embed) {
        const [vector] = await provider.embed([query]);
        queryEmbedding = vector;
        embeddingModel = model || 'local';
      }
    } catch {
      // Fallback to lexical search if embedding API fails
    }

    const scoredChunks = allChunks.map((chunk) => {
      const lexicalScore = this.computeLexicalScore(chunk, queryTokens);
      let vectorScore = 0;

      if (queryEmbedding && chunk.embedding && chunk.embedding.length > 0 && chunk.embedding.length === queryEmbedding.length) {
        vectorScore = VectorStore.cosineSimilarity(queryEmbedding, chunk.embedding);
        // Clamp negative scores
        vectorScore = Math.max(0, vectorScore);
      }

      // Hybrid RRF / Weighted Combination (65% semantic, 35% lexical)
      const combinedScore = queryEmbedding ? vectorScore * 0.65 + lexicalScore * 0.35 : lexicalScore;
      return { chunk, score: combinedScore, vectorScore, lexicalScore };
    });

    scoredChunks.sort((a, b) => b.score - a.score);
    const topResults = scoredChunks.slice(0, topK).filter((item) => item.score > 0.01);

    if (topResults.length === 0) {
      return `No relevant code chunks matched search query "${query}". Index contains ${allChunks.length} chunks. Try a broader query or re-index.`;
    }

    const formatted = topResults.map((res, idx) => {
      return `${idx + 1}. ${res.chunk.filePath}:${res.chunk.startLine}-${res.chunk.endLine}  score=${res.score.toFixed(3)} (vec=${res.vectorScore.toFixed(3)}, lex=${res.lexicalScore.toFixed(3)})\n---\n${res.chunk.content.slice(0, 1200)}`;
    });

    return `Top ${topResults.length} Codebase Matches for "${query}" [embedding: ${embeddingModel}, index: ${allChunks.length} chunks]:\n\n${formatted.join('\n\n==================================================\n\n')}`;
  }
}
