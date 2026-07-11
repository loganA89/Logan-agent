import { describe, it, expect } from 'vitest';
import { Chunker } from '../rag/Chunker';

describe('Chunker.chunkFile', () => {
  it('should return an empty array for empty content', () => {
    expect(Chunker.chunkFile('test.ts', '')).toEqual([]);
    expect(Chunker.chunkFile('test.ts', '   ')).toEqual([]);
  });

  it('should produce a single chunk for small files', () => {
    const content = 'console.log("Hello World");\nconsole.log("Testing Chunker");';
    const chunks = Chunker.chunkFile('test.ts', content);
    expect(chunks.length).toBe(1);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(2);
    expect(chunks[0].filePath).toBe('test.ts');
  });

  it('should produce multiple chunks with overlap for large files', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
    const content = lines.join('\n');
    const chunks = Chunker.chunkFile('test.ts', content);
    
    // BLOCK_LINES = 60, OVERLAP = 15, step = 45
    // Chunk 1: 1-60
    // Chunk 2: 46-100 (since 45 + 60 = 105, capped at 100)
    expect(chunks.length).toBe(2);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(60);
    expect(chunks[1].startLine).toBe(46);
    expect(chunks[1].endLine).toBe(100);
  });

  it('should include filePath in the chunk ID', () => {
    const content = 'const x = 10;';
    const chunks = Chunker.chunkFile('src/app.ts', content);
    expect(chunks[0].id).toContain('src/app.ts');
  });
});
