import * as vscode from 'vscode';
import * as path from 'path';
import { AgentState, AgentMessage } from './types';
import { PlanRouter, TaskComplexity, TokenUsageMetrics, CompletionResult } from '../providers';
import { ToolRegistry } from '../tools';
import { MemoryManager } from './MemoryManager';
import { LoganLogger } from '../utils';
import { FileIndexer } from '../rag';

export interface ReActExecutionOptions {
  complexity?: TaskComplexity;
  systemPromptOverride?: string;
  onStateChange?: (state: AgentState) => void;
  onStepLog?: (step: number, log: string) => void;
  onUsageMetrics?: (metrics: TokenUsageMetrics) => void;
  onReasoningDelta?: (delta: string) => void;
  onToolStart?: (toolName: string, args: Record<string, unknown>) => void;
  onToolEnd?: (toolName: string, observation: string) => void;
  onDiffProposed?: (filePath: string, checkpointId?: string) => void;
}

export interface ExtractedToolCall {
  name: string;
  arguments: Record<string, unknown>;
  isSyntaxError?: boolean;
  errorMessage?: string;
}

/**
 * Extracts tool invocations from both native tool call arrays and raw XML tags with robust JSON error recovery.
 */
export function extractToolCalls(messageContent: string, nativeToolCalls?: unknown[]): ExtractedToolCall[] {
  const parsedCalls: ExtractedToolCall[] = [];

  if (nativeToolCalls && Array.isArray(nativeToolCalls) && nativeToolCalls.length > 0) {
    for (const tc of nativeToolCalls) {
      const item = tc as { function?: { name?: string; arguments?: unknown }; name?: string; arguments?: unknown };
      const name = item.function?.name || item.name;
      const rawArgs = item.function?.arguments !== undefined ? item.function.arguments : item.arguments;
      if (name) {
        let argsObj: Record<string, unknown> = {};
        if (typeof rawArgs === 'string') {
          try {
            argsObj = JSON.parse(rawArgs);
          } catch {
            parsedCalls.push({
              name: '__SYNTAX_ERROR__',
              arguments: {},
              isSyntaxError: true,
              errorMessage: '[Tool Execution Error: Malformed JSON syntax in <tool_call>. Please output valid JSON with "name" and "arguments" keys.]',
            });
            continue;
          }
        } else if (rawArgs && typeof rawArgs === 'object') {
          argsObj = rawArgs as Record<string, unknown>;
        }
        parsedCalls.push({ name, arguments: argsObj });
      }
    }
  }

  const xmlRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  let match: RegExpExecArray | null;
  while ((match = xmlRegex.exec(messageContent)) !== null) {
    const rawInner = match[1].trim();
    try {
      const payload = JSON.parse(rawInner);
      if (payload && payload.name) {
        parsedCalls.push({
          name: payload.name,
          arguments: payload.arguments || {},
        });
      } else {
        parsedCalls.push({
          name: '__SYNTAX_ERROR__',
          arguments: {},
          isSyntaxError: true,
          errorMessage: '[Tool Execution Error: Malformed JSON syntax in <tool_call>. Please output valid JSON with "name" and "arguments" keys.]',
        });
      }
    } catch {
      parsedCalls.push({
        name: '__SYNTAX_ERROR__',
        arguments: {},
        isSyntaxError: true,
        errorMessage: '[Tool Execution Error: Malformed JSON syntax in <tool_call>. Please output valid JSON with "name" and "arguments" keys.]',
      });
    }
  }

  if (parsedCalls.length > 0) {
    return parsedCalls;
  }

  const actionRegex = /<action>([\s\S]*?)<\/action>/g;
  while ((match = actionRegex.exec(messageContent)) !== null) {
    const rawInner = match[1].trim();
    try {
      const payload = JSON.parse(rawInner);
      const name = payload.tool || payload.name;
      if (name) {
        parsedCalls.push({
          name,
          arguments: payload.arguments || {},
        });
      }
    } catch {
      parsedCalls.push({
        name: '__SYNTAX_ERROR__',
        arguments: {},
        isSyntaxError: true,
        errorMessage: '[Tool Execution Error: Malformed JSON syntax in <tool_call>. Please output valid JSON with "name" and "arguments" keys.]',
      });
    }
  }

  return parsedCalls;
}

/**
 * Autonomous Reasoning and Acting (ReAct) Engine enforcing step limits, context compaction, and fault-tolerant tool recovery.
 */
export class ReActEngine {
  private static readonly MAX_STEPS = 10;
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

  public parseToolCalls(responseText: string): ExtractedToolCall[] {
    return extractToolCalls(responseText);
  }

  private buildDefaultSystemPrompt(): string {
    const toolDefs = ToolRegistry.getInstance().getToolDefinitions();
    const formattedTools = toolDefs
      .map((t) => `- ${t.name}: ${t.description}\n  Schema: ${JSON.stringify(t.inputSchema)}`)
      .join('\n\n');

    return `You are Logan Agent, an elite autonomous AI coding assistant integrated into Visual Studio Code.
You follow strict ReAct (Reason -> Act -> Observe) reasoning loops.

[CRITICAL DIRECTIVE: STRICT ENGLISH ONLY]
Regardless of the language used by the user prompt or workspace code comments, all internal reasoning (<thought>...</thought>) and tool parameters MUST be written exclusively in professional English.

[AVAILABLE TOOLS]
To execute an action, emit one or more <tool_call> XML tags containing a JSON object matching the exact tool schema:
<tool_call>
{"name": "tool_name", "arguments": {"arg1": "value1"}}
</tool_call>

Registered Tools:
${formattedTools}

When you have completed all tasks or verified the final solution, respond directly to the user without emitting tool calls.`;
  }

  /**
   * Executes the autonomous multi-step reasoning loop for a user prompt.
   */
  public async executeTask(prompt: string, options?: ReActExecutionOptions): Promise<string> {
    const logger = LoganLogger.getInstance();
    const complexity = options?.complexity || 'MEDIUM';
    const systemPrompt = options?.systemPromptOverride || this.buildDefaultSystemPrompt();
    const router = PlanRouter.getInstance();
    const { provider } = router.routeTask(complexity);

    logger.logInfo(`Starting ReAct task execution with prompt: "${prompt}" (Complexity: ${complexity})`);

    // JIT Indexing Milestone 1: Task Start
    logger.logInfo('Executing JIT sync of dirty workspace files at task start...');
    await FileIndexer.getInstance().syncDirtyFiles();

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.setState('THINKING', options?.onStateChange);
    this.memoryManager.appendMessage({ role: 'user', content: prompt });

    let stepCount = 0;

    while (stepCount < ReActEngine.MAX_STEPS) {
      if (signal.aborted) {
        this.setState('IDLE', options?.onStateChange);
        return '[Generation Aborted by User]';
      }

      stepCount++;
      logger.logInfo(`Executing ReAct Step ${stepCount}/${ReActEngine.MAX_STEPS}`);

      if (options?.onStepLog) {
        options.onStepLog(stepCount, `Initiating ReAct step ${stepCount}/${ReActEngine.MAX_STEPS}...`);
      }

      if (this.memoryManager.shouldCompact()) {
        logger.logInfo('Memory threshold reached; executing context compaction.');
        if (options?.onStepLog) {
          options.onStepLog(stepCount, 'Compacting historical memory to optimize token expenditure...');
        }
        await this.memoryManager.compactHistory();
      }

      const activeMessages = this.memoryManager.getMessages();
      const providerMessages = activeMessages.map((m) => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.role === 'tool' ? `[Tool Observation]\n${m.content}` : m.content,
      }));

      let result: CompletionResult;
      try {
        result = await provider.complete(prompt, {
          systemPrompt,
          messages: providerMessages,
          onUsageMetrics: options?.onUsageMetrics,
          onReasoningDelta: options?.onReasoningDelta,
          abortSignal: signal,
        });
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

      if (signal.aborted) {
        this.setState('IDLE', options?.onStateChange);
        return '[Generation Aborted by User]';
      }

      this.memoryManager.appendMessage({ role: 'assistant', content: result.content });

      const toolCalls = extractToolCalls(result.content, result.toolCalls);
      if (toolCalls.length === 0) {
        logger.logInfo(`Step ${stepCount} converged to final answer (0 tool calls).`);
        this.setState('IDLE', options?.onStateChange);

        // JIT Indexing Milestone 2: Task Completion
        logger.logInfo('Executing JIT sync of modified files upon task convergence...');
        await FileIndexer.getInstance().syncDirtyFiles();

        return result.content;
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
        if (call.isSyntaxError) {
          observation = call.errorMessage || '[Tool Execution Error: Malformed JSON syntax in <tool_call>. Please output valid JSON with "name" and "arguments" keys.]';
          logger.logError(`Syntax error intercepted in tool call "${call.name}": ${observation}`);
        } else {
          try {
            observation = await ToolRegistry.getInstance().executeTool(call.name, call.arguments);
            logger.logInfo(`Tool "${call.name}" executed successfully. Output length: ${observation.length}`);

            if (call.name === 'edit_file' || call.name === 'create_file') {
              const targetPath = call.arguments.path;
              if (typeof targetPath === 'string' && vscode.workspace.workspaceFolders?.[0]) {
                const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
                const fileUri = vscode.Uri.file(path.resolve(root, targetPath));
                await FileIndexer.getInstance().indexSingleFile(fileUri);
              }
            }
          } catch (toolError) {
            const errMsg = toolError instanceof Error ? toolError.message : String(toolError);
            observation = `[Tool Execution Error for "${call.name}"]: ${errMsg}\nAnalyze this failure and self-correct your plan.`;
            logger.logError(`Execution failed for tool "${call.name}"`, toolError);
          }
        }

        if (options?.onToolEnd) {
          options.onToolEnd(call.name, observation);
        }

        if (call.name === 'edit_file' && call.arguments.path && options?.onDiffProposed) {
          const chkMatch = observation.match(/Checkpoint saved:\s*([a-zA-Z0-9_-]+)/);
          const chkId = chkMatch ? chkMatch[1] : undefined;
          options.onDiffProposed(String(call.arguments.path), chkId);
        }

        this.memoryManager.appendMessage({
          role: 'tool',
          name: call.name,
          content: observation,
        });
      }

      this.setState('THINKING', options?.onStateChange);
    }

    this.setState('IDLE', options?.onStateChange);
    const emergencyWarning = `[Safety Circuit Breaker Triggered] Logan Agent reached the maximum execution limit (${ReActEngine.MAX_STEPS} steps) for this task without converging. Autonomous execution halted to protect context window and token expenditure.`;
    logger.logError('Safety Circuit Breaker limit reached.');
    this.memoryManager.appendMessage({ role: 'assistant', content: emergencyWarning });

    await FileIndexer.getInstance().syncDirtyFiles();

    return emergencyWarning;
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
