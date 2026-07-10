# Logan Agent: Provider Abstraction & Routing Engine Specification

**Document Version:** 1.0.0  
**Status:** Approved Specification (Phase 0 - Step 2)  
**Parent Blueprint:** `docs/00_project_overview.md`  
**Target Module:** Provider Abstraction Layer (PAL) & Intelligent Task Router

---

## 1. Introduction & Architectural Objectives

The **Provider Abstraction & Routing Engine** is the foundational communication backbone of Logan Agent. Modern autonomous coding agents face a complex vendor landscape where APIs differ vastly in streaming protocols, tool-calling definitions, prompt caching semantics, and token accounting formats. Direct coupling to a single model vendor introduces vendor lock-in, unmitigated cost spikes, and fragility during model deprecations.

The Logan Agent Provider Abstraction Layer (PAL) resolves these challenges by introducing a unified, strongly typed facade that isolates core ReAct reasoning workflows from vendor-specific network payloads. Sitting directly above the PAL is the **Intelligent Task Router**, which dynamically evaluates incoming tasks and routes them across tiered multi-vendor endpoints based on user subscription tiers (`Economy` vs. `Pro`), task cognitive complexity, and token latency budgets.

---

## 2. The Provider Abstraction Layer (PAL) Interface

The PAL establishes a universal contract across all AI vendors. It normalizes text completions, Server-Sent Events (SSE) token streaming, structured tool definitions, execution invocations, and unified token expenditure accounting.

### 2.1 Core Normalized Data Models & TypeScript Interface Contracts

The following architectural interface contracts define the strict normalized data models utilized across the entire Logan Agent runtime:

```typescript
/**
 * Unified message role definitions supported across all provider adapters.
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Cache control specification for prompt caching supported backends (e.g., Anthropic).
 */
export interface CacheControlMetadata {
  type: 'ephemeral';
}

/**
 * Tool call request emitted by the assistant during reasoning loops.
 */
export interface ToolCallPayload {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Individual content block within a conversational turn.
 */
export type ContentBlock =
  | { type: 'text'; text: string; cacheControl?: CacheControlMetadata }
  | { type: 'image_url'; imageUrl: { url: string; detail?: 'low' | 'high' | 'auto' } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean };

/**
 * Unified conversational message payload.
 */
export interface NormalizedMessage {
  role: MessageRole;
  content: string | ContentBlock[];
  name?: string;
}

/**
 * Standardized tool definition schema passed to providers.
 */
export interface NormalizedToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/**
 * Execution configuration parameters for completion requests.
 */
export interface ProviderExecutionOptions {
  modelId: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  tools?: NormalizedToolDefinition[];
  toolChoice?: 'auto' | 'any' | 'none' | { type: 'tool'; name: string };
  signal?: AbortSignal;
}

/**
 * Granular token accounting and cost estimation metrics.
 */
export interface TokenAccountingMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedPromptTokens?: number;
  estimatedCostUSD?: number;
}

/**
 * Streaming event emitted during asynchronous SSE processing.
 */
export type StreamEvent =
  | { type: 'content_delta'; delta: string }
  | { type: 'reasoning_delta'; delta: string }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_delta'; id: string; argumentsDelta: string }
  | { type: 'usage_metadata'; usage: TokenAccountingMetrics }
  | { type: 'stream_end'; finishReason: 'stop' | 'tool_calls' | 'length' | 'error' };

/**
 * Complete, non-streaming completion response.
 */
export interface NormalizedCompletionResponse {
  id: string;
  modelId: string;
  content: string;
  reasoningContent?: string;
  toolCalls?: ToolCallPayload[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  usage: TokenAccountingMetrics;
}

/**
 * Master Provider Adapter Interface required for all vendor implementations.
 */
export interface IProviderAdapter {
  readonly vendorName: string;
  readonly supportedModels: string[];

  /**
   * Execute a synchronous (buffered) chat completion request.
   */
  complete(
    messages: NormalizedMessage[],
    options: ProviderExecutionOptions
  ): Promise<NormalizedCompletionResponse>;

  /**
   * Execute an asynchronous (SSE) streaming chat completion request.
   */
  stream(
    messages: NormalizedMessage[],
    options: ProviderExecutionOptions
  ): AsyncIterable<StreamEvent>;

  /**
   * Generate dense vector embeddings for local RAG retrieval.
   */
  embed?(texts: string[], modelId?: string): Promise<number[][]>;
}
```

---

## 3. Multi-Vendor Adapter Specifications

Each vendor adapter acts as a bidirectional translation layer between the PAL `NormalizedMessage` / `StreamEvent` schemas and the vendor-specific REST/SSE APIs.

```
+---------------------------------------------------------------------------------+
|                         LOGAN AGENT REASONING CORE                              |
|                   (Operates strictly on Normalized Schemas)                     |
+---------------------------------------------------------------------------------+
                                         │
                                         ▼
+---------------------------------------------------------------------------------+
|                        PROVIDER ABSTRACTION LAYER (PAL)                         |
+---------------------------------------------------------------------------------+
          │                              │                              │
          ▼                              ▼                              ▼
+-------------------+          +-------------------+          +-------------------+
|  OpenAI Adapter   |          | Anthropic Adapter |          |  GapGPT Adapter   |
+-------------------+          +-------------------+          +-------------------+
| • Standard Chat   |          | • Native Prompt   |          | • Qwen 3.6 Std    |
| • Function Calling|          |   Caching Headers |          | • Qwen Thinking   |
| • Embedding API   |          | • Ephemeral Blocks|          | • Z-Image Vision  |
+-------------------+          +-------------------+          +-------------------+
```

### 3.1 OpenAI Adapter Specification
The OpenAI Adapter connects Logan Agent to OpenAI models (`gpt-4o`, `o1`, `o3-mini`) and text embedding endpoints (`text-embedding-3-small`, `text-embedding-3-large`).

* **Request Normalization:**
  * Translates `NormalizedToolDefinition` directly into OpenAI's `tools` payload structure (`type: "function", function: { ... }`).
  * For reasoning models (`o1`, `o3-mini`), maps system messages to user role prefixes or `developer` roles as dictated by endpoint requirements, and strips incompatible parameters (e.g., `temperature`, `top_p`) automatically.
* **Stream & SSE Handling:**
  * Parses incoming data chunks (`data: {...}`), mapping `delta.content` to `content_delta` events and `delta.tool_calls` argument streams into incremental JSON accumulation buffers.
* **Embeddings Support:**
  * Implements `embed()` via the `/v1/embeddings` REST endpoint, returning normalized float arrays for local workspace RAG indexing.

### 3.2 Anthropic Adapter Specification (Native Prompt Caching)
The Anthropic Adapter integrates Claude models (`claude-3-5-sonnet`, `claude-3-5-haiku`) via the Messages API (`/v1/messages`). To dramatically optimize costs and latency during multi-turn coding sessions, this adapter implements **Native Prompt Caching** specifications.

* **Prompt Caching Strategy (`cache_control: { type: "ephemeral" }`):**
  * Anthropic allows caching of up to 4 structured blocks per request. The adapter automatically inspects the outgoing message stack and injects `cache_control` headers at three critical breakpoints:
    1. **Breakpoint 1 (System Prompt):** The immutable Logan Agent system prompt, core persona, and tool definitions are placed in the top-level `system` array with ephemeral caching enabled.
    2. **Breakpoint 2 (Static Codebase Context):** Large retrieved files, project structure trees, or reference AST indices injected into conversation history are marked as ephemeral.
    3. **Breakpoint 3 (Recent Turn Horizon):** The last stable assistant turn before active user drafting is marked, ensuring continuous conversational state cache hits.
* **Economic Impact:**
  * Prompt caching reduces read costs on system and context tokens by **up to 90%** and latency by **up to 80%**, enabling Logan Agent to maintain massive multi-file context windows without exceeding user budget ceilings.
* **Response Mapping:**
  * Captures `message_start` usage payloads (`cache_creation_input_tokens`, `cache_read_input_tokens`) and normalizes them into `TokenAccountingMetrics.cachedPromptTokens`.

### 3.3 GapGPT Adapter Specification
The GapGPT Adapter interfaces with enterprise high-throughput endpoints providing access to advanced open-weights and specialized vision models.

* **Supported Endpoint Models:**
  * **Qwen 3.6 Standard:** Ultra-low latency code generation, syntax completion, and localized AST transformations.
  * **Qwen 3.6 Thinking:** Advanced chain-of-thought reasoning endpoint capable of outputting dedicated `<think>...</think>` internal cognitive blocks before emitting final action responses. The adapter separates thinking streams into `reasoning_delta` events.
  * **Z-Image Generation & Vision:** Connects multi-modal inspection capabilities. When visual UI verification tasks occur (e.g., inspecting rendered webview diffs or DOM screenshots), the adapter formats image byte arrays into base64 data URIs compatible with GapGPT vision endpoints.
* **Protocol Compatibility:**
  * Uses OpenAI-compatible wire serialization while injecting GapGPT-specific authentication headers and custom routing metadata.

---

## 4. User Pricing Tiers & Task Routing Strategy

To balance operational cost against cognitive capability, Logan Agent divides model consumption into two clear user-selectable UI subscription tiers. A sophisticated **Triage & Routing Algorithm** operates within each tier to dynamically assign tasks to the optimal underlying LLM.

### 4.1 User Pricing Tiers Specification

| Feature / Dimension | Economy Plan | Pro Plan |
| :--- | :--- | :--- |
| **Target User Segment** | Students, hobbyists, budget-conscious developers | Enterprise developers, software architects, power users |
| **Primary Fast / Light Model** | **Gemini 2.5 Flash Lite** (via Gateway) | **Claude 3.5 Haiku** (with Prompt Caching) |
| **Primary Code / Heavy Model** | **GapGPT Qwen 3.6 Standard** | **Claude Sonnet 5** / **OpenAI GPT-4o** |
| **Deep Reasoning Engine** | **GapGPT Qwen 3.6 Thinking** | **Claude Sonnet 5 (Reasoning)** / **GapGPT Qwen Thinking** |
| **Context Window Limit** | up to 64,000 tokens (Aggressive Pruning) | up to 200,000 tokens (Full Caching & Pruning) |
| **Token Cost Profile** | Ultra-low cost (< $0.50 / million tokens avg) | High performance / Enterprise SLA |

### 4.2 Triage & Routing Algorithm

When a user submits a prompt or triggers an autonomous agent action, the **Intelligent Task Router** intercepts the request before PAL execution. Instead of statically routing to a single model, it executes a deterministic triage classification pipeline:

```
 Incoming User Prompt / Task Event
                 │
                 ▼
+-----------------------------------------------------------------+
|                  TASK TRIAGE CLASSIFIER                         |
|  • Regex & Keyword Analysis    • Requested Tool Complexity      |
|  • Code Modification Scope     • Token Estimation Boundary      |
+-----------------------------------------------------------------+
                 │
                 ├───────────────────────────────┬──────────────────────────────┐
                 ▼                               ▼                              ▼
      [Tier 1: Light Task]              [Tier 2: Code Task]            [Tier 3: Heavy Reasoning]
  (Formatting, Quick Q&A, Git Docs)  (Single-File Refactor, Bug Fix)  (Multi-File Arch, Complex Debug)
                 │                               │                              │
                 ▼                               ▼                              ▼
     +-----------------------+       +-----------------------+      +-----------------------+
     |   Economy: Gemini     |       |   Economy: Qwen Std   |      | Economy: Qwen Think   |
     |   Pro: Claude Haiku   |       |   Pro: Claude Sonnet  |      | Pro: Claude Sonnet 5  |
     +-----------------------+       +-----------------------+      +-----------------------+
```

#### Triage Classification Rules & Heuristics:
1. **Tier 1: Light Tasks (Routed to Fast/Light Models):**
   * **Triggers:** Queries shorter than 150 words with no workspace tool attachments; documentation lookups; commit message generation; variable renaming; syntax explanations.
   * **Routing Decision:** Assigns immediately to `Gemini 2.5 Flash Lite` (Economy) or `Claude 3.5 Haiku` (Pro).
2. **Tier 2: Standard Code Execution Tasks (Routed to Primary Coding Models):**
   * **Triggers:** Explicit tool invocations (`readFile`, `writeFile`, `runTerminalCommand`); single-file refactoring requests; deterministic unit test generation.
   * **Routing Decision:** Assigns to `GapGPT Qwen 3.6 Standard` (Economy) or `Claude Sonnet 5` (Pro).
3. **Tier 3: Heavy Architectural & Deep Reasoning Tasks (Routed to Reasoning Models):**
   * **Triggers:** Multi-file architectural planning; root-cause analysis across complex stack traces (>5 files); compiler type-error chain resolution; visual UI inspection requiring Z-Image vision analysis.
   * **Routing Decision:** Assigns to `GapGPT Qwen 3.6 Thinking` (Economy) or high-capacity reasoning endpoints in the Pro Plan.

#### Fallback & Circuit Breaker Logic:
If a primary routed model responds with rate-limiting HTTP statuses (`429 Too Many Requests`) or service unavailability (`503 Service Unavailable`), the PAL automatically engages exponential backoff and transparently degrades routing to the next available tier adapter within the user's plan, guaranteeing continuous extension availability.
