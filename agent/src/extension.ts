import * as vscode from 'vscode';
import { SidebarProvider } from './ui';
import { FileIndexer } from './rag';
import { SessionManager } from './agent';

let outputChannel: vscode.OutputChannel | undefined;

/**
 * Activates the Logan Agent extension inside the VS Code Extension Host.
 *
 * @param context The extension runtime context provided by VS Code.
 */
export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('Logan Agent');
  outputChannel.appendLine('[Logan Agent] Initializing extension core...');

  SessionManager.getInstance().init(context);

  const sidebarProvider = new SidebarProvider(context);
  const sidebarDisposable = vscode.window.registerWebviewViewProvider(
    SidebarProvider.viewType,
    sidebarProvider
  );
  context.subscriptions.push(sidebarDisposable);

  FileIndexer.getInstance().startWatcher(context);

  const startCommandDisposable = vscode.commands.registerCommand('logan.start', () => {
    if (outputChannel) {
      outputChannel.appendLine('[Logan Agent] Command logan.start invoked successfully.');
      outputChannel.show(true);
    }
    vscode.window.showInformationMessage('Logan Agent initialized and ready for autonomous coding.');
  });

  context.subscriptions.push(startCommandDisposable);
  outputChannel.appendLine('[Logan Agent] Extension bootstrap completed successfully.');
}

/**
 * Deactivates the extension and disposes active runtime resources.
 */
export function deactivate(): void {
  if (outputChannel) {
    outputChannel.appendLine('[Logan Agent] Deactivating extension runtime.');
    outputChannel.dispose();
    outputChannel = undefined;
  }
}
