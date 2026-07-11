# Current Task — Phase 2: Streaming, Auto-Continue & UI Upgrades

## Status: PENDING — Awaiting Developer Agent

## Objective
Port streaming with tool_call aggregation, auto-continue logic, tier settings UI, and real-time stream rendering from v0.3.0 into the stable baseline. Each sub-task must pass `tsc --noEmit` + `node esbuild.js` with 0 errors before committing.

## Reference Source
Donor code: `Logan-agent/agent/src/` — current baseline: `agent/src/`

---

## Sub-Task 2.1 — Add STREAM_DELTA and Tier Settings to UI Types
**Files to modify:** `agent/src/ui/types.ts`

Changes needed:
1. Add `'STREAM_DELTA'` to `ExtensionEventType` union
2. Add `'REQ_TIER_SETTINGS'` and `'SAVE_TIER_SETTINGS'` to `WebviewCommandType` union
3. Add `'TIER_SETTINGS_DATA'` to `ExtensionEventType` union
4. Add `delta?: string` to `ExtensionOutgoingEvent.payload`
5. Add `tierSettings?: Record<string, { providerType: string; apiKey: string; baseUrl?: string; model: string }>` to `ExtensionOutgoingEvent.payload`
6. Add `tier?: string`, `providerType?: string`, `apiKey?: string`, `baseUrl?: string`, `model?: string` to `WebviewIncomingMessage.payload`

Reference: `Logan-agent/agent/src/ui/types.ts`

**Commit message:** `feat: add STREAM_DELTA, tier settings types to UI message protocol`

---

## Sub-Task 2.2 — Upgrade ReActEngine with Streaming & Auto-Continue
**Files to modify:** `agent/src/agent/ReActEngine.ts`

Replace the current `ReActEngine.ts` with the v0.3.0 version from `Logan-agent/agent/src/agent/ReActEngine.ts`.

This version adds:
- `useStreaming` option — when true, uses `provider.stream()` with tool_call delta aggregation
- `autoContinue` option — when step limit is reached, auto-injects a continuation prompt (up to `maxAutoContinues` rounds)
- `onContentDelta` callback — streams content deltas to UI in real-time
- `onAutoContinue` callback — notifies UI when auto-continue triggers
- `id` field on `ExtractedToolCall` — passes native tool call IDs through
- Cleaner `extractToolCalls` that checks native `ToolCall[]` first, then falls back to XML

**Important**: The v0.3.0 version imports `ToolCall` from providers instead of `CompletionResult`. Since the current baseline already has both types, just make sure the imports are correct. The function signature changes from `nativeToolCalls?: unknown[]` to `nativeToolCalls?: ToolCall[]`.

**Commit message:** `feat: add streaming with tool_call aggregation and auto-continue to ReActEngine`

---

## Sub-Task 2.3 — Upgrade SidebarProvider with Streaming & Tier Settings
**Files to modify:** `agent/src/ui/SidebarProvider.ts`

Port these changes from `Logan-agent/agent/src/ui/SidebarProvider.ts`:

1. **Add `REQ_TIER_SETTINGS` handler** (lines ~166-181 in v0.3.0): Reads tier configs from ConfigurationManager and sends to webview
2. **Add `SAVE_TIER_SETTINGS` handler** (lines ~183-196 in v0.3.0): Saves tier config to VS Code settings, resets router cache
3. **Update `executeUserPrompt` method**:
   - Add `autoContinue: true`, `maxAutoContinues: 3`, `useStreaming: true` to the options
   - Add `onContentDelta` callback that sends `STREAM_DELTA` event to webview
   - Add `onAutoContinue` callback that sends `THINKING_STEP` event
   - Add `apply_diff` and `generate_image` to the tool badge switch cases
4. **Remove the unused `streamCard` variable** (the v0.3.0 had it declared but never used — just don't include it)

**Commit message:** `feat: add streaming callbacks, auto-continue, and tier settings to SidebarProvider`

---

## Sub-Task 2.4 — Upgrade Sidebar HTML with Stream Rendering & Provider Settings
**Files to modify:** `agent/src/ui/html/sidebarHtml.ts`

Port these changes from `Logan-agent/agent/src/ui/html/sidebarHtml.ts`:

1. **CSS additions**: Add `flex-wrap: wrap` to `.header`, update `select` styles to also apply to `input[type="text"]` and `input[type="password"]`, add `.form-group` and `.form-label` styles
2. **Version string**: Change `v0.2.0` → `v0.3.0` in the header title
3. **Add `⚙️ Configure Providers` button** in the header nav area
4. **Add the Provider Settings Modal** (`#settings-modal`): Tier selector dropdown, provider type dropdown, API key input, base URL input, model name input, save button
5. **Add JavaScript handlers**:
   - `settings-btn` click → show settings modal + request tier settings
   - `window.selectTierTab(tier)` — populates form from cached tier settings
   - `window.onProviderChanged(pType)` — auto-fills base URL and placeholder based on provider
   - `window.saveCurrentTierSetting()` — sends `SAVE_TIER_SETTINGS` message
6. **Add `STREAM_DELTA` message handler** in the message listener: Creates/appends to a streaming card in real-time
7. **Update `STREAM_CHUNK` handler**: Check if a stream card exists, finalize it with rollback button
8. **Add `TIER_SETTINGS_DATA` handler**: Cache tier settings and populate active tier form
9. **Add Git and Task Planning categories** to the tool category list
10. **Update welcome message**: Add "image" to capability list

Reference diff is substantial (~230 lines). Copy the complete `getSidebarHtml()` function from `Logan-agent/agent/src/ui/html/sidebarHtml.ts` and verify it compiles.

**Commit message:** `feat: add streaming UI, provider settings modal, and updated sidebar HTML`

---

## Sub-Task 2.5 — Add PerchanceProvider (Optional but Recommended)
**New file:** `agent/src/providers/PerchanceProvider.ts`
**Files to modify:** `agent/src/providers/index.ts`

Copy `PerchanceProvider.ts` from `Logan-agent/agent/src/providers/PerchanceProvider.ts`. Add export to `agent/src/providers/index.ts`.

Verify that `PlanRouter.ts` already handles `providerType === 'perchance'` — if not, add a routing case.

**Commit message:** `feat: add PerchanceProvider for free community text/image generation`

---

## Sub-Task 2.6 — Update package.json Version & Flat Tier Settings
**Files to modify:** `agent/package.json`

1. Update version from `"0.2.0"` to `"0.3.0"`
2. The v0.3.0 `package.json` changes tier settings from nested objects (`logan.tiers.light: {}`) to flat keys (`logan.tiers.light.providerType`, `logan.tiers.light.apiKey`, etc.). Port this change from `Logan-agent/agent/package.json`.

⚠️ **IMPORTANT**: The `ConfigurationManager.getTierConfig()` method must match the settings schema. Currently in baseline it reads `config.get<Record<string, string>>('tiers.${tier}', {})` (object-style). In v0.3.0 it reads `config.get<string>('tiers.${tier}.providerType', '')` (flat-style). **You must update `ConfigurationManager.ts` to use the flat-style reads** to match the new `package.json` schema.

Reference: Compare `Logan-agent/agent/package.json` contributes.configuration with current `agent/package.json`, and compare both `ConfigurationManager.ts` files.

**Commit message:** `feat: bump version to v0.3.0, update tier settings to flat key schema`

---

## Execution Order

Sequential: 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6

Sub-tasks 2.1 through 2.3 are tightly coupled — if tsc breaks after 2.1, it may not pass until 2.3 is also done. You may combine 2.1+2.2+2.3 into a single commit if needed.

## Verification Gates
```bash
cd agent/
npx tsc --noEmit          # Must exit 0
node esbuild.js           # Must exit 0
ls -la out/extension.js   # Must exist
```

## Report Format
```
## Task Report
- **Task**: Phase 2: Streaming, Auto-Continue & UI Upgrades
- **Status**: COMPLETED / BLOCKED / PARTIAL
- **Sub-tasks completed**: [list]
- **Changes**: [files created/modified]
- **Verification**:
  - tsc: PASS/FAIL
  - esbuild: PASS/FAIL
  - extension.js size: [size]
- **Commits**: [list]
- **Notes**: [any issues]
```
