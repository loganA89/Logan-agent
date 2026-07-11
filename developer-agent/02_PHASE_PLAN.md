# Development Phase Plan

## Phase 0 — Baseline Recovery ← CURRENT
Establish v0.2.0 as clean baseline. Fix package.json. Verify build.

## Phase 1 — Port Safe Features from v0.3.0
Port the following in order (each must pass tsc + esbuild before next):
1. Add `ToolCall`, `CompletionResult`, `StreamChunk` types to `providers/types.ts`
2. Update `AIProvider` interface with new return types
3. Update `OpenAICompatibleProvider` with native tool calling
4. Update `AnthropicProvider` with tool_use support
5. Add `'items'` property to `ToolParameterSchema`
6. Port `applyDiffTool.ts`
7. Port `gitTools.ts`
8. Port `todoTool.ts`
9. Port `diagnosticsTool.ts`
10. Port `imageTool.ts`
11. Update `ToolRegistry` with new tools + categories (`'Git'`, `'Task Planning'`)
12. Sync `ui/types.ts` ToolCategory with `ToolRegistry` ToolCategory

## Phase 2 — Streaming & Auto-Continue
1. Update ReActEngine with streaming support
2. Add auto-continue logic
3. Add `STREAM_DELTA` to ExtensionEventType
4. Update SidebarProvider for streaming callbacks
5. Update sidebarHtml for real-time rendering

## Phase 3 — Local Embedding
1. Add `'local'` to `SupportedProviderType`
2. Port `LocalEmbeddingProvider`
3. Add `@xenova/transformers` + `onnxruntime-node` to esbuild externals
4. Update `PlanRouter` for local embedding routing

## Phase 4 — Quality & Release Readiness
1. Create test suite (vitest or mocha)
2. Add retry/backoff logic to providers
3. Migrate API key storage to VS Code SecretStorage
4. Create `.vscodeignore`, `README.md`, `CHANGELOG.md`
5. Test `vsce package` output

## Rules for Every Phase
- Each task must pass `npx tsc --noEmit` with 0 errors before commit
- Each task must pass `node esbuild.js` with 0 errors before commit
- Commit messages follow conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`
- No new features until baseline is stable
- Reference v0.3.0 source as "donor" — never copy blindly, always verify types
