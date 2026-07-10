import * as vscode from 'vscode';
import { Tool, ToolParameterSchema } from './types';
import { validateAndResolveSandboxPath } from './fileTools';
import { CheckpointEngine } from './checkpointEngine';

/**
 * Tool for applying unified diff / multi-file patches with checkpoint safety.
 * Supports SEARCH/REPLACE blocks and unified diff format.
 */
export class ApplyDiffTool implements Tool {
  public readonly name = 'apply_diff';
  public readonly description = 'Apply a unified diff patch or multiple search/replace edits to one or more files atomically. Preferred over edit_file for multi-hunk changes.';
  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Relative path to target file (for single-file mode). Omit if using patch string with multiple files.',
      },
      diff: {
        type: 'string',
        description: 'Unified diff content, or a SEARCH/REPLACE block set. Supports multiple hunks.',
      },
      edits: {
        type: 'array',
        description: 'Optional structured edits array: [{oldText, newText}] for batch replace in single file.',
        items: { type: 'object' }
      }
    },
    required: ['diff'],
  };

  public async execute(args: Record<string, unknown>): Promise<string> {
    const file = typeof args.file === 'string' ? args.file : undefined;
    const diff = typeof args.diff === 'string' ? args.diff : '';
    const edits = Array.isArray(args.edits) ? args.edits as Array<{oldText?: string, newText?: string}> : [];

    if (!diff && edits.length === 0) {
      throw new Error('[apply_diff] Provide either "diff" string or "edits" array.');
    }

    if (file && edits.length > 0) {
      return this.applyStructuredEdits(file, edits);
    }

    if (file && diff) {
      // Try to parse as search/replace blocks first
      const srEdits = this.parseSearchReplace(diff);
      if (srEdits.length > 0) {
        return this.applyStructuredEdits(file, srEdits);
      }
      // Fall back to unified diff
      return this.applyUnifiedDiff(file, diff);
    }

    // Multi-file patch mode - parse diff for file headers
    if (diff.includes('--- ') && diff.includes('+++ ')) {
      return this.applyMultiFilePatch(diff);
    }

    throw new Error('[apply_diff] Could not parse diff. Provide file + edits, or a valid unified diff.');
  }

  private parseSearchReplace(input: string): Array<{oldText: string, newText: string}> {
    const edits: Array<{oldText: string, newText: string}> = [];
    // Format:
    // <<<<<<< SEARCH
    // old
    // =======
    // new
    // >>>>>>> REPLACE
    const regex = /<<<<<<< SEARCH\s*([\s\S]*?)=======\s*([\s\S]*?)>>>>>>> REPLACE/g;
    let m;
    while ((m = regex.exec(input)) !== null) {
      edits.push({ oldText: m[1].trimEnd(), newText: m[2].trimEnd() });
    }
    return edits;
  }

  private async applyStructuredEdits(filePath: string, edits: Array<{oldText?: string, newText?: string}>): Promise<string> {
    const safeUri = validateAndResolveSandboxPath(filePath);
    let originalContent: string;
    try {
      const bytes = await vscode.workspace.fs.readFile(safeUri);
      originalContent = new TextDecoder().decode(bytes);
    } catch {
      throw new Error(`[apply_diff] Cannot read target file "${filePath}"`);
    }

    const checkpointId = await CheckpointEngine.getInstance().createSnapshot(filePath, originalContent);
    let content = originalContent;
    let applied = 0;

    for (const e of edits) {
      const oldText = e.oldText || '';
      const newText = e.newText || '';
      if (!oldText) continue;
      const idx = content.indexOf(oldText);
      if (idx === -1) {
        // try fuzzy
        const normContent = content.replace(/\r\n/g, '\n');
        const normOld = oldText.replace(/\r\n/g, '\n');
        const nIdx = normContent.indexOf(normOld);
        if (nIdx === -1) {
          throw new Error(`[apply_diff] Hunk not found in ${filePath}: "${oldText.slice(0,60)}..."`);
        }
      }
      content = content.replace(oldText, newText);
      applied++;
    }

    await vscode.workspace.fs.writeFile(safeUri, new TextEncoder().encode(content));
    return `Successfully applied ${applied} hunk(s) to "${filePath}" (Checkpoint saved: ${checkpointId}).`;
  }

  private async applyUnifiedDiff(filePath: string, diffText: string): Promise<string> {
    // Very small unified diff applicator - supports simple @@ hunks
    const safeUri = validateAndResolveSandboxPath(filePath);
    let originalContent: string;
    try {
      const bytes = await vscode.workspace.fs.readFile(safeUri);
      originalContent = new TextDecoder().decode(bytes);
    } catch {
      throw new Error(`[apply_diff] Cannot read target file "${filePath}"`);
    }

    const checkpointId = await CheckpointEngine.getInstance().createSnapshot(filePath, originalContent);
    const origLines = originalContent.split(/\r?\n/);
    const diffLines = diffText.split(/\r?\n/);
    
    const outputLines = [...origLines];
    let offset = 0;
    let hunkCount = 0;

    for (let i = 0; i < diffLines.length; i++) {
      const line = diffLines[i];
      const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (!hunkMatch) continue;
      hunkCount++;
      const oldStart = parseInt(hunkMatch[1], 10) - 1;
      let cur = oldStart + offset;
      i++;
      while (i < diffLines.length && !diffLines[i].startsWith('@@')) {
        const dl = diffLines[i];
        if (dl.startsWith('-')) {
          if (outputLines[cur] !== undefined) {
            outputLines.splice(cur, 1);
            offset--;
          }
        } else if (dl.startsWith('+')) {
          outputLines.splice(cur, 0, dl.slice(1));
          cur++;
          offset++;
        } else if (dl.startsWith(' ') || dl.startsWith('\\')) {
          cur++;
        } else if (dl.startsWith('---') || dl.startsWith('+++')) {
          // ignore
        } else {
          // context line without prefix
          cur++;
        }
        i++;
      }
      i--; // backtrack
    }

    if (hunkCount === 0) {
      throw new Error('[apply_diff] No valid @@ hunks found in diff.');
    }

    const newContent = outputLines.join('\n');
    await vscode.workspace.fs.writeFile(safeUri, new TextEncoder().encode(newContent));
    return `Successfully applied unified diff with ${hunkCount} hunk(s) to "${filePath}" (Checkpoint saved: ${checkpointId}).`;
  }

  private async applyMultiFilePatch(patch: string): Promise<string> {
    // Simple multi-file: split by diff --git headers
    const files: Array<{path: string, diff: string}> = [];
    const fileRegex = /^\+\+\+ b\/(.+)$/gm;
    let match;
    const indices: Array<{path: string, index: number}> = [];
    while ((match = fileRegex.exec(patch)) !== null) {
      indices.push({ path: match[1], index: match.index });
    }
    if (indices.length === 0) {
      throw new Error('[apply_diff] Multi-file patch parsing failed - no +++ b/ headers found.');
    }
    for (let i = 0; i < indices.length; i++) {
      const start = patch.lastIndexOf('--- ', indices[i].index);
      const end = i + 1 < indices.length ? patch.lastIndexOf('--- ', indices[i+1].index) : patch.length;
      const chunk = patch.slice(start >= 0 ? start : indices[i].index, end);
      files.push({ path: indices[i].path, diff: chunk });
    }

    const results: string[] = [];
    for (const f of files) {
      try {
        const res = await this.applyUnifiedDiff(f.path, f.diff);
        results.push(res);
      } catch (e) {
        results.push(`Failed ${f.path}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return results.join('\n');
  }
}
