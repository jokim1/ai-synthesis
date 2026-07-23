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
Pi value imports must be lazy and isolated behind `extensions/council/lib/pi-runtime.ts`.
`readPiMvpRuntimeGate()` must verify command registration, `ctx.ui.custom`, mode/cwd, trust, `getAgentDir`, `CONFIG_DIR_NAME`, model registry access, and `session_shutdown` before registration or render.
If installed Pi is unsupported or lacks required surfaces, package load must not crash.
The UI must show a mismatch diagnostic or portable `bin/council` fallback guidance.
The first local milestone is a no-model-call `pi -e ./extensions/council/index.ts /council --self-test` before TUI work starts.
Phase 3C may show provider-invoke routes inside Pi, but Pi-registry-only execution stays unavailable until Phase 4.
First-run Pi seeding may copy the portable global roster into an editable Pi draft only when no Pi user roster and no trusted project roster exist.
That draft records `seededFrom: "portable-global"`, revalidates live routes, preserves unavailable entries visibly, and persists only after Pi Run to the selected Pi scope.
Pi must never import an explicit portable `--roster-file` and must never mutate the portable global file.

## Phase 4 Pi Direct Execution

Phase 4 adds `extensions/council/lib/executors/pi-complete.ts` only after a verified installed Pi surface artifact exists.
Pi route discovery uses `ctx.modelRegistry.refresh()`, `getAll()`, `getAvailable()`, `hasConfiguredAuth()`, `getProviderAuthStatus()`, and `isUsingOAuth()`.
Pi execution resolves `ctx.modelRegistry.getApiKeyAndHeaders(model)` only after Run and immediately before a selected route executes.
Resolving keys or headers is not a paid probe call, but it is sensitive and may execute user-configured commands.
Pi Claude routes require OAuth or another Pi subscription route and must never run from Anthropic API-key-only auth.
Before each Pi Claude call, `pi-complete` re-checks subscription auth and fails with `auth_policy` before `complete()` when the guard fails.
The executor calls `complete(model, context, { apiKey, headers, env, signal, timeoutMs, maxRetries: 0, ...toPiEffortOptions(model, effort) })`.
`toPiEffortOptions()` emits provider-specific per-call effort options and must never rely on session-global thinking setters.
Phase 4 Pi direct execution is hard-serial with Pi-direct lane width `1`.
Mixed portable and Pi direct scheduling may overlap portable calls only within `maxConcurrencyGlobalCeiling` after the Pi serial call consumes one global slot.
Pi direct diagnostics redact API keys, bearer tokens, `sk-...` values, headers, and known secrets before reports are written.

## Surface Gate Contracts

Phase 3C adds `scripts/verify-pi-package.mjs`, `scripts/verify-pi-surface.mjs`, and `scripts/check-council-pi-gate.mjs`.
Phase 4 activates strict surface gating when `pi-complete.ts` is tracked.
`docs/public/council-pi-surface-gate.v1.json` must match normalized code and stub hashes before Pi direct execution can merge.
Only `npm run verify:pi-surface -- --write-artifact` may write `status: "verified"`.
`node scripts/check-council-pi-gate.mjs --strict-verified` is required before Phase 4 execution acceptance.
The verified artifact records installed Pi path, Pi package versions, Node version, compatible minor ranges, normalized hashes, thinking vocabulary, provider effort option keys, and no-secret runtime sanity requirements.
Pending artifacts omit installed Pi claims and include a reason.
`CouncilPiRuntimeGateResultV1` returns either verified package versions or one unavailable reason from `pi_surface_not_verified`, `pi_runtime_version_mismatch`, `pi_runtime_surface_mismatch`, or `pi_runtime_unavailable`.
Out-of-range Pi versions disable Pi direct with `pi_runtime_version_mismatch`.
In-range but non-exact versions require no-model sanity before enabling Pi direct.
Missing, pending, stale, source-hash-mismatched, out-of-range, or sanity-failed artifacts keep Pi direct routes visible but unavailable and must never call `complete()`.
Pi direct support is per minor line; day one targets Pi `0.80.10` and `0.80.x`, and each new minor needs a regenerated verified artifact before support is claimed.
When drift disables a selected route, suggestions may include only verified authorized portable replacements and must never rewrite the selection silently.

## Phase 7 Parallel Pi Direct Proof

Phase 7 may add parallel Pi direct only after `npm run verify:pi-effort-live` succeeds on a real reasoning route with non-secret per-call effort metadata.
Exit `77` with `PI_EFFORT_LIVE_INCONCLUSIVE` writes no verified artifact and leaves Phase 4 serial mode intact.
`CouncilPiEffortLiveGateV1` records version, verified status, command, Pi package versions, route id, provider API family, two tested efforts, and non-secret proof summary.
Parallel scheduler support is scoped only to the proven provider/API family.

## Deferred Files

Phase 3C files include the Pi manifest, Pi peers, `.gitattributes`, Pi stubs, `extensions/council/index.ts`, `extensions/council/lib/pi-runtime.ts`, and Pi UI modules.
Phase 4 files include `extensions/council/lib/executors/pi-complete.ts`, `docs/public/council-pi-surface-gate.v1.json`, and `scripts/check-council-release-artifacts.mjs`.
Phase 7 files include `scripts/verify-pi-effort-live.mjs` and `docs/public/council-pi-effort-live.v1.json`.
`skills/council/SKILL.md` ships only after nested-skill proof on a pinned Claude Code version.

## Deferred Tests

| Scenario | Expected result |
|---|---|
| Pi surface gate | Installed Pi passes `verify:pi-surface` and `pi -e` self-test before command registration. |
| Pi path mapping | Runtime imports resolve installed Pi modules, not repo-local stubs. |
| Pi lifecycle | Reload, session replacement, narrow rendering, and cancel avoid stale contexts and unintended config writes. |
| Pi provider-invoke UI | Phase 3C runs authenticated CLI routes and leaves registry-only auth unavailable until Phase 4. |
| Pi Claude auth guard | Non-subscription Claude auth fails before `complete()`. |
| Pi strict runtime gate | Pending or stale artifacts disable Pi direct and fail release checks. |
| Pi effort propagation | Per-member effort reaches provider-specific per-call options without global thinking state. |
| Pi drift replacement | Drift suggests authorized portable routes only and blocks Run until explicit selection. |
| Pi live effort proof | Success writes the artifact, exit `77` keeps serial mode, and hard failure blocks parallel code. |

## Deferred Acceptance

Post-MVP `/council` in Pi TUI opens a roster editor seeded from the last confirmed Pi roster or recommendations.
Pi TUI Run gating, portable roster semantic validation, `--emit-roster`, and engine preflight all use the same exported `validateRoster()` result.
Pi direct routes require verified installed Pi surface, version gates, provider-specific effort mapping, and no silent portable replacement.
Phase 4 serializes Pi direct members.
Phase 7 parallel Pi direct code cannot land without a verified live effort artifact.
`prepack` is maintainer-only and must not be treated as an install gate for `pi install git:...`.
Do not add a `prepare` install gate for MVP or Pi direct.
Before Phase 4 acceptance, replace pending artifacts with verified ones, run clean-checkout `check-council-pi-gate`, run `verify:pi-execution-release`, and run `npm pack --dry-run`.
