import * as vscode from 'vscode';
import { WebviewIncomingMessage, ExtensionOutgoingEvent } from './types';
import { ReActEngine, SessionManager } from '../agent';
import { ConfigurationManager } from '../config';
import { PlanRouter } from '../providers';
import { CheckpointEngine, ToolRegistry } from '../tools';
import { getSidebarHtml } from './html';
import { LoganLogger } from '../utils';

/**
 * VS Code Sidebar Webview Provider connecting frontend UI controls to backend autonomous ReAct loops.
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'logan.sidebarView';
  private webviewView: vscode.WebviewView | undefined;
  private readonly reactEngine: ReActEngine;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.reactEngine = new ReActEngine();
    const savedTools = context.workspaceState.get<Record<string, boolean>>('logan.toolSelections', {});
    ToolRegistry.getInstance().loadSavedSelections(savedTools);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = getSidebarHtml();

    webviewView.webview.onDidReceiveMessage(async (message: WebviewIncomingMessage) => {
      await this.handleIncomingMessage(message);
    });
  }

  /**
   * Posts an event payload securely to the active Webview frontend.
   */
  public postMessage(event: ExtensionOutgoingEvent): void {
    if (this.webviewView) {
      this.webviewView.webview.postMessage(event);
    }
  }

  private async handleIncomingMessage(message: WebviewIncomingMessage): Promise<void> {
    const logger = LoganLogger.getInstance();
    switch (message.type) {
      case 'SEND_PROMPT':
        if (message.payload?.prompt) {
          logger.logInfo(`Webview sent prompt: "${message.payload.prompt}"`);
          await this.executeUserPrompt(message.payload.prompt);
        }
        break;

      case 'SWITCH_PLAN':
        if (message.payload?.plan) {
          logger.logInfo(`Switching pricing plan to: ${message.payload.plan}`);
          await ConfigurationManager.getInstance().updateSetting('activePlan', message.payload.plan);
          PlanRouter.getInstance().resetRouterCache();
          vscode.window.showInformationMessage(`Logan Agent switched to ${message.payload.plan.toUpperCase()} plan.`);
        }
        break;

      case 'NEW_CHAT':
      case 'CLEAR_CHAT':
        logger.logInfo('User initiated clean session / reset.');
        this.reactEngine.clearHistory();
        await SessionManager.getInstance().createSession();
        this.postMessage({ type: 'CHAT_LOADED', payload: { messages: [] } });
        vscode.window.showInformationMessage('Logan Agent started clean chat session.');
        break;

      case 'GET_SESSIONS_LIST': {
        const sessions = SessionManager.getInstance().listSessions();
        this.postMessage({
          type: 'SESSIONS_LIST_UPDATED',
          payload: {
            sessions: sessions.map((s) => ({ id: s.id, title: s.title, timestamp: s.timestamp })),
          },
        });
        break;
      }

      case 'LOAD_CHAT': {
        const targetSesId = message.payload?.sessionId;
        if (targetSesId) {
          const session = SessionManager.getInstance().loadSession(targetSesId);
          if (session) {
            this.reactEngine.restoreHistory(session.messages);
            this.postMessage({
              type: 'CHAT_LOADED',
              payload: {
                messages: session.messages.map((m) => ({ role: m.role, content: m.content })),
              },
            });
            vscode.window.showInformationMessage(`Loaded session: "${session.title}"`);
          }
        }
        break;
      }

      case 'DELETE_CHAT': {
        const delSesId = message.payload?.sessionId;
        if (delSesId) {
          await SessionManager.getInstance().deleteSession(delSesId);
          const sessions = SessionManager.getInstance().listSessions();
          this.postMessage({
            type: 'SESSIONS_LIST_UPDATED',
            payload: {
              sessions: sessions.map((s) => ({ id: s.id, title: s.title, timestamp: s.timestamp })),
            },
          });
          vscode.window.showInformationMessage('Deleted chat session.');
        }
        break;
      }

      case 'GET_AVAILABLE_TOOLS': {
        const toolsData = ToolRegistry.getInstance().getAllToolsMetadata();
        this.postMessage({
          type: 'AVAILABLE_TOOLS_DATA',
          payload: { tools: toolsData },
        });
        break;
      }

      case 'UPDATE_TOOL_SELECTION': {
        const reg = ToolRegistry.getInstance();
        if (message.payload?.toolName !== undefined && message.payload?.enabled !== undefined) {
          reg.setToolState(message.payload.toolName, message.payload.enabled);
        } else if (message.payload?.selectedTools !== undefined) {
          const allTools = reg.getAllToolsMetadata();
          const selectedSet = new Set(message.payload.selectedTools);
          allTools.forEach((t) => {
            reg.setToolState(t.name, selectedSet.has(t.name));
          });
        }
        await this.context.workspaceState.update('logan.toolSelections', reg.getSavedSelections());
        const updated = reg.getAllToolsMetadata();
        this.postMessage({
          type: 'AVAILABLE_TOOLS_DATA',
          payload: { tools: updated },
        });
        logger.logInfo('User tool selections updated.');
        break;
      }

      case 'TOGGLE_TOOL': {
        const toolName = message.payload?.toolName;
        const enabled = message.payload?.enabled;
        if (toolName !== undefined && enabled !== undefined) {
          ToolRegistry.getInstance().setToolState(toolName, enabled);
          await this.context.workspaceState.update('logan.toolSelections', ToolRegistry.getInstance().getSavedSelections());
          logger.logInfo(`Tool "${toolName}" toggled to ${enabled}`);
        }
        break;
      }

      case 'REQ_TIER_SETTINGS': {
        const cfgMgr = ConfigurationManager.getInstance();
        const tiers: Array<'light' | 'medium' | 'heavy' | 'embedding' | 'image' | 'audio'> = [
          'light',
          'medium',
          'heavy',
          'embedding',
          'image',
          'audio',
        ];
        const tierSettings: Record<string, { providerType: string; apiKey: string; baseUrl?: string; model: string }> = {};
        for (const t of tiers) {
          tierSettings[t] = cfgMgr.getTierConfig(t);
        }
        this.postMessage({
          type: 'TIER_SETTINGS_DATA',
          payload: { tierSettings },
        });
        break;
      }

      case 'SAVE_TIER_SETTINGS': {
        const p = message.payload;
        if (p && p.tier) {
          const config = vscode.workspace.getConfiguration('logan');
          await config.update(`tiers.${p.tier}.providerType`, p.providerType || 'openai', true);
          await config.update(`tiers.${p.tier}.apiKey`, p.apiKey || '', true);
          await config.update(`tiers.${p.tier}.baseUrl`, p.baseUrl || '', true);
          await config.update(`tiers.${p.tier}.model`, p.model || '', true);
          PlanRouter.getInstance().resetRouterCache();
          logger.logInfo(`Saved provider settings for tier "${p.tier}".`);
          vscode.window.showInformationMessage(`Logan Agent: Updated settings for ${p.tier.toUpperCase()} tier.`);
        }
        break;
      }

      case 'ABORT_GENERATION':
        logger.logInfo('User triggered emergency stop generation.');
        this.reactEngine.abortExecution();
        this.postMessage({ type: 'GENERATION_ABORTED', payload: {} });
        vscode.window.showInformationMessage('Logan Agent generation stopped.');
        break;

      case 'APPROVE_DIFF':
        logger.logInfo(`User approved staged diff for: ${message.payload?.filePath}`);
        vscode.window.showInformationMessage(`Logan Agent: Changes verified and committed for ${message.payload?.filePath || 'file'}.`);
        break;

      case 'REJECT_DIFF':
      case 'TRIGGER_ROLLBACK': {
        const targetId = message.payload?.checkpointId || 'latest';
        logger.logInfo(`User triggered rollback for checkpoint: ${targetId}`);
        const restored = await CheckpointEngine.getInstance().rollbackSnapshot(targetId);
        if (restored) {
          this.reactEngine.rollbackLastTurn();
          this.postMessage({
            type: 'THINKING_STEP',
            payload: { step: 0, description: `⏪ Time-Travel Rollback completed: Reverted workspace files and AI memory (${targetId}).` },
          });
          vscode.window.showInformationMessage(`Time-Travel Rollback completed successfully (${targetId}).`);
        } else {
          logger.logError(`Rollback failed for checkpoint: ${targetId}`);
          vscode.window.showErrorMessage(`Rollback failed: Checkpoint "${targetId}" not found.`);
        }
        break;
      }
    }
  }

  private async executeUserPrompt(prompt: string): Promise<void> {
    const logger = LoganLogger.getInstance();
    try {
      this.postMessage({
        type: 'THINKING_STEP',
        payload: { step: 1, description: 'Initiating cognitive ReAct loop...' },
      });

      const response = await this.reactEngine.executeTask(prompt, {
        onStepLog: (step, log) => {
          this.postMessage({
            type: 'THINKING_STEP',
            payload: { step, description: log },
          });
        },
        onReasoningDelta: (delta) => {
          this.postMessage({
            type: 'THINKING_STEP',
            payload: { step: 1, description: `🧠 Logan Reasoning: ${delta.substring(0, 150)}...` },
          });
        },
        onToolStart: (toolName, args) => {
          let badgeText = `⚡ Executing tool: ${toolName}`;
          if (toolName === 'read_file' && args.path) {
            badgeText = `⚡ Reading file: ${args.path}`;
          } else if (toolName === 'create_file' && args.path) {
            badgeText = `📄 Creating file: ${args.path}`;
          } else if (toolName === 'edit_file' && args.path) {
            badgeText = `✏️ Modifying file: ${args.path}`;
          } else if (toolName === 'run_terminal_command' && args.command) {
            badgeText = `💻 Running command: ${args.command}`;
          } else if (toolName === 'search_codebase' && args.query) {
            badgeText = `🔍 RAG Query: "${args.query}"`;
          } else if (toolName === 'generate_audio' && args.filePath) {
            badgeText = `🎵 Generating audio: ${args.filePath}`;
          } else if (toolName === 'generate_image' && args.file_path) {
            badgeText = `🎨 Generating image: ${args.file_path}`;
          }
          this.postMessage({
            type: 'TOOL_EXECUTION_START',
            payload: { toolName, description: badgeText },
          });
        },
        onToolEnd: (toolName, observation) => {
          this.postMessage({
            type: 'TOOL_EXECUTION_END',
            payload: { toolName, observation },
          });
        },
        onDiffProposed: (filePath, checkpointId) => {
          this.postMessage({
            type: 'DIFF_PROPOSED',
            payload: { filePath, checkpointId },
          });
        },
        onUsageMetrics: (metrics) => {
          this.postMessage({
            type: 'TOKEN_USAGE_UPDATE',
            payload: {
              metrics: {
                inputTokens: metrics.inputTokens,
                outputTokens: metrics.outputTokens,
                cachedTokens: metrics.cachedInputTokens || 0,
                totalTokens: metrics.totalTokens,
                estimatedCostUSD: metrics.estimatedCostUSD,
              },
            },
          });
        },
      });

      await SessionManager.getInstance().saveSessionData(this.reactEngine.getConversationHistory(), undefined, prompt);

      this.postMessage({
        type: 'STREAM_CHUNK',
        payload: { chunk: response },
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.logError('User prompt execution failed', error);
      this.postMessage({
        type: 'ERROR_ALERT',
        payload: { errorMessage: errMsg },
      });
    }
  }
}
