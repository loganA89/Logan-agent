import * as vscode from 'vscode';
import { Tool, ToolParameterSchema } from './types';
import { validateAndResolveSandboxPath } from './fileTools';

/**
 * VS Code Problems panel / Diagnostics reader.
 * Allows the agent to see TypeScript errors, ESLint warnings, etc. without running tsc manually.
 */
export class ReadDiagnosticsTool implements Tool {
  public readonly name = 'read_diagnostics';
  public readonly description = 'Read VS Code Problems panel diagnostics (TypeScript errors, ESLint warnings, etc.) for a specific file or the entire workspace. Use this before and after edits to verify no regressions.';
  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Optional relative path to a specific file to check diagnostics for. If omitted, returns all workspace diagnostics.',
      },
      severity: {
        type: 'string',
        enum: ['error', 'warning', 'info', 'hint', 'all'],
        description: 'Filter by severity level. Default: all',
      }
    },
    required: []
  };

  public async execute(args: Record<string, unknown>): Promise<string> {
    const filePath = typeof args.filePath === 'string' ? args.filePath : undefined;
    const severityFilter = typeof args.severity === 'string' ? args.severity.toLowerCase() : 'all';

    const severityMap: Record<string, vscode.DiagnosticSeverity> = {
      'error': vscode.DiagnosticSeverity.Error,
      'warning': vscode.DiagnosticSeverity.Warning,
      'info': vscode.DiagnosticSeverity.Information,
      'hint': vscode.DiagnosticSeverity.Hint,
    };

    let diagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [];

    if (filePath) {
      try {
        const uri = validateAndResolveSandboxPath(filePath);
        const diags = vscode.languages.getDiagnostics(uri);
        diagnostics = [[uri, diags]];
      } catch (e) {
        throw new Error(`[read_diagnostics] Invalid file path "${filePath}": ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      diagnostics = vscode.languages.getDiagnostics();
    }

    const severityNames = ['Error', 'Warning', 'Information', 'Hint'];
    const results: string[] = [];
    let totalCount = 0;
    let filteredCount = 0;

    for (const [uri, diags] of diagnostics) {
      const relPath = vscode.workspace.asRelativePath(uri, false);
      const filtered = severityFilter === 'all' || !severityMap[severityFilter]
        ? diags
        : diags.filter(d => d.severity === severityMap[severityFilter]);

      totalCount += diags.length;
      filteredCount += filtered.length;

      if (filtered.length === 0) continue;

      for (const d of filtered.slice(0, 50)) { // cap per file
        const sev = severityNames[d.severity] || 'Unknown';
        const line = d.range.start.line + 1;
        const col = d.range.start.character + 1;
        const source = d.source ? ` [${d.source}]` : '';
        const code = d.code ? typeof d.code === 'object' ? (d.code as any).value || '' : d.code : '';
        const codeStr = code ? ` (${code})` : '';
        results.push(`${relPath}:${line}:${col}  ${sev}${source}${codeStr}\n  ${d.message}`);
      }
      if (filtered.length > 50) {
        results.push(`... and ${filtered.length - 50} more in ${relPath}`);
      }
    }

    if (filteredCount === 0) {
      if (totalCount === 0) {
        return filePath
          ? `✅ No diagnostics found in ${filePath} – file is clean.`
          : `✅ No diagnostics found in workspace – 0 errors, 0 warnings.`;
      }
      return `No diagnostics matching severity="${severityFilter}" found. Total diagnostics in scope: ${totalCount}`;
    }

    const header = filePath
      ? `Diagnostics for ${filePath} – ${filteredCount} issue(s) found:`
      : `Workspace diagnostics – ${filteredCount} issue(s) found (severity filter: ${severityFilter}):`;

    return `${header}\n\n${results.join('\n\n')}`;
  }
}
