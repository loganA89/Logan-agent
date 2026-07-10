import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { Tool, ToolParameterSchema } from './types';
import { scrubTerminalOutput } from './terminalScrubber';

/**
 * Tool implementation for running shell commands in the active workspace directory.
 * Features automated process timeouts and output token scrubbing.
 */
export class RunTerminalCommandTool implements Tool {
  public readonly name = 'run_terminal_command';
  public readonly description = 'Execute a shell command (e.g. npm test, git status, tsc) inside the workspace root.';
  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The exact CLI command line to execute.',
      },
      timeoutSeconds: {
        type: 'number',
        description: 'Maximum execution time allowed before process termination (default 60s).',
      },
    },
    required: ['command'],
  };

  public async execute(args: Record<string, unknown>): Promise<string> {
    const command = typeof args.command === 'string' ? args.command : undefined;
    if (!command) {
      throw new Error('[run_terminal_command] Missing required parameter "command".');
    }

    const timeoutSeconds = typeof args.timeoutSeconds === 'number' ? args.timeoutSeconds : 60;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('[run_terminal_command] Cannot execute command without an active workspace folder.');
    }

    const cwd = workspaceFolders[0].uri.fsPath;

    return new Promise<string>((resolve) => {
      const child = child_process.exec(
        command,
        {
          cwd,
          timeout: timeoutSeconds * 1000,
          maxBuffer: 5 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          let rawOutput = '';
          if (stdout) {
            rawOutput += `[stdout]\n${stdout}\n`;
          }
          if (stderr) {
            rawOutput += `[stderr]\n${stderr}\n`;
          }

          if (error && error.killed) {
            rawOutput += `\n[Execution Timeout] Command terminated forcibly after exceeding ${timeoutSeconds} seconds threshold.\n`;
          } else if (error && error.code) {
            rawOutput += `\n[Exit Code] Process exited with status code ${error.code}.\n`;
          } else if (!error) {
            rawOutput += '\n[Status] Command executed successfully (Exit Code 0).\n';
          }

          const scrubbed = scrubTerminalOutput(rawOutput);
          resolve(scrubbed);
        }
      );

      // Ensure process cleanup on unexpected exit
      child.on('error', (err) => {
        resolve(`[Terminal Execution Error] Failed to launch subprocess: ${err.message}`);
      });
    });
  }
}
