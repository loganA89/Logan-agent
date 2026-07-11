# Current Task — Phase 4: Fix Phase 3 Defect + Quality & Release Readiness

## Status: PENDING — Awaiting Developer Agent

## Objective
Fix the incomplete sub-task from Phase 3, then prepare the project for release readiness: add a test framework, create essential metadata files, and validate the full build + package pipeline.

---

## 🔴 URGENT FIX — Phase 3 Defect (Must be done FIRST)

### Sub-Task 4.0 — Fix Missing @xenova/transformers Dependency & esbuild Externals

The Architect Agent verified Phase 3 and found that **sub-task 3.5 was not properly completed**:

**Problem 1**: `@xenova/transformers` is NOT in `package.json` dependencies. The `LocalEmbeddingProvider.ts` does `import('@xenova/transformers')` but the package isn't declared.

**Problem 2**: `esbuild.js` still has `external: ['vscode']` only — `@xenova/transformers` and `onnxruntime-node` were NOT added to externals.

**Fix for package.json** — Add to dependencies:
```json
"dependencies": {
  "openai": "^6.45.0",
  "@xenova/transformers": "^2.17.2"
}
```

**Fix for esbuild.js** — Update the external array:
```javascript
external: ['vscode', '@xenova/transformers', 'onnxruntime-node'],
```

**Verification**: After fixing, run:
```bash
npm install
npx tsc --noEmit          # Must exit 0
node esbuild.js           # Must exit 0
```

Without this fix, `tsc` fails with: `TS2307: Cannot find module '@xenova/transformers'`

**Commit message:** `fix: add @xenova/transformers to dependencies and externalize native modules in esbuild`

---

## Sub-Task 4.1 — Add Test Framework (vitest)
**New files:**
- `agent/vitest.config.ts`
- `agent/src/__tests__/terminalScrubber.test.ts`
- `agent/src/__tests__/chunker.test.ts`

**Files to modify:** `agent/package.json` — add vitest to devDependencies and `"test"` script

Set up a minimal test framework:

1. Install vitest: add `"vitest": "^3.2.0"` to devDependencies
2. Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
});
```
3. Add test script to package.json: `"test": "vitest run"`
4. Write 2 basic unit tests for modules that have NO VS Code dependency:

**Test 1: `terminalScrubber.test.ts`** — Test the `scrubTerminalOutput` function:
- Test empty input returns empty string
- Test ANSI code stripping
- Test duplicate line deduplication
- Test truncation over 100 lines

**Test 2: `chunker.test.ts`** — Test the `Chunker.chunkFile` function:
- Test empty file returns empty array
- Test small file produces 1 chunk
- Test large file produces multiple chunks with overlap
- Test chunk IDs contain file path

These are pure functions with no VS Code API dependency, so they can run in Node.js.

**Commit message:** `test: add vitest framework with unit tests for terminalScrubber and Chunker`

---

## Sub-Task 4.2 — Create Essential Metadata Files
**New files:**
- `agent/README.md`
- `agent/CHANGELOG.md`
- `agent/.vscodeignore`

**README.md** — Brief project description:
```markdown
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
```

**CHANGELOG.md**:
```markdown
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
```

**.vscodeignore**:
```
.vscode/**
.vscode-test/**
src/**
node_modules/**
*.ts
!out/**
.gitignore
vitest.config.ts
tsconfig.json
esbuild.js
*.map
```

**Commit message:** `docs: add README, CHANGELOG, and .vscodeignore`

---

## Sub-Task 4.3 — Validate vsce Package
**No file changes** — just run verification:

```bash
cd agent
npm install -g @vscode/vsce
vsce package --no-dependencies
```

If `vsce` errors out, fix whatever is missing (usually `icon`, `repository` field in package.json, or file paths).

Report what happens. If it produces a `.vsix` file, report the file size.

**Commit message:** (only if fixes are needed) `fix: resolve vsce packaging issues`

---

## Execution Order

**4.0 (URGENT FIX)** → 4.1 → 4.2 → 4.3

## Verification Gates
```bash
cd agent/
npm install
npx tsc --noEmit          # Must exit 0
node esbuild.js           # Must exit 0
npm test                  # Must pass all tests
ls -la out/extension.js   # Must exist
```

## Report Format
```
## Task Report
- **Task**: Phase 4: Fix + Quality & Release Readiness
- **Status**: COMPLETED / BLOCKED / PARTIAL
- **Sub-tasks completed**: [list]
- **Changes**: [files]
- **Verification**:
  - tsc: PASS/FAIL
  - esbuild: PASS/FAIL
  - tests: PASS/FAIL (X passed, Y failed)
  - vsce package: PASS/FAIL (size if pass)
  - extension.js size: [size]
- **Commits**: [list]
- **Notes**: [any issues]
```
