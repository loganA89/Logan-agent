import { Tool, ToolParameterSchema } from './types';
import { VectorStore, CodeChunk } from '../rag';
import { PlanRouter } from '../providers';

/**
 * Hybrid codebase semantic and keyword retrieval tool enabling Logan Agent to search local workspace code.
 */
export class SearchCodebaseTool implements Tool {
  public readonly name = 'search_codebase';
  public readonly description = 'Execute a hybrid semantic vector and keyword search across the indexed workspace codebase.';
  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language search query or specific symbol name (e.g. "user login authentication flow").',
      },
      topK: {
        type: 'number',
        description: 'Number of top code chunks to retrieve (defaults strictly to 5).',
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
      const regex = new RegExp(`\\b${token}\\b`, 'gi');
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

    const topK = typeof args.topK === 'number' ? Math.min(Math.max(1, args.topK), 5) : 5;
    const store = VectorStore.getInstance();
    const allChunks = await store.getAllChunks();

    if (allChunks.length === 0) {
      return `Codebase index is currently empty. No code chunks matched query "${query}".`;
    }

    const queryTokens = query
      .toLowerCase()
      .split(/\W+/)
      .filter((token) => token.length > 2);

    let queryEmbedding: number[] | undefined;
    try {
      const router = PlanRouter.getInstance();
      const { provider } = router.routeTask('EMBEDDING');
      if (provider.embed) {
        const [vector] = await provider.embed([query]);
        queryEmbedding = vector;
      }
    } catch {
      // Fallback to lexical search if embedding API fails
    }

    const scoredChunks = allChunks.map((chunk) => {
      const lexicalScore = this.computeLexicalScore(chunk, queryTokens);
      let vectorScore = 0;

      if (queryEmbedding && chunk.embedding && chunk.embedding.length > 0) {
        vectorScore = VectorStore.cosineSimilarity(queryEmbedding, chunk.embedding);
      }

      // Hybrid Reciprocal Rank Fusion / Weighted Combination (70% semantic, 30% lexical)
      const combinedScore = queryEmbedding ? vectorScore * 0.7 + lexicalScore * 0.3 : lexicalScore;
      return { chunk, score: combinedScore };
    });

    scoredChunks.sort((a, b) => b.score - a.score);
    const topResults = scoredChunks.slice(0, topK).filter((item) => item.score > 0);

    if (topResults.length === 0) {
      return `No relevant code chunks matched search query "${query}".`;
    }

    const formatted = topResults.map((res, idx) => {
      return `${idx + 1}. File: ${res.chunk.filePath} (Lines ${res.chunk.startLine}-${res.chunk.endLine})\n   Similarity Score: ${res.score.toFixed(3)}\n---\n${res.chunk.content}`;
    });

    return `Top ${topResults.length} Codebase Matches for "${query}":\n\n${formatted.join('\n\n==================================================\n\n')}`;
  }
}
