/**
 * Sanitizes and compacts raw shell terminal output streams to prevent LLM context overflow.
 *
 * @param rawLog Raw string output captured from stdout/stderr streams.
 * @returns Token-optimized, sanitized log string.
 */
export function scrubTerminalOutput(rawLog: string): string {
  if (!rawLog) {
    return '';
  }

  // Stage 1: Strip ANSI control codes and escape sequences
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
  const stripped = rawLog.replace(ansiRegex, '');

  // Stage 2: Split lines and deduplicate contiguous repetitive stack trace or warning lines
  const rawLines = stripped.split(/\r?\n/);
  const deduplicatedLines: string[] = [];
  let previousLine = '';
  let repeatCount = 0;

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (trimmed !== '' && trimmed === previousLine) {
      repeatCount++;
    } else {
      if (repeatCount > 0) {
        deduplicatedLines.push(`[... repeated ${repeatCount} times ...]`);
        repeatCount = 0;
      }
      deduplicatedLines.push(line);
      previousLine = trimmed;
    }
  }

  if (repeatCount > 0) {
    deduplicatedLines.push(`[... repeated ${repeatCount} times ...]`);
  }

  // Stage 3: Threshold slicing algorithm for logs exceeding 100 lines
  if (deduplicatedLines.length > 100) {
    const head = deduplicatedLines.slice(0, 30);
    const tail = deduplicatedLines.slice(-50);
    const removedCount = deduplicatedLines.length - 80;
    return [
      ...head,
      `[... truncated by Logan Token Scrubber (${removedCount} lines removed) to save context ...]`,
      ...tail,
    ].join('\n');
  }

  return deduplicatedLines.join('\n');
}
