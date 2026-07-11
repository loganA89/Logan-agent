import { describe, it, expect } from 'vitest';
import { scrubTerminalOutput } from '../tools/terminalScrubber';

describe('scrubTerminalOutput', () => {
  it('should return an empty string for empty input', () => {
    expect(scrubTerminalOutput('')).toBe('');
    expect(scrubTerminalOutput(null as any)).toBe('');
  });

  it('should strip ANSI escape sequences', () => {
    const input = '\x1b[31mError:\x1b[0m Something went wrong';
    expect(scrubTerminalOutput(input)).toBe('Error: Something went wrong');
  });

  it('should deduplicate contiguous repeated lines', () => {
    const input = 'Line 1\nLine 2\nLine 2\nLine 2\nLine 3';
    const expected = 'Line 1\nLine 2\n[... repeated 2 times ...]\nLine 3';
    expect(scrubTerminalOutput(input)).toBe(expected);
  });

  it('should truncate logs exceeding 100 lines', () => {
    const lines = Array.from({ length: 150 }, (_, i) => `Log line ${i + 1}`);
    const result = scrubTerminalOutput(lines.join('\n'));
    const resultLines = result.split('\n');
    
    expect(resultLines.length).toBe(81); // 30 head + 1 truncation msg + 50 tail
    expect(resultLines[0]).toBe('Log line 1');
    expect(resultLines[30]).toContain('truncated by Logan Token Scrubber');
    expect(resultLines[resultLines.length - 1]).toBe('Log line 150');
  });
});
