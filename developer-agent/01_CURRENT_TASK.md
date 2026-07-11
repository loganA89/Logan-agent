# Current Task — Phase 1: Port Native Tool Calling & New Tools from v0.3.0

## Status: PENDING — Awaiting Developer Agent

## Objective
Port the native tool calling infrastructure and new tools from v0.3.0 (`Logan-agent/agent/`) into the stable baseline (`agent/`). Each sub-task must pass `tsc --noEmit` with 0 errors before committing.

## CRITICAL RULE
After EVERY sub-task: run `npx tsc --noEmit` and `node esbuild.js` — both must exit 0 before committing. If they fail, fix the errors before moving on.

## Reference Source
All "donor" code lives in `Logan-agent/agent/src/`. Compare with current baseline in `agent/src/`. Do NOT copy files blindly — adapt them to match the current baseline's type system.

---

## Sub-Task 1.1 — Upgrade Provider Type System
**Files to modify:** `agent/src/providers/types.ts`

Add these types (from `Logan-agent/agent/src/providers/types.ts`):
- `ToolCall` interface (id?, name, arguments)
- `CompletionResult` interface (content, toolCalls, finishReason)
- `StreamChunk` interface (contentDelta, reasoningDelta, toolCallDelta, usage, finishReason)
- Add `onContentDelta` callback to `CompletionOptions`
- Expand `messages` array type in `CompletionOptions` to include `tool_call_id`, `name`, `tool_calls` fields

Update the `AIProvider` interface:
- Change `complete()` return type from `Promise<string>` to `Promise<CompletionResult>`
- Change `stream()` return type from `AsyncIterable<string>` to `AsyncIterable<StreamChunk>`

**Commit message:** `feat: add ToolCall, CompletionResult, StreamChunk types to provider interface`

⚠️ **WARNING**: After this change, `OpenAICompatibleProvider.ts`, `AnthropicProvider.ts`, and every file that calls `provider.complete()` will break because return type changed. You MUST complete sub-tasks 1.2 and 1.3 before tsc will pass. Do all three (1.1 + 1.2 + 1.3) as a single commit.

---

## Sub-Task 1.2 — Upgrade OpenAICompatibleProvider
**Files to modify:** `agent/src/providers/OpenAICompatibleProvider.ts`

Replace entirely with the v0.3.0 version from `Logan-agent/agent/src/providers/OpenAICompatibleProvider.ts`.

This version:
- Returns `CompletionResult` (with `toolCalls` array) instead of raw string
- Has proper streaming with `StreamChunk` yield
- Has `embed()` method
- Has auto-retaining tool check logic
- Properly maps tool definitions to OpenAI format

---

## Sub-Task 1.3 — Upgrade AnthropicProvider
**Files to modify:** `agent/src/providers/AnthropicProvider.ts`

Replace entirely with the v0.3.0 version from `Logan-agent/agent/src/providers/AnthropicProvider.ts`.

This version:
- Returns `CompletionResult` instead of raw string
- Has native `tool_use` content block parsing
- Has prompt caching via `cache_control` headers
- Stream method wraps `complete()` (fake streaming — acceptable for now)

---

## Sub-Task 1.4 — Fix All Callers of provider.complete()
**Files to check/modify:**
- `agent/src/agent/ReActEngine.ts` — The main caller. The v0.2.0 version calls `provider.complete()` and expects a string. After 1.1-1.3, it returns `CompletionResult`. You need to update the engine to use `result.content` and handle `result.toolCalls` if present.
- `agent/src/agent/MemoryManager.ts` — Calls `provider.complete()` in `compactHistory()`. Must use `.content` from result.
- `agent/src/tools/searchCodebaseTool.ts` — Calls `provider.embed()` — verify this still works.
- `agent/src/rag/FileIndexer.ts` — Calls `provider.embed()` — verify this still works.

**Key change in ReActEngine**: The v0.2.0 engine extracts tool calls from XML text (`extractToolCalls(assistantResponse)`). After this upgrade, native tool calls come from `CompletionResult.toolCalls`. Update the extraction logic to check native tool calls first, then fall back to XML parsing.

Study the v0.3.0 `ReActEngine.ts` (`Logan-agent/agent/src/agent/ReActEngine.ts`) for reference, but do NOT copy it wholesale — it has streaming/auto-continue features we'll add in Phase 2. For now, just fix the `complete()` return type handling.

**Commit message for 1.1+1.2+1.3+1.4 combined:** `feat: upgrade provider system to native tool calling with CompletionResult`

---

## Sub-Task 1.5 — Add `items` to ToolParameterSchema
**Files to modify:** `agent/src/tools/types.ts`

The current `ToolParameterSchema` properties type is:
```typescript
properties: Record<string, {
  type: string;
  description: string;
  enum?: string[];
  default?: unknown;
}>;
```

Add `items?: { type: string }` to the property schema object to support array-type parameters:
```typescript
properties: Record<string, {
  type: string;
  description: string;
  enum?: string[];
  default?: unknown;
  items?: { type: string };
}>;
```

**Commit message:** `fix: add items field to ToolParameterSchema for array parameters`

---

## Sub-Task 1.6 — Port New Tools
**New files to create** (copy from `Logan-agent/agent/src/tools/`):
- `agent/src/tools/applyDiffTool.ts`
- `agent/src/tools/gitTools.ts`
- `agent/src/tools/todoTool.ts`
- `agent/src/tools/diagnosticsTool.ts`
- `agent/src/tools/imageTool.ts`

**Files to modify:**
- `agent/src/tools/index.ts` — Add exports for the 5 new tool files
- `agent/src/tools/ToolRegistry.ts` — Import and register the new tools, update `ToolCategory` type to add `'Git'` and `'Task Planning'`, update `resolveCategory()` switch cases

**Commit message:** `feat: port applyDiff, git, todo, diagnostics, image tools from v0.3.0`

---

## Sub-Task 1.7 — Sync UI Types
**Files to modify:** `agent/src/ui/types.ts`

- Update `ToolCategory` type to match `ToolRegistry`: add `'Git'` and `'Task Planning'`
- Verify `ToolMetadataItem` matches between `ui/types.ts` and `ToolRegistry.ts`

**Commit message:** `fix: sync ToolCategory between ToolRegistry and UI types`

---

## Sub-Task 1.8 — Update Provider Exports
**Files to modify:** `agent/src/providers/index.ts`

If `PerchanceProvider` was ported, add its export. Also verify all new types (`ToolCall`, `CompletionResult`, `StreamChunk`) are properly exported.

Check if `PlanRouter.ts` or `ProviderManager.ts` need updates for the new return types.

**Commit message:** `chore: update provider exports and verify router compatibility`

---

## Execution Order

**Must be done together (one commit):** 1.1 + 1.2 + 1.3 + 1.4
**Then sequentially:** 1.5 → 1.6 → 1.7 → 1.8

## Verification Gates (after ALL sub-tasks complete)
```bash
cd agent/
npx tsc --noEmit          # Must exit 0
node esbuild.js           # Must exit 0
ls -la out/extension.js   # Must exist
```

## Report Format
After completing Phase 1, report:
```
## Task Report
- **Task**: Phase 1: Port Native Tool Calling & New Tools
- **Status**: COMPLETED / BLOCKED / PARTIAL
- **Sub-tasks completed**: [list]
- **Changes**: [list of files created/modified]
- **Verification**:
  - tsc: PASS/FAIL (error count)
  - esbuild: PASS/FAIL (error count)
  - extension.js size: [size]
- **Commits**: [list of commit hashes]
- **Notes**: [any issues, questions, or observations]
```
