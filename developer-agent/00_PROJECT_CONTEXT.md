# Logan Agent — Project Context for Developer Agent

## What is Logan Agent?

Logan Agent is a **VS Code extension** that acts as an autonomous AI coding assistant. It uses a **ReAct (Reason → Act → Observe)** architecture to break complex coding tasks into steps, call tools (file read/write, terminal, search, git, etc.), observe results, and iterate until the task is complete.

## Repository Structure

```
https://github.com/loganA89/Logan-agent

├── Logan-agent/agent/     ← v0.3.0 (BROKEN — do not use as baseline)
├── Old_agent/             ← v0.2.0 (STABLE — this is our recovery baseline)
└── developer-agent/       ← Coordination files between Architect & Developer agents
```

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | VS Code Extension Host (Node.js) |
| Language | TypeScript 5.x (strict mode) |
| Bundler | esbuild (CJS, single output `out/extension.js`) |
| AI SDK | OpenAI Node SDK v6+ (`openai` package) |
| Embedding | @xenova/transformers (optional, local) |
| UI | VS Code Webview (inline HTML/CSS/JS in sidebar) |
| State | VS Code WorkspaceState + in-memory maps |

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    VS Code Host                      │
├──────────┬──────────┬───────────┬───────────────────┤
│ extension.ts        │           │                    │
│  ├─ SessionManager  │  Sidebar  │   ConfigManager    │
│  ├─ FileIndexer     │  Webview  │   (user settings)  │
│  └─ logan.start cmd │  Provider │                    │
├──────────┴──────────┴───────────┴───────────────────┤
│                   ReAct Engine                       │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │MemoryManager│  │  PlanRouter  │  │ToolRegistry│  │
│  │ (context    │  │  (economy/   │  │ (17 tools) │  │
│  │  compaction)│  │   pro plans) │  │            │  │
│  └─────────────┘  └──────────────┘  └────────────┘  │
├─────────────────────────────────────────────────────┤
│                   Providers                          │
│  OpenAICompatible │ Anthropic │ Perchance │ Local   │
├─────────────────────────────────────────────────────┤
│                   Tool Layer                         │
│  Files │ Edit │ Terminal │ Search │ Git │ Todo │ RAG │
├─────────────────────────────────────────────────────┤
│              RAG / Vector Store                      │
│  Chunker → Embedding → VectorStore → CosineSimilar  │
└─────────────────────────────────────────────────────┘
```

## Current State Summary

### v0.2.0 (Old_agent/) — STABLE BASELINE
- **TypeScript**: ✅ Compiles with zero errors
- **esbuild**: ✅ Bundles successfully
- **Core capabilities**: ReAct loop, file ops, edit, terminal, web search, RAG, checkpoints, sessions, memory compaction, provider routing, sidebar UI
- **Missing**: No native tool calling, no streaming, no git tools, no apply_diff, no todo, no diagnostics, no image tool, no local embedding

### v0.3.0 (Logan-agent/agent/) — BROKEN
- **TypeScript**: ❌ 9 compilation errors
- **esbuild**: ❌ 7 bundle errors (native .node files)
- **Added capabilities**: Native tool calling, streaming + tool_call aggregation, auto-continue, apply_diff, git tools, todo, diagnostics, image tool, local embedding, Perchance provider
- **Root cause of breakage**: Type definitions were not synchronized after adding new features (ToolCategory drift, missing STREAM_DELTA event type, 'local' not in SupportedProviderType, ToolParameterSchema missing 'items' property, @xenova/transformers not externalized in esbuild)

## Recovery Strategy (Approved by PM)

**Baseline**: v0.2.0 (Old_agent/)
**Method**: Incremental port of v0.3.0 features into v0.2.0 baseline, with type-check gate after each port.

## Key Files Reference

| Module | Path (relative to project root) | Purpose |
|---|---|---|
| Entry point | `src/extension.ts` | VS Code activation, registers sidebar + command |
| ReAct Engine | `src/agent/ReActEngine.ts` | Main agentic loop (think → call tools → observe) |
| Memory | `src/agent/MemoryManager.ts` | Conversation history, compaction, rollback |
| Sessions | `src/agent/SessionManager.ts` | Persistent chat session CRUD |
| System Prompts | `src/agent/SystemPrompts.ts` | Master persona prompt generation |
| Agent Types | `src/agent/types.ts` | AgentState, AgentMessage, ChatSession |
| Provider Types | `src/providers/types.ts` | AIProvider interface, CompletionOptions |
| OpenAI Provider | `src/providers/OpenAICompatibleProvider.ts` | OpenAI SDK adapter |
| Anthropic Provider | `src/providers/AnthropicProvider.ts` | Anthropic Messages API adapter |
| Plan Router | `src/providers/PlanRouter.ts` | Task complexity → provider routing |
| Provider Manager | `src/providers/ProviderManager.ts` | Provider instantiation cache |
| Config | `src/config/ConfigurationManager.ts` | VS Code settings bridge |
| Tool Types | `src/tools/types.ts` | Tool interface, ToolParameterSchema |
| Tool Registry | `src/tools/ToolRegistry.ts` | Central tool registration + execution |
| File Tools | `src/tools/fileTools.ts` | read_file, create_file, list_dir, search_files |
| Edit Tool | `src/tools/editTool.ts` | Search-and-replace file editing |
| Terminal | `src/tools/terminalTool.ts` | Shell command execution |
| Terminal Scrubber | `src/tools/terminalScrubber.ts` | Output sanitization + truncation |
| Checkpoint | `src/tools/checkpointEngine.ts` | Pre-edit snapshot + rollback |
| Web Search | `src/tools/webSearchTool.ts` | Tavily + DuckDuckGo fallback |
| Codebase Search | `src/tools/searchCodebaseTool.ts` | Hybrid semantic + keyword RAG |
| Media (Audio) | `src/tools/mediaTools.ts` | Audio generation (currently stub) |
| RAG Chunker | `src/rag/Chunker.ts` | Source code → chunk splitter |
| Vector Store | `src/rag/VectorStore.ts` | In-memory cosine similarity search |
| File Indexer | `src/rag/FileIndexer.ts` | JIT workspace file indexing |
| Sidebar Provider | `src/ui/SidebarProvider.ts` | Webview ↔ Extension message handler |
| Sidebar HTML | `src/ui/html/sidebarHtml.ts` | Inline HTML/CSS/JS for sidebar UI |
| UI Types | `src/ui/types.ts` | Message types between webview ↔ extension |
| Logger | `src/utils/LoganLogger.ts` | File + OutputChannel logging |

## Important Constraints

1. **No tests exist** — we need to build a test suite from scratch
2. **All @types packages are in dependencies** — must be moved to devDependencies
3. **API keys are stored in VS Code settings** — should eventually use SecretStorage
4. **Extension has never been packaged** — `vsce package` has not been attempted
5. **esbuild config has no externals** — native modules will break bundling
6. **Strict TypeScript** — `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`
