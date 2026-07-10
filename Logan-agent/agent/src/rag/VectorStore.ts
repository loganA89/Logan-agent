import * as vscode from 'vscode';
import { CodeChunk, SearchResult } from './types';

/**
 * Lightweight, serverless local vector database managing embedded code chunk storage
 * and executing fast in-memory cosine similarity search evaluations.
 */
export class VectorStore {
  private static instance: VectorStore | undefined;
  private fileChunks: Map<string, CodeChunk[]> = new Map();
  private loaded = false;

  private constructor() {}

  public static getInstance(): VectorStore {
    if (!VectorStore.instance) {
      VectorStore.instance = new VectorStore();
    }
    return VectorStore.instance;
  }

  private async getIndexUri(): Promise<vscode.Uri> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('[VectorStore] Cannot access index storage without an active workspace folder.');
    }
    const rootUri = workspaceFolders[0].uri;
    const loganDir = vscode.Uri.joinPath(rootUri, '.vscode', '.logan');
    await vscode.workspace.fs.createDirectory(loganDir);
    return vscode.Uri.joinPath(loganDir, 'index.json');
  }

  /**
   * Loads indexed code chunks and embeddings from local disk storage into runtime memory.
   */
  public async loadFromDisk(): Promise<void> {
    if (this.loaded) {
      return;
    }

    try {
      const uri = await this.getIndexUri();
      const rawBytes = await vscode.workspace.fs.readFile(uri);
      const jsonStr = new TextDecoder('utf-8').decode(rawBytes);
      const serializedMap = JSON.parse(jsonStr) as Record<string, CodeChunk[]>;

      this.fileChunks.clear();
      for (const [filePath, chunks] of Object.entries(serializedMap)) {
        this.fileChunks.set(filePath, chunks);
      }
      this.loaded = true;
    } catch {
      // Index file does not exist yet or is unreadable; initialize empty state
      this.fileChunks.clear();
      this.loaded = true;
    }
  }

  /**
   * Persists active memory chunk index directly to local workspace storage (.vscode/.logan/index.json).
   */
  public async saveToDisk(): Promise<void> {
    try {
      const uri = await this.getIndexUri();
      const serializedMap: Record<string, CodeChunk[]> = {};
      for (const [filePath, chunks] of this.fileChunks.entries()) {
        serializedMap[filePath] = chunks;
      }

      const payload = JSON.stringify(serializedMap, null, 2);
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(payload));
    } catch {
      // Ignore write failures if filesystem is locked or read-only
    }
  }

  /**
   * Inserts or updates the chunk embedding index for a specific workspace file.
   */
  public async upsertChunks(filePath: string, chunks: CodeChunk[]): Promise<void> {
    await this.loadFromDisk();
    this.fileChunks.set(filePath, [...chunks]);
    await this.saveToDisk();
  }

  /**
   * Removes all indexed chunks associated with a deleted workspace file.
   */
  public async deleteFile(filePath: string): Promise<void> {
    await this.loadFromDisk();
    if (this.fileChunks.has(filePath)) {
      this.fileChunks.delete(filePath);
      await this.saveToDisk();
    }
  }

  /**
   * Completely purges all stored embeddings and resets the local index database.
   */
  public async clearIndex(): Promise<void> {
    this.fileChunks.clear();
    await this.saveToDisk();
  }

  /**
   * Retrieves all indexed chunks currently tracked across the workspace.
   */
  public async getAllChunks(): Promise<CodeChunk[]> {
    await this.loadFromDisk();
    const all: CodeChunk[] = [];
    for (const chunks of this.fileChunks.values()) {
      all.push(...chunks);
    }
    return all;
  }

  /**
   * Computes the mathematical Cosine Similarity score between two float embedding vectors.
   *
   * @param vecA Query vector.
   * @param vecB Target indexed vector.
   * @returns Similarity score ranging from -1.0 to 1.0 (1.0 indicates exact directional similarity).
   */
  public static cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Executes dense vector semantic similarity search across all indexed workspace chunks.
   *
   * @param queryEmbedding Dense embedding vector generated for user search query.
   * @param topK Maximum number of results to return.
   */
  public async searchSimilar(queryEmbedding: number[], topK: number = 5): Promise<SearchResult[]> {
    const allChunks = await this.getAllChunks();
    const results: SearchResult[] = [];

    for (const chunk of allChunks) {
      if (!chunk.embedding || chunk.embedding.length === 0) {
        continue;
      }

      const score = VectorStore.cosineSimilarity(queryEmbedding, chunk.embedding);
      results.push({ chunk, similarityScore: score });
    }

    results.sort((a, b) => b.similarityScore - a.similarityScore);
    return results.slice(0, topK);
  }
}
