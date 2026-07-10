import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as util from 'util';
import * as path from 'path';
import { Tool, ToolParameterSchema } from './types';

const execFile = util.promisify(cp.execFile);

async function getWorkspaceRoot(): Promise<string> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new Error('[git] No workspace folder open');
  }
  return folders[0].uri.fsPath;
}

async function runGit(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout, stderr } = await execFile('git', args, { cwd, timeout: 15000, maxBuffer: 10 * 1024 * 1024 });
    return (stdout + (stderr ? `\n${stderr}` : '')).trim();
  } catch (e: any) {
    const msg = e.stderr || e.stdout || e.message || String(e);
    throw new Error(`git ${args.join(' ')} failed: ${msg}`);
  }
}

function sanitizePath(p: string, root: string): string {
  const resolved = path.resolve(root, p);
  const rel = path.relative(root, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`[git] Path escapes workspace: ${p}`);
  }
  return rel.replace(/\\/g, '/');
}

/**
 * git status – show working tree status
 */
export class GitStatusTool implements Tool {
  public readonly name = 'git_status';
  public readonly description = 'Get git working tree status – shows modified, staged, untracked files. Use before committing.';
  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {},
    required: []
  };

  public async execute(_args: Record<string, unknown>): Promise<string> {
    const root = await getWorkspaceRoot();
    const status = await runGit(['status', '--porcelain=v1', '--branch'], root);
    if (!status.trim()) return 'Working tree clean – nothing to commit.';
    return `Git status:\n${status}`;
  }
}

/**
 * git_diff – show changes
 */
export class GitDiffTool implements Tool {
  public readonly name = 'git_diff';
  public readonly description = 'Show git diff. Can diff unstaged changes, staged changes, or a specific file / commit. Essential for code review before commit.';
  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: 'What to diff: "staged" for --cached, a commit SHA / HEAD~1, or a file path. Omit for unstaged working tree diff.',
      },
      filePath: {
        type: 'string',
        description: 'Optional specific file path to diff (relative to workspace root).',
      },
      staged: {
        type: 'boolean',
        description: 'If true, show staged diff (git diff --cached). Equivalent to target="staged".',
      }
    },
    required: []
  };

  public async execute(args: Record<string, unknown>): Promise<string> {
    const root = await getWorkspaceRoot();
    const target = typeof args.target === 'string' ? args.target : undefined;
    const filePath = typeof args.filePath === 'string' ? args.filePath : undefined;
    const staged = args.staged === true || target === 'staged';

    const gitArgs = ['diff', '--no-color', '--unified=3'];
    if (staged) gitArgs.push('--cached');
    
    if (target && target !== 'staged') {
      // Allow HEAD, HEAD~n, commit SHA (basic validation)
      if (!/^[a-zA-Z0-9_.\/~^-]+$/.test(target)) {
        throw new Error('[git_diff] Invalid target characters');
      }
      gitArgs.push(target);
    }

    if (filePath) {
      const safe = sanitizePath(filePath, root);
      gitArgs.push('--', safe);
    }

    const diff = await runGit(gitArgs, root);
    if (!diff.trim()) return 'No changes to show (diff empty).';
    // Truncate very large diffs to protect context window
    if (diff.length > 12000) {
      return diff.slice(0, 12000) + `\n\n... [diff truncated, ${diff.length} total chars]`;
    }
    return diff;
  }
}

/**
 * git_commit – stage and commit
 */
export class GitCommitTool implements Tool {
  public readonly name = 'git_commit';
  public readonly description = 'Create a git commit. Automatically stages specified files (or all tracked changes with all=true). Always run git_status / git_diff before committing.';
  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Commit message – concise, imperative mood, e.g. "fix: handle null user in auth middleware"',
      },
      files: {
        type: 'array',
        description: 'Optional list of specific files to stage and commit (relative paths). If omitted and all=true, commits all tracked changes.',
        items: { type: 'string' }
      },
      all: {
        type: 'boolean',
        description: 'If true, stage all tracked modified files (git commit -a). Default false.',
      },
      allowEmpty: {
        type: 'boolean',
        description: 'Allow empty commit. Default false.',
      }
    },
    required: ['message']
  };

  public async execute(args: Record<string, unknown>): Promise<string> {
    const message = typeof args.message === 'string' ? args.message.trim() : '';
    if (!message) throw new Error('[git_commit] Commit message is required');
    if (message.length > 2000) throw new Error('[git_commit] Commit message too long (>2000 chars)');

    const files = Array.isArray(args.files) ? (args.files as unknown[]).filter(f => typeof f === 'string') as string[] : [];
    const all = args.all === true;
    const allowEmpty = args.allowEmpty === true;

    const root = await getWorkspaceRoot();

    // Verify we're in a git repo
    try {
      await runGit(['rev-parse', '--is-inside-work-tree'], root);
    } catch {
      throw new Error('[git_commit] Current workspace is not a git repository');
    }

    // Stage files
    if (files.length > 0) {
      const safeFiles = files.map(f => sanitizePath(f, root));
      await runGit(['add', '--', ...safeFiles], root);
    } else if (all) {
      // commit -a will auto-stage tracked files, nothing to do here
    } else {
      // Check if there's anything staged
      const staged = await runGit(['diff', '--cached', '--name-only'], root);
      if (!staged.trim() && !allowEmpty) {
        throw new Error('[git_commit] Nothing staged to commit. Specify files: [...] or set all=true, or use allowEmpty=true');
      }
    }

    const commitArgs = ['commit', '-m', message];
    if (all) commitArgs.splice(1, 0, '-a');
    if (allowEmpty) commitArgs.push('--allow-empty');

    const result = await runGit(commitArgs, root);
    
    // Get commit SHA
    let sha = '';
    try {
      sha = await runGit(['rev-parse', 'HEAD'], root);
    } catch {}

    return `Commit successful${sha ? ` (${sha.slice(0, 8)})` : ''}:\n${result}`;
  }
}

/**
 * git_log – show commit history (bonus)
 */
export class GitLogTool implements Tool {
  public readonly name = 'git_log';
  public readonly description = 'Show git commit history (log). Useful to understand recent changes before editing.';
  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      maxCount: {
        type: 'number',
        description: 'Number of commits to show (default 10, max 50)',
      },
      filePath: {
        type: 'string',
        description: 'Optional file path to show history for that file only',
      }
    },
    required: []
  };

  public async execute(args: Record<string, unknown>): Promise<string> {
    const root = await getWorkspaceRoot();
    const maxCount = Math.min(Math.max(1, typeof args.maxCount === 'number' ? args.maxCount : 10), 50);
    const filePath = typeof args.filePath === 'string' ? args.filePath : undefined;

    const gitArgs = ['log', `--max-count=${maxCount}`, '--oneline', '--decorate', '--date=short', '--format=%h %ad %s (%an)'];
    if (filePath) {
      const safe = sanitizePath(filePath, root);
      gitArgs.push('--', safe);
    }

    const log = await runGit(gitArgs, root);
    return log.trim() || 'No commits found';
  }
}
