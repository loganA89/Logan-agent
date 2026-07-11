import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Dedicated file-based and OutputChannel logger recording raw LLM completions,
 * parsed tool calls, and runtime diagnostics into .vscode/.logan/debug.log.
 */
export class LoganLogger {
  private static instance: LoganLogger | undefined;
  private outputChannel: vscode.OutputChannel | undefined;
  private logFilePath: string | undefined;

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Logan Debug Logs');
    this.initLogFile();
  }

  public static getInstance(): LoganLogger {
    if (!LoganLogger.instance) {
      LoganLogger.instance = new LoganLogger();
    }
    return LoganLogger.instance;
  }

  private initLogFile(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const rootPath = workspaceFolders[0].uri.fsPath;
      const loganDir = path.join(rootPath, '.vscode', '.logan');
      try {
        if (!fs.existsSync(loganDir)) {
          fs.mkdirSync(loganDir, { recursive: true });
        }
        this.logFilePath = path.join(loganDir, 'debug.log');
      } catch {
        // If directory creation fails due to permissions, fallback to OutputChannel only
      }
    }
  }

  private writeLog(level: string, message: string): void {
    const timestamp = new Date().toISOString();
    const formattedLine = `[${timestamp}] [${level}] ${message}`;

    if (this.outputChannel) {
      this.outputChannel.appendLine(formattedLine);
    }

    if (this.logFilePath) {
      try {
        fs.appendFileSync(this.logFilePath, formattedLine + '\n', 'utf8');
      } catch {
        // Ignore filesystem errors if disk is locked
      }
    }
  }

  /**
   * Logs a general informational runtime event or step confirmation.
   */
  public logInfo(msg: string): void {
    this.writeLog('INFO', msg);
  }

  /**
   * Logs an exception or diagnostic error trace.
   */
  public logError(msg: string, err?: unknown): void {
    const errDetails = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack || ''}` : err !== undefined ? String(err) : '';
    const fullMsg = errDetails ? `${msg} | Details: ${errDetails}` : msg;
    this.writeLog('ERROR', fullMsg);
  }

  /**
   * Records raw prompt payloads and model response strings for debugging token streaming and schemas.
   */
  public logRawLLM(prompt: unknown, response: string): void {
    let promptStr = '';
    try {
      promptStr = typeof prompt === 'string' ? prompt : JSON.stringify(prompt, null, 2);
    } catch {
      promptStr = String(prompt);
    }
    this.writeLog('LLM_TRACE', `\n--- PROMPT ---\n${promptStr}\n--- RESPONSE ---\n${response}\n----------------`);
  }
}
