import * as crypto from 'crypto';
import { CodeChunk } from './types';

/**
 * Intelligent source code chunker breaking files into semantic blocks or sliding line intervals.
 */
export class Chunker {
  private static readonly BLOCK_LINES = 60;
  private static readonly OVERLAP_LINES = 15;

  private static computeHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Partitions source file contents into structured CodeChunk blocks.
   *
   * @param filePath Relative or absolute path identifier.
   * @param content Raw string content of the source file.
   */
  public static chunkFile(filePath: string, content: string): CodeChunk[] {
    const lines = content.split(/\r?\n/);
    if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) {
      return [];
    }

    const chunks: CodeChunk[] = [];
    const step = Chunker.BLOCK_LINES - Chunker.OVERLAP_LINES;

    for (let i = 0; i < lines.length; i += step) {
      const startLine = i + 1;
      const endLine = Math.min(lines.length, i + Chunker.BLOCK_LINES);
      const chunkLines = lines.slice(i, endLine);
      const chunkContent = chunkLines.join('\n').trim();

      if (chunkContent.length === 0) {
        continue;
      }

      const chunkHash = Chunker.computeHash(chunkContent);
      const chunkId = `${filePath}:${startLine}-${endLine}:${chunkHash.substring(0, 8)}`;

      chunks.push({
        id: chunkId,
        filePath,
        startLine,
        endLine,
        content: chunkContent,
        hash: chunkHash,
        timestamp: Date.now(),
      });

      if (endLine === lines.length) {
        break;
      }
    }

    return chunks;
  }
}
