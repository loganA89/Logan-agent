# Current Task — Phase 0: Baseline Recovery

## Status: PENDING — Awaiting Developer Agent

## Objective
Establish `Old_agent/` (v0.2.0) as the clean project baseline, verify build pipeline, and prepare for incremental feature porting from v0.3.0.

## Tasks

### Task 0.1 — Restructure Repository
- [ ] Copy `Old_agent/` contents to a new root-level project directory (e.g., `agent/`)
- [ ] Verify directory structure is correct
- [ ] Do NOT delete `Old_agent/` or `Logan-agent/agent/` yet (keep for reference)

### Task 0.2 — Fix package.json
- [ ] Move `@types/node`, `@types/vscode`, `typescript`, `esbuild` from `dependencies` to `devDependencies`
- [ ] Keep `openai` in `dependencies` (it's the only runtime dependency)
- [ ] Run `npm install` to verify

### Task 0.3 — Verify Build Pipeline
- [ ] Run `npx tsc --noEmit` → must produce 0 errors
- [ ] Run `node esbuild.js` → must produce 0 errors
- [ ] Confirm `out/extension.js` exists after build

### Task 0.4 — Commit and Push
- [ ] Stage changes
- [ ] Commit with message: `chore: establish v0.2.0 as recovery baseline`
- [ ] Push to main branch

## Verification Gates
After completion, ALL of the following must be true:
1. `npx tsc --noEmit` exits with code 0
2. `node esbuild.js` exits with code 0
3. `out/extension.js` file exists and is >10KB
4. `package.json` has correct dependency classification

## Notes
- The Architect Agent has already verified that v0.2.0 compiles and bundles successfully
- This phase is about organizing the repo, not changing any source code
- After this phase completes, we proceed to Phase 1 (porting v0.3.0 features)
