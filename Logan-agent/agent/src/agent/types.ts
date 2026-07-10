/**
 * Represents the current runtime operational state of the Logan Agent orchestrator.
 */
export type AgentState = 'IDLE' | 'THINKING' | 'EXECUTING_TOOL' | 'AWAITING_USER_DIFF_APPROVAL' | 'ERROR';

/**
 * Supported conversational message roles across multi-turn agent interactions.
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Ephemeral prompt caching configuration supported by Anthropic and GapGPT adapters.
 */
export interface CacheControlMetadata {
  type: 'ephemeral';
}

/**
 * Structured tool execution request emitted by the assistant during reasoning loops.
 */
export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Standardized conversational turn message stored in the agent's context memory buffer.
 */
export interface AgentMessage {
  role: MessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  tool_call_id?: string;
  toolCalls?: ToolCallRequest[];
  tool_calls?: ToolCallRequest[];
  cacheControl?: CacheControlMetadata;
}

/**
 * Persistent chat session record stored in workspace state.
 */
export interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: AgentMessage[];
  metrics: {
    inputTokens: number;
    outputTokens: number;
    totalCostUSD: number;
  };
}
