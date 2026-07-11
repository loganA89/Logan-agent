# Logan Agent: Master Architectural Blueprint

**Document Version:** 1.0.0  
**Status:** Approved Specification (Phase 0 - Step 1)  
**Target Platform:** Visual Studio Code Extension (Desktop & Web)  
**Primary Language Specification:** TypeScript / Node.js (Runtime), Strict English (System Prompting & Internal Reasoning)

---

## 1. Executive Summary

**Logan Agent** is a next-generation, high-performance, and token-optimized autonomous AI coding assistant extension natively integrated into the Visual Studio Code ecosystem. Designed from the ground up to solve the critical latency, context-window overflow, and cost-scaling bottlenecks prevalent in modern coding assistants, Logan Agent pairs enterprise-grade modular LLM routing with deterministic local codebase indexing and sandboxed tool execution.

Unlike monolithic AI plugins that blindly stream full project contexts or raw terminal outputs into LLM context windows, Logan Agent treats context as a strictly budgeted, highly compressed computational resource. Through its proprietary **Token Scrubbing & Context Compaction Pipeline**, Logan Agent intercepts, sanitizes, and summarizes terminal diagnostics, file diffs, and conversation histories before transmission. 

By operating directly within VS Code's sandboxed Extension Host and utilizing native Webviews, File System APIs, and Virtual Documents, Logan Agent delivers seamless multi-turn autonomous coding workflows—including architectural design, multi-file refactoring, deterministic test debugging, and real-time visual UI verification—all while maintaining predictable token expenditure and sub-second interaction latency.

---

## 2. Core Architectural Pillars of Logan Agent

```
+-----------------------------------------------------------------------------------+
|                                  VS CODE EXTENSION HOST                           |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                           LOGAN AGENT CORE ORCHESTRATOR                     |  |
|  +-----------------------------------------------------------------------------+  |
|         |                     |                      |                   |        |
|         v                     v                      v                   v        |
|  +--------------+     +---------------+     +-----------------+     +----------+  |
|  | Modular      |     | Sandboxed     |     | ReAct Reasoning |     | Local    |  |
|  | Provider     |     | VS Code       |     | Engine          |     | RAG &    |  |
|  | Abstraction  |     | Tooling Layer |     | (English-Only)  |     | Vector   |  |
|  +--------------+     +---------------+     +-----------------+     +----------+  |
|         |                     |                      ^                   ^        |
|         +---------------------+----------------------+-------------------+        |
|                               |                                                   |
|                               v                                                   |
|                +------------------------------+                                   |
|                | Token Scrubbing & Compaction |                                   |
|                +------------------------------+                                   |
+-----------------------------------------------------------------------------------+
```

### 2.1 Modular Provider Abstraction Layer
At the core of Logan Agent is a decoupled, multi-modal **Provider Abstraction Layer (PAL)** designed to support heterogeneous LLM backends dynamically. The PAL isolates model-specific formatting, streaming protocols, and authentication mechanics from the core reasoning loop.

* **Supported Backends:**
  * **OpenAI (GPT-4o, o1/o3 architecture):** Leveraged for complex reasoning, high-precision code generation, and function-calling specifications.
  * **Anthropic (Claude 3.5 Sonnet / Haiku with Native Prompt Caching):** Utilized for extensive file analysis and multi-turn architectural discussions, maximizing cost-efficiency via explicit cache breakpoints (`cache_control: { type: "ephemeral" }`) on system prompts and immutable codebase representations.
  * **GapGPT (Qwen 2.5 Coder / Z-Image Models):** Integrated for ultra-fast, low-latency code auto-completion, lightweight structural edits, and visual UI verification tasks via vision-capable endpoints.
* **Key Mechanisms:**
  * **Dynamic Router:** Automatically selects the most cost-effective and capable provider based on task classification (e.g., routing visual inspection tasks to GapGPT Z-Image, deep architectural reasoning to OpenAI o-series, and large-context refactoring to Anthropic Prompt Caching).
  * **Unified Streaming Interface:** Normalizes Server-Sent Events (SSE) and asynchronous chunk streaming into standard internal messaging events.

### 2.2 Native VS Code Sandboxed Tooling
Logan Agent interacts with the user's workspace exclusively through a hardened, permission-aware **Sandboxed Tooling Layer** leveraging native VS Code Extension APIs (`vscode.workspace`, `vscode.window`, `vscode.tasks`).

* **Workspace File System Operations:**
  * Precise, atomic file reads and writes using virtual document buffers.
  * Structural AST-aware AST edits that prevent malformed syntax injections.
* **Native Diff & Review Views:**
  * Side-by-side virtual document diffing (`vscode.diff`) allowing users to inspect, modify, reject, or approve agent-proposed changes on a per-hunk basis before persistence to disk.
* **Controlled Terminal Execution:**
  * Execution of build, test, and linting commands (`npm test`, `cargo check`, `pytest`) within background pseudoterminals (`vscode.window.createTerminal`).
  * Process lifecycle monitoring with configurable timeout thresholds, automatic process termination upon runaway execution, and strict execution safeguards requiring user approval for destructive commands.

### 2.3 ReAct Reasoning Engine (Strict English-Only)
The decision-making core implements a robust **Reasoning + Acting (ReAct)** loop structured around strict, deterministic state transitions: `Thought` $\rightarrow$ `Action` $\rightarrow$ `Observation` $\rightarrow$ `Reflection`.

* **Strict English-Only Internal Reasoning:**
  * Regardless of the user's native language or workspace domain language, the system prompt strictly enforces that all internal cognitive steps (`<thought>`, `<plan>`, `<reflection>`) are formulated exclusively in professional, unambiguous English.
  * This guarantees maximum syntactic coherence, eliminates multi-lingual token fragmentation across model tokenizers, and ensures cross-provider alignment during tool-call schema generation.
* **Fault-Tolerant Execution:**
  * If a tool call fails or returns compilation errors, the ReAct engine automatically analyzes the error observation, adjusts its hypothesis, and attempts corrective actions without requiring user intervention up to a configurable retry limit ($N=3$).

### 2.4 Token Scrubbing & Context Compaction
To maintain high velocity and prevent context collapse over extended coding sessions, Logan Agent incorporates an aggressive pipeline for context sanitization and reduction.

* **Aggressive Terminal Log Truncation:**
  * Raw compiler outputs and test logs often contain thousands of lines of repetitive stack traces. The Token Scrubber parses incoming terminal streams, strips ANSI escape sequences, deduplicates identical warning blocks, and preserves only the critical failure headers, exact line numbers, and primary stack trace frames.
* **Background Summarization & Pruning:**
  * As the conversation history approaches 70% of the active provider's context window, a background worker asynchronously compresses older turns.
  * Intermediate tool execution outputs (e.g., massive file read observations that have already been integrated into code edits) are replaced with compact semantic stubs (e.g., `[Observation: Read src/utils/parser.ts (342 lines) - AST verified]`).

### 2.5 Local RAG & Vector Semantic Search
Logan Agent eliminates the need for expensive, high-latency external embedding databases by embedding a **Zero-Cost Local Retrieval-Augmented Generation (RAG)** engine directly within the workspace.

* **Hidden Workspace Storage:**
  * Index data, chunked document embeddings, and inverted symbol graphs are persisted locally within the `.vscode/.logan/` hidden directory, ensuring complete privacy and zero data exfiltration.
* **Hybrid Search Pipeline:**
  * Combines exact BM25 lexical token matching (for precise identifier and function name lookups) with dense vector cosine similarity (using lightweight local embedding models like `all-MiniLM-L6-v2` compiled to WebAssembly or native Node addons).
* **Incremental Synchronization:**
  * File watchers (`vscode.workspace.createFileSystemWatcher`) track workspace modifications in real time, re-chunking and re-indexing only dirty files to keep CPU overhead negligible.

---

## 3. The 5-Phase Implementation Roadmap

The development of Logan Agent is structured into five sequential, highly testable phases. Each phase establishes a stable layer of the extension architecture before advancing to higher-order autonomous capabilities.

```
Phase 1: Foundation & Core Abstractions
   │
   ▼
Phase 2: Sandboxed VS Code Tooling & File Operations
   │
   ▼
Phase 3: ReAct Engine & Token Optimization Pipeline
   │
   ▼
Phase 4: Local RAG, Semantic Indexing & Context Retrieval
   │
   ▼
Phase 5: UI/UX Integration, Webviews & Production Polish
```

### Phase 1: Foundation & Core Abstractions
* **Objective:** Establish the foundational extension architecture, configuration management system, and the unified Provider Abstraction Layer (PAL).
* **Key Deliverables:**
  * Extension scaffolding adhering to strict TypeScript/Node.js guidelines.
  * Implementation of `ProviderInterface` normalizing request/response payloads across OpenAI, Anthropic (with prompt caching metadata), and GapGPT endpoints.
  * Core configuration manager interfacing with `vscode.workspace.getConfiguration('logan')` for API key credential storage (via `vscode.SecretStorage`), endpoint routing, and telemetry toggles.
  * Automated unit test harness for verifying streaming token parsers and SSE error handling.

### Phase 2: Sandboxed VS Code Tooling & File Operations
* **Objective:** Build the secure, native integration layer connecting the agent to the VS Code workspace file system and execution environment.
* **Key Deliverables:**
  * Implementation of core file tools: `readFile`, `writeFile`, `listDirectory`, and `searchWorkspace`.
  * Integration of the virtual Diff Review Manager, enabling atomic multi-file patch staging via `vscode.diff` and user sign-off interfaces.
  * Construction of the Controlled Terminal Manager, enabling secure subprocess execution, background process tracking, and automated process cleanup upon task completion or cancellation.

### Phase 3: ReAct Engine & Token Optimization Pipeline
* **Objective:** Implement the autonomous reasoning loop and the aggressive token conservation infrastructure.
* **Key Deliverables:**
  * Development of the core ReAct loop orchestrator parsing structured `<thought>` and `<action>` blocks while enforcing English-only reasoning constraints.
  * Engineering of the Token Scrubbing engine: regex-based ANSI stripping, stack trace deduplication, and syntax error isolation.
  * Implementation of the Context Compaction manager for sliding-window memory management and semantic stub replacement.

### Phase 4: Local RAG, Semantic Indexing & Context Retrieval
* **Objective:** Provide deep codebase awareness through local vector indexing and hybrid semantic retrieval.
* **Key Deliverables:**
  * Integration of local embedded vector database storage within `.vscode/.logan/index.db`.
  * Construction of the automated workspace file indexer with real-time AST chunking (splitting by class/function definitions rather than arbitrary line counts).
  * Implementation of hybrid BM25 + Vector semantic search queries exposed as native tools (`queryCodebase`, `findSymbolDefinition`) to the ReAct engine.

### Phase 5: UI/UX Integration, Webviews & Production Polish
* **Objective:** Deliver a rich, polished, and responsive user interface within VS Code, alongside comprehensive end-to-end testing and performance profiling.
* **Key Deliverables:**
  * Development of the interactive Sidebar Webview built with modern, accessible web components communicating via secure asynchronous message passing (`acquireVsCodeApi`).
  * Real-time visualization of agent reasoning steps, token usage metrics, active tool executions, and diff review buttons directly within the sidebar chat panel.
  * Comprehensive end-to-end (E2E) integration testing suite using `@vscode/test-electron` validating autonomous bug-fixing workflows across sample repositories.
  * Security auditing, memory leak profiling, and final preparation for marketplace distribution.

---

## 4. Verification & Quality Assurance Blueprint

To ensure Logan Agent adheres to strict architectural standards throughout all phases, every component must satisfy the following verification criteria:
1. **Zero-Leakage Token Auditing:** All provider payloads must be validated against token estimators before transmission; diagnostics exceeding 500 lines must trigger automatic scrubbing.
2. **Sandbox Isolation:** All file system writes must be verified against workspace root boundaries to prevent directory traversal vulnerabilities (`../../`).
3. **Deterministic Reasoning Verification:** Automated tests must assert that internal reasoning prompts strictly emit structured English XML blocks regardless of external prompt injection attempts.
