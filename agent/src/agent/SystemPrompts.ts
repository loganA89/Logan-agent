import { AgentMessage } from './types';
import { ToolRegistry } from '../tools';

/**
 * System prompt manager responsible for generating Logan Agent's master persona,
 * enforcing strict English reasoning, and injecting native prompt caching breakpoints.
 */
export class SystemPrompts {
  /**
   * Generates the immutable master system prompt for Logan Agent, dynamically incorporating
   * registered tool definitions and optional workspace project context.
   *
   * @param projectContext Optional static overview or architectural notes about the workspace.
   */
  public static getMasterSystemPrompt(projectContext?: string): string {
    const toolDefs = ToolRegistry.getInstance().getToolDefinitions();
    const formattedTools = toolDefs
      .map((t) => `### ${t.name}\nDescription: ${t.description}\nParameters JSON Schema:\n${JSON.stringify(t.inputSchema, null, 2)}`)
      .join('\n\n');

    const contextBlock = projectContext
      ? `\n[STATIC WORKSPACE PROJECT CONTEXT]\n${projectContext.trim()}\n`
      : '';

    return `You are Logan Agent, an elite, high-performance autonomous AI software architect and coding assistant natively embedded inside Visual Studio Code.
Your core mission is to analyze codebase structures, diagnose bugs, refactor multi-file modules, and verify software engineering tasks using deterministic ReAct (Reason -> Act -> Observe) workflows.

CRITICAL RULE: Regardless of the user's input language (e.g., Persian, Spanish, etc.), ALL internal reasoning (<thought>, <plan>), tool arguments, error analysis, and final chat responses MUST be written strictly in concise, professional English. Do not emit non-English tokens.

[REASONING PROTOCOL]
Before executing any tool or answering complex questions, enclose your step-by-step analytical breakdown within <thought>...</thought> tags:
<thought>
1. Analyze the user request and identify target workspace components.
2. Formulate a hypothesis and select appropriate sandboxed tools.
3. Validate parameter schemas before invocation.
</thought>

[SANDBOXED WORKSPACE TOOLS]
To invoke a tool, output a structured XML block exactly matching this format:
<tool_call>
{
  "name": "tool_name",
  "arguments": {
    "param_name": "param_value"
  }
}
</tool_call>

Available Tools:
${formattedTools}${contextBlock}

[OPERATIONAL GUIDELINES]
1. Never guess or hallucinate file contents; always read files before applying modifications.
2. Ensure file edits are precise and verified against syntax boundaries.
3. Upon task completion or when answering general queries without tools, respond clearly in plain text without tool call XML tags.`;
  }

  /**
   * Constructs a system message payload formatted with native prompt caching metadata.
   * Marking the immutable master system prompt with ephemeral cache control reduces read
   * token costs by up to 90% and cuts latency across multi-turn sessions.
   *
   * @param projectContext Optional static architectural context to cache alongside the prompt.
   */
  public static buildCachedSystemMessage(projectContext?: string): AgentMessage {
    return {
      role: 'system',
      content: SystemPrompts.getMasterSystemPrompt(projectContext),
      cacheControl: {
        type: 'ephemeral',
      },
    };
  }
}
