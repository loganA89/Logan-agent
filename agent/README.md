# Logan Agent

AI-powered autonomous coding assistant for Visual Studio Code.

## Features
- Multi-step ReAct (Reason → Act → Observe) execution
- Native tool calling with OpenAI, Anthropic, DeepSeek, and more
- Real-time streaming with auto-continue
- File read/write/edit with checkpoint rollback
- apply_diff (unified diff and SEARCH/REPLACE blocks)
- Terminal command execution with output scrubbing
- Git tools (status, diff, commit, log)
- Todo/task planning
- Semantic codebase search (RAG) with local embeddings
- VS Code diagnostics integration
- Image and audio generation
- Multi-vendor provider routing (Economy/Pro plans)
- Session management with conversation memory compaction

## Requirements
- VS Code 1.85.0+
- Node.js 18+
- At least one AI provider API key (or use Perchance/Ollama for free)

## Installation
1. Clone this repository
2. `cd agent && npm install`
3. Press F5 in VS Code to launch Extension Development Host
4. Configure your API key in Settings → Logan Agent

## License
MIT
