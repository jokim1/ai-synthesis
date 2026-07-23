# Council Post-MVP Pi Companion

Status: deferred companion for `docs/council-command-implementation-plan.md`.
This document is not a first-MVP acceptance gate.
No Phase 3C, Phase 4, Phase 7, or `skills/council/SKILL.md` work starts until portable `bin/council` ships, usefulness gates pass, and this companion receives a refreshed plan review.

## Governed Status

| Deferred surface | Status | Start condition |
|---|---|---|
| Phase 3C Pi package and TUI | Deferred | Portable MVP shipped and companion re-reviewed. |
| Phase 4 Pi direct execution | Deferred | Phase 3C accepted, installed Pi surface artifact verified, and companion re-reviewed. |
| Phase 7 parallel Pi direct proof | Deferred | Phase 4 serial Pi direct accepted and a live no-secret effort proof succeeds. |
| `skills/council/SKILL.md` | Deferred | Pinned Claude Code nested-skill smoke test proves coexistence with symlinked `/synthesis`. |

## Phase 3C Pi Package And TUI

Phase 3C adds the Pi `pi` manifest, Pi peers, repo-local Pi type stubs, `.gitattributes` normalization for Pi gate files, `extensions/council/index.ts`, `extensions/council/lib/pi-runtime.ts`, and Pi UI files.
Phase 3C `extensions/council/index.ts` must import installed Pi packages only through lazy calls to `extensions/council/lib/pi-runtime.ts`.
`extensions/council/lib/pi-runtime.ts` owns lazy Pi value imports, `getAgentDir()`, `CONFIG_DIR_NAME`, trust checks, mode/cwd, injected `CouncilConfigRootsV1`, and session-shutdown hooks.
Phase 3C adds `readPiMvpRuntimeGate()` before command registration or UI render.
The gate verifies Pi registry, UI, command, session, provider-invoke UI, `ctx.ui.custom`, `getAgentDir`, `CONFIG_DIR_NAME`, `ctx.isProjectTrusted`, `ctx.mode`, `ctx.cwd`, and `session_shutdown`.
If installed Pi is outside the supported range or lacks required surfaces, package load must not crash.
The UI must show a mismatch diagnostic or portable `bin/council` fallback guidance.
The first local milestone is a no-model-call `pi -e ./extensions/council/index.ts /council --self-test` spike before TUI work starts.
No roster editor, Pi route execution, or Pi session custom entry is built until the matching Pi surface contract and self-test pass.
Phase 3C may show provider-invoke routes inside Pi, but Pi-registry-only execution stays unavailable until Phase 4.
Pi-registry-only users are not MVP users until Phase 4.
Phase 3C first-run seeding may copy the portable global roster into an editable Pi draft only when no Pi user roster exists and no trusted project roster exists.
That draft must set `seededFrom: "portable-global"`, revalidate every route against the live Pi/provider catalog, preserve unavailable entries visibly, and persist only after Run to the selected Pi scope.
Pi must never import an explicit portable `--roster-file`, must never mutate portable global config, and must document one-way seeding as convenience rather than synchronization.

## Phase 4 Pi Direct Execution

Phase 4 adds `extensions/council/lib/executors/pi-complete.ts` and enables Pi direct routes only after a verified installed Pi surface artifact exists.
The Pi extension uses `ctx.modelRegistry` for Pi routes and never parses Pi auth files directly.
Pi route discovery calls `await ctx.modelRegistry.refresh()` once at command start, enumerates `getAll()` to preserve unavailable configured Pi routes, and uses `getAvailable()` for direct-route status.
Pi auth status comes from `ctx.modelRegistry.hasConfiguredAuth(model)`, `ctx.modelRegistry.getProviderAuthStatus(model.provider)`, and `ctx.modelRegistry.isUsingOAuth(model)`.
Pi execution calls `ctx.modelRegistry.getApiKeyAndHeaders(model)` only after Run and immediately before a selected route executes.
Resolving API keys or headers is not a paid probe call, but it may execute user-configured commands and is sensitive.
Pi Claude routes are runnable only when auth is OAuth or another Pi subscription route, not when the only available source is an Anthropic API key.
Before each Pi Claude member call, `pi-complete` re-checks `ctx.modelRegistry.isUsingOAuth(model)` after route reconciliation and before `ctx.modelRegistry.getApiKeyAndHeaders(model)`.
If that guard is false, the member fails with `auth_policy`, reason `Claude council routes require subscription auth`, and no `complete()` call occurs.
The executor relies on registry auth-status APIs for non-secret source validation and never inspects or logs credential material to infer auth type.
The executor calls `complete(model, context, { apiKey, headers, env, signal: memberSignal, timeoutMs, maxRetries: 0, ...toPiEffortOptions(model, entry.effort) })`.
`toPiEffortOptions(model, effort)` uses `hasApi()` to emit Anthropic `{ effort }`, OpenAI `{ reasoningEffort }`, and Codex `off -> "none"` only after installed-surface confirmation.
For `off` on providers without an explicit `"none"` option, `toPiEffortOptions` omits provider-specific thinking options.
The Pi executor must use provider-specific per-call effort options and must never call session-global thinking setters such as `pi.setThinkingLevel()`.
Phase 4 Pi direct execution is hard-serial with Pi-direct lane width `1`.
No parallel Pi direct scheduler path, artifact reader, or fixture is implemented in Phase 4.
Mixed portable and Pi direct scheduling may overlap portable calls only within `maxConcurrencyGlobalCeiling` after the Pi serial call consumes one global slot.
Pi direct executor diagnostics redact `sk-...`, `Bearer ...`, known secret values, API keys, and headers before reports are written.

## Surface Gate Contracts

Phase 3C adds `scripts/verify-pi-package.mjs`, `scripts/verify-pi-surface.mjs`, and `scripts/check-council-pi-gate.mjs`.
Phase 3C `check-council-pi-gate` may run without a surface artifact while only provider-invoke Pi UI exists.
Phase 4 activates the strict Pi gate when `extensions/council/lib/executors/pi-complete.ts` is tracked.
Then `docs/public/council-pi-surface-gate.v1.json` must match normalized code and stub files.
`npm run verify:pi-surface -- --write-artifact` is the only command that writes `status: "verified"`.
`node scripts/check-council-pi-gate.mjs --strict-verified` is required before Phase 4 Pi execution acceptance.
`scripts/verify-pi-surface.mjs` imports installed Pi packages, compiles a temporary TS surface check, and fails with `PI_NOT_INSTALLED` when unavailable.
The installed-runtime surface check verifies Pi registry, UI, command, session, and provider-invoke UI surfaces in Phase 3C, then Pi execution and effort-option surfaces in Phase 4.
`tests/council/pi-surface-contract.test-d.ts` and `tests/council/pi-effort-options-contract.test-d.ts` are Phase 3C or Phase 4 files, not Phase 1 files.
Phase 4 reruns `npm run verify:pi-surface` before any live Pi model execution code lands.
Phase 4 generates and commits `docs/public/council-pi-surface-gate.v1.json` from the successful Pi-present run before `pi-complete.ts` can merge.
The verified artifact records version, status, installed Pi path/versions, Node version, command, timestamp, normalized hashes, normalization contract, compatible ranges, and no-secret summary.
The pending artifact records version, pending status, timestamp, reason, normalized hashes, normalization contract, and no installed Pi package claims.
The artifact excludes council-owned mappers such as `extensions/council/lib/effort.ts`; unit and type tests cover them without Pi regeneration.
Every tracked stub `.d.ts` under `tests/council/pi-fixtures/types/@earendil-works/` is included in `PI_SURFACE_GATE_STUB_FILES_V1` or its deterministic generated equivalent.

```ts
export interface CouncilPiSurfaceGateV1 {
  version: 1;
  status: "verified" | "pending_pi_regeneration";
  sourceFiles: Record<"scripts/verify-pi-surface.mjs" | "extensions/council/lib/pi-runtime.ts" | "extensions/council/lib/executors/pi-complete.ts", { sha256: string }>;
  stubFiles: Record<string, { sha256: string }>;
  generatedAt: string;
  reason?: string;
  verifiedBy?: {
    command: "npm run verify:pi-surface -- --write-artifact";
    nodeVersion: string;
    piPackagePath: string;
    piVersions: Record<"@earendil-works/pi-coding-agent" | "@earendil-works/pi-ai" | "@earendil-works/pi-tui", string>;
    compatiblePiVersionRanges: Record<"@earendil-works/pi-coding-agent" | "@earendil-works/pi-ai" | "@earendil-works/pi-tui", string>;
    surfaceSummary: {
      thinkingVocabulary: ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
      providerEffortOptions: Record<"anthropic-messages" | "openai-responses" | "azure-openai-responses" | "openai-codex-responses", "effort" | "reasoningEffort">;
    };
    runtimeSanityContract: {
      requiredExports: ["complete", "getSupportedThinkingLevels", "hasApi"];
      requiredModelRegistryMethods: ["getAll", "getAvailable", "find", "hasConfiguredAuth", "getProviderAuthStatus", "getApiKeyAndHeaders", "isUsingOAuth"];
      requiredMvpContextSurfaces: ["registerCommand", "ctx.ui.custom", "getAgentDir", "CONFIG_DIR_NAME", "ctx.isProjectTrusted", "ctx.mode", "ctx.cwd", "session_shutdown"];
      allowedThinkingVocabulary: ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
    };
  };
}

export type CouncilPiRuntimeGateResultV1 =
  | { ok: true; surfaceGate: "verified"; piVersions: Record<string, string>; exactVersionMatch: boolean }
  | { ok: false; reason: "pi_surface_not_verified" | "pi_runtime_version_mismatch" | "pi_runtime_surface_mismatch" | "pi_runtime_unavailable"; piVersions?: Record<string, string>; compatiblePiVersionRanges?: Record<string, string>; sanityErrors?: string[] };
```

A `verified` artifact includes `verifiedBy` and omits `reason`.
A `pending_pi_regeneration` artifact includes `reason` and omits `verifiedBy`.
The runtime gate treats any live version outside `verifiedBy.compatiblePiVersionRanges` as `pi_runtime_version_mismatch`.
The runtime gate allows live versions inside range but different from exact verified versions only after no-model runtime sanity passes.
Pi direct routes with missing, pending, stale, source-hash-mismatched, out-of-range, or sanity-failed artifacts stay visible but unavailable.
`complete()` must never be called while the gate is unavailable.
When drift disables a selected route, discovery may suggest only verified authorized `provider-invoke` replacements and must never silently rewrite the selection.
If no verified authorized portable replacement is selected, `validateRoster()` blocks Run with the lower-level gate reason and an actionable compatibility error.
Exactly-next-minor Pi may offer one-run `allow_unverified_pi_runtime` only after no-model sanity passes.
Other drift disables Pi direct with the gate reason.
Pi direct support is per minor line: day one targets installed Pi `0.80.10` and `0.80.x`, and each new minor needs a regenerated verified artifact before support is claimed.

## Phase 7 Parallel Pi Direct Proof

Phase 7 may add parallel Pi direct only after `npm run verify:pi-effort-live` first succeeds on at least one real reasoning route with non-secret per-call effort metadata.
If the live runner exits `77` with `PI_EFFORT_LIVE_INCONCLUSIVE`, it writes no verified artifact and Phase 7 must not implement or claim parallel Pi direct execution.
After a successful proof, Phase 7 may add `docs/public/council-pi-effort-live.v1.json`, parallel scheduler support scoped to the proven provider/API family, and diagnostics `pi_concurrency_mode: "parallel_verified_effort_isolation"`.
Missing, inconclusive, stale, or version-mismatched live-effort artifacts never affect Phase 4 Pi direct availability; diagnostics remain `pi_concurrency_mode: "serial_pi_direct"`.

```ts
export interface CouncilPiEffortLiveGateV1 {
  version: 1;
  status: "verified";
  generatedAt: string;
  command: "npm run verify:pi-effort-live -- --write-artifact";
  piVersions: Record<"@earendil-works/pi-coding-agent" | "@earendil-works/pi-ai" | "@earendil-works/pi-tui", string>;
  routeId: string;
  providerApiFamily: string;
  testedEfforts: [CouncilEffort, CouncilEffort];
  metadataProofSummary: string[];
}
```

`CouncilPiEffortLiveGateV1` is Phase 7-only and must not be read by Phase 4 code until a real live proof succeeds.

## Deferred File-Level Changes

Add the Pi `pi` manifest and Pi peers in Phase 3C with the Pi UI package work.
Add `.gitattributes` in Phase 3C pinning Pi gate files to LF text, and test the same normalizer in artifact writer and runtime gate.
Add `tests/council/pi-fixtures/types/@earendil-works/` in Phase 3C with minimal type stubs for the Pi imports used by council code and contracts.
Add `extensions/council/index.ts` in Phase 3C for real Pi command registration, and do not expose executable Pi `/council` behavior until the UI and engine dependencies exist.
Add `extensions/council/lib/pi-runtime.ts` in Phase 3C for lazy Pi value imports and injected config roots.
Add `extensions/council/ui/roster-editor.ts`, `extensions/council/ui/composition.ts`, and `extensions/council/ui/keymap.ts` in Phase 3C.
Add `extensions/council/lib/executors/pi-complete.ts` in Phase 4 for Pi direct model calls.
Add `scripts/check-council-release-artifacts.mjs` in Phase 4 so release tags and default-branch refs intended for `pi install git:` fail unless the Pi surface artifact is current and `status: "verified"`.
Add `scripts/verify-pi-effort-live.mjs` and `docs/public/council-pi-effort-live.v1.json` only in Phase 7 after a real route proves usable per-call effort metadata.
Add `skills/council/SKILL.md` only after nested-skill proof on a pinned Claude Code version.

## Deferred Test Matrix

| Scenario | Test location | Expected result |
|---|---|---|
| Pi-present surface gate | Local Pi integration check | Installed Pi passes `npm run verify:pi-surface` and `pi -e ./extensions/council/index.ts /council --self-test` before command registration. |
| Pi runtime path mapping | Local Pi integration check | `pi -e` proves `@earendil-works/*` imports resolve installed Pi modules, not repo-local stubs. |
| Pi TUI render width | UI fixture | Long roster and composition labels render at narrow widths with every emitted line length `<= width`. |
| Pi reload during menu | Pi integration fixture | Menu closes, no config write occurs, and stale context is not used. |
| Pi session replacement during run | Pi integration fixture | Active run aborts and no replacement-session work uses old `ctx`. |
| Pi provider-invoke UI | Pi fixture plus fake provider-invoke | Phase 3C runs only authenticated Claude/Codex CLI routes and leaves Pi-registry-only auth unavailable until Phase 4. |
| Pi complete Claude auth guard | Executor unit test with fake Pi registry | When `ctx.modelRegistry.isUsingOAuth(model)` is false for a Claude route, the member fails with `auth_policy` and `complete()` is never called. |
| Pi strict runtime gate | Route/executor unit test plus release check | Pending or stale artifacts disable Pi direct, never call `complete()`, and fail release. |
| Pi runtime version drift | Route/executor unit test | Outside-range Pi disables direct routes; exactly-next-minor drift runs only after one-run acceptance plus no-model sanity. |
| Pi effort option contract | Surface verification, type contract, and executor unit test | Installed effort keys map exactly and unsupported values are not clamped. |
| Per-member Pi effort propagation | Executor unit test | `pi-complete` passes each roster effort through provider-specific per-call options and never calls a global thinking setter. |
| Serial mixed Pi efforts | Executor/scheduler unit test | Fake Pi members with different efforts run serially in roster order with separate per-call options. |
| Pi drift replacement safety | Route and roster tests | Drift disables selected Pi routes, suggests authorized portable routes only, blocks Run until explicit selection, and never rewrites silently. |
| Pi package install lifecycle | Local Pi package-manager smoke test | Pi git install uses production deps; `prepack` is maintainer-only and runtime route gates protect users. |
| Pi live effort proof | Phase 7 script test | Pass writes artifact, exit `77` is inconclusive and keeps serial mode, hard failure blocks parallel code. |

## Deferred Acceptance

Post-MVP `/council` in Pi TUI opens a roster editor seeded from the last confirmed Pi roster or recommendations.
Pi TUI Run gating, portable roster semantic validation, `--emit-roster`, and engine preflight all use the same exported `validateRoster()` result.
Post-MVP Pi direct routes require verified installed Pi surface, normalized code-and-stub freshness, version gates, provider-specific effort mapping, and no silent portable replacement.
Phase 4 serializes Pi direct members while portable calls may overlap only within `maxConcurrencyGlobalCeiling`.
Phase 7 parallel Pi direct code cannot land without a verified live effort artifact.
Pi-present surface checks remain outside generic clean-checkout CI but are required before Pi-dependent phases land.
`prepack` is only a maintainer pack or publish gate and must not be treated as an install gate for `pi install git:...`.
Do not add a `prepare` install gate for MVP or Pi direct because it would require dev dependencies in end-user Pi installs or duplicate the runtime gate.
Before Phase 4 Pi execution acceptance, replace pending surface artifacts with verified ones, run clean-checkout `check-council-pi-gate`, `verify:pi-execution-release`, and `npm pack --dry-run`.
Before claiming concurrent Pi direct execution, run `npm run verify:pi-effort-live -- --write-artifact`; if it exits `77`, confirm no parallel code or artifact lands.
