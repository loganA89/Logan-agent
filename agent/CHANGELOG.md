# Changelog

## [0.3.0] - 2026-07-11
### Added
- Native tool calling (OpenAI SDK) replacing XML-based tool parsing
- Real-time streaming with tool_call delta aggregation
- Auto-continue (up to 3 rounds of 50 steps)
- apply_diff tool (unified diff + SEARCH/REPLACE blocks)
- Git tools (status, diff, commit, log)
- Todo/task planning tool
- VS Code diagnostics tool
- Image generation tool
- Local embedding provider (transformers.js, zero-cost)
- Perchance provider (free community generators)
- Provider settings modal in sidebar UI
- Stream delta rendering in sidebar
- Prompt caching for Anthropic

### Fixed
- ToolCategory type drift between ToolRegistry and UI types
- esbuild native module bundling errors
- package.json dependency classification

## [0.2.0] - 2026-07-10
### Initial
- ReAct loop engine with XML tool parsing
- File read/write/edit tools
- Terminal command execution with scrubbing
- Web search (Tavily + DuckDuckGo)
- Semantic codebase search (RAG)
- Checkpoint engine for time-travel rollback
- Session management
- Memory compaction
- Provider routing (Economy/Pro plans)
- Sidebar webview UI
