import * as vscode from 'vscode';
import * as path from 'path';
import { Tool, ToolParameterSchema } from './types';
import { CheckpointEngine } from './checkpointEngine';

/**
 * Validates that a target file path resolves strictly within an active workspace folder boundary.
 * Prevents path traversal directory escapes (e.g. '../../etc/passwd').
 *
 * @param targetPath Relative or absolute path string provided by the agent.
 * @returns Resolved safe vscode.Uri object.
 */
export function validateAndResolveSandboxPath(targetPath: string): vscode.Uri {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error('[Sandbox Security Error] No active workspace folder found to scope file operations.');
  }

  const primaryWorkspace = workspaceFolders[0].uri.fsPath;
  const normalizedTarget = path.isAbsolute(targetPath)
    ? path.normalize(targetPath)
    : path.normalize(path.join(primaryWorkspace, targetPath));

  const resolvedWorkspaceRoot = path.normalize(primaryWorkspace);
  if (!normalizedTarget.startsWith(resolvedWorkspaceRoot)) {
    throw new Error(`[Sandbox Security Error] Path traversal violation detected. Target path "${targetPath}" resolves outside active workspace boundary.`);
  }

  return vscode.Uri.file(normalizedTarget);
}

/**
 * Tool implementation for reading workspace file content.
 */
export class ReadFileTool implements Tool {
  public readonly name = 'read_file';
  public readonly description = 'Read the full text content of a file located within the workspace boundary.';
  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to the workspace file (e.g., "src/index.ts").',
      },
      startLine: {
        type: 'number',
        description: 'Optional 1-indexed line number to start reading from.',
      },
      endLine: {
        type: 'number',
        description: 'Optional 1-indexed line number to stop reading at.',
      },
    },
    required: ['path'],
  };

  public async execute(args: Record<string, unknown>): Promise<string> {
    const rawPath = typeof args.path === 'string' ? args.path : undefined;
    if (!rawPath) {
      throw new Error('[read_file] Missing required parameter "path".');
    }

    const safeUri = validateAndResolveSandboxPath(rawPath);
    try {
      const uint8Array = await vscode.workspace.fs.readFile(safeUri);
      const content = new TextDecoder('utf-8').decode(uint8Array);

      const startLine = typeof args.startLine === 'number' ? args.startLine : undefined;
      const endLine = typeof args.endLine === 'number' ? args.endLine : undefined;

      if (startLine !== undefined || endLine !== undefined) {
        const lines = content.split(/\r?\n/);
        const startIdx = Math.max(0, (startLine || 1) - 1);
        const endIdx = endLine !== undefined ? Math.min(lines.length, endLine) : lines.length;
        const sliced = lines.slice(startIdx, endIdx);
        return sliced.map((line, i) => `${startIdx + i + 1} | ${line}`).join('\n');
      }

      return content;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[read_file] Failed to read file "${rawPath}": ${msg}`);
    }
  }
}

/**
 * Tool implementation for creating or overwriting workspace files from scratch.
 */
export class CreateFileTool implements Tool {
  public readonly name = 'create_file';
  public readonly description = 'Create a new file in the workspace or overwrite an existing file with complete text content. Automatically creates parent directories.';
  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path where the new file should be created (e.g. "src/components/Header.tsx").',
      },
      content: {
        type: 'string',
        description: 'Full text content to write into the file.',
      },
    },
    required: ['path', 'content'],
  };

  public async execute(args: Record<string, unknown>): Promise<string> {
    const rawPath = typeof args.path === 'string' ? args.path : undefined;
    const content = typeof args.content === 'string' ? args.content : undefined;

    if (!rawPath || content === undefined) {
      throw new Error('[create_file] Missing required parameters "path" or "content".');
    }

    const safeUri = validateAndResolveSandboxPath(rawPath);
    let originalContent = '';
    try {
      const existingBytes = await vscode.workspace.fs.readFile(safeUri);
      originalContent = new TextDecoder('utf-8').decode(existingBytes);
    } catch {
      // File does not exist yet; original content is empty string
    }

    const checkpointId = await CheckpointEngine.getInstance().createSnapshot(rawPath, originalContent);

    try {
      const parentDir = vscode.Uri.file(path.dirname(safeUri.fsPath));
      await vscode.workspace.fs.createDirectory(parentDir);
      await vscode.workspace.fs.writeFile(safeUri, new TextEncoder().encode(content));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[create_file] Failed to write file "${rawPath}": ${msg}`);
    }

    return `Successfully created file "${rawPath}" (Checkpoint saved: ${checkpointId}).`;
  }
}

/**
 * Tool implementation for listing entries within a workspace directory.
 */
export class ListDirTool implements Tool {
  public readonly name = 'list_dir';
  public readonly description = 'List files and subdirectories inside a workspace directory folder.';
  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to directory. Use "." or "" for workspace root.',
      },
    },
    required: ['path'],
  };

  public async execute(args: Record<string, unknown>): Promise<string> {
    const rawPath = typeof args.path === 'string' ? args.path : '.';
    const safeUri = validateAndResolveSandboxPath(rawPath);

    try {
      const entries = await vscode.workspace.fs.readDirectory(safeUri);
      if (entries.length === 0) {
        return `Directory "${rawPath}" is empty.`;
      }

      const formatted = entries
        .sort((a, b) => {
          if (a[1] !== b[1]) {
            return b[1] - a[1]; // Directories first
          }
          return a[0].localeCompare(b[0]);
        })
        .map(([name, type]) => {
          const typeStr = type === vscode.FileType.Directory ? '[DIR]' : type === vscode.FileType.SymbolicLink ? '[SYMLINK]' : '[FILE]';
          return `${typeStr.padEnd(10)} ${name}`;
        });

      return `Entries in "${rawPath}":\n${formatted.join('\n')}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[list_dir] Failed to list directory "${rawPath}": ${msg}`);
    }
  }
}

/**
 * Tool implementation for searching filenames across the workspace.
 */
export class SearchFilesTool implements Tool {
  public readonly name = 'search_files';
  public readonly description = 'Search for workspace files matching a glob or filename pattern.';
  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern (e.g., "**/*.ts") or filename search string.',
      },
      excludePattern: {
        type: 'string',
        description: 'Optional glob pattern to exclude (defaults to node_modules/dist).',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default 50).',
      },
    },
    required: ['pattern'],
  };

  public async execute(args: Record<string, unknown>): Promise<string> {
    const pattern = typeof args.pattern === 'string' ? args.pattern : undefined;
    if (!pattern) {
      throw new Error('[search_files] Missing required parameter "pattern".');
    }

    const exclude = typeof args.excludePattern === 'string' ? args.excludePattern : '**/node_modules/**';
    const maxResults = typeof args.maxResults === 'number' ? args.maxResults : 50;

    try {
      const uris = await vscode.workspace.findFiles(pattern, exclude, maxResults);
      if (uris.length === 0) {
        return `No workspace files matched pattern "${pattern}".`;
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
      const relativePaths = uris.map((uri) => path.relative(workspaceRoot, uri.fsPath));
      return `Found ${uris.length} file(s) matching "${pattern}":\n${relativePaths.join('\n')}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[search_files] Search failed for pattern "${pattern}": ${msg}`);
    }
  }
}
