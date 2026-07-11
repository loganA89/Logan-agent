# Current Task — Phase 3: Local Embedding, Router Integration & Cleanup

## Status: PENDING — Awaiting Developer Agent

## Objective
Complete the provider integration by wiring PerchanceProvider and LocalEmbeddingProvider into the PlanRouter, add `'local'` to SupportedProviderType, and do essential repository cleanup (.gitignore, remove tracked build artifacts). Each sub-task must pass `tsc --noEmit` + `node esbuild.js` with 0 errors.

## Reference Source
Donor code: `Logan-agent/agent/src/` — current baseline: `agent/src/`

---

## Sub-Task 3.1 — Add LocalEmbeddingProvider
**New file:** `agent/src/providers/LocalEmbeddingProvider.ts`

Copy from `Logan-agent/agent/src/providers/LocalEmbeddingProvider.ts`. This provider:
- Uses `@xenova/transformers` for free on-device embedding (all-MiniLM-L6-v2)
- Dynamic imports the module so the extension works even if it's not installed
- Implements `embed()` method with batch processing
- Has stub `complete()` and `stream()` that just echo (it's an embedding-only provider)

**Commit message:** `feat: add LocalEmbeddingProvider for zero-cost on-device embeddings`

---

## Sub-Task 3.2 — Add 'local' to SupportedProviderType
**Files to modify:** `agent/src/config/ConfigurationManager.ts`

Add `| 'local'` to the `SupportedProviderType` union type. Currently it has `'perchance'` but NOT `'local'`.

**Commit message:** (combine with 3.3)

---

## Sub-Task 3.3 — Wire PerchanceProvider & LocalEmbeddingProvider into PlanRouter
**Files to modify:** `agent/src/providers/PlanRouter.ts`

The current PlanRouter only knows about `OpenAICompatibleProvider` and `AnthropicProvider`. Update it to match the v0.3.0 version:

1. Import `PerchanceProvider` and `LocalEmbeddingProvider`
2. Update the `cacheKey` to use `tierConfig.providerType` instead of just `anthropic`/`openai`
3. Add routing logic for `'local'` provider type (and fallback when EMBEDDING tier has no API key):
   ```typescript
   if (tierConfig.providerType === 'local' || (complexity === 'EMBEDDING' && !providerConfig.apiKey)) {
     const modelName = tierConfig.model || 'Xenova/all-MiniLM-L6-v2';
     provider = new LocalEmbeddingProvider(modelName);
     // ... return early
   }
   ```
4. Add routing for `'perchance'`:
   ```typescript
   if (tierConfig.providerType === 'perchance') {
     provider = new PerchanceProvider(providerConfig);
   }
   ```

Reference: `Logan-agent/agent/src/providers/PlanRouter.ts`

**Commit message:** `feat: wire PerchanceProvider and LocalEmbeddingProvider into PlanRouter`

---

## Sub-Task 3.4 — Update Provider Exports
**Files to modify:** `agent/src/providers/index.ts`

Add exports for `PerchanceProvider` and `LocalEmbeddingProvider`:
```typescript
export * from './PerchanceProvider';
export * from './LocalEmbeddingProvider';
```

**Commit message:** (combine with 3.3)

---

## Sub-Task 3.5 — Add @xenova/transformers as Optional Dependency + esbuild External
**Files to modify:**
- `agent/package.json` — Add `"@xenova/transformers": "^2.17.2"` to `dependencies`
- `agent/esbuild.js` — Add `'@xenova/transformers'` and `'onnxruntime-node'` to the `external` array alongside `'vscode'`

The esbuild external change is **critical** — without it, esbuild will try to bundle native `.node` binary files and fail with 7 errors (this was the original v0.3.0 build failure).

The esbuild config should look like:
```javascript
external: ['vscode', '@xenova/transformers', 'onnxruntime-node'],
```

**Commit message:** `fix: add @xenova/transformers as dependency and externalize native modules in esbuild`

---

## Sub-Task 3.6 — Repository Cleanup
**New file:** `agent/.gitignore`
**Files to remove from git tracking:** `agent/out/extension.js`, `agent/out/extension.js.map`

Create `agent/.gitignore`:
```
node_modules/
out/
.vscode-test/
*.vsix
```

Remove build artifacts from git tracking (but not from disk):
```bash
cd agent
git rm --cached out/extension.js out/extension.js.map
```

**Commit message:** `chore: add .gitignore, remove tracked build artifacts`

---

## Execution Order

3.1 → 3.2+3.3+3.4 (one commit) → 3.5 → 3.6

After 3.5, re-run `npm install` + `node esbuild.js` to verify the external configuration works.

## Verification Gates
```bash
cd agent/
npm install
npx tsc --noEmit          # Must exit 0
node esbuild.js           # Must exit 0
ls -la out/extension.js   # Must exist and be >10KB
```

## Report Format
```
## Task Report
- **Task**: Phase 3: Local Embedding, Router Integration & Cleanup
- **Status**: COMPLETED / BLOCKED / PARTIAL
- **Sub-tasks completed**: [list]
- **Changes**: [files created/modified/removed]
- **Verification**:
  - tsc: PASS/FAIL
  - esbuild: PASS/FAIL
  - extension.js size: [size]
- **Commits**: [list]
- **Notes**: [any issues]
```
