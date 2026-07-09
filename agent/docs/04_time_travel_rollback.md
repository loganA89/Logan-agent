# Logan Agent: Checkpoint & Time-Travel Rollback Engine

**Document Version:** 1.0.0  
**Status:** Approved Specification (Phase 0 - Step 5)  
**Parent Blueprint:** `docs/00_project_overview.md`  
**Target Module:** Transactional State Management & Time-Travel Rollback Controller

---

## 1. The Problem Statement

When autonomous coding agents execute multi-step tool workflows—such as refactoring interconnected module interfaces, running automated migration scripts, or applying cross-file regex replacements—they operate under incomplete global knowledge. Even advanced reasoning models inevitably introduce breaking compilation bugs, unintended side effects, or structural regressions during exploratory coding sessions.

In conventional AI assistant implementations, recovering from a flawed agent execution is tedious and error-prone. Users are forced to manually parse git diffs, reverse complex file modifications across multiple directories, and instruct the LLM to "forget" or ignore its previous incorrect reasoning steps. If the AI's conversation context still contains the failed assumptions and erroneous patches, subsequent turns suffer from severe hallucination and compounding logical errors.

To provide absolute developer confidence and rapid experimentation velocity, Logan Agent introduces the **Checkpoint & Time-Travel Rollback Engine**. This system delivers an instantaneous, atomic "Ctrl+Z" mechanism that simultaneously rewinds both the physical workspace file system and the agent's internal conversational memory back to a verified, pristine pre-execution checkpoint.

---

## 2. Conversation History Rewind (Chat State Rollback)

An agent's decision-making behavior is entirely determined by its conversational context buffer (`messages[]`). If a file refactoring fails, simply restoring the disk files without reverting the LLM's memory leaves the agent in an asynchronous cognitive state, believing its changes are still active or attempting to fix a bug that has already been erased.

The **Chat State Rollback Engine** treats conversational turns as transactional stacks:

```
Before Rollback (Corrupted State):
[messages[] Buffer]
  ├── [Turn 1]: User: "Refactor AuthController to use JWT"
  ├── [Turn 2]: Assistant: <thought>... <tool_call: edit_file(AuthController.ts)>
  ├── [Turn 3]: Tool Observation: [File modified successfully]
  ├── [Turn 4]: Assistant: <thought>... <tool_call: run_terminal_command(npm test)>
  └── [Turn 5]: Tool Observation: [FAIL: 14 tests failing due to broken import]
                                      │
                                      ▼
                        [User Triggers Time-Travel Rollback]
                                      │
                                      ▼
After Rollback (Pristine Restored State):
[messages[] Buffer]
  └── [Turn 1]: User: "Refactor AuthController to use JWT"
```

### 2.1 State Slicing Architecture
When a rollback event is triggered for Checkpoint ID $C_k$, the orchestrator queries the internal transaction ledger to identify the exact array index $I_{checkpoint}$ where the checkpoint was established.
* **Atomic Array Slicing:** The runtime executes an in-place slice: `messages = messages.slice(0, I_{checkpoint})`.
* **Cognitive Purge:** All assistant thoughts, intermediate tool calls (`edit_file`, `write_file`), and failure observations executed after $C_k$ are permanently purged from memory.
* **Context Synchronization:** When the user submits their next prompt or retry instruction, the Provider Abstraction Layer receives a clean context window identical to the exact millisecond before the failed execution sequence began.

---

## 3. Pre-Execution Workspace Snapshotting (File System Rollback)

To guarantee that file system restorations occur in sub-second latency without relying on external system tools or corrupting the developer's local Git staging area, Logan Agent manages an independent, lightweight **Local Snapshot Registry** within VS Code's isolated extension storage.

```
+-----------------------------------------------------------------------------------+
|                           AGENT TOOL INVOCATION EVENT                             |
|              Intercepted before `edit_file` or `run_terminal_command`             |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
|                        AUTOMATED CHECKPOINT TRIGGER                               |
|   1. Generate unique Checkpoint ID: `chk_timestamp_uuid`                          |
|   2. Identify target files (or all dirty workspace buffers)                       |
|   3. Copy raw byte contents to: `.vscode/.logan/checkpoints/[chk_id]/`          |
|   4. Record metadata entry in transactional storage database                      |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
|                        EXECUTE SANDBOXED TOOL MUTATION                            |
|             File system modified -> Virtual Diff shown -> Tests run               |
+-----------------------------------------------------------------------------------+
```

### 3.1 Automated Checkpoint Trigger Specification
Before Logan Agent executes any mutating tool operation (`write_file`, `edit_file`, `run_terminal_command`), the **Snapshot Interceptor Middleware** suspends tool execution and generates an atomic workspace checkpoint:
1. **Target Isolation:** For targeted tools (`edit_file`), the engine identifies the specific target file URI. For global execution tools (`run_terminal_command`), the engine scans and identifies all currently modified (dirty) files across the workspace.
2. **Snapshot Persistence:** The engine writes exact copies of the target file buffers into the extension's private storage directory (`vscode.ExtensionContext.workspaceState` backed by local filesystem persistence under `.vscode/.logan/checkpoints/`).
3. **Ledger Registration:** A metadata transaction record is indexed, linking Checkpoint ID $C_k$, timestamp, affected file URIs, and the corresponding `messages[]` array index $I_{checkpoint}$.

### 3.2 Atomic Restoration Algorithm

When a rollback request is received, the **Atomic Restoration Controller** executes a high-speed recovery sequence:

```
[Trigger Time-Travel Rollback: chk_id]
                 │
                 ▼
+-----------------------------------------------------------------+
|             STEP 1: LOCK WORKSPACE & VIRTUAL BUFFERS            |
|  Prevent concurrent file edits or active background processes   |
+-----------------------------------------------------------------+
                 │
                 ▼
+-----------------------------------------------------------------+
|             STEP 2: BATCH FILE SYSTEM RESTORATION               |
|  Iterate affected URIs -> Overwrite disk files from snapshot    |
|  Execute via `vscode.workspace.fs.writeFile` in single batch     |
+-----------------------------------------------------------------+
                 │
                 ▼
+-----------------------------------------------------------------+
|             STEP 3: REFRESH EDITOR & REJECT DIFFS               |
|  Dismiss open `vscode.diff` review panels -> Reload active tabs |
+-----------------------------------------------------------------+
                 │
                 ▼
Workspace Restored (< 250ms Latency)
```

#### Performance Guarantees:
Because snapshots are stored directly on the local high-speed NVMe/SSD workspace volume and restored via batch `vscode.workspace.fs` asynchronous streams, restoring a multi-file refactoring involving up to 50 files completes in **under 250 milliseconds**, ensuring zero friction for the developer.

---

## 4. Webview UI Integration for One-Click Rewind

The Time-Travel Rollback Engine is natively exposed through intuitive, prominent visual controls embedded directly inside the Logan Agent VS Code Sidebar Webview and virtual diff review interfaces.

```
+-----------------------------------------------------------------------------------+
| LOGAN AGENT SIDEBAR CHAT WEBVIEW                                                  |
|                                                                                   |
|  Agent: "I have refactored AuthController.ts and updated 14 unit tests."          |
|                                                                                   |
|  [Diff Review Panel Open: 2 files modified]                                       |
|  Terminal Observation: 4 tests failed with TypeError.                             |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |  ( ! ) Execution resulted in test failures.                                 |  |
|  |                                                                             |  |
|  |  [ Accept Changes ]   [ Retry Fix Autonomous ]   [ <= Undo / Rewind Step ]  |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

### 4.1 UI Interaction Mechanics

* **Interactive Action Bar:** Whenever an agent turn completes an action that modifies workspace files or yields an error observation, the chat turn container renders an interactive action footer containing the **`Undo / Rewind Step`** button (styled with a prominent rollback icon).
* **Virtual Diff Review Rejection:** Within the side-by-side `vscode.diff` editor toolbar, clicking the native **`Reject / Discard Changes`** action button acts as a direct proxy trigger for the rollback engine.
* **Single-Click Execution Protocol:**
  When the user clicks `Undo / Rewind Step`:
  1. The Webview posts an asynchronous RPC command (`COMMAND_TIME_TRAVEL_ROLLBACK`) containing the target Checkpoint ID to the Extension Host Core.
  2. The Extension Host simultaneously executes the **Atomic File System Restoration** and the **Chat State Rollback**.
  3. The Sidebar Chat Webview smoothly animates the removal of the failed turn cards, resetting the input prompt focus to the exact moment before the attempt.
  4. A toast notification (`vscode.window.showInformationMessage`) confirms: *"Logan Agent: Rolled back workspace files and AI memory to Checkpoint #4."*
