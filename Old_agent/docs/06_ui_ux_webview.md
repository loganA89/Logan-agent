# Logan Agent: UI/UX Webview Sidebar & Cost Control Architecture

**Document Version:** 1.0.0  
**Status:** Approved Specification (Phase 0 - Step 7)  
**Parent Blueprint:** `docs/00_project_overview.md`  
**Target Module:** Webview Sidebar Provider, Real-Time Telemetry Dashboard & Interactive Approval Interface

---

## 1. Introduction & Architectural Objectives

The effectiveness of an autonomous coding assistant relies heavily on developer trust, ergonomics, and observability. If an AI agent operates as an opaque black box—executing complex background file modifications without visual status indicators or budget ceilings—developers quickly experience cognitive fatigue, anxiety over uncontrolled token expenditures, and hesitation when authorizing structural changes.

The **Logan Agent UI/UX Webview Sidebar** acts as the command center for developer interaction. Built as a responsive, accessible web interface embedded directly inside VS Code's primary side bar container (`vscode.window.registerWebviewViewProvider`), the UI bridges human intuition with autonomous ReAct execution. By providing real-time visual streaming of internal cognitive loops (`<thought>`), live token and cost calculation dashboards, interactive diff approval buttons, and single-click Time-Travel rollback triggers, Logan Agent delivers absolute transparency and control over autonomous workflows.

---

## 2. VS Code Sidebar Webview Architecture

To maintain high UI responsiveness and adhere to strict sandbox isolation, Logan Agent implements a decoupled Webview architecture using modern HTML5, CSS Grid/Flexbox layouts, and Vanilla TypeScript/Web Components without bulky external UI framework overhead.

```
+-----------------------------------------------------------------------------------+
|                         VS CODE PRIMARY SIDE BAR VIEW                             |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | [Plan: (•) Pro Plan v]  [Tokens: 14.2k | Cost: $0.014 | Cached: 82%]        |  |
|  +-----------------------------------------------------------------------------+  |
|  |                                                                             |  |
|  |  User: Refactor user session caching in RedisService.ts                     |  |
|  |                                                                             |  |
|  |  +-----------------------------------------------------------------------+  |  |
|  |  | [v] Internal Reasoning (Thought Process - 4.2s)                       |  |  |
|  |  |     Analyzing RedisService.ts structure and identifying TTL methods.  |  |  |
|  |  +-----------------------------------------------------------------------+  |  |
|  |  | [*] Active Tool: Reading src/services/RedisService.ts (AST verified)  |  |  |
|  |  +-----------------------------------------------------------------------+  |  |
|  |                                                                             |  |
|  |  Agent: I have generated an updated Redis caching pattern with strict TTL.  |  |
|  |                                                                             |  |
|  |  +-----------------------------------------------------------------------+  |  |
|  |  | [!] Modified: src/services/RedisService.ts (Diff Staged)             |  |  |
|  |  | [ Open Diff Review Panel ]  [ Approve ]  [ Reject / Undo Step ]       |  |  |
|  |  +-----------------------------------------------------------------------+  |  |
|  +-----------------------------------------------------------------------------+  |
|  | [ Ask Logan or type '/' for commands...                                ] [>]|  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

### 2.1 Secure Asynchronous Message Passing Bridge
Webviews operate inside isolated web browser iframes without direct network or system API permissions. Communication between the Webview UI frontend and the Node.js Extension Host Core relies exclusively on bi-directional asynchronous JSON message passing via `acquireVsCodeApi()`.

```
+-----------------------------------------------------------------------------------+
|                            SIDEBAR WEBVIEW FRONTEND                               |
|        UI Components • DOM Rendering • Event Handlers • State Store              |
+-----------------------------------------------------------------------------------+
       │                                                                      ^
       │ postMessage({ type: 'COMMAND_EXECUTE_PROMPT', payload: {...} })      │
       ▼                                                                      │
+-----------------------------------------------------------------------------------+
|                         VS CODE ASYNC IPC BRIDGE                                  |
|                 ExtensionContext.subscriptions / window.onDidReceiveMessage       |
+-----------------------------------------------------------------------------------+
       │                                                                      ^
       ▼                                                                      │
+-----------------------------------------------------------------------------------+
|                           EXTENSION HOST BACKEND CORE                             |
|        Provider Routing Core • ReAct Engine • Tool Sandbox • File System          |
|                                                                                   |
|        webviewView.webview.postMessage({                                          |
|          type: 'EVENT_STREAM_DELTA',                                              |
|          payload: { deltaContent, tokenMetrics }                                  |
|        })                                                                         |
+-----------------------------------------------------------------------------------+
```

#### Message Protocol Contract:
* **UI $\rightarrow$ Host Commands:**
  * `COMMAND_EXECUTE_PROMPT`: Initiates a new user task turn.
  * `COMMAND_SELECT_PLAN`: Updates active pricing plan tier (`Economy` vs `Pro`).
  * `COMMAND_APPROVE_DIFF`: Authorizes disk write for pending virtual patch.
  * `COMMAND_TIME_TRAVEL_ROLLBACK`: Triggers atomic file system and memory rollback.
* **Host $\rightarrow$ UI Events:**
  * `EVENT_STREAM_DELTA`: Streams partial token chunks (`content_delta` / `reasoning_delta`).
  * `EVENT_TOOL_EXECUTION_STATE`: Updates UI badges for active tool executions.
  * `EVENT_TELEMETRY_UPDATE`: Broadcasts live token usage metrics and cost calculations.

---

## 3. Plan Selector & Real-Time Cost Dashboard

Managing AI operational costs requires visibility into token expenditure at every step of a session. The top bar of the Logan Agent Webview embeds an interactive **Plan Selector & Live Cost Calculator**.

### 3.1 Tier Switching UI Toggle
Developers can switch between model pricing tiers dynamically via a persistent header dropdown:
* **`Economy Plan` (`Gemini Flash Lite + Qwen 3.6`):** Optimized for ultra-low token expenditure during exploratory drafting, formatting, or documentation searches.
* **`Pro Plan` (`Claude 3.5 Haiku / Sonnet 5 + Qwen Thinking`):** Engaged for high-complexity architectural reasoning, complex debugging, and multi-file code transformations.

When switched mid-conversation, the underlying Provider Abstraction Layer immediately maps upcoming ReAct turns to the corresponding provider endpoints without interrupting session state.

### 3.2 Real-Time Cost Calculator Architecture
The telemetry dashboard calculates and renders session financial metrics in real time by aggregating data from every incoming `usage_metadata` event:

$$\text{Session Cost USD} = \sum_{t \in Turns} \left( \frac{T_{prompt} \times R_{in}}{1,000,000} + \frac{T_{cached} \times R_{cache\_read}}{1,000,000} + \frac{T_{completion} \times R_{out}}{1,000,000} \right)$$

* **Real-Time Token Display:** Visual counters track raw `Prompt Tokens`, `Completion Tokens`, and `Total Session Tokens`.
* **Prompt Caching Efficiency Gauge:** Displays the percentage of context tokens served from vendor ephemeral cache (`Cached: 82%`). High cache hit rates turn the badge green, indicating maximum cost efficiency.
* **Live Dollar Estimation:** Translates token counts into exact dollar amounts (`$0.0143`), updated continuously during streaming responses.

---

## 4. Interactive ReAct Stream & Time-Travel Controls

To make autonomous reasoning comprehensible without visual clutter, the chat display organizes agent output into structured, interactive UI components.

### 4.1 Visual Thinking & Tool Execution Components
* **Collapsible `<thought>` Blocks:** When the ReAct engine emits internal cognitive deduction streams (`reasoning_delta`), the UI renders an accordion component titled `Internal Reasoning (Thought Process - X.Xs)`. By default, this component is collapsed to keep the chat view clean, but users can expand it to inspect the agent's exact step-by-step hypothesis formulation.
* **Active Tool Execution Badges:** When the agent invokes a tool, an animated status badge appears directly in the stream:
  * File Operations: `[*] Reading src/services/RedisService.ts (340 lines)...`
  * Index Queries: `[?] Searching local RAG index for "session TTL"...`
  * Shell Execution: `[>] Executing terminal command: npm run test:unit...`
* **Terminal Status Icons:** Upon command completion, the badge updates to show a green checkmark `[✓]` for exit code 0 or a red cross `[✗]` along with summarized failure diagnostics.

### 4.2 Prominent Undo / Rewind Step Action Button
Every completed agent action block that mutates workspace files surfaces an interactive rollback toolbar:
* **Visual Styling:** A prominent red/amber button labeled **`Undo / Rewind Step`** accompanied by a rewind arrow icon.
* **Interaction Flow:** Clicking this button sends the `COMMAND_TIME_TRAVEL_ROLLBACK` payload to the extension host, initiating the atomic file system restoration and chat memory rollback detailed in `docs/04_time_travel_rollback.md`.

---

## 5. Interactive Diff Approval Workflow

Logan Agent adheres to the core security principle that **no file mutation is saved to physical disk without user authorization**. When the ReAct engine invokes `edit_file` or `write_file`, the UI triggers the interactive diff approval workflow.

```
[Agent Emits edit_file Patch]
             │
             ▼
+-----------------------------------------------------------------+
|              STAGE 1: STAGE VIRTUAL PATCH IN HOST               |
|  Extension Host opens side-by-side `vscode.diff` review editor  |
+-----------------------------------------------------------------+
             │
             ▼
+-----------------------------------------------------------------+
|               STAGE 2: RENDER SIDEBAR DIFF CARD                 |
|  Display Card: • Target File Path: src/services/RedisService.ts |
|                • Action Buttons: [View Diff] [Approve] [Reject] |
+-----------------------------------------------------------------+
             │
      ┌──────┴──────┐
      ▼             ▼
 [User Clicks    [User Clicks
  Approve]        Reject / Undo]
      │             │
      ▼             ▼
Write to Disk   Discard Virtual Buffer
Continue Loop   Execute Rollback Engine
```

### 5.1 Diff Review UI Card Specification
Inside the chat timeline, pending code modifications render inside a dedicated **Staged Diff Card**:
* **File Identifier Header:** Shows the workspace relative path (`src/services/RedisService.ts`) and a summary tag (`+24 lines / -8 lines`).
* **`Open Diff Review Panel` Button:** Clicking this button focuses the editor group onto the native VS Code side-by-side `vscode.diff` tab, letting the developer inspect changes on a granular hunk-by-hunk basis.
* **`Approve Changes` Button (Primary Action):** Explicitly commits the virtual document buffer to physical disk via `vscode.workspace.fs.writeFile()` and notifies the ReAct loop that the tool observation is verified.
* **`Reject / Undo Step` Button (Secondary Action):** Instantly closes the virtual diff editor, discards pending edits in memory, and triggers the Time-Travel Rollback engine, returning the conversation prompt to pre-execution state.
