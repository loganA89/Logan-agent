# Logan Agent: Native VS Code Sandboxed Tooling & File Operations

**Document Version:** 1.0.0  
**Status:** Approved Specification (Phase 0 - Step 3)  
**Parent Blueprint:** `docs/00_project_overview.md`  
**Target Module:** Sandboxed Tooling Layer, Virtual Diff Engine & Terminal Log Scrubber

---

## 1. Introduction & Architectural Objectives

To operate autonomously as a coding assistant, Logan Agent must inspect, analyze, execute, and modify code within the user's local development environment. However, giving an LLM direct, unrestricted access to Node.js `fs` module or raw shell commands introduces catastrophic system security hazards and guarantees rapid context-window exhaustion via unthrottled log ingestion.

The **Sandboxed Tooling Layer** interfaces exclusively with official Visual Studio Code Extension Host APIs (`vscode.workspace.fs`, `vscode.window`, `vscode.diff`). By encapsulating all file mutations within virtual transaction buffers and passing terminal streams through a deterministic **Token Scrubber Engine**, Logan Agent guarantees strict workspace sandbox containment, zero data corruption, interactive user sign-off on modifications, and optimal context economy.

---

## 2. Sandboxed Workspace File Operations

All file system operations executed by Logan Agent bypass raw OS system calls in favor of asynchronous, URI-based operations via `vscode.workspace.fs`. This ensures transparent support for both desktop file systems and virtualized web workspaces (e.g., GitHub Codespaces, VS Code Web).

### 2.1 Sandbox Validation & Path Traversal Security Boundary

Before any file system tool executes, input target paths undergo strict path canonicalization and boundary assertion within the **Sandbox Enforcement Middleware**:

```
[Agent Tool Request: path input]
                 │
                 ▼
+-----------------------------------------------------------------+
|               SANDBOX ENFORCEMENT MIDDLEWARE                    |
|  1. Resolve relative paths against active workspace root        |
|  2. Canonicalize path segments (strip './', resolve '../')      |
|  3. Assert path starts with workspace root URI string           |
+-----------------------------------------------------------------+
                 │
         ┌───────┴───────┐
         ▼               ▼
   [Valid Path]    [Security Violation detected!]
         │               │
         │               ▼
         │      Throw SecuritySandboxException
         │      Terminate ReAct Loop & Alert User
         ▼
[Execute via vscode.workspace.fs]
```

* **Absolute Containment:** Any attempt by the LLM to read or write sensitive system files outside the opened workspace directories (e.g., `/etc/passwd`, `C:\Windows\System32`, `~/.ssh/id_rsa`, or relative paths resolving outside like `../../secret.txt`) is immediately blocked at the validation layer.
* **Symbolic Link Resolution:** Symlinks are explicitly checked via `vscode.workspace.fs.stat()` to verify that their resolved targets remain strictly bounded inside the workspace root.

### 2.2 Tool Schemas Specification

The following JSON schemas define the standardized tool contracts exposed to the Provider Abstraction Layer (PAL):

```typescript
/**
 * Normalized tool definitions for workspace file operations.
 */
export const FileSystemToolSchemas = [
  {
    name: 'read_file',
    description: 'Read the complete text content of a file within the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the workspace file (e.g., "src/index.ts").'
        },
        startLine: {
          type: 'number',
          description: 'Optional 1-indexed line number to start reading from.'
        },
        endLine: {
          type: 'number',
          description: 'Optional 1-indexed line number to stop reading at.'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Create a new file or completely overwrite an existing workspace file.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to target file location.'
        },
        content: {
          type: 'string',
          description: 'Full text content to write to disk.'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'list_directory',
    description: 'List files and subdirectories inside a workspace folder.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative directory path. Use "." for workspace root.'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'search_files',
    description: 'Execute a fast glob or regex filename pattern search across the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern (e.g., "**/*.controller.ts") or filename substring.'
        },
        exclude: {
          type: 'string',
          description: 'Optional exclusion glob pattern (defaults to node_modules/dist).'
        }
      },
      required: ['pattern']
    }
  }
];
```

---

## 3. Virtual Diff & Interactive Code Review (`edit_file` Tool)

Rather than directly overwriting production code during complex refactorings, Logan Agent implements the `edit_file` tool using an interactive **Virtual Diff Review Architecture**. This provides deterministic fuzzy search-and-replace capabilities coupled with native VS Code side-by-side review views.

### 3.1 `edit_file` Tool Schema Specification

```typescript
export const EditFileToolSchema = {
  name: 'edit_file',
  description: 'Modify an existing file using fuzzy text matching and replacement blocks.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative file path in the workspace.'
      },
      old_text: {
        type: 'string',
        description: 'Exact or fuzzy substring block currently present in the file to be replaced.'
      },
      new_text: {
        type: 'string',
        description: 'Replacement substring block.'
      }
    },
    required: ['path', 'old_text', 'new_text']
  }
};
```

### 3.2 Virtual Document Diff Workflow

When the agent invokes `edit_file`, mutations are staged in memory without altering the physical file system:

```
[Agent invokes edit_file]
             │
             ▼
+-----------------------------------------------------------------+
|                    DIFF STAGING ORCHESTRATOR                    |
|  1. Load existing file content from disk                        |
|  2. Execute fuzzy whitespace-tolerant string matching           |
|  3. Generate modified text buffer in memory                     |
|  4. Register virtual document scheme: `logan-diff:/[path]`       |
+-----------------------------------------------------------------+
             │
             ▼
+-----------------------------------------------------------------+
|             LAUNCH NATIVE VS CODE DIFF EDITOR                   |
|  vscode.commands.executeCommand('vscode.diff', leftUri, right)  |
|  Displays Side-by-Side Review Panel with Toolbar Action Buttons |
+-----------------------------------------------------------------+
             │
      ┌──────┴──────┐
      ▼             ▼
[User Accepts]   [User Rejects]
      │             │
      ▼             ▼
  Write to      Discard Virtual
    Disk          Buffer & Notify
                   Agent Engine
```

* **Fuzzy Matching Tolerance:** To prevent edit failures caused by minor whitespace or indentation variations in LLM outputs, the matching engine normalizes leading/trailing indentation levels and line-ending styles (`\r\n` vs `\n`) before locating target replacement hunks.
* **Interactive Sign-Off:** The diff view surfaces custom editor actions (`Accept Agent Changes`, `Reject Agent Changes`). While pending user approval, the ReAct loop pauses execution, preventing runaway chained edits on unverified code states.

---

## 4. Controlled Terminal Execution & The Token Scrubber Engine

Executing test runners, compilers, and linter pipelines is vital for self-correcting agent workflows. Logan Agent manages background shell execution via native pseudoterminals (`vscode.window.createTerminal`).

### 4.1 Controlled Terminal Execution Architecture

* **Isolated Pseudoterminal:** Commands run inside a dedicated, non-interactive shell process managed by Logan (`Logan Agent Execution Channel`).
* **Execution Safeguards:**
  * **Command Whitelisting & Approval:** Read-only verification commands (`npm test`, `git status`, `tsc --noEmit`) run autonomously. Destructive or mutation commands (`npm install`, `rm -rf`, `git reset`) trigger an explicit modal user confirmation prompt.
  * **Timeout & Runaway Process Termination:** Execution commands enforce a strict timeout ceiling (default: 30 seconds). If a build script hangs or enters an infinite loop, the agent sends a `SIGINT`/`SIGTERM` signal via terminal disposal API and reports a execution timeout observation.

### 4.2 Terminal Log Truncation & Scrubbing Algorithm

Raw build failures and test logs frequently output hundreds of lines of noise, ANSI color codes, and repetitive framework stack traces. Feeding raw terminal output into an LLM causes severe context bloating and degrades reasoning accuracy.

The **Token Scrubber Engine** processes all raw stdout/stderr streams prior to formatting them as tool observations:

```
Raw Shell Output Stream (500+ lines)
                 │
                 ▼
+-----------------------------------------------------------------+
|                STAGE 1: ANSI & CONTROL CHARACTER PURGE          |
|  Strips regex: /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g          |
+-----------------------------------------------------------------+
                 │
                 ▼
+-----------------------------------------------------------------+
|                STAGE 2: STACK TRACE DEDUPLICATION               |
|  Collapses repetitive internal node_modules/framework frames    |
|  Retains only workspace-local user source code stack frames     |
+-----------------------------------------------------------------+
                 │
                 ▼
+-----------------------------------------------------------------+
|                STAGE 3: THRESHOLD SLICING ALGORITHM             |
|  If total line count > 100 lines:                               |
|  • Extract First 30 Lines (Compiler Headers & System Diagnostics)  |
|  • Inject Synthetic Summary Marker:                             |
|    "... [LOG TRUNCATED: 420 lines removed for context economy] ..."|
|  • Extract Last 50 Lines (Fatal Exceptions & Error Footers)     |
+-----------------------------------------------------------------+
                 │
                 ▼
Optimized Tool Observation Payload (< 85 lines / ~600 tokens)
```

#### Algorithm Specification:
1. **Sanitization:** Strip all non-printable ASCII characters and escape sequences to ensure clean Markdown rendering.
2. **Frame Filtering:** Parse multi-line stack traces; replace contiguous sequences of `at Object.<anonymous> (.../node_modules/...)` with a single summary stub: `[... 14 framework stack frames omitted ...]`.
3. **Head/Tail Slicing:** When output exceeds the 100-line threshold ($L > 100$), slice the buffer to preserve $L_{head} = 30$ and $L_{tail} = 50$. This retains the initial configuration/compilation context and the final fatal crash output while eliminating hundreds of intermediate progress or cascading warning lines.

---

## 5. Lightweight Web Documentation Search Tool

To prevent hallucinations when interacting with newly released libraries or framework APIs updated after the underlying LLM's knowledge cutoff, Logan Agent includes a native web lookup tool (`web_search`).

### 5.1 `web_search` Tool Schema Specification

```typescript
export const WebSearchToolSchema = {
  name: 'web_search',
  description: 'Search external web sources and API documentation for up-to-date technical references.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Concise search query targeting documentation or API usage (e.g., "Next.js 15 App Router caching syntax").'
      },
      depth: {
        type: 'string',
        enum: ['1', '2', '3'],
        description: 'Search depth controlling excerpt granularity and result counts.'
      }
    },
    required: ['query']
  }
};
```

### 5.2 Integration Architecture
* **Search Gateway:** The tool communicates over secure HTTPS with enterprise developer-focused search APIs (**Tavily API** or **Brave Search API**) configured via user extension settings (`logan.searchProvider`).
* **Content Extraction & Markdown Compaction:** Raw HTML search results are parsed through a lightweight Readability DOM stripper, extracting pure markdown text snippets and code examples while stripping advertisements, navigation headers, and boilerplate styling.
* **Context Budgeting:** Extracted search results are strictly capped at 1,500 words per query before ingestion into the ReAct observation stream.
