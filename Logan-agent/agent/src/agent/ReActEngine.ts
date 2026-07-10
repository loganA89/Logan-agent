import * as vscode from 'vscode';
import * as path from 'path';
import { AgentState, AgentMessage } from './types';
import { PlanRouter, TaskComplexity, TokenUsageMetrics, ToolCall } from '../providers';
import { ToolRegistry } from '../tools';
import { MemoryManager } from './MemoryManager';
import { LoganLogger } from '../utils';
import { FileIndexer } from '../rag';

export interface ReActExecutionOptions {
  complexity?: TaskComplexity;
  systemPromptOverride?: string;
  autoContinue?: boolean;
  maxAutoContinues?: number;
  useStreaming?: boolean;
  onStateChange?: (state: AgentState) => void;
  onStepLog?: (step: number, log: string) => void;
  onUsageMetrics?: (metrics: TokenUsageMetrics) => void;
  onReasoningDelta?: (delta: string) => void;
  onContentDelta?: (delta: string) => void;
  onToolStart?: (toolName: string, args: Record<string, unknown>) => void;
  onToolEnd?: (toolName: string, observation: string) => void;
  onDiffProposed?: (filePath: string, checkpointId?: string) => void;
  onAutoContinue?: (round: number, totalSteps: number) => void;
}

export interface ExtractedToolCall {
  name: string;
  arguments: Record<string, unknown>;
  id?: string;
  isSyntaxError?: boolean;
  errorMessage?: string;
}

/**
 * Legacy XML extractor - kept for backward compatibility.
 * Native tool calling is now preferred.
 */
export function extractToolCalls(messageContent: string, nativeToolCalls?: ToolCall[]): ExtractedToolCall[] {
  if (nativeToolCalls && nativeToolCalls.length > 0) {
    return nativeToolCalls.map(tc => ({ name: tc.name, arguments: tc.arguments, id: tc.id }));
  }
  const parsedCalls: ExtractedToolCall[] = [];
  const xmlRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  let match: RegExpExecArray | null;
  while ((match = xmlRegex.exec(messageContent)) !== null) {
    try {
      const payload = JSON.parse(match[1].trim());
      if (payload?.name) parsedCalls.push({ name: payload.name, arguments: payload.arguments || {} });
    } catch {
      parsedCalls.push({ name: '__SYNTAX_ERROR__', arguments: {}, isSyntaxError: true, errorMessage: '[Tool Execution Error: Malformed JSON]' });
    }
  }
  return parsedCalls;
}

/**
 * Autonomous Reasoning and Acting (ReAct) Engine
 * v0.3.1 - Native tool calling + Auto-continue
 */
export class ReActEngine {
  private static readonly MAX_STEPS = 50;
  private static readonly MAX_AUTO_CONTINUES = 3;
  private state: AgentState = 'IDLE';
  private readonly memoryManager: MemoryManager = new MemoryManager();
  private abortController: AbortController | undefined;

  constructor() {}

  public getState(): AgentState {
    return this.state;
  }

  private setState(state: AgentState, callback?: (state: AgentState) => void): void {
    this.state = state;
    if (callback) {
      callback(state);
    }
  }

  public abortExecution(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.setState('IDLE');
      LoganLogger.getInstance().logInfo('ReAct execution aborted by user emergency stop.');
    }
  }

  public parseToolCalls(responseText: string, native?: ToolCall[]): ExtractedToolCall[] {
    return extractToolCalls(responseText, native);
  }

  private buildDefaultSystemPrompt(): string {
    return `You are Logan Agent, an elite autonomous AI coding assistant integrated into Visual Studio Code.

You have access to native function calling tools. Call tools directly when needed.

[CRITICAL DIRECTIVE: STRICT ENGLISH ONLY]
Regardless of the user language, all internal reasoning and tool parameters MUST be in professional English.

[Task Planning]
For any complex multi-step task (3+ steps), you MUST first call todo_list to create a task breakdown plan.
- Mark tasks as in_progress when starting, completed when finished
- Only ONE task should be in_progress at a time
- Update the todo list frequently to track progress

Workflow:
1. If task is complex: create todo_list plan first
2. Think step by step about the task
3. Call appropriate tools to read files, search codebase, edit, run terminal, etc.
4. After each edit: run read_diagnostics to verify no regressions
5. Observe results and iterate, updating todos
6. When done, provide a direct answer to the user

Available tool categories: File Ops, Terminal, Search & RAG, Git, Task Planning, Media

Be concise, accurate, and autonomous.`;
  }

  public async executeTask(prompt: string, options?: ReActExecutionOptions): Promise<string> {
    const logger = LoganLogger.getInstance();
    const complexity = options?.complexity || 'MEDIUM';
    const systemPrompt = options?.systemPromptOverride || this.buildDefaultSystemPrompt();
    const router = PlanRouter.getInstance();
    const { provider } = router.routeTask(complexity);

    const toolDefs = ToolRegistry.getInstance().getToolDefinitions();
    const autoContinue = options?.autoContinue ?? true;
    const maxAutoContinues = options?.maxAutoContinues ?? ReActEngine.MAX_AUTO_CONTINUES;

    logger.logInfo(`Starting ReAct task execution with prompt: "${prompt}" (Complexity: ${complexity})`);

    logger.logInfo('Executing JIT sync of dirty workspace files at task start...');
    await FileIndexer.getInstance().syncDirtyFiles();

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.setState('THINKING', options?.onStateChange);
    this.memoryManager.appendMessage({ role: 'user', content: prompt });

    let stepCount = 0;
    let autoContinueCount = 0;
    let totalSteps = 0;

    while (true) {
      if (signal.aborted) {
        this.setState('IDLE', options?.onStateChange);
        return '[Generation Aborted by User]';
      }

      if (stepCount >= ReActEngine.MAX_STEPS) {
        // Auto-continue logic
        if (autoContinue && autoContinueCount < maxAutoContinues) {
          autoContinueCount++;
          stepCount = 0;
          totalSteps += ReActEngine.MAX_STEPS;
          
          const continueMsg = `[SYSTEM AUTO-CONTINUE ${autoContinueCount}/${maxAutoContinues}] You have reached ${ReActEngine.MAX_STEPS} steps. Continue the task autonomously from where you left off. Summarize progress briefly, then continue with the next logical tool calls. Do NOT repeat already completed work.`;
          
          logger.logInfo(`Auto-continue ${autoContinueCount}/${maxAutoContinues} triggered at ${totalSteps} total steps`);
          if (options?.onAutoContinue) {
            options.onAutoContinue(autoContinueCount, totalSteps);
          }
          if (options?.onStepLog) {
            options.onStepLog(0, `🔄 Auto-continue ${autoContinueCount}/${maxAutoContinues} – resuming task...`);
          }

          this.memoryManager.appendMessage({
            role: 'user',
            content: continueMsg
          });

          continue;
        }

        // No more auto-continues left
        this.setState('IDLE', options?.onStateChange);
        const emergencyWarning = `[Safety Circuit Breaker Triggered] Logan Agent reached the maximum execution limit (${ReActEngine.MAX_STEPS} steps × ${autoContinueCount + 1} rounds = ${totalSteps + ReActEngine.MAX_STEPS} total steps) without converging. Autonomous execution halted to protect context window and token expenditure.`;
        logger.logError('Safety Circuit Breaker limit reached.');
        this.memoryManager.appendMessage({ role: 'assistant', content: emergencyWarning });
        await FileIndexer.getInstance().syncDirtyFiles();
        return emergencyWarning;
      }

      stepCount++;
      totalSteps++;
      logger.logInfo(`Executing ReAct Step ${stepCount}/${ReActEngine.MAX_STEPS} (round ${autoContinueCount + 1}, total ${totalSteps})`);

      if (options?.onStepLog) {
        const roundSuffix = autoContinueCount > 0 ? ` (R${autoContinueCount + 1})` : '';
        options.onStepLog(stepCount, `Initiating ReAct step ${stepCount}/${ReActEngine.MAX_STEPS}${roundSuffix}...`);
      }

      if (this.memoryManager.shouldCompact()) {
        logger.logInfo('Memory threshold reached; executing context compaction.');
        if (options?.onStepLog) {
          options.onStepLog(stepCount, 'Compacting historical memory to optimize token expenditure...');
        }
        await this.memoryManager.compactHistory();
      }

      const activeMessages = this.memoryManager.getMessages();

      let assistantResponse = '';
      let toolCalls: ToolCall[] = [];

      try {
        const useStreaming = options?.useStreaming ?? true;
        if (useStreaming && provider.stream) {
          // Streaming mode with tool_call aggregation
          const toolCallBuffers: Map<number, { id?: string; name: string; arguments: string }> = new Map();
          for await (const chunk of provider.stream(prompt, {
            systemPrompt,
            messages: activeMessages as any,
            tools: toolDefs,
            cacheBreakpoints: true,
            onUsageMetrics: options?.onUsageMetrics,
            onReasoningDelta: options?.onReasoningDelta,
            onContentDelta: options?.onContentDelta,
            abortSignal: signal,
          })) {
            if (signal.aborted) break;
            if (chunk.contentDelta) {
              assistantResponse += chunk.contentDelta;
            }
            if (chunk.reasoningDelta && options?.onReasoningDelta) {
              options.onReasoningDelta(chunk.reasoningDelta);
            }
            if (chunk.toolCallDelta) {
              const idx = chunk.toolCallDelta.index ?? 0;
              const buf = toolCallBuffers.get(idx) || { name: '', arguments: '' };
              if (chunk.toolCallDelta.id) buf.id = chunk.toolCallDelta.id;
              if (chunk.toolCallDelta.name) buf.name = chunk.toolCallDelta.name;
              if (chunk.toolCallDelta.argumentsDelta) buf.arguments += chunk.toolCallDelta.argumentsDelta;
              toolCallBuffers.set(idx, buf);
            }
          }
          // Finalize tool calls
          for (const [, buf] of toolCallBuffers) {
            if (!buf.name) continue;
            let argsObj: Record<string, unknown> = {};
            try {
              argsObj = buf.arguments ? JSON.parse(buf.arguments) : {};
            } catch {
              argsObj = {};
            }
            toolCalls.push({ id: buf.id, name: buf.name, arguments: argsObj });
          }
        } else {
          // Fallback buffered completion
          const assistantResult = await provider.complete(prompt, {
            systemPrompt,
            messages: activeMessages as any,
            tools: toolDefs,
            cacheBreakpoints: true,
            onUsageMetrics: options?.onUsageMetrics,
            onReasoningDelta: options?.onReasoningDelta,
            abortSignal: signal,
          });
          assistantResponse = assistantResult.content || '';
          toolCalls = assistantResult.toolCalls || [];
        }
      } catch (error) {
        if (signal.aborted) {
          this.setState('IDLE', options?.onStateChange);
          return '[Generation Aborted by User]';
        }
        this.setState('ERROR', options?.onStateChange);
        const errStr = error instanceof Error ? error.message : String(error);
        logger.logError(`ReAct loop provider completion error at step ${stepCount}`, error);
        throw new Error(`[ReActEngine] Provider API completion failed: ${errStr}`);
      }

      // Save assistant message with tool_calls metadata
      this.memoryManager.appendMessage({ 
        role: 'assistant', 
        content: assistantResponse,
        tool_calls: toolCalls.length ? toolCalls : undefined
      } as any);

      if (toolCalls.length === 0) {
        logger.logInfo(`Step ${stepCount} converged to final answer (0 tool calls). Total steps: ${totalSteps}`);
        this.setState('IDLE', options?.onStateChange);
        logger.logInfo('Executing JIT sync of modified files upon task convergence...');
        await FileIndexer.getInstance().syncDirtyFiles();
        return assistantResponse || 'Task completed.';
      }

      logger.logInfo(`Extracted ${toolCalls.length} tool call(s): ${toolCalls.map((c) => c.name).join(', ')}`);
      this.setState('EXECUTING_TOOL', options?.onStateChange);

      for (const call of toolCalls) {
        if (signal.aborted) {
          this.setState('IDLE', options?.onStateChange);
          return '[Generation Aborted by User]';
        }

        if (options?.onStepLog) {
          options.onStepLog(stepCount, `Executing tool "${call.name}"...`);
        }
        if (options?.onToolStart) {
          options.onToolStart(call.name, call.arguments);
        }

        let observation: string;
        try {
          observation = await ToolRegistry.getInstance().executeTool(call.name, call.arguments);
          logger.logInfo(`Tool "${call.name}" executed successfully. Output length: ${observation.length}`);

          if (call.name === 'edit_file' || call.name === 'create_file' || call.name === 'apply_diff') {
            const targetPath = call.arguments.path as string | undefined;
            if (targetPath && vscode.workspace.workspaceFolders?.[0]) {
              const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
              const fileUri = vscode.Uri.file(path.resolve(root, targetPath));
              await FileIndexer.getInstance().indexSingleFile(fileUri).catch(()=>{});
            }
          }
        } catch (toolError) {
          const errMsg = toolError instanceof Error ? toolError.message : String(toolError);
          observation = `[Tool Execution Error for "${call.name}"]: ${errMsg}\nAnalyze this failure and self-correct your plan.`;
          logger.logError(`Execution failed for tool "${call.name}"`, toolError);
        }

        if (options?.onToolEnd) {
          options.onToolEnd(call.name, observation);
        }

        if ((call.name === 'edit_file' || call.name === 'apply_diff') && call.arguments.path && options?.onDiffProposed) {
          const chkMatch = observation.match(/Checkpoint saved:\s*([a-zA-Z0-9_-]+)/);
          const chkId = chkMatch ? chkMatch[1] : undefined;
          options.onDiffProposed(String(call.arguments.path), chkId);
        }

        this.memoryManager.appendMessage({
          role: 'tool',
          name: call.name,
          content: observation,
          tool_call_id: call.id,
        } as any);
      }

      this.setState('THINKING', options?.onStateChange);
    }
  }

  public getConversationHistory(): AgentMessage[] {
    return this.memoryManager.getMessages();
  }

  public restoreHistory(messages: AgentMessage[]): void {
    this.memoryManager.setMessages(messages);
  }

  public clearHistory(): void {
    this.memoryManager.clear();
  }

  public rollbackLastTurn(): boolean {
    return this.memoryManager.rollbackLastTurn();
  }
}
