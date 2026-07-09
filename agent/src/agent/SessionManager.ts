import * as vscode from 'vscode';
import { ChatSession, AgentMessage } from './types';

/**
 * Manages persistent multi-turn chat sessions inside VS Code workspace state.
 */
export class SessionManager {
  private static instance: SessionManager | undefined;
  private context: vscode.ExtensionContext | undefined;
  private currentSessionId: string | undefined;

  private constructor() {}

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  public init(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  private getSessions(): ChatSession[] {
    if (!this.context) {
      return [];
    }
    return this.context.workspaceState.get<ChatSession[]>('logan.sessions', []);
  }

  private async setSessions(sessions: ChatSession[]): Promise<void> {
    if (!this.context) {
      return;
    }
    await this.context.workspaceState.update('logan.sessions', sessions);
  }

  public getCurrentSessionId(): string | undefined {
    return this.currentSessionId;
  }

  public setCurrentSessionId(id: string | undefined): void {
    this.currentSessionId = id;
  }

  public listSessions(): ChatSession[] {
    return this.getSessions().sort((a, b) => b.timestamp - a.timestamp);
  }

  public loadSession(id: string): ChatSession | undefined {
    const sessions = this.getSessions();
    const found = sessions.find((s) => s.id === id);
    if (found) {
      this.currentSessionId = found.id;
    }
    return found;
  }

  public async createSession(initialPrompt?: string): Promise<ChatSession> {
    const id = `ses_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const title = initialPrompt
      ? initialPrompt.substring(0, 30) + (initialPrompt.length > 30 ? '...' : '')
      : `Session ${new Date().toLocaleTimeString()}`;

    const newSession: ChatSession = {
      id,
      title,
      timestamp: Date.now(),
      messages: [],
      metrics: {
        inputTokens: 0,
        outputTokens: 0,
        totalCostUSD: 0,
      },
    };

    const sessions = this.getSessions();
    sessions.unshift(newSession);
    await this.setSessions(sessions);
    this.currentSessionId = id;
    return newSession;
  }

  public async saveSessionData(
    messages: AgentMessage[],
    metrics?: { inputTokens?: number; outputTokens?: number; totalCostUSD?: number },
    promptForTitle?: string
  ): Promise<void> {
    let sessions = this.getSessions();
    let target = sessions.find((s) => s.id === this.currentSessionId);

    if (!target) {
      target = await this.createSession(promptForTitle);
      sessions = this.getSessions();
      target = sessions.find((s) => s.id === this.currentSessionId) || target;
    }

    target.messages = [...messages];
    target.timestamp = Date.now();
    if (promptForTitle && target.title.startsWith('Session ')) {
      target.title = promptForTitle.substring(0, 30) + (promptForTitle.length > 30 ? '...' : '');
    }

    if (metrics) {
      target.metrics = {
        inputTokens: (target.metrics?.inputTokens || 0) + (metrics.inputTokens || 0),
        outputTokens: (target.metrics?.outputTokens || 0) + (metrics.outputTokens || 0),
        totalCostUSD: (target.metrics?.totalCostUSD || 0) + (metrics.totalCostUSD || 0),
      };
    }

    await this.setSessions(sessions);
  }

  public async deleteSession(id: string): Promise<boolean> {
    const sessions = this.getSessions();
    const filtered = sessions.filter((s) => s.id !== id);
    if (filtered.length === sessions.length) {
      return false;
    }
    await this.setSessions(filtered);
    if (this.currentSessionId === id) {
      this.currentSessionId = undefined;
    }
    return true;
  }
}
