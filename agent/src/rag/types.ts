/**
 * Represents a discrete structural chunk of source code indexed for local semantic retrieval.
 */
export interface CodeChunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  hash: string;
  timestamp: number;
  embedding?: number[];
}

/**
 * Represents a ranked semantic search result returned from local vector evaluation.
 */
export interface SearchResult {
  chunk: CodeChunk;
  similarityScore: number;
}
