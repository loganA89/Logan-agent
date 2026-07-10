import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { VectorStore } from './VectorStore';
import { Chunker } from './Chunker';
import { PlanRouter } from '../providers';
import { LoganLogger } from '../utils';

/**
 * Automated Just-In-Time (JIT) codebase indexer scanning workspace directories and synchronizing
 * local vector storage strictly during agent task execution milestones.
 */
export class FileIndexer {
  private static instance: FileIndexer | undefined;
  private isIndexing = false;

  private constructor() {}

  public static getInstance(): FileIndexer {
    if (!FileIndexer.instance) {
      FileIndexer.instance = new FileIndexer();
    }
    return FileIndexer.instance;
  }

  private computeFileHash(buffer: Uint8Array): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Deprecated no-op: 24/7 background watchers disabled in favor of JIT indexing.
   */
  public startWatcher(_context: vscode.ExtensionContext): void {
    LoganLogger.getInstance().logInfo('Background file watchers disabled; JIT indexing active.');
  }

  /**
   * Scans dirty or modified workspace source files and synchronizes their vector embeddings JIT.
   */
  public async syncDirtyFiles(): Promise<void> {
    if (this.isIndexing) {
      return;
    }

    this.isIndexing = true;
    try {
      const files = await vscode.workspace.findFiles(
        '**/*.{ts,js,jsx,tsx,py,go,rs,java,c,cpp,h,hpp,cs,md,json}',
        '**/{node_modules,.git,out,dist,build,.vscode}/**'
      );

      for (const uri of files) {
        await this.indexSingleFile(uri);
      }
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * Evaluates and incrementally indexes a single file URI if its content hash state has changed.
   */
  public async indexSingleFile(uri: vscode.Uri): Promise<void> {
    const relativePath = vscode.workspace.asRelativePath(uri, false);
    if (relativePath.includes('node_modules') || relativePath.includes('.git') || relativePath.startsWith('out/') || relativePath.startsWith('dist/')) {
      return;
    }

    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type !== vscode.FileType.File) {
        return;
      }

      const rawBytes = await vscode.workspace.fs.readFile(uri);
      const textContent = new TextDecoder('utf-8').decode(rawBytes);

      // Strict Validation: Skip empty files
      if (textContent.trim().length === 0) {
        const store = VectorStore.getInstance();
        await store.deleteFile(relativePath);
        return;
      }

      const fileHash = this.computeFileHash(rawBytes);
      const store = VectorStore.getInstance();
      const existingChunks = await store.getAllChunks();
      const fileChunks = existingChunks.filter((c) => c.filePath === relativePath);

      // Skip if existing chunks match file hash signature exactly
      if (fileChunks.length > 0 && fileChunks.every((c) => c.hash.startsWith(fileHash.substring(0, 8)))) {
        return;
      }

      const chunks = Chunker.chunkFile(relativePath, textContent);
      if (chunks.length === 0) {
        await store.deleteFile(relativePath);
        return;
      }

      const router = PlanRouter.getInstance();
      const { provider, model } = router.routeTask('EMBEDDING');

      if (provider.embed) {
        const texts = chunks.map((c) => c.content.slice(0, 8000)); // truncate to avoid token overflow
        const vectors: number[][] = [];
        // Batch embedding to respect API rate limits (OpenAI max ~2048, local ~32)
        const batchSize = model.includes('MiniLM') || model.includes('local') ? 32 : 128;
        
        for (let i = 0; i < texts.length; i += batchSize) {
          const batch = texts.slice(i, i + batchSize);
          try {
            const batchVectors = await provider.embed(batch);
            vectors.push(...batchVectors);
          } catch (embedErr) {
            LoganLogger.getInstance().logError(`Embedding batch failed for ${relativePath} [${i}-${i+batch.length}]`, embedErr);
            // Pad with zero vectors to keep alignment
            for (let j = 0; j < batch.length; j++) vectors.push([]);
          }
        }

        // Validate dimension consistency
        let expectedDim = 0;
        for (let idx = 0; idx < chunks.length; idx++) {
          const vec = vectors[idx] || [];
          if (vec.length > 0) {
            if (expectedDim === 0) expectedDim = vec.length;
            // L2 normalize if not already normalized (local provider does it, OpenAI does not)
            const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
            chunks[idx].embedding = norm > 0.99 && norm < 1.01 ? vec : vec.map(v => v / (norm || 1));
          } else {
            chunks[idx].embedding = [];
          }
        }
        if (expectedDim > 0) {
          LoganLogger.getInstance().logInfo(`Embedded ${chunks.length} chunks (${expectedDim}d) for ${relativePath} via ${model || 'local'}`);
        }
      }

      await store.upsertChunks(relativePath, chunks);
      LoganLogger.getInstance().logInfo(`JIT Indexed ${chunks.length} chunk(s) for dirty file: ${relativePath}`);
    } catch (error) {
      LoganLogger.getInstance().logError(`Failed to JIT index file ${relativePath}`, error);
    }
  }

  /**
   * Executes a full sweep across all workspace source files.
   */
  public async indexWorkspace(onProgress?: (processed: number, total: number) => void): Promise<void> {
    if (this.isIndexing) {
      return;
    }

    this.isIndexing = true;
    try {
      const files = await vscode.workspace.findFiles(
        '**/*.{ts,js,jsx,tsx,py,go,rs,java,c,cpp,h,hpp,cs,md,json}',
        '**/{node_modules,.git,out,dist,build,.vscode}/**'
      );

      let processed = 0;
      for (const uri of files) {
        await this.indexSingleFile(uri);
        processed++;
        if (onProgress) {
          onProgress(processed, files.length);
        }
      }
    } finally {
      this.isIndexing = false;
    }
  }
}
