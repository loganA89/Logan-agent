import { AgentMessage } from './types';
import { PlanRouter } from '../providers';

/**
 * Context memory manager responsible for conversation history tracking, token budgeting,
 * background summarization compaction, and conversational time-travel rollback.
 */
export class MemoryManager {
  private static readonly TURN_THRESHOLD = 10;
  private static readonly TOKEN_THRESHOLD = 12000;
  private messages: AgentMessage[] = [];

  constructor(initialMessages: AgentMessage[] = []) {
    this.messages = [...initialMessages];
  }

  public getMessages(): AgentMessage[] {
    return [...this.messages];
  }

  public setMessages(messages: AgentMessage[]): void {
    this.messages = [...messages];
  }

  public appendMessage(message: AgentMessage): void {
    this.messages.push(message);
  }

  public clear(): void {
    this.messages = [];
  }

  /**
   * Estimates total token count across active context memory buffer (~4 characters per token).
   */
  public estimateTotalTokens(): number {
    return this.messages.reduce((acc, msg) => acc + Math.ceil((msg.content || '').length / 4), 0);
  }

  /**
   * Evaluates whether conversation history exceeds threshold parameters triggering compaction.
   */
  public shouldCompact(): boolean {
    return this.messages.length > MemoryManager.TURN_THRESHOLD || this.estimateTotalTokens() > MemoryManager.TOKEN_THRESHOLD;
  }

  /**
   * Reverts conversation memory back to the exact cognitive state before the most recent user turn.
   *
   * @returns True if rollback occurred successfully, false if no previous user turn exists.
   */
  public rollbackLastTurn(): boolean {
    let lastUserIndex = -1;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if (msg.role === 'user' && !msg.content.startsWith('[SYSTEM CONTEXT COMPACTION')) {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex === -1) {
      return false;
    }

    this.messages = this.messages.slice(0, lastUserIndex);
    return true;
  }

  /**
   * Compresses older conversational turns into a dense technical summary via low-cost routing,
   * reducing token consumption by up to 80% while retaining structural awareness.
   */
  public async compactHistory(): Promise<void> {
    if (this.messages.length <= 3) {
      return;
    }

    const systemMessages = this.messages.filter((m) => m.role === 'system');
    const nonSystemMessages = this.messages.filter((m) => m.role !== 'system');

    if (nonSystemMessages.length <= 2) {
      return;
    }

    const recentTurns = nonSystemMessages.slice(-2);
    const historicalTurns = nonSystemMessages.slice(0, -2);

    if (historicalTurns.length === 0) {
      return;
    }

    const transcript = historicalTurns
      .map((m) => `[Role: ${m.role.toUpperCase()}]\n${m.content}`)
      .join('\n\n---\n\n');

    const prompt = `Synthesize the following conversation transcript into a concise Markdown technical state report strictly structured into three sections:
### 1. Completed Goals
### 2. Modified Files
### 3. Active Errors

Do not include conversational filler. Focus strictly on technical facts, file paths, function signatures, and diagnostics.

Transcript:
${transcript}`;

    try {
      const router = PlanRouter.getInstance();
      const { provider } = router.routeTask('LIGHT');
      const summaryContent = await provider.complete(prompt, {
        maxTokens: 1024,
      });

      const summaryMessage: AgentMessage = {
        role: 'user',
        content: `[SYSTEM CONTEXT COMPACTION - HISTORICAL STATE REPORT]\n${summaryContent.trim()}`,
      };

      this.messages = [...systemMessages, summaryMessage, ...recentTurns];
    } catch {
      // If background compaction model fails or rate limits, preserve current buffer state
    }
  }
}
