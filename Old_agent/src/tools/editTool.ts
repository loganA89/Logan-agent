import * as vscode from 'vscode';
import * as path from 'path';
import { Tool, ToolParameterSchema } from './types';
import { validateAndResolveSandboxPath } from './fileTools';
import { CheckpointEngine } from './checkpointEngine';

/**
 * Tool implementation for modifying workspace files via search-and-replace blocks.
 * Enforces pre-edit snapshot creation before writing to disk.
 */
export class EditFileTool implements Tool {
  public readonly name = 'edit_file';
  public readonly description = 'Modify a workspace file by replacing a target text block with new content.';
  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to the target workspace file.',
      },
      oldText: {
        type: 'string',
        description: 'Exact or whitespace-tolerant block currently present in the file to be replaced.',
      },
      newText: {
        type: 'string',
        description: 'Replacement text block.',
      },
    },
    required: ['path', 'oldText', 'newText'],
  };

  /**
   * Attempts to locate oldText inside content using exact matching followed by normalized line endings.
   */
  private findMatchIndex(content: string, oldText: string): { index: number; length: number } | null {
    const exactIndex = content.indexOf(oldText);
    if (exactIndex !== -1) {
      return { index: exactIndex, length: oldText.length };
    }

    // Attempt matching after normalizing CRLF to LF
    const normalizedContent = content.replace(/\r\n/g, '\n');
    const normalizedOld = oldText.replace(/\r\n/g, '\n');
    const normIndex = normalizedContent.indexOf(normalizedOld);

    if (normIndex !== -1) {
      // Map index back to original content coordinates
      let originalIdx = 0;
      let normIdx = 0;
      while (normIdx < normIndex && originalIdx < content.length) {
        if (content[originalIdx] === '\r' && content[originalIdx + 1] === '\n') {
          originalIdx += 2;
          normIdx += 1;
        } else {
          originalIdx += 1;
          normIdx += 1;
        }
      }

      // Calculate original match length
      let origLen = 0;
      let normLen = 0;
      while (normLen < normalizedOld.length && (originalIdx + origLen) < content.length) {
        if (content[originalIdx + origLen] === '\r' && content[originalIdx + origLen + 1] === '\n') {
          origLen += 2;
          normLen += 1;
        } else {
          origLen += 1;
          normLen += 1;
        }
      }

      return { index: originalIdx, length: origLen };
    }

    // Attempt whitespace-tolerant line matching
    const contentLines = content.split(/\r?\n/);
    const oldLines = oldText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

    if (oldLines.length === 0) {
      return null;
    }

    for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
      let matched = true;
      for (let j = 0; j < oldLines.length; j++) {
        if (contentLines[i + j].trim() !== oldLines[j]) {
          matched = false;
          break;
        }
      }

      if (matched) {
        const prefixLines = contentLines.slice(0, i);
        const matchLines = contentLines.slice(i, i + oldLines.length);
        const prefixStr = prefixLines.length > 0 ? prefixLines.join('\n') + '\n' : '';
        const matchStr = matchLines.join('\n');
        return { index: prefixStr.length, length: matchStr.length };
      }
    }

    return null;
  }

  public async execute(args: Record<string, unknown>): Promise<string> {
    const rawPath = typeof args.path === 'string' ? args.path : undefined;
    const oldText = typeof args.oldText === 'string' ? args.oldText : undefined;
    const newText = typeof args.newText === 'string' ? args.newText : undefined;

    if (!rawPath || oldText === undefined || newText === undefined) {
      throw new Error('[edit_file] Missing required parameters "path", "oldText", or "newText".');
    }

    const safeUri = validateAndResolveSandboxPath(rawPath);
    let originalContent: string;
    try {
      const uint8Array = await vscode.workspace.fs.readFile(safeUri);
      originalContent = new TextDecoder('utf-8').decode(uint8Array);
    } catch {
      throw new Error(`[edit_file] Cannot read target file "${rawPath}". File may not exist.`);
    }

    const match = this.findMatchIndex(originalContent, oldText);
    if (!match) {
      throw new Error(`[edit_file] Could not find exact or fuzzy match for oldText block in file "${rawPath}".`);
    }

    // MANDATORY PRE-EDIT STEP: Create automated Time-Travel Checkpoint snapshot
    const checkpointId = await CheckpointEngine.getInstance().createSnapshot(rawPath, originalContent);

    const modifiedContent =
      originalContent.slice(0, match.index) + newText + originalContent.slice(match.index + match.length);

    try {
      await vscode.workspace.fs.writeFile(safeUri, new TextEncoder().encode(modifiedContent));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[edit_file] Failed to write modified content to disk: ${msg}`);
    }

    return `Successfully modified "${rawPath}" (Checkpoint saved: ${checkpointId}).`;
  }

  /**
   * Opens a native side-by-side diff review panel comparing the original pre-edit state
   * with the modified file on disk.
   *
   * @param filePath Relative workspace file path.
   * @param originalContent Exact pre-edit string content.
   */
  public static async openDiffReview(filePath: string, originalContent: string): Promise<void> {
    const modifiedUri = validateAndResolveSandboxPath(filePath);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri;
    if (!workspaceRoot) {
      return;
    }

    const diffDir = vscode.Uri.joinPath(workspaceRoot, '.vscode', '.logan', 'diffs');
    await vscode.workspace.fs.createDirectory(diffDir);

    const fileName = path.basename(filePath);
    const originalUri = vscode.Uri.joinPath(diffDir, `original_${Date.now()}_${fileName}`);
    await vscode.workspace.fs.writeFile(originalUri, new TextEncoder().encode(originalContent));

    await vscode.commands.executeCommand(
      'vscode.diff',
      originalUri,
      modifiedUri,
      `Logan Review: ${fileName} (Proposed Edit)`
    );
  }
}
