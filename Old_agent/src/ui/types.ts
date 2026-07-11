/**
 * Message command identifiers sent from Webview UI Frontend to Extension Host Core.
 */
export type WebviewCommandType =
  | 'SEND_PROMPT'
  | 'SWITCH_PLAN'
  | 'APPROVE_DIFF'
  | 'REJECT_DIFF'
  | 'TRIGGER_ROLLBACK'
  | 'CLEAR_CHAT'
  | 'ABORT_GENERATION'
  | 'NEW_CHAT'
  | 'LOAD_CHAT'
  | 'GET_SESSIONS_LIST'
  | 'DELETE_CHAT'
  | 'TOGGLE_TOOL'
  | 'GET_AVAILABLE_TOOLS'
  | 'UPDATE_TOOL_SELECTION';

export interface WebviewIncomingMessage {
  type: WebviewCommandType;
  payload?: {
    prompt?: string;
    plan?: 'economy' | 'pro';
    filePath?: string;
    checkpointId?: string;
    sessionId?: string;
    toolName?: string;
    enabled?: boolean;
    allSelected?: boolean;
    selectedTools?: string[];
  };
}

/**
 * Event event identifiers sent from Extension Host Core to Webview UI Frontend.
 */
export type ExtensionEventType =
  | 'STREAM_CHUNK'
  | 'THINKING_STEP'
  | 'TOOL_EXECUTION_START'
  | 'TOOL_EXECUTION_END'
  | 'TOKEN_USAGE_UPDATE'
  | 'DIFF_PROPOSED'
  | 'ERROR_ALERT'
  | 'GENERATION_ABORTED'
  | 'SESSIONS_LIST_UPDATED'
  | 'CHAT_LOADED'
  | 'AVAILABLE_TOOLS_DATA';

export type ToolCategory = 'File Ops' | 'Terminal' | 'Search & RAG' | 'Media';

export interface ToolMetadataItem {
  name: string;
  description: string;
  category: ToolCategory;
  enabled: boolean;
}

export interface ExtensionOutgoingEvent {
  type: ExtensionEventType;
  payload: {
    chunk?: string;
    step?: number;
    description?: string;
    toolName?: string;
    observation?: string;
    filePath?: string;
    checkpointId?: string;
    errorMessage?: string;
    sessions?: Array<{ id: string; title: string; timestamp: number }>;
    messages?: Array<{ role: string; content: string }>;
    tools?: ToolMetadataItem[];
    metrics?: {
      inputTokens: number;
      outputTokens: number;
      cachedTokens?: number;
      totalTokens: number;
      estimatedCostUSD?: number;
    };
  };
}
