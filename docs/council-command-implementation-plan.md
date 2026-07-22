# Council Command Implementation Plan

This plan covers the optional, user-installed `/council` capability for `ai-synthesis`.
It is an implementation plan only and does not implement the capability.
The design keeps `/council` as personal `ai-synthesis` customization and does not require any Firstmate repository or default behavior change.

## What Already Exists

`README.md` describes `ai-synthesis` as a Claude Code skill installed by symlinking the whole repository into `~/.claude/skills/synthesis`.
`SKILL.md` is the current `/synthesis` orchestrator and intentionally keeps orchestration in the skill file instead of a framework.
`SKILL.md` resolves `AISYNTH_HOME` from the directory containing the skill and writes durable project-local sessions under `./.ai-synthesis/sessions/`.
`SKILL.md` supports `/synthesis <decision>`, Pi-style `@file`-like context parsing for `/synthesis`, `--solo`, `--compare`, `rate`, `revisit`, `expand`, `list`, and `resume`.
`SKILL.md` `expand` selects the latest `./.ai-synthesis/sessions/*.md` file or a matching id/topic and prints expected synthesis sections.
`SKILL.md` `list` reads every `./.ai-synthesis/sessions/*.md` frontmatter file and does not define a `mode` filter.
`SKILL.md` `rate` writes to the latest or matching session, and `revisit` explicitly skips only `mode: compare`, so council reports must not share that legacy glob until those commands are changed.
`SKILL.md` already defines independent initial analysis, shared evidence ledger construction, degradation on failed voices, adversarial review, decision-grade versus exploratory grading, and frontmatter-backed ratings and outcomes.
`roles/analyst.md`, `roles/critic.md`, `roles/steelman.md`, `roles/synthesizer.md`, `roles/adversary.md`, and `roles/solo.md` provide the strongest reusable prompting concepts for council phases.
`schemas/analyst.json`, `schemas/critic.json`, `schemas/steelman.json`, `schemas/adversary.json`, and `schemas/solo.json` enforce `ok: true`, provenance discipline, cruxes, capability gaps, and bounded adversarial objections.
`bin/provider-probe` performs a no-cost binary and authentication check for `claude` or `codex` and emits the normalized provider envelope.
`bin/provider-invoke` runs a role call through `claude` or `codex` and emits the same envelope with `ok`, `status`, `provider`, `model`, `structured`, `text`, `error`, and `meta`.
`bin/provider-invoke --help` exposes the actual `--auth <auto|subscription|apikey>` and `--effort <low|medium|high|xhigh|max>` flags.
`bin/provider-invoke` already parses `--auth` and `--effort`, exports `A_AUTH` and `A_EFFORT`, and rejects unknown top-level flags through `aisynth_die_usage`.
`bin/provider-invoke` does not validate the semantic effort vocabulary; `bin/adapters/codex.sh` maps `max` to `xhigh` and clamps unknown effort strings to `medium`, so council must validate supported efforts before invoking it.
`bin/adapters/claude.sh` already consumes `A_AUTH=auto|subscription|apikey`, but `bin/provider-probe` does not currently expose a CLI flag to set `A_AUTH`.
`bin/adapters/claude.sh` currently unsets known Claude credential variables when its internal first-party-session branch is active and preserves non-credential `ANTHROPIC_*` variables in the default `auto` path.
`bin/adapters/claude.sh` currently omits `ANTHROPIC_OAUTH_TOKEN` from that known-credential unset list in the default `auto` path, and `/council` should preserve that auto behavior for `/synthesis`.
Installed Pi's `env-api-keys.js` treats `ANTHROPIC_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` as Anthropic credentials, so explicit council subscription sanitizing must still delete `ANTHROPIC_OAUTH_TOKEN`.
`bin/adapters/claude.sh` defaults to subscription-preferred auto mode and can fall back to `ANTHROPIC_API_KEY`, which `/council` must avoid for Claude routes.
`bin/adapters/claude.sh` passes `A_EFFORT` directly to `claude --effort "$A_EFFORT"` without adapter-level validation, mapping, or clamping.
The installed Claude CLI help confirms an `--effort <level>` flag but does not publish accepted values, so council must prove portable Claude effort support through fake/no-model argv contract tests before marking values executable.
`bin/adapters/codex.sh` maps `max` to `xhigh` for `/synthesis`, but `/council` must not silently clamp remembered effort values.
`bin/lib/json_extract.py` provides the existing provider-layer tolerant JSON extraction algorithm and minimal JSON Schema subset for model text that is not provider-enforced.
`bin/lib/json_extract.py` is small enough to port to TypeScript for council runtime use, so `/council` should not introduce a Python dependency for Pi or portable Node execution.
`bin/lib/frontmatter_set.py` updates session frontmatter fields for rating and revisit flows and should remain available for council report metadata updates if needed.
`tests/conformance/run.sh` supports the exact current targets `unit`, `claude`, `codex`, and `all`, with `all` running unit, Claude, and Codex suites.
The current `claude` and `codex` suites include live provider probe or smoke sections before their fake-only branches, so the current `all` target is not a hermetic clean-runner gate when real provider CLIs or auth are absent.
`tests/conformance/fakes.sh` provides fake CLIs for deterministic auth, timeout, malformed, retry, and argv tests.
`.gitignore` ignores `/docs/*` except `/docs/public/`, so this plan and later non-public implementation docs must be added with `git add -f`.
`.pipelane.json` declares `prePrChecks` as `npm run test`, `npm run typecheck`, and `npm run build`, but the inspected installed Pipelane version ignores repo-local config through `readPackageJsonOverlay()`.
Installed Pipelane `src/operator/commands/pr.ts` runs each effective check through `runShell(context.repoRoot, check, ...)`, and `src/operator/state.ts` implements that as `sh -lc <check>` without `npm ci`.
Installed Pipelane `resolveWorkflowContext(cwd)` loads machine-local `~/.pipelane/repos/<repo-key>/config.json` or synthesized defaults, and `pipelaneHomeDir()` honors `PIPELANE_HOME` so Phase 1 can verify both paths.
The current machine-local config at `/Users/josephkim/.pipelane/repos/243e6e4a17556acb3aa7996c/config.json` has those same three checks, and the current no-`package.json` checkout is a known red baseline for them.
The task shell reached the npm registry, but Pipelane has no install or network guarantee, so Phase 1 must make `test`, `typecheck`, and `build` install-aware with package metadata.
Pi documentation under `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/` supports the required optional package path.
The installed Pi package surface verified for this plan is `@earendil-works/pi-coding-agent` `0.80.10` under `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/`, with nested `@earendil-works/pi-ai` `0.80.10` and `@earendil-works/pi-tui` `0.80.10`, all requiring Node `>=22.19.0`.
Installed Pi `0.80.10` package installation clones git packages into the Pi package store and runs `npm install --omit=dev` when package metadata exists, so `/council` must not depend on npm `prepack` or `prepare` as an end-user install gate.
Pi package resources are declared in `package.json` under a `pi` key or discovered from conventional `extensions/`, `skills/`, `prompts/`, and `themes/` directories.
Pi extension commands are registered with `pi.registerCommand(name, { description, handler, getArgumentCompletions })`.
Pi extension commands run before input events, skill commands, and prompt templates, so `/council ...` should be implemented as an extension command for native Pi behavior.
Pi native UI belongs behind `ctx.mode === "tui"` because `ctx.ui.custom()` is not available in RPC, JSON, or print modes.
Pi provides `ctx.ui.custom()`, `SelectList`, `SettingsList`, `BorderedLoader`, `DynamicBorder`, `keyHint`, `getSettingsListTheme()`, and `@earendil-works/pi-tui` width utilities for polished TUI controls.
Pi requires custom component `render(width)` output lines not to exceed `width`.
Pi state that should survive reloads inside a session can be appended with `pi.appendEntry(customType, data)` and restored by scanning `ctx.sessionManager.getBranch()`.
Pi user-global config locations must be derived with `getAgentDir()` and project config directory names with `CONFIG_DIR_NAME`, not hardcoded as `~/.pi/agent` or `.pi`.
Pi model discovery is available from `ctx.modelRegistry.getAll()`, `getAvailable()`, `find()`, `hasConfiguredAuth()`, `getProviderAuthStatus()`, `getApiKeyAndHeaders()`, `isUsingOAuth()`, and provider display names.
Pi model effort support is exposed by `getSupportedThinkingLevels(model)` from `@earendil-works/pi-ai`.
Installed Pi `0.80.10` defines CLI thinking levels as `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`.
Installed `@earendil-works/pi-ai` `0.80.10` defines `ModelThinkingLevel` as `off` plus `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`, and `getSupportedThinkingLevels(model)` returns `["off"]` for non-reasoning models.
Installed `@earendil-works/pi-ai` `0.80.10` `getSupportedThinkingLevels(model)` filters `xhigh` and `max` through `model.thinkingLevelMap`, and `clampThinkingLevel(model, level)` would silently choose a nearby level, so council route reconciliation must normalize levels itself and must not use Pi clamping for remembered roster efforts.
Pi direct model execution can use `complete(model, context, options)` from `@earendil-works/pi-ai/compat` after resolving auth with `ctx.modelRegistry.getApiKeyAndHeaders(model)`.
The installed `@earendil-works/pi-ai/compat` `complete()` declaration accepts open `ProviderStreamOptions`, so compiling a call to `complete(..., { reasoningEffort })` alone cannot prove that a provider actually honors that option.
The installed provider-specific Pi option types in `dist/api/openai-responses.d.ts`, `dist/api/openai-codex-responses.d.ts`, and `dist/api/anthropic-messages.d.ts` expose `reasoningEffort` for OpenAI Responses and OpenAI Codex models, while Anthropic models expose `effort`, so the Pi executor needs an explicit provider/API-specific effort mapper.
Pi session replacement and reload invalidate old extension contexts, so any council command must abort active work on `session_shutdown` and use only replacement contexts inside `withSession` callbacks.
The installed Pi extension loader in `dist/core/extensions/loader.js` creates `jiti` with Pi-owned aliases for `@earendil-works/*` packages rather than relying on the caller repository's `tsconfig.json` path mappings.
A local loader probe against Pi `0.80.10` with a temporary root `tsconfig.json` mapping `@earendil-works/pi-coding-agent` to a fake stub still resolved the installed module and reported `CONFIG_DIR_NAME` as `.pi`, so the Node `pi -e` loader path did not let repo-local stubs shadow installed Pi modules.
The `pi -e` self-test remains a hard gate because an installed Pi loader or packaging behavior change could still alter runtime resolution later.

## Goals

Provide `/council [issue text]`, `/council <plan-file>`, and `/council @plan-file` as a Pi-first command installed only when the user installs the `ai-synthesis` package.
Provide a portable non-Pi skill and CLI fallback that runs the same TypeScript council engine through Node without claiming to provide Pi's native roster menu.
Review an issue or plan without modifying the reviewed plan file or authorizing implementation.
Detect model execution routes without paid probe calls.
Separate provider and model identity from the executor used to call it and from billing or authentication state.
Present an editable roster where every entry is defined by `model`, `role`, and `effort`.
Allow users to add, delete, edit, reorder, reset to recommendations, run, and cancel.
Seed the roster from the last confirmed roster, revalidate it on every invocation, and persist only after the user selects Run.
Preserve unavailable or unsupported remembered roster entries visibly and provide replacement suggestions.
Recommend role coverage, available routes, issue-versus-plan composition, prior roster continuity, and local user-specific routing evidence without blocking valid councils.
Accept two or more valid members even when they are a single model, a single family, or cross-family.
Treat cross-family diversity as useful feedback, not a launch gate.
Require at least two executable members with valid model, role, supported effort, and a final report strategy before Run.
Recommend but do not require a chair.
Support final report strategies of designated chair, deterministic synthesis, and structured disagreement.
Keep every substantive model voice explicit in the roster.
Prevent the host Pi model or extension process from becoming a hidden extra vote.
Execute independent initial analyses before any member sees another member's output.
Run evidence-led critique, steelman, adversarial, and synthesis or disagreement phases after the independent round.
Reuse existing `ai-synthesis` evidence, degradation, compare, and revisit concepts where they fit.
Output recommendation, evidence, strongest dissent, assumptions, risks, what would change the recommendation, decision readiness, and next action.
Preserve subscription-only Claude usage and never fall back to Anthropic API credentials for Claude council routes.

## Not In Scope

Do not implement `/council` in this task.
Do not change Firstmate's repository, defaults, command registry, or tracked configuration.
Do not make `/council` a built-in Pi or Firstmate feature.
Do not replace `/synthesis`, `--solo`, `--compare`, `revisit`, `expand`, `list`, or `resume`.
Do not require cross-family diversity for a council to run.
Do not silently change a remembered model, role, effort, route, or report strategy.
Do not invoke Anthropic API credentials for Claude council routes.
Do not mutate, rewrite, normalize, or annotate the reviewed plan file.
Do not add model tool access that can edit files during council review.
Do not make council completion a signal to start implementation.

## User Experience

The recommended Pi install command should be `pi install git:github.com/jokim1/ai-synthesis@<tag-or-commit>` once the package exists.
Project-local installation should be supported with `pi install -l git:github.com/jokim1/ai-synthesis@<tag-or-commit>` for users who want `/council` only in a project.
The package should expose one Pi extension command named `council` and one skill named `council`.
The Pi extension command should render the polished roster editor only when `ctx.mode === "tui"`.
In Pi RPC mode, `/council` should use dialog methods or a non-interactive fallback and should not call `ctx.ui.custom()`.
In Pi print or JSON mode, `/council` should run only when enough input and a valid saved roster exist, otherwise it should print a usage error with no UI claim.
The portable CLI may require Node and package dependencies, and its missing-runtime error should name the exact command to run, such as `npm install` from the package root.
In non-Pi environments, the portable `skills/council/SKILL.md` should explain that the native menu is Pi-only and should route users to the Node-backed `bin/council` CLI plus a JSON roster file.
`/council` with empty input in Pi TUI should open a small choice flow that asks for issue text or a plan file path.
`/council` with empty input outside Pi TUI should return usage and exit without creating or changing config.
`/council @plan.md` should treat `plan.md` as the reviewed plan file when it resolves to a readable regular file under an allowed root.
`/council plan.md` should treat `plan.md` as the reviewed plan file only when the entire argument resolves to one readable regular file.
`/council fix the deployment plan` should treat the argument as issue text even though it contains words that could be filenames.
`/council notes plan.md` should treat the whole argument as issue text unless `plan.md` is explicitly marked with `@`.
For input parsing, a candidate is path-shaped when, after stripping one leading `@`, it is absolute, starts with `.`, starts with `~`, contains `/` or `\`, has a recognized plan extension `.md`, `.markdown`, `.mdown`, `.txt`, or `.plan`, or resolves to any filesystem entry before readability checks.
The parser should apply the path-shaped predicate only to a single-token full argument or to an explicit `@candidate`; mixed unmarked text remains issue text.
The parser should treat a single bare token such as `caching` as issue text when it does not resolve on disk and is not path-shaped by the rule above.
Unreadable path-shaped input should produce a clear validation error rather than silently falling back to issue text.
Bare `@word` should remain issue text when it is not path-shaped and does not resolve to a readable file.
Multiple explicit `@` files should be rejected for MVP with a message that `/council` reviews one issue or one plan at a time.
The roster screen should show a left list of roster entries and a right composition panel.
Each roster row should show route label, provider/model, role, effort, auth or billing badge, availability, and whether it is executable.
Unavailable remembered entries should remain in place, dimmed, with the original effort and a suggested replacement route or effort.
Unsupported remembered efforts should show the remembered effort verbatim and a suggested valid effort, never an automatic replacement.
The composition panel should show role coverage, model and family diversity, independent voices, effort allocation, estimated latency and cost, availability, and final report strategy.
Composition feedback should use warnings and suggestions, not gates, except for the practical validity minimum.
The roster editor keymap should use `up` and `down` to move selection, `a` to add, `e` or `enter` to edit the selected row, `d` to delete, `alt+up` and `alt+down` to reorder, `r` to reset to recommendations, `ctrl+r` to run, and `escape` or `ctrl+c` to cancel.
The roster editor should render key labels through Pi `keyHint()` or local equivalents so customized keybindings remain understandable where Pi exposes them.
The Run action should be disabled until the shared `validateRoster()` result reports at least two executable members and a valid final report strategy.
A `chair` final report strategy should be valid for Run only when the shared `validateRoster()` result proves `chairEntryId` references an enabled executable roster entry whose role is exactly `chair` and whose route and effort are available.
If the remembered chair entry is disabled, unavailable, missing, or has an unsupported effort, the editor should keep the strategy visibly invalid and require the user to edit the chair, switch report strategy, or reset recommendations before Run.
The Cancel action should close the menu without writing the roster config.
The Reset action should replace the editable draft with current recommendations while keeping a visible "undo by Cancel" path.
The Run action should atomically persist the full confirmed roster draft, including visible unavailable remembered entries, then start execution.
Execution should show a `BorderedLoader` with phase, completed member count, elapsed time, and an Escape cancellation hint.
Cancellation after Run should abort active model calls, write a canceled session entry if any work started, and keep the already-confirmed roster config.
The final report should explicitly say that council completion does not authorize project implementation.

## Architecture

Add Pi package resources while keeping the existing Claude Code `/synthesis` skill intact.
Use the Pi extension as the primary UI and model execution path.
Use a shared council engine library for state machine, prompt assembly, validation, degradation, recommendation, and report generation.
Use `extensions/council/lib/validate-roster.ts` as the single source of truth for executable-member computation, unsupported-effort blocking, two-member minimum, composition feedback, and report-strategy validity before the Phase 5 engine exists.
Use executor implementations to keep route identity separate from provider/model identity.
Use the existing provider layer only as a model executor behind the shared TypeScript engine for portable CLI routes and non-Pi fallback.
Do not make the Pi extension shell out to `pi` itself.
Do not change the current `/synthesis` orchestration in `SKILL.md` except for documentation links if desired later.

The package shape should be:

```text
package.json
package-lock.json
tsconfig.json
vitest.config.ts
extensions/council/index.ts
extensions/council/cli.ts
extensions/council/lib/types.ts
extensions/council/lib/runtime.ts
extensions/council/lib/config.ts
extensions/council/lib/input.ts
extensions/council/lib/effort.ts
extensions/council/lib/routes.ts
extensions/council/lib/validate-roster.ts
extensions/council/lib/recommend.ts
extensions/council/lib/emit-roster.ts
extensions/council/lib/engine.ts
extensions/council/lib/pi-runtime.ts
extensions/council/lib/executors/pi-complete.ts
extensions/council/lib/executors/provider-invoke.ts
extensions/council/lib/validate-json.ts
extensions/council/lib/report.ts
extensions/council/ui/roster-editor.ts
extensions/council/ui/composition.ts
extensions/council/ui/keymap.ts
skills/council/SKILL.md
bin/council
bin/council-route-probe
scripts/verify-pi-package.mjs
scripts/verify-pi-surface.mjs
scripts/verify-pi-effort-live.mjs
docs/public/council-pi-surface-gate.v1.json
docs/public/council-pi-effort-live.v1.json
scripts/ensure-node-deps.mjs
roles/council/initial.md
roles/council/critique.md
roles/council/steelman.md
roles/council/adversary.md
roles/council/chair.md
schemas/council-voice.json
schemas/council-critique.json
schemas/council-steelman.json
schemas/council-adversary.json
schemas/council-chair-report.json
schemas/council-report.json
tests/conformance/council.sh
tests/conformance/fixtures/council/
tests/council/
tests/council/pi-fixtures/
tests/council/pi-surface-contract.test-d.ts
tests/council/pi-effort-options-contract.test-d.ts
```

`package.json` should include `"keywords": ["pi-package"]` and a `pi` manifest that exposes `extensions/council/index.ts` and `skills/council`.
`package.json` should list Pi core packages as peer dependencies with `"*"` ranges, matching Pi package documentation.
`package.json` should not rely on peer dependencies to satisfy clean-checkout typecheck or build because `npm ci` does not install peers by itself.
Clean-checkout TypeScript checks should resolve Pi imports through repo-local type stubs under `tests/council/pi-fixtures/types/@earendil-works/` and `tsconfig.json` path mappings.
The repo-local Pi type stubs should be deliberately minimal and should cover only the imports and call signatures used by `/council`; they pin the council code-to-stub contract but do not prove the installed Pi runtime has not drifted.
Clean-checkout runtime tests and build scripts must never execute a module that imports `@earendil-works/*` at module evaluation time, because clean checkout has only repo-local type stubs and no installed Pi runtime modules.
All installed Pi value imports should be isolated behind `extensions/council/lib/pi-runtime.ts`, loaded lazily only by the Pi entrypoint or Pi executor after a Pi-present guard has run.
Shared modules under `extensions/council/lib/` other than `pi-runtime.ts` and `executors/pi-complete.ts` must remain portable and must not import `@earendil-works/*` value modules.
`extensions/council/ui/*` should receive Pi TUI controls and width helpers through explicit parameters from the Pi entrypoint rather than importing installed Pi packages directly.
`npm run verify:pi-surface` is the Pi-present guard against drift in the installed packages and must run against the actual package tree under `PI_CODING_AGENT_DIR` or `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/`.
`npm run verify:pi-surface` and the `pi -e` self-test should be excluded from live execution in generic Pipelane pre-PR checks and clean-checkout CI unless `PI_CODING_AGENT_DIR` or the installed Pi package path is explicitly available.
Clean-checkout CI can still enforce that the Pi-present gate was run by validating a committed freshness artifact after Pi-dependent execution files exist.
`package.json` should include runtime dependencies needed by the portable Node wrapper, including `jiti` if the CLI loads TypeScript sources directly.
`package.json` scripts `test`, `typecheck`, and `build` should be meaningful for the files present in the current implementation phase and should stay green the same commit that `package.json` is introduced.
Adding `package.json` is a deliberate repository-wide contributor and CI change, not only an optional runtime install detail.
Phase 1 should require Node `>=22.19.0`, commit `package-lock.json`, document `npm ci --prefer-offline --no-audit --fund=false`, and verify package-local scripts on a clean checkout after that install command.
Because installed Pipelane runs effective `prePrChecks` directly without installing dependencies and ignores tracked `.pipelane.json`, Phase 1 must make `npm run test`, `npm run typecheck`, and `npm run build` bootstrap dependencies through package lifecycle scripts.
Phase 1 should add `scripts/ensure-node-deps.mjs` with an exact contract: if `node_modules/.package-lock.json` or another implementation-chosen install stamp does not match the current `package-lock.json`, it runs `npm ci --prefer-offline --no-audit --fund=false`; otherwise it exits `0` without network.
`package.json` should wire `pretest`, `pretypecheck`, and `prebuild` to `node scripts/ensure-node-deps.mjs` so Pipelane's direct `npm run test`, `npm run typecheck`, and `npm run build` checks self-install before invoking dependency-backed commands.
The recurring npm bootstrap precondition is that every fresh checkout runner has either network access to the configured npm registry or a prewarmed npm cache that satisfies the committed `package-lock.json`.
If that precondition is absent, `scripts/ensure-node-deps.mjs` should fail fast with `DEPENDENCY_INSTALL_UNAVAILABLE`, print `npm config get registry`, the cache directory, and the exact manual remediation `npm ci --prefer-offline --no-audit --fund=false`, and should not skip tests or fabricate a dependency stamp.
Phase 1 verification must cover both a cache-hit run that avoids network and a cache-miss failure path with the diagnostic above.
Phase 1 should add a new `tests/conformance/run.sh hermetic` target before package scripts start depending on Node test tooling.
The `hermetic` target should run `unit` plus fake-only Claude and Codex cases, should make no live `provider-probe` or `provider-invoke` calls against real provider binaries, and should pass with real `claude` and `codex` absent from `PATH`.
The existing `tests/conformance/run.sh all` target may remain a provider-present integration gate that includes live no-cost probes and smoke checks.
Phase 1 must prove `npm run test`, `npm run typecheck`, and `npm run build` pass through the same `sh -lc` execution shape Pipelane uses in a clean checkout with no preexisting `node_modules`.
Phase 1 should also record the effective installed-Pipelane config source used for that verification: machine-local config path when present, otherwise synthesized defaults from the current checkout.
If `npm ci --prefer-offline --no-audit --fund=false` cannot reach the registry or a valid cache in the implementation runner, Phase 1 must stop and revise the package strategy rather than committing package scripts that cannot pass the active Pipelane checks.
This install-aware npm-script shape is intentionally known-good after package metadata exists and does not depend on tracked `.pipelane.json` for active Pipelane behavior.
Phase 1 should not add tracked `.pipelane.json` references to `verify:pi-surface`; that command is a Pi-present local gate, not a generic clean-checkout gate.
Phase 1 should add `scripts/check-council-pi-gate.mjs` as a no-dependency clean-checkout check that exits `0` until Pi-dependent execution files exist.
Once `extensions/council/lib/executors/pi-complete.ts` or another Pi model-execution file exists, `scripts/check-council-pi-gate.mjs` should require a committed, git-tracked `docs/public/council-pi-surface-gate.v1.json` artifact whose recorded source hashes match the exact static file list `PI_SURFACE_GATE_FILES_V1`.
`PI_SURFACE_GATE_FILES_V1` should be defined in `scripts/check-council-pi-gate.mjs` as `["scripts/verify-pi-surface.mjs", "extensions/council/lib/pi-runtime.ts", "extensions/council/lib/executors/pi-complete.ts"]`.
The checker must not infer Pi coupling by scanning source text; if a future file imports installed Pi runtime APIs, the implementation must move that import behind `pi-runtime.ts` or update `PI_SURFACE_GATE_FILES_V1` in the same commit.
The clean-checkout checker should accept only artifact statuses `verified` and `pending_pi_regeneration`, and it should fail if the artifact's `sourceFiles` keys differ from `PI_SURFACE_GATE_FILES_V1` or any recorded hash differs from current content.
`npm run verify:pi-surface -- --write-artifact` should be the only command that writes `status: "verified"`.
For contributors without installed Pi, `node scripts/check-council-pi-gate.mjs --mark-pending --reason <text>` may update the artifact with current hashes and `status: "pending_pi_regeneration"` so generic clean-checkout npm checks can pass while making the missing Pi-present verification explicit.
`node scripts/check-council-pi-gate.mjs --strict-verified` should fail on `pending_pi_regeneration` and is required before Phase 4 Pi execution acceptance.
`npm run verify:pi-execution-release` should run `node scripts/check-council-pi-gate.mjs --strict-verified` and `npm run verify:pi-surface` when Pi direct execution files exist, and it must make no model calls.
`prepack` is only a maintainer pack or publish gate for `npm pack`, `npm publish`, and equivalent packaging flows run from a development checkout with dev dependencies installed.
`prepack` is not an install gate for `pi install git:...`, `pi install -l git:...`, or local Pi installs, because installed Pi `0.80.10` runs dependency installation in the target package checkout with production dependencies only.
Do not add a `prepare` install gate for MVP, because it would either require dev dependencies in an end-user Pi install or duplicate the runtime gate.
The install-time safety boundary is runtime route availability: a package may install successfully, but Pi direct routes remain disabled until the runtime gates below pass.
The Pi route catalog and Pi executor should enforce the strict verified source gate at runtime: if the surface artifact is missing, stale, pending, or not strict-verified, Pi direct execution routes should be unavailable with reason `pi_surface_not_verified`, and `complete()` must not be called.
The Pi route catalog and Pi executor should also enforce an end-user installed-Pi compatibility gate at runtime by comparing the live installed package versions for `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, and `@earendil-works/pi-tui` with the compatible ranges recorded in the verified surface artifact.
`npm run verify:pi-surface -- --write-artifact` should derive the default compatible range for each Pi package as `>=<verifiedVersion> <nextMinor>` unless a future implementation deliberately narrows it after an installed-surface failure.
MVP Pi-direct support is per Pi minor line: the day-one verified artifact targets installed Pi `0.80.10` and the `0.80.x` minor line, README must state that target, and maintainers must regenerate and release a verified artifact for each new Pi minor before claiming Pi-direct support for that minor.
Do not widen the default compatible range beyond one Pi minor line in MVP; a future wider range requires an explicit risk-acceptance field in the surface artifact plus the no-model runtime sanity contract.
If any runtime Pi package version is outside the recorded range, Pi direct routes should be unavailable with `pi_runtime_version_mismatch`, the UI should suggest a verified package for that Pi minor or an authorized portable replacement, and `complete()` must not be called.
If runtime versions are inside range but not exact, `readPiRuntimeGate()` should run a no-model-call sanity check for installed lazy imports, required exports, known thinking vocabulary, `hasApi()` coverage for `toPiEffortOptions`, and `ctx.modelRegistry` methods used by discovery and auth.
If that runtime sanity check fails, every Pi direct route should be unavailable with reason `pi_runtime_surface_mismatch`, and `complete()` must not be called.
When compatibility verification fails after installed Pi drift, route discovery should disable Pi direct routes for that invocation and compute portable replacement suggestions only from verified `provider-invoke` routes whose no-cost wrapper contracts, auth policy, supported effort, and billing labels have been reconciled successfully.
The implementation must never silently rewrite a selected Pi direct route to a portable route, must never call `complete()` for the drifted route, and must never claim Pi direct compatibility from a portable route's availability.
If the user explicitly accepts a portable replacement through Edit, Reset to recommendations, or a freshly emitted portable roster, the selected roster row should become that `provider-invoke` route and diagnostics should record `originalPiRouteId`, `replacementRouteId`, and `replacementConfirmedBy`.
If no verified authorized portable replacement is selected, `validateRoster()` should block Run with `pi_drift_requires_user_route_confirmation` or the lower-level Pi gate reason and should show the actionable compatibility error.
The runtime compatibility gate protects end users from installed-Pi drift; the clean-checkout hash gate protects maintainers from source-versus-artifact drift.
Before any Pi execution phase is considered complete, a Pi-equipped maintainer must replace every `pending_pi_regeneration` artifact with a `verified` artifact generated by `npm run verify:pi-surface -- --write-artifact`; pending artifacts are allowed only as an ordinary-edit unblocker, not as final acceptance for Pi execution behavior.
If the council effort stalls after `package.json` is added, the default rollback path should remove Phase 2+ council feature artifacts while retaining the Phase 1 package baseline so `npm run test`, `npm run typecheck`, and `npm run build` remain green for installed Pipelane's default checks.
Full abandonment may remove Track A only with a same-change Pipelane gate that stays green; otherwise Track A remains retained baseline infrastructure.
Users who only symlink the existing Claude Code `/synthesis` skill are unaffected at runtime because `SKILL.md` and the provider shell scripts must not require Node for existing flows.
The Pi extension should use `import type` for Pi TypeScript shapes when helpful, but all installed Pi value imports for `CONFIG_DIR_NAME`, `getAgentDir`, `DynamicBorder`, `BorderedLoader`, `getSettingsListTheme`, `complete`, `getSupportedThinkingLevels`, and `@earendil-works/pi-tui` controls should flow through lazy helpers in `extensions/council/lib/pi-runtime.ts`.
Phase 1 must include an installed-runtime Pi surface contract before Phase 2 starts.
`scripts/verify-pi-surface.mjs` should import installed Pi packages, compile a temporary TypeScript surface check against their declarations, and fail with `PI_NOT_INSTALLED` when unavailable.
The installed-runtime surface check should verify `complete`, `getSupportedThinkingLevels`, `hasApi`, `ctx.modelRegistry` methods, `ctx.ui.custom`, command registration, custom entries, session replacement hooks, and the provider-specific effort option types used by `toPiEffortOptions`.
`tests/council/pi-surface-contract.test-d.ts` should compile the exact imports and call signatures planned for `extensions/council/index.ts`, `ui/roster-editor.ts`, and the later Pi executor without requiring the Phase 4 `pi-complete.ts` file to exist.
`tests/council/pi-effort-options-contract.test-d.ts` should compile the council-owned `toPiEffortOptions` mapper against repo-local stubs so clean checkout tests verify council code uses the mapper rather than a session-global thinking setter.
Installed Pi option rename or shape drift is detected by `npm run verify:pi-surface`, not by repo-local stubs, and clean-checkout CI enforces that a current Pi-present verification artifact exists once Pi execution files land.
The first local milestone should be a no-model-call `pi -e ./extensions/council/index.ts /council --self-test` spike covering command registration, a trivial TUI component, registry refresh/read, thinking-level read, harmless entry append, and branch scan without `complete()`.
No roster editor, route execution, or council engine phase should be built on top of Pi APIs until `npm run verify:pi-surface`, the repo-local Pi contracts, and the `pi -e` self-test pass against the installed Pi version.
Phase 4 must rerun `npm run verify:pi-surface` before any live Pi model execution code lands, because that is the gate that catches real installed Pi effort-option drift.
Phase 4 must generate and commit `docs/public/council-pi-surface-gate.v1.json` from the successful Pi-present run before `extensions/council/lib/executors/pi-complete.ts` can merge.
The committed verified gate artifact should record `version: 1`, `status: "verified"`, installed Pi package path, Pi package versions, Node version, verification command, timestamp, the exact `PI_SURFACE_GATE_FILES_V1` hash map, and a normalized pass/fail summary with no secrets.
The committed pending gate artifact should record `version: 1`, `status: "pending_pi_regeneration"`, timestamp, reason, the exact `PI_SURFACE_GATE_FILES_V1` hash map, and no installed Pi package claims.
The artifact should not hash pure council-owned mappers such as `extensions/council/lib/effort.ts`, because those are covered by clean-checkout unit and type tests and should remain editable without a Pi-present regeneration.
The portable skill should use relative paths from its `SKILL.md` and should not require Pi APIs.
`extensions/council/cli.ts` should be the non-Pi entrypoint and should call the same input parser, config loader, route catalog, engine, and report writer as the Pi extension.
The shell `bin/council` should be only a thin launcher that checks for Node, loads the TypeScript CLI through `jiti` or the chosen runtime loader, and exits with clear setup instructions when dependencies are missing.
The shell `bin/council-route-probe` should be only a thin launcher for `extensions/council/cli.ts route-probe --json`.
Do not create a second shell implementation of roster validation, phase orchestration, synthesis, cancellation, or reporting.
The council runtime dependency contract is Node `>=22.19.0` plus the package-local Node dependencies; it must not require `python3` in Pi or portable runtime paths.
`extensions/council/lib/runtime.ts` should implement a startup contract check that verifies Node version, package root, runtime loader, `bin/provider-invoke --auth`, `bin/provider-invoke --effort`, and the planned `bin/provider-probe --auth` flag before route execution.
Missing startup contract requirements should disable Run in Pi TUI or exit `5` from the portable CLI after printing actionable setup diagnostics.
Do not add a runtime startup check for `bin/lib/json_extract.py` or `python3`, because council structured validation should be TypeScript-native.
The shell interface should be:

```sh
bin/council --issue <text> --roster-file <path> [--report-strategy deterministic|structured_disagreement|chair:<member-id>] [--json]
bin/council --plan-file <path> --roster-file <path> [--report-strategy deterministic|structured_disagreement|chair:<member-id>] [--json]
bin/council --issue <text> --emit-roster <path> [--auth-policy subscription-only|default] [--overwrite] [--json]
bin/council --plan-file <path> --emit-roster <path> [--auth-policy subscription-only|default] [--overwrite] [--json]
bin/council-route-probe --json [--auth-policy subscription-only|default]
```

The portable CLI execution path should refuse to run without a roster file because it cannot present Pi's native editable menu.
The portable `--emit-roster <path>` path should parse input, run no-cost route discovery, call Pi-shared recommendations, mint fresh ids, choose a valid strategy, validate through `validateRoster()`, and write atomically without model calls.
`--emit-roster` should write only runnable roster configs with at least two executable members and a valid report strategy; when the practical minimum cannot be met, it should exit `4`, print the blocking route/auth/effort diagnostics, and write no file.
`--emit-roster` should refuse to overwrite an existing file unless `--overwrite` is supplied, should use exit `2` for path or overwrite usage errors, and should emit `{ "ok": true, "path": "...", "roster": ... }` under `--json`.
`--emit-roster` should never write Pi user-global or project-local roster config and should never persist remembered-roster state.
When `--roster-file` exists but fails JSON parsing, schema validation, route reconciliation, supported-effort validation, two-member minimum validation, or report-strategy validation, `bin/council` should exit nonzero before execution.
The portable CLI should use exit code `2` for usage/input errors, `3` for roster JSON or schema errors, `4` for roster semantic validation failures, and `5` for runtime failures after execution starts.
For portable roster validation failures, stdout should contain either human-readable diagnostics or a JSON envelope under `--json`, no roster config should be written, no report should be written, and no deterministic or chair fallback should run silently.
When a portable roster file and `--report-strategy` are both present, the CLI flag should override the roster file's `reportStrategy` for this run only.
The override should not be persisted back to the roster file unless a future portable editor explicitly edits and saves it.
Portable `--roster-file` execution is read-only: it must never rewrite the supplied file for `routeId`, `updatedAt`, `scope`, legacy-chair stripping, report-strategy override, or any other canonicalization.
Portable canonical roster writes happen only through `--emit-roster`; Pi user/project roster canonicalization happens only after Pi Run.
The effective report strategy should still pass the same validation as a roster-file strategy, including requiring `chair:<member-id>` to reference an enabled executable member in the reconciled roster.
The final report diagnostics should record both `report_strategy_source: cli | roster_file | recommendation` and the effective report strategy.
The Pi extension should use `ctx.modelRegistry` for Pi routes and should not parse Pi auth files directly.
The Pi extension should call `complete(model, context, { apiKey, headers, env, signal: memberSignal, timeoutMs, maxRetries: 0, ...toPiEffortOptions(model, entry.effort) })` for Pi model routes.
`toPiEffortOptions(model, effort)` should use `hasApi()` to emit `{ effort }` for Anthropic, `{ reasoningEffort: effort }` for OpenAI Responses and Azure OpenAI Responses non-`off` efforts, and OpenAI Codex `{ reasoningEffort: effort === "off" ? "none" : effort }` only after installed-surface confirmation.
For `off` on providers without an explicit `"none"` option, `toPiEffortOptions` should omit provider-specific thinking options.
The Pi executor must use provider-specific per-call effort options from `toPiEffortOptions`, not session-global thinking-level state, to avoid cross-member effort bleed during concurrent calls.
`npm run verify:pi-effort-live` should be an opt-in Pi-present live conformance runner requiring `COUNCIL_LIVE_PI_MODEL`, `COUNCIL_LIVE_PI_EFFORT_LOW`, `COUNCIL_LIVE_PI_EFFORT_HIGH`, and `AISYNTH_LIVE_MODEL_TESTS=1`.
That runner should execute two sequential and two concurrent calls through installed Pi `complete()` against one real reasoning route whose provider or Pi response exposes non-secret request or response metadata sufficient to prove the requested effort value was honored per call.
The runner should assert that low-effort and high-effort calls record distinct per-call effort metadata, that concurrent mixed-effort calls preserve their own metadata, and that no session-global thinking setting changes during the run.
On success with `--write-artifact`, the runner should write `docs/public/council-pi-effort-live.v1.json` with `status: "verified"`, the exact live Pi package versions, the tested provider/model route id, the two tested effort values, the verification command, timestamp, and a redacted metadata proof summary.
If no available real reasoning route exposes such metadata, the runner should exit `77` with `PI_EFFORT_LIVE_INCONCLUSIVE`, write no verified live-effort artifact, and Phase 7 should not claim real provider no-bleed verification.
Runtime Pi direct concurrency should be conservative: unless a current verified `council-pi-effort-live.v1.json` artifact exists and its recorded Pi package versions match the live runtime versions, the scheduler must run Pi direct model calls serially with a Pi-direct lane width of `1`.
When the live-effort artifact is missing, inconclusive, stale, or version-mismatched, non-Pi provider-invoke routes may still use the normal promise pool, same-effort and mixed-effort Pi direct calls are serialized, and the composition panel plus report diagnostics should show `pi_concurrency_mode: "serial_unverified_effort_isolation"`.
When the live-effort artifact is verified and runtime versions match, Pi direct calls may use the configured `maxConcurrency` with per-call effort options, and diagnostics should show `pi_concurrency_mode: "parallel_verified_effort_isolation"`.
If a future installed Pi version renames a provider-specific effort option, `npm run verify:pi-surface` should fail before Phase 4 model execution lands and the mapper contract should be updated.
The Pi extension should pass no model tools during council MVP.
The extension itself should read plan files into immutable, line-numbered text and should instruct models to cite `plan.md:Lx-Ly` for `plan_line` evidence.
For issue input, the extension should normalize the issue text once, freeze an immutable line-numbered issue block, and instruct models to cite `issue:Lx-Ly` for `issue_text` evidence.
The engine should accept issue text or immutable plan text, a confirmed roster, a route catalog, and an abort signal.
The engine should return a structured report object plus markdown.
The report writer should save markdown under `./.ai-synthesis/council-sessions/<id>.md` for MVP.
Council reports should not be written under `./.ai-synthesis/sessions/` until existing `/synthesis` `list`, `expand`, `resume`, `rate`, and `revisit` commands explicitly filter or tolerate `mode: council`.
The Pi extension should append a custom Pi session entry named `ai-synthesis-council` with run id, input summary, status, and report path.
The custom Pi session entry should not be the source of roster persistence.

## Data And Config Schemas

Use TypeScript types as the implementation source of truth and JSON schemas for model outputs.
Keep config versioned from day one.
Store user-global roster config under `join(getAgentDir(), "ai-synthesis", "council", "roster.v1.json")` in Pi.
Store trusted project-local roster config under `join(ctx.cwd, CONFIG_DIR_NAME, "ai-synthesis", "council", "roster.v1.json")` in Pi.
Store non-Pi roster config under `${AISYNTH_CONFIG_HOME:-$HOME/.ai-synthesis}/council/roster.v1.json`.
The portable CLI should treat `--roster-file` as an explicit config scope and should not implicitly load Pi global or project-local roster files.
Pi config scope should be `project` when the current project is trusted and the active council package was installed or configured from trusted project settings, otherwise `user`.
The implementation should detect active project package scope by resolving the package home from `import.meta.url` and comparing it with trusted project package resources under `join(ctx.cwd, CONFIG_DIR_NAME)` and project `settings.json`; if this cannot be proven, use `user` scope.
When `project` scope is active and a valid project-local roster exists, it is the draft source of truth.
When `project` scope is active and no project-local roster exists, a valid user-global roster may seed the initial draft as a template, but Run should persist to the project-local path and the UI should label the draft as "seeded from user roster".
When both user-global and project-local configs exist in a trusted project, do not merge fields; project-local config wins for the draft and user-global config is only advisory evidence for recommendations.
When the project is untrusted, ignore project-local roster config entirely and load only user-global config.
When a project-local config is corrupt, quarantine that project-local file and seed from recommendations; user-global config may influence recommendations but should not silently replace the corrupt project draft.
Resolve the `ai-synthesis` package home from `AISYNTH_HOME` when set, otherwise from the package root derived from `import.meta.url` or the directory containing `skills/council/SKILL.md`.
Never hardcode Firstmate paths.
Create config files with mode `0600` where the platform supports it.
Write config atomically by writing `<file>.tmp.<pid>`, fsyncing the file when practical, and renaming it over the target.
On corrupt config, preserve the corrupt file as `roster.v1.json.corrupt.<timestamp>` and start from recommendations.
On unwritable config, allow the current run to proceed after Run but warn that the roster could not be remembered.

Core TypeScript interfaces should be:

```ts
export type CouncilEffort = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export const COUNCIL_EFFORT_ORDER: readonly CouncilEffort[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

export const PI_THINKING_LEVEL_TO_COUNCIL_EFFORT = {
  off: "off",
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
} as const satisfies Record<CouncilEffort, CouncilEffort>;

export type CouncilExecutorKind = "pi-complete" | "provider-invoke";

export type CouncilAuthPolicy = "default" | "subscription_only";

export type CouncilConfigScope = "user" | "project" | "explicit";

export type CouncilBillingKind =
  | "subscription"
  | "api_key"
  | "oauth"
  | "unified_billing"
  | "local"
  | "unknown";

export interface CouncilRouteRef {
  executor: CouncilExecutorKind;
  provider: string;
  model: string;
  routeId: string;
}

export interface CouncilRouteRefOnDiskV1 {
  executor: CouncilExecutorKind;
  provider: string;
  model: string;
  routeId?: string;
}

export interface CouncilRoute {
  ref: CouncilRouteRef;
  displayName: string;
  family: string;
  providerDisplayName: string;
  supportedEfforts: CouncilEffort[];
  effortSupport: {
    source: "pi_model_registry" | "provider_invoke_help_adapter_passthrough" | "provider_adapter_static" | "none";
    confidence: "model_metadata" | "wrapper_contract" | "static_adapter_contract" | "unavailable";
    verifiedBy: string[];
    warning?: string;
  };
  auth: {
    configured: boolean;
    runnable: boolean;
    policy: CouncilAuthPolicy;
    source?: "stored" | "runtime" | "environment" | "fallback" | "models_json_key" | "models_json_command" | "oauth" | "subscription";
    billing: CouncilBillingKind;
    reason?: string;
  };
  cost: {
    inputPerMTok?: number;
    outputPerMTok?: number;
    cacheReadPerMTok?: number;
    cacheWritePerMTok?: number;
    known: boolean;
  };
  limits: {
    contextWindow?: number;
    maxTokens?: number;
  };
}

export type CouncilRole =
  | "chair"
  | "architect"
  | "implementation-critic"
  | "risk-critic"
  | "evidence-auditor"
  | "steelman"
  | "product-operator"
  | "adversary";

export interface CouncilRosterEntryV1 {
  id: string;
  route: CouncilRouteRef;
  role: CouncilRole;
  effort: CouncilEffort;
  enabled: boolean;
}

export type CouncilReportStrategy =
  | { kind: "chair"; chairEntryId: string }
  | { kind: "deterministic" }
  | { kind: "structured_disagreement" };

export interface CouncilRosterConfigV1 {
  version: 1;
  updatedAt: string;
  scope: CouncilConfigScope;
  entries: CouncilRosterEntryV1[];
  reportStrategy: CouncilReportStrategy;
}

export interface CouncilRosterConfigOnDiskV1 {
  version: 1;
  updatedAt?: string;
  scope?: CouncilConfigScope;
  entries: Array<Omit<CouncilRosterEntryV1, "route"> & { route: CouncilRouteRefOnDiskV1; chair?: boolean }>;
  reportStrategy?: CouncilReportStrategy;
}

export interface CouncilConfigLocation {
  scope: CouncilConfigScope;
  path: string;
  source: "pi_user" | "pi_project" | "portable_explicit";
  seededFrom?: "user" | "project" | "recommendations";
  writeGuard?: {
    kind: "future_version_preserve_required";
    originalPath: string;
    originalSha256: string;
    originalVersion: number;
  };
}

export interface CouncilValidateRosterInputV1 {
  config: CouncilRosterConfigV1;
  routes: CouncilRoute[];
  mode: "pi_tui" | "portable_cli" | "engine_preflight";
  reportStrategyOverride?: CouncilReportStrategy;
}

export interface CouncilRosterValidationResultV1 {
  ok: boolean;
  executableEntryIds: string[];
  unavailableEntryIds: string[];
  unsupportedEffortEntryIds: string[];
  blockingProblems: Array<{
    kind:
      | "duplicate_entry_id"
      | "unavailable_route"
      | "unsupported_effort"
      | "too_few_executable_members"
      | "missing_report_strategy"
      | "invalid_chair_strategy"
      | "migration_requires_confirmation"
      | "pi_drift_requires_user_route_confirmation";
    entryId?: string;
    routeId?: string;
    message: string;
    suggestedRouteIds?: string[];
    suggestedEfforts?: CouncilEffort[];
  }>;
  compositionFeedback: Array<{ kind: "warning" | "suggestion"; message: string; entryIds?: string[] }>;
  reportStrategy: { ok: boolean; effective?: CouncilReportStrategy; source: "config" | "cli_override" | "recommendation"; message?: string };
}

export declare function validateRoster(input: CouncilValidateRosterInputV1): CouncilRosterValidationResultV1;

export interface CouncilPositionCandidateV1 {
  id: string;
  label: string;
  source: "plan_review_default" | "issue_option" | "issue_default" | "engine_default";
  extractedText?: string;
}

export interface CouncilPositionCatalogV1 {
  version: 1;
  inputKind: "issue" | "plan";
  candidates: CouncilPositionCandidateV1[];
  otherPrefix: "other:";
}

export interface CouncilAssumptionReviewTargetV1 {
  id: string;
  memberId: string;
  canonicalPositionId: string;
  statement: string;
  loadBearing: boolean;
  howToVerify?: string;
  evidenceIds: string[];
}

export interface CouncilAssumptionReviewCatalogV1 {
  version: 1;
  targets: CouncilAssumptionReviewTargetV1[];
}

export interface CouncilEvidenceLedgerV1 {
  version: 1;
  items: Array<{
    id: string;
    claim: string;
    sourceType: "plan_line" | "issue_text" | "repo_context" | "web" | "theory" | "prior_knowledge";
    locator: string;
    supportingMemberIds: string[];
    contradictingMemberIds: string[];
    grounded: boolean;
    groundingStatus: "engine_verified" | "engine_unverified";
    groundingReason: string;
  }>;
}

export interface CouncilCritiqueOutputV1 {
  memberId: string;
  targetedChallenges: Array<{ canonicalPositionId: string; challenge: string; evidenceIds: string[] }>;
  assumptionReviews: Array<{ assumptionId: string; status: "verified_by_cited_evidence" | "unverified" | "contradicted" | "not_evaluated"; rationale: string; evidenceIds: string[] }>;
}

export interface CouncilSteelmanOutputV1 {
  memberId: string;
  steelmans: Array<{ canonicalPositionId: string; improvedCase: string; concededRisks: string[]; evidenceIds: string[] }>;
}

export interface CouncilAdversaryOutputV1 {
  memberId: string;
  objections: Array<{ canonicalPositionId: string; axis: "evidence" | "framing" | "recommendation_logic"; objection: string; evidenceIds: string[]; wouldChangeRecommendation: string }>;
}

export interface CouncilSynthesisBriefV1 {
  version: 1;
  inputKind: "issue" | "plan";
  positionCatalog: CouncilPositionCatalogV1;
  evidenceLedger: CouncilEvidenceLedgerV1;
  successfulInitialMemberIds: string[];
  groupedPositions: Array<{ canonicalPositionId: string; supporterMemberIds: string[]; evidenceIds: string[]; unresolvedAssumptionIds: string[] }>;
  critiqueOutputs: CouncilCritiqueOutputV1[];
  steelmanOutputs: CouncilSteelmanOutputV1[];
}

export type CouncilJsonValidationResult =
  | { ok: true; value: unknown; source: "whole" | "fence" | "scan" }
  | { ok: false; kind: "no_json" | "schema_invalid" | "validator_usage_error"; rawText: string; error: string };

export interface CouncilRuntimeContractReport {
  ok: boolean;
  nodeVersion: string;
  packageRoot: string;
  loader: "jiti" | "compiled_js";
  providerInvokeAuthFlag: boolean;
  providerInvokeEffortFlag: boolean;
  providerProbeAuthFlag: boolean;
  piInstalled?: boolean;
  errors: string[];
}

export interface CouncilPiSurfaceGateV1 {
  version: 1;
  status: "verified" | "pending_pi_regeneration";
  sourceFiles: Record<"scripts/verify-pi-surface.mjs" | "extensions/council/lib/pi-runtime.ts" | "extensions/council/lib/executors/pi-complete.ts", { sha256: string }>;
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
      allowedThinkingVocabulary: ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
    };
  };
}

export interface CouncilPiEffortLiveGateV1 {
  version: 1;
  status: "verified";
  generatedAt: string;
  command: "npm run verify:pi-effort-live -- --write-artifact";
  piVersions: Record<"@earendil-works/pi-coding-agent" | "@earendil-works/pi-ai" | "@earendil-works/pi-tui", string>;
  routeId: string;
  testedEfforts: [CouncilEffort, CouncilEffort];
  metadataProofSummary: string[];
}

export type CouncilPiRuntimeGateResultV1 =
  | { ok: true; surfaceGate: "verified"; effortConcurrency: "parallel_verified_effort_isolation" | "serial_unverified_effort_isolation"; piVersions: Record<string, string>; exactVersionMatch: boolean }
  | { ok: false; reason: "pi_surface_not_verified" | "pi_runtime_version_mismatch" | "pi_runtime_surface_mismatch" | "pi_runtime_unavailable"; piVersions?: Record<string, string>; compatiblePiVersionRanges?: Record<string, string>; sanityErrors?: string[] };

export interface CouncilEmitRosterResultV1 {
  ok: true;
  path: string;
  roster: CouncilRosterConfigV1;
  routeProbe: CouncilRouteProbeEnvelopeV1;
}

export interface CouncilPhaseLanePlanV1 {
  phase: "initial_analysis" | "critique" | "steelman" | "adversary" | "chair";
  memberTimeoutMs: number;
  maxConcurrency: number;
  piConcurrencyMode: "parallel_verified_effort_isolation" | "serial_unverified_effort_isolation";
  serialPiConsumesGlobalSlot: boolean;
  portableCapacityWhileSerialPiActive: number;
  serialPiDirectMemberCount: number;
  verifiedParallelPiDirectMemberCount: number;
  portableProviderInvokeMemberCount: number;
  phaseBudgetMs: number;
}
```

A `verified` Pi surface gate artifact must include `verifiedBy` and must not include `reason`.
A `pending_pi_regeneration` artifact must include `reason` and must not include `verifiedBy`.
The runtime Pi gate should treat any live version outside `CouncilPiSurfaceGateV1.verifiedBy.compatiblePiVersionRanges` as `pi_runtime_version_mismatch` rather than attempting best-effort execution.
The runtime Pi gate should allow live versions inside range but different from the exact verified versions only after the runtime sanity contract passes without model calls.
The live-effort gate is optional for shipping but authoritative for Pi direct concurrency; when `CouncilPiEffortLiveGateV1` is absent, stale, or version-mismatched, the scheduler must serialize Pi direct calls.

`routeId` must be a deterministic stable key with the form `v1:<executor>:<provider>:<model>`.
Each component should be NFC-normalized UTF-8 and percent-encode every byte outside `[A-Za-z0-9._~-]`, and `routeId` must never include display name, cost, auth source, billing state, or availability.
The in-memory `CouncilRosterConfigV1` should require `routeId`, but the config loader should first parse `CouncilRosterConfigOnDiskV1` so early files without `routeId` can migrate.
The config load pipeline order is parse JSON, resolve location/scope, future-version guard, duplicate/invalid-id quarantine, missing-`routeId` derivation from complete tuple, Pi-only legacy chair/reportStrategy migration, canonical validation, then route reconciliation.
Quarantine wins over migration whenever duplicate ids, invalid ids, corrupt entries, or schema-shape ambiguity make the user's intended roster target ambiguous.
Migration should derive missing `routeId` values from valid `(executor, provider, model)` tuples before canonical schema validation and quarantine.
Migration should fill missing `updatedAt` from the file mtime when available, otherwise from the current time with a diagnostic.
In Pi TUI mode, migration may fill missing `reportStrategy` with `{ kind: "deterministic" }` because the user sees the editable draft and must select Run before persistence or execution.
In portable `--roster-file` mode, a missing `reportStrategy` is a semantic ambiguity and should exit `4` with `migration_requires_confirmation`, unless the current invocation supplies an explicit `--report-strategy` override.
If an old on-disk entry has `chair: true` and the file has no `reportStrategy`, Pi TUI migration may set `reportStrategy` to `{ kind: "chair", chairEntryId: entry.id }` only when exactly one entry has `chair: true`, and it must also set that entry's in-memory `role` to `"chair"` before roster validation.
When that legacy chair migration changes a role in Pi TUI mode, it should record a diagnostic containing the previous role, should show the changed role in the editable draft, and should persist the canonical role only after the user selects Run.
In portable `--roster-file` mode, any entry-level `chair` boolean or any migration that would change a roster entry's role or report strategy should exit `4` before route discovery or route execution, print the exact canonical JSON edits needed, and write no report.
Portable migration diagnostics alone do not satisfy the not-silent guarantee for role or strategy changes; the non-interactive path must require the user to edit the file or pass an explicit one-run `--report-strategy` that does not rely on legacy `chair` booleans.
In Pi TUI mode, if multiple old entries have `chair: true`, migration should ignore all old chair booleans, choose deterministic strategy in the editable draft, and warn that the chair marker was ambiguous.
Canonical writes should never include an entry-level `chair` boolean.
If an on-disk entry lacks both `routeId` and a complete valid tuple, that entry is corrupt and the loader should quarantine the file instead of guessing.
Roster reconciliation should first match fresh routes by exact `routeId`, then by the same `(executor, provider, model)` tuple whenever the exact match fails.
If neither key matches, the remembered roster entry remains visible and unavailable with replacement suggestions.
Changing a route's display label, auth state, billing label, cost metadata, or effort support must not change `routeId`.
When tuple fallback succeeds for an entry that already had a mismatched `routeId`, the loader should keep the member available, emit a `route_id_mismatch` diagnostic, and rewrite the canonical `routeId` only after a confirmed Run.
`CouncilConfigLocation.scope` derived from the resolved load path is the authoritative config scope.
The config loader should set in-memory `CouncilRosterConfigV1.scope` from `CouncilConfigLocation.scope` only, never from the on-disk `scope` field.
No implementation call site should read the on-disk `scope` field after migration; it exists only to support diagnostics and canonical rewrite after Run.
The on-disk `scope` field is compatibility metadata only; when it disagrees with the resolved location, the loader should warn, use the resolved location's scope, and overwrite the field on the next successful Run persistence.
Report frontmatter `config_scope` should always come from `CouncilConfigLocation.scope`, not from the file contents.
Portable `--roster-file` always resolves to `scope: "explicit"` regardless of any in-file `scope`.
`CouncilRosterEntryV1.id` should be an opaque generated id with the form `entry_<26 lowercase base32 chars>` derived from 128 bits of randomness, not from route, provider, model, role, order, or display text.
Entry ids must be unique within a roster config and stable across edit, reorder, disable, effort changes, and route replacement of the same row.
Add and duplicate-row actions must mint a fresh id even when the copied row keeps the same route, role, effort, and enabled state.
`validate_roster` should block Run and portable execution when any duplicate id exists, because `reportStrategy.chairEntryId` and phase fallback need exactly one target.
Config load should quarantine a saved roster with duplicate ids rather than repairing it silently, because the intended chair and persisted ordering are ambiguous.
Migration should preserve original ids only when they are unique and valid; missing or invalid ids should be replaced with fresh ids with a diagnostic before the user confirms Run.

The route probe JSON contract for portable CLI discovery should be:

```ts
export interface CouncilRouteProbeEnvelopeV1 {
  version: 1;
  routes: CouncilRoute[];
  diagnostics: Array<{
    executor: CouncilExecutorKind;
    provider: string;
    status: "ok" | "unavailable" | "auth" | "error";
    message: string;
  }>;
}
```

The model voice schema in `schemas/council-voice.json` should require:

```json
{
  "ok": true,
  "member_id": "stable roster entry id",
  "role": "role name",
  "position_key": "one id from the engine-provided position catalog, or other:<short lowercase ASCII slug>",
  "recommendation": "role-specific recommendation or position",
  "evidence": [
    {
      "claim": "string",
      "source_type": "plan_line|issue_text|repo_context|web|theory|prior_knowledge",
      "locator": "string"
    }
  ],
  "assumptions": [
    {
      "assumption_key": "short lowercase ASCII key unique within this member output",
      "statement": "string",
      "load_bearing": true,
      "if_false_then": "string",
      "how_to_verify": "string"
    }
  ],
  "risks": ["string"],
  "what_would_change_my_view": ["string"]
}
```

`derive_position_catalog` should build a model-free `CouncilPositionCatalogV1` before prompt assembly and include it verbatim in every initial prompt.
For plan input, the catalog should contain `accept_plan`, `revise_plan`, `reject_plan`, and `needs_more_evidence`.
For issue input, explicit alternatives should be extracted only by this grammar.
Normalize CRLF to LF, trim outer whitespace, and ignore blank leading and trailing lines.
List extraction applies when every nonblank line is a bullet `- text` or `* text`, or a numbered item `1. text` or `1) text`, and at least two items remain after normalization.
Inline extraction applies only when the entire issue is one line of at most 200 characters containing exactly one separator token ` vs `, ` versus `, or ` or ` with ASCII whitespace on both sides.
Inline extraction should reject candidates that contain `.`, `?`, `!`, `;`, or `:`, contain more than 10 words, or are shorter than 3 or longer than 80 characters after trimming.
List item candidates should be 3 to 120 characters after trimming and should have one trailing `.` stripped.
Extraction should dedupe candidates by lowercase ASCII, collapsed whitespace, and stripped surrounding quotes; keep the first occurrence.
If fewer than two explicit candidates remain after validation and dedupe, emit zero `issue_option_*` entries.
Use ids `issue_option_1` through `issue_option_4` in source order for the first four explicit candidates only.
Every issue catalog should also include `propose_alternative` and `defer_for_evidence`, even when no explicit alternatives are extracted.
Models should be instructed to set `position_key` to exactly one catalog id unless none fits, in which case they may emit `other:<slug>`.
The engine should reject invalid `position_key` values after one JSON-only retry; if the retry still fails, that voice degrades rather than deriving a hidden semantic grouping.
The engine should assign `canonicalPositionId` by exact catalog id or exact `other:<slug>` match and should not use display labels or prose similarity for grouping.
This means deterministic grouping is reproducible: two voices group only when they choose the same provided candidate or the same exact `other:<slug>`.
For free-form issue prose with no extracted `issue_option_*` candidates and no valid selected chair, recommendations should default the draft `reportStrategy` to `{ kind: "structured_disagreement" }`.
For plan input and issue input with at least two extracted `issue_option_*` candidates, recommendations may default to `{ kind: "deterministic" }` when no valid chair is recommended or remembered.
Users may still explicitly choose deterministic synthesis for free-form issue prose, but the composition panel should warn that exact `other:<slug>` grouping may yield `No deterministic recommendation; see structured disagreement`.
Each assumption should include `assumption_key`, and the engine should normalize it to `[a-z0-9-]{1,64}` and form the canonical assumption id as `<member_id>:<assumption_key>`.
When an assumption key is missing or invalid, the engine should derive a stable key from the first 80 characters of the assumption statement and mark it as derived in diagnostics.
The model voice schema should not include a `grounded` field, because grounding is engine-owned rather than model-owned.
`pool_evidence` should convert model evidence into `CouncilEvidenceLedgerV1` items with stable ids `ev_<phase>_<member_id>_<ordinal>` and should compute `grounded`, `groundingStatus`, and `groundingReason` without trusting model prose.
For `sourceType: "plan_line"`, the engine should mark evidence grounded only when `locator` is exactly `plan.md:Lx` or `plan.md:Lx-Ly` and every referenced line exists in the immutable line-numbered plan loaded before execution.
For `sourceType: "issue_text"`, the engine should mark evidence grounded only when `locator` is exactly `issue:Lx` or `issue:Lx-Ly` and every referenced line exists in the normalized issue text.
For `sourceType: "repo_context"` and `sourceType: "web"`, the MVP engine should mark evidence ungrounded unless the implementation explicitly adds immutable host-supplied context with a precomputed locator table before prompt assembly.
For `sourceType: "theory"` and `sourceType: "prior_knowledge"`, the engine should always mark evidence ungrounded.
The engine should preserve ungrounded evidence in the ledger for transparency, but deterministic readiness and material dissent should count only ledger items with `grounded: true`.
The deterministic synthesis strategy depends on `canonicalPositionId`, engine-grounded evidence, risks, and assumptions rather than free-form prose ordering.
After successful initial voices are collected, the engine should build a frozen `CouncilAssumptionReviewCatalogV1` containing every canonical assumption id, member id, canonical position id, assumption statement, load-bearing flag, how-to-verify text when present, and available `CouncilEvidenceLedgerV1` ids.
The catalog should not expose raw model-provided locators as authority; reviewers may cite only ledger ids that the engine created before prompt assembly.
`prepare_prompts` must inject that frozen assumption review catalog into every critique prompt with the exact ids reviewers are allowed to reference.
The prompt hash recorded for each critique voice should cover the assumption review catalog bytes exactly as included in the prompt.
The critique schema should require targeted challenges and an `assumption_reviews` array keyed by canonical assumption id.
Structured validation should reject any critique `assumption_reviews` item whose canonical id is not present in the provided `CouncilAssumptionReviewCatalogV1`.
Structured validation should reject any critique, steelman, or adversary `evidenceIds` entry that does not reference an existing `CouncilEvidenceLedgerV1.items[].id`.
Each critique assumption review should require `status: "verified_by_cited_evidence" | "unverified" | "contradicted" | "not_evaluated"`, a short rationale, and at least one evidence id that resolves to `grounded: true` when status is `verified_by_cited_evidence` or `contradicted`.
For deterministic readiness, a load-bearing assumption is verified only when at least one successful critique response marks its canonical id `verified_by_cited_evidence` with at least one grounded ledger evidence id and no successful critique response marks the same assumption `contradicted` or `unverified`.
The engine should not infer verification from the initial voice's confidence, from the existence of `how_to_verify`, or from unsupported prose.
The steelman schema should require `CouncilSteelmanOutputV1.steelmans` entries keyed to `canonicalPositionId`, and validation should reject any steelman position id outside the frozen `CouncilPositionCatalogV1`.
The adversary schema should reuse the existing bounded pattern from `schemas/adversary.json` with axes `evidence`, `framing`, and `recommendation_logic`.
The adversary schema should require `CouncilAdversaryOutputV1.objections` entries keyed to `canonicalPositionId`, and validation should reject any adversary position id outside the frozen `CouncilSynthesisBriefV1.groupedPositions`.
The chair model draft schema in `schemas/council-chair-report.json` should require the substantive report fields but should not include `implementation_authorized`.
The final assembled report schema in `schemas/council-report.json` should require:

```json
{
  "recommendation": "string",
  "decision_readiness": "ready|conditional|not_ready",
  "evidence_summary": ["string"],
  "strongest_dissent": "string",
  "assumptions": ["string"],
  "risks": ["string"],
  "what_would_change_recommendation": ["string"],
  "phase_findings": {
    "critique": ["string"],
    "steelman": ["string"],
    "adversary": ["string"]
  },
  "next_action": "string",
  "implementation_authorized": false
}
```

The `implementation_authorized` field should have `const: false`.
The engine, not any model, should set `implementation_authorized: false` in `assemble_final_report` after chair, deterministic, structured-disagreement, or single-survivor synthesis has produced the substantive fields.
If a chair model emits `implementation_authorized`, the chair draft normalizer should drop that field, record `implementation_authorized_forced_false`, and validate the remaining chair draft against `schemas/council-chair-report.json`.
If the chair draft's only defect is a missing, `true`, or otherwise wrong `implementation_authorized` field, the chair synthesis should remain usable after normalization and the final assembled report should validate with `implementation_authorized: false`.
If other chair draft schema defects remain after the JSON-only retry, the chair phase should degrade to deterministic synthesis when at least two initial voices succeeded, should use the single-survivor mechanical path when exactly one initial voice succeeded, and should fail when no initial voice succeeded.
Failure of final `schemas/council-report.json` validation after the engine has forced `implementation_authorized: false` should fail the run because that indicates an implementation or deterministic-rendering bug.
The final markdown report should include frontmatter compatible with existing session habits:

```yaml
---
id: <id>
mode: council
input_kind: issue | plan
input_locator: <path or null>
input_sha256: <sha or null>
date: <iso timestamp>
status: complete | degraded | canceled | failed
roster_version: 1
config_scope: user | project | explicit
report_strategy: chair | deterministic | structured_disagreement | single_survivor
configured_report_strategy: chair | deterministic | structured_disagreement
report_strategy_source: cli | roster_file | recommendation
chair_entry_id: <entry id or null>
members_total: <n>
members_executed: <n>
providers: [<provider ids>]
models: [<provider/model ids>]
families: [<family ids>]
decision_readiness: ready | conditional | not_ready
implementation_authorized: false
---
```

## Availability And Routing

Route discovery must not make paid model calls.
Pi route discovery should call `await ctx.modelRegistry.refresh()` once at command start so `models.json` changes are visible.
Pi route discovery should enumerate `ctx.modelRegistry.getAll()` to preserve unavailable configured routes and `ctx.modelRegistry.getAvailable()` to mark runnable routes.
Pi auth status should come from `ctx.modelRegistry.hasConfiguredAuth(model)`, `ctx.modelRegistry.getProviderAuthStatus(model.provider)`, and `ctx.modelRegistry.isUsingOAuth(model)`.
Recommendation should also use the current `ctx.model`, the prior confirmed roster, user-global Pi `settings.json` under `getAgentDir()`, trusted project settings at `join(ctx.cwd, CONFIG_DIR_NAME, "settings.json")`, and `enabledModels` patterns when those files are readable through Pi's configured homes.
Pi execution should call `ctx.modelRegistry.getApiKeyAndHeaders(model)` only when the user has selected Run and the route is about to execute.
Resolving API keys or headers is allowed at execution time because it is not a paid probe call, but it may execute user-configured commands and should be treated as sensitive.
Claude routes must be subscription-only.
Pi Claude routes should be included as runnable only when auth is OAuth or another Pi subscription route, not when the only available source is an Anthropic API key.
Every Claude council route should carry `auth.policy: "subscription_only"` in the route catalog.
Before each Pi Claude member call, `pi-complete` must re-check `ctx.modelRegistry.isUsingOAuth(model)` after route reconciliation and before `ctx.modelRegistry.getApiKeyAndHeaders(model)`.
If that execution-time guard is false, the member should fail with status `auth_policy`, reason `Claude council routes require subscription auth`, and no `complete()` call should be made.
After `ctx.modelRegistry.getApiKeyAndHeaders(model)` resolves, a Claude route with `auth.policy: "subscription_only"` should still fail before `complete()` when auth resolution reports `ok:false`.
The executor should rely on `ctx.modelRegistry.isUsingOAuth(model)` and `ctx.modelRegistry.getProviderAuthStatus(model.provider)` for non-secret source validation and should never inspect or log credential material to infer auth type.
Portable Claude Code routes should call `bin/provider-probe claude --auth subscription` and `bin/provider-invoke claude --auth subscription`.
No `bin/provider-invoke` parser change is required for `--auth subscription` because the current parser already accepts `--auth` and exports `A_AUTH`.
Council explicit subscription mode requires a first-party Claude CLI login or Pi OAuth/subscription status, not an environment-token-only `ANTHROPIC_OAUTH_TOKEN` path.
`extensions/council/lib/executors/provider-invoke.ts` must own Claude child env sanitizing by copying `process.env`, deleting Anthropic credentials and unclassified `ANTHROPIC_*`, preserving only the allowlist, and passing that env to `bin/provider-probe` and `bin/provider-invoke`.
The portable executor should expose an internal pure helper with the signature `sanitizeProviderInvokeEnv(route: CouncilRoute, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv` so unit tests can verify Claude scrubbing without spawning a real provider.
The initial Anthropic credential denylist must be `ANTHROPIC_API_KEY`, `ANTHROPIC_OAUTH_TOKEN`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BEARER_TOKEN`, `ANTHROPIC_CONSOLE_API_KEY`, and `ANTHROPIC_CONSOLE_AUTH_TOKEN`.
The initial verified non-credential Anthropic allowlist should contain `ANTHROPIC_BASE_URL`, because the installed `@anthropic-ai/sdk` client documents it as the default `baseURL` endpoint override and not as an auth credential.
No other `ANTHROPIC_*` name should be allowlisted in MVP without a test or installed-surface inspection proving that the variable is non-secret and cannot trigger API-key fallback.
When `ANTHROPIC_BASE_URL` is preserved, the route and report diagnostics should include `anthropic_base_url_present: true` and should label billing as `unknown` or organization-managed unless the executor can prove first-party subscription billing from the Claude auth status.
Preserving `ANTHROPIC_BASE_URL` must not preserve any Anthropic credential variable; if the custom endpoint requires an API key, the explicit subscription route should fail auth rather than falling back to API-key billing.
The sanitizer should record a diagnostic listing deleted unclassified `ANTHROPIC_*` names without logging values.
The portable Claude executor should pass `--auth subscription` per member call only after that environment scrub has been applied.
`bin/adapters/claude.sh` should also distinguish explicit `A_AUTH=subscription` from `A_AUTH=auto` that happens to find a subscription session.
Only explicit `A_AUTH=subscription` should apply the credential-denylist plus verified-non-credential-allowlist sanitizer before executing the Claude CLI, preserving `/synthesis` auto behavior while making council and direct `bin/provider-invoke claude --auth subscription` defense-in-depth safe.
The existing `A_AUTH=auto` path should keep today's behavior exactly: when a first-party session exists it unsets only the credential variables already unset by the current adapter and continues to pass through `ANTHROPIC_OAUTH_TOKEN` and non-credential `ANTHROPIC_*` configuration variables.
The implementation should not add `ANTHROPIC_OAUTH_TOKEN` to the auto-mode unset list unless a separate `/synthesis` compatibility review proves that doing so cannot break subscription-auth environments.
Fake tests must assert that Anthropic credential variables and unknown future names such as `ANTHROPIC_TEST_SENTINEL` do not reach the child Claude process for council portable Claude routes, while `ANTHROPIC_BASE_URL` is preserved and surfaced in diagnostics without any credential value logging.
Add a backward-compatible optional `--auth <auto|subscription|apikey>` flag to `bin/provider-probe`.
Leave `bin/provider-probe claude` defaulting to existing `auto` behavior for `/synthesis` compatibility.
Phase 2 must prove subscription execution survives the sanitizer with fake `provider-probe` and `provider-invoke --auth subscription` cases containing credential and unclassified Anthropic variables, plus a no-paid live probe when a logged-in Claude CLI is available.
When only `ANTHROPIC_API_KEY` is present, `/council` should show Claude as unavailable with the reason `Claude API key detected, but council requires subscription auth`.
When only `ANTHROPIC_OAUTH_TOKEN` is apparent and no first-party Claude CLI session remains after scrubbing, mark Claude unavailable with `claude_subscription_login_required_after_env_token_scrub` and the planned Claude CLI login message.
Codex routes may use ChatGPT subscription auth through Pi or Codex CLI auth, and should label billing as subscription when the route is OAuth or CLI login.
OpenAI API key routes, Gemini routes, Bedrock routes, OpenRouter routes, Vercel AI Gateway routes, and other provider routes may be shown if Pi marks auth configured.
API-key or gateway routes should display honest billing labels and cost estimates when `model.cost` is known.
Local model routes with dummy keys should be labeled local or unknown rather than free unless the provider metadata clearly says zero cost.
Route family should be derived deterministically from provider and model identifiers.
Examples include `claude`, `openai`, `codex`, `gemini`, `mistral`, `deepseek`, `qwen`, `kimi`, `grok`, `local`, and `unknown`.
Family derivation should be advisory only.
Recommended rosters should prefer distinct families when available but must accept single-family and single-model rosters.
Effort values must come from the route, not from generic assumptions.
For Pi routes, call `getSupportedThinkingLevels(model)` and map the result to `CouncilEffort[]`.
Pi routes should record `effortSupport.source: "pi_model_registry"`, `confidence: "model_metadata"`, and `verifiedBy` entries for `getSupportedThinkingLevels(model)` and `normalizePiThinkingLevels(model, rawLevels)`.
`normalizePiThinkingLevels(model, rawLevels)` should accept only the exact installed Pi vocabulary `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`, should deduplicate in `COUNCIL_EFFORT_ORDER`, and should return those same values as `CouncilEffort[]`.
For non-reasoning Pi routes, installed Pi should already return `["off"]`, and council should treat a missing or empty raw level list as a route-discovery contract failure rather than guessing `off`.
If `getSupportedThinkingLevels(model)` returns an unknown raw value, council should mark that route unavailable with reason `unknown_pi_thinking_level`, preserve remembered entries visibly, and require `npm run verify:pi-surface` plus a mapper update before execution.
For portable Codex CLI routes, supported efforts should be `["minimal", "low", "medium", "high", "xhigh"]`.
Portable Codex routes should record `effortSupport.source: "provider_adapter_static"`, `confidence: "static_adapter_contract"`, and `verifiedBy` entries for `bin/provider-invoke --help` and the inspected `bin/adapters/codex.sh` mapping.
For portable Claude Code subscription routes, supported efforts should be the intersection of `bin/provider-invoke --help` accepted efforts and values proven by a fake/no-model CLI argv contract to reach `claude --effort` unchanged.
The inspected portable Claude path permits `["low", "medium", "high", "xhigh", "max"]` only after the fake argv test proves each value is forwarded unmodified through `bin/adapters/claude.sh`; if the installed Claude CLI rejects any value in a no-paid contract check, route discovery should remove that value visibly and suggest the nearest supported replacement.
Portable Claude routes should record `effortSupport.source: "provider_invoke_help_adapter_passthrough"`, `confidence: "wrapper_contract"`, and `verifiedBy` entries for `bin/provider-invoke --help`, `bin/adapters/claude.sh` passthrough inspection, and the fake argv contract.
Portable Claude support must not include `off`, `minimal`, or any remembered unknown value unless a future verified Claude CLI surface and wrapper contract prove exact support.
Unsupported remembered efforts should remain in config and UI until the user edits them.
Execution should reject an enabled member whose selected effort is unsupported and should not call `pi.setThinkingLevel()` or `provider-invoke` with a different effort.
Pi execution should pass the selected supported effort through `toPiEffortOptions` and should never pass a universal `reasoningEffort` option without checking the model API.
Portable execution should pass the selected supported effort to the existing `bin/provider-invoke --effort` flag for each member.
Portable execution should never pass `off`, `minimal`, or any other remembered effort to `bin/provider-invoke` unless route reconciliation has confirmed that exact value is supported by the target provider adapter.
If an implementation or future refactor cannot prove `bin/provider-invoke --effort` exists, the portable executor must fail its startup contract check and must not execute at a default effort.
Effort propagation should be asserted from captured executor call records before any live model smoke test is allowed.
Replacement suggestions should pick the nearest effort by the ordered list `off < minimal < low < medium < high < xhigh < max`.
Replacement suggestions should be suggestions only and require explicit user confirmation through Edit or Reset.

## Council Execution State Machine

The state machine should be explicit and testable.
The command starts in `idle`.
`parse_input` resolves issue text or plan file.
`validate_input` checks empty input, readable files, trusted roots, symlink escapes, regular file status, and maximum size.
`discover_routes` builds the route catalog without paid calls.
`load_roster` reads the last confirmed roster config or creates an empty draft.
`recommend_roster` builds an advisory recommendation using input kind, available routes, prior roster, and role coverage.
`edit_roster` presents the Pi TUI menu or validates non-interactive config.
`validate_roster` is a state-machine step backed by `validateRoster()` from `extensions/council/lib/validate-roster.ts`, not a second engine-local implementation.
`validate_roster` computes executable members, unavailable members, unsupported efforts, composition feedback, and report strategy validity.
`validate_roster` should mark `chair` report strategy invalid unless `chairEntryId` references an enabled executable entry in the current reconciled roster whose `role` is exactly `chair`.
`confirm_run` fires when the user selects Run.
`persist_roster` atomically writes the confirmed roster before model execution starts.
`prepare_run_context` creates one per-run `AbortController` owned by the engine and line-numbers immutable input evidence for both plan input and issue input.
For plan input, `prepare_run_context` should freeze `plan.md:Lx` line numbers from the exact plan bytes read before execution.
For issue input, `prepare_run_context` should freeze `issue:Lx` line numbers from the normalized issue text after CRLF normalization, outer trim, and blank-edge removal.
`derive_position_catalog` builds the model-free `CouncilPositionCatalogV1` from immutable input text and freezes it for the run.
`prepare_prompts` builds immutable prompts from the frozen input evidence, frozen position catalog, confirmed roster, and role templates.
Initial and critique prompts should instruct `plan_line` citations to use `plan.md:Lx-Ly` only for plan input and `issue_text` citations to use `issue:Lx-Ly` only for issue input.
The prompt hash recorded for each initial voice should cover the position catalog bytes exactly as included in the prompt.
`initial_analysis` runs each executable member independently without seeing other member outputs.
`pool_evidence` deterministically builds a shared evidence ledger from issue text, plan lines, and member evidence.
`derive_assumption_review_catalog` builds the model-free `CouncilAssumptionReviewCatalogV1` from successful initial outputs and freezes it for critique readiness checks.
`critique` runs evidence-led critique over the ledger and initial outputs.
`steelman` runs steelman prompts over the same ledger and initial outputs.
`build_synthesis_brief` creates `CouncilSynthesisBriefV1` from immutable input, the position catalog, evidence ledger, successful initial outputs, critique outputs, and steelman outputs, with no `adversaryOutputs` field because adversary has not run yet.
`adversary` runs bounded adversarial objections against that pre-synthesis brief, grouped positions, strongest provisional evidence, unresolved assumptions, and steelman-improved cases; it must not be prompted as if a final draft recommendation already exists.
`synthesize` runs either an explicit chair model, deterministic synthesis code, or mechanical structured disagreement generation using `CouncilSynthesisBriefV1` plus the collected `CouncilAdversaryOutputV1[]`.
`assemble_final_report` forces `implementation_authorized: false`, attaches strategy diagnostics, and records any chair-model authorization-field normalization before final validation.
`validate_report` validates the final assembled report schema and rejects any post-normalization value other than `implementation_authorized: false`.
`write_report` writes the markdown report through a temp file and rename.
`write_terminal_report` writes a canceled or failed report only after the roster has been confirmed and execution has started.
`done` displays the result and the report path.
`canceled` aborts active work and reports what was canceled.
`failed` reports why no council output could be produced.

Phase-role semantics should be deterministic and independent of UI ordering except where explicitly stated.
Every enabled executable roster entry runs `initial_analysis`, including a designated chair.
Later phases select explicit roster members from the successful initial voices.
`reportStrategy.chairEntryId` should be the only authoritative source of chair synthesis identity.
`CouncilRosterEntryV1.role === "chair"` should be the user-visible role required for the entry named by `reportStrategy.chairEntryId`; it is not enough by itself to authorize a chair synthesis call.
The roster should not store a separate `chair` boolean; any chair badge in the UI should be derived from the effective report strategy.
When the effective report strategy is not `chair`, entries with `role: "chair"` are ordinary initial voices and do not receive a synthesis call.
For phase fallback selection, `non-chair` means an entry whose id is not the effective `reportStrategy.chairEntryId`.
The strategy chair may run only its independent `initial_analysis` and the final chair synthesis call; it should not be selected for critique, steelman, or adversary fallback while any other successful member is available.
If every successful survivor is the strategy chair, the later phase should be marked degraded rather than giving the chair extra critique, steelman, or adversary influence.
`critique` should run all successful members with role `implementation-critic`, `risk-critic`, or `evidence-auditor`; if none exist, select the highest-effort non-chair successful member, breaking ties by roster order.
`evidence-auditor` is not a separate phase in MVP; it is a roster role that participates in the `critique` phase and emits the same `assumption_reviews` contract.
`steelman` should run all successful non-chair members with role `steelman`.
If no successful non-chair steelman exists, `steelman` fallback should select the non-chair successful member whose `canonicalPositionId` has the fewest supporters, breaking ties by highest effort then roster order.
`adversary` should run all successful members with role `adversary`; if none exist, select a successful non-chair `risk-critic`, otherwise the highest-effort non-chair successful member.
`chair` is a report strategy role and does not satisfy critique, steelman, or adversary selection.
Phase fallback selection must be recorded in the report diagnostics so users can see when a member was reused outside its preferred role.
If a selected later-phase member fails, that phase degrades; the engine should not silently substitute an unrecorded member after the phase starts.

Allowed transitions should be:

```text
idle -> parse_input -> validate_input -> discover_routes -> load_roster -> recommend_roster -> edit_roster
edit_roster -> validate_roster -> edit_roster
edit_roster -> canceled
validate_roster -> confirm_run
confirm_run -> persist_roster -> prepare_run_context -> derive_position_catalog -> prepare_prompts -> initial_analysis
initial_analysis -> write_terminal_report -> failed [zero successful initial voices]
initial_analysis -> single_survivor_report [exactly one successful initial voice after one or more initial runtime failures]
initial_analysis -> pool_evidence [at least two successful initial voices]
pool_evidence -> derive_assumption_review_catalog -> critique -> steelman -> build_synthesis_brief -> adversary -> synthesize -> assemble_final_report -> validate_report -> write_report -> done
single_survivor_report -> assemble_final_report -> validate_report -> write_report -> done
synthesize -> assemble_final_report -> validate_report -> write_report -> done
any_running_state_after_persist -> write_terminal_report -> canceled
any_running_state_after_persist -> write_terminal_report -> failed
any_running_state_before_persist -> canceled
any_pre_confirm_state -> failed
```

The run-level abort reason `deadline_exceeded` has higher precedence than every normal survivor transition.
If the computed whole-run deadline fires during `initial_analysis`, the engine should abort active members and route to `write_terminal_report -> failed` even when exactly one initial voice had already succeeded.
The single-survivor `initial_analysis -> single_survivor_report` edge applies only when initial analysis naturally completes or member-local failures finish without a run-level deadline, user cancellation, session shutdown, or process-signal abort.
`single_survivor_report` consumes only the surviving `CouncilVoiceOutputV1` plus failed-member diagnostics; it must not read `CouncilSynthesisBriefV1`, `CouncilAdversaryOutputV1[]`, hidden host state, or configured chair output.
The one-survivor `single_survivor_report` state should always produce a mechanical report with `status: degraded`, `decision_readiness: not_ready`, `implementation_authorized: false`, and a diagnostics field naming the failed initial members.
The one-survivor edge should ignore the configured chair or structured-disagreement strategy, should make no chair model call, should set frontmatter `report_strategy: single_survivor`, should preserve the configured strategy in `configured_report_strategy`, and should set `report_strategy_effective: "single_survivor_mechanical"` in diagnostics.
If the configured chair survived as the only initial voice, the report should use that voice once and should not ask it to synthesize itself.
If the configured chair failed and a non-chair survived, the report should use the non-chair survivor once and should record that the chair strategy was unavailable because fewer than two initial voices succeeded.
The normal at-least-two-survivor path must not skip `critique`, `steelman`, `build_synthesis_brief`, or `adversary` when a fallback member can be selected.
If a later phase's selected member list is empty despite the fallback rules, the engine should mark that phase degraded and continue to the next named phase, and the condition should be covered as an invariant violation in tests.
If a later phase member fails, times out, or returns invalid output, that phase degrades and control continues to the next named phase rather than jumping directly to `synthesize`.
Early `critique -> synthesize` or `steelman -> synthesize` shortcuts should not exist in MVP because they hide which required phase was skipped.

Initial analyses should run through a bounded promise pool.
The default max concurrent member calls should be `4`.
The default hard roster cap should be `6` enabled members, with a config override allowed up to `8`.
The scheduler should apply `maxConcurrency` across portable provider-invoke calls and verified-concurrent Pi direct calls, but it should maintain a separate Pi direct lane width of `1` whenever the live-effort concurrency gate is absent, inconclusive, stale, or version-mismatched.
Serial Pi direct mode should preserve deterministic roster order inside each phase, should consume one global `maxConcurrency` slot while a serial Pi call is active, should allow portable provider-invoke calls to run in parallel only up to `max(0, maxConcurrency - 1)` remaining global slots, and should record the effective lane mode in phase diagnostics.
When `maxConcurrency` is `1`, serial Pi direct calls and portable provider-invoke calls must not overlap.
Parallel Pi direct mode is allowed only when both the runtime surface gate and the live-effort concurrency gate pass against the current installed Pi versions.
Before scheduling a phase, the engine should derive a `CouncilPhaseLanePlanV1` from the selected members, executor kinds, runtime Pi gate, live-effort gate, `maxConcurrency`, and phase timeout.
The scheduler, deadline calculator, and report diagnostics should all consume that single lane plan for the phase.
The default `memberTimeoutMs` should be `300000` ms for each scheduled member in initial, critique, steelman, and adversary phases.
The default `memberTimeoutMs` should be `420000` ms for an explicit chair synthesis member.
The default whole-run deadline should be computed from scheduled phase budgets and the exact lane plan the scheduler will use rather than from a flat wall-clock cap or raw `maxConcurrency`.
For each phase, compute `serialPiMs = serialPiDirectMemberCount * phaseMemberTimeoutMs`.
For each phase, compute `parallelEligibleMs = ceil((verifiedParallelPiDirectMemberCount + portableProviderInvokeMemberCount) / maxConcurrency) * phaseMemberTimeoutMs`.
The conservative phase budget should be `serialPiMs + parallelEligibleMs`; this may over-budget when portable calls overlap serial Pi calls in remaining global capacity, but it must never under-budget a healthy run.
The whole-run deadline formula should be `max(1200000, sum(phaseBudgetMs for initial, critique, steelman, and adversary using the selected members and effective pi_concurrency_mode for each phase) + chairMemberTimeoutMsWhenScheduled + 120000)`.
The deadline should be recalculated after each phase selection is known, should use the same `pi_concurrency_mode` and lane counts that the scheduler records in diagnostics, should never be lower than the remaining budget for already scheduled valid work, and should abort the run-level `AbortController` only after that computed budget expires.
For a six-member all-Pi-direct serial initial phase with `memberTimeoutMs = 300000`, the phase budget is at least `1800000` ms before overhead, not `ceil(6 / 4) * 300000`.
The default `1200000` ms value is a minimum safety floor for small councils, not a cap for full rosters.
Each member call should receive a `memberSignal` from a per-member `AbortController` that is linked to the run-level signal.
Run-level aborts from Escape, Pi `session_shutdown`, process signals, or the computed whole-run deadline should propagate to every active member controller.
When the computed whole-run deadline fires, the engine should set abort reason `deadline_exceeded`, abort every active member controller, skip unscheduled remaining phases, and proceed directly to terminal failure reporting.
Per-member timeout handlers should abort only that member's controller or rely on the executor's per-call `timeoutMs`; they must never abort the run-level controller.
The provider retry count should be `0` for transport-level retries so Pi can surface rate limits instead of waiting silently.
Malformed structured output should get at most one JSON-only retry per voice inside that voice's `memberTimeoutMs` budget.
The first attempt and JSON-only retry are not separate whole-run budget units.
The executor should pass each attempt a provider `timeoutMs` equal to the remaining `memberTimeoutMs` budget, skip the JSON-only retry when no positive member budget remains, and record `retry_skipped_no_member_budget` rather than extending the deadline.
Structured validation should use a TypeScript-native helper with the concrete signature `validateModelJson(schemaPath: string, rawText: string): Promise<CouncilJsonValidationResult>`.
The helper should implement current `bin/lib/json_extract.py` behavior in TypeScript: whole input, single stripped markdown fence, up to `512` plausible starts, shortest complete object or array parse, last satisfying object preference, object-over-array preference, and the local JSON Schema subset.
That supported schema subset is `type`, `const`, `enum`, `required`, `properties`, `additionalProperties: false`, and object `items`.
The council runtime must not spawn `bin/lib/json_extract.py`; parity should be enforced with checked-in fixture cases derived from the existing helper.
The engine should map `no_json` and `schema_invalid` to voice degradation with one JSON-only retry, and should map `validator_usage_error` to a failed voice plus implementation diagnostic unless every initial voice fails.
Auth, timeout, malformed, budget, rate limit, and invocation failures should degrade that voice rather than crash the whole council.
If no initial voices succeed, the run should fail with no recommendation.
If exactly one initial voice succeeds after at least one runtime failure, the report should be `degraded`, `not_ready`, and clearly label the output as a single surviving voice, not a valid council recommendation.
If at least two initial voices succeed, the report may complete as a council even when later critique, steelman, adversary, or chair phases degrade.
A designated chair must be a roster entry with `role: "chair"` and must also run an independent initial analysis before the synthesis phase.
A deterministic strategy must not call any model for synthesis.
A deterministic strategy should produce a mechanical synthesis with narrower guarantees than a chair model.
A deterministic strategy should consume `CouncilSynthesisBriefV1`, `CouncilAdversaryOutputV1[]`, and no other mutable run state.
A deterministic strategy should group successful initial voices by engine-assigned `canonicalPositionId`, not raw model-generated prose or label similarity.
A deterministic strategy should choose `recommendation` as the majority position when one position has more than half of successful voices.
A deterministic strategy should choose `recommendation` as the plurality position only when it has at least two voices and at least one more supporter than the runner-up.
A deterministic strategy should set `recommendation` to `No deterministic recommendation; see structured disagreement` when there is a tie, one surviving voice, no grounded evidence, or no plurality that meets the rule above.
A deterministic strategy should rank `evidence_summary` by grounded evidence cited by the most voices, then by source locator, then by first appearance.
A deterministic strategy should choose `strongest_dissent` from the largest non-winning position, breaking ties by count of grounded counter-evidence, count of load-bearing assumptions, and roster order.
A deterministic strategy should include steelman outputs in `phase_findings.steelman`, should let steelman-improved evidence strengthen the listed strongest dissent without changing canonical position grouping, and should include adversary objections in `phase_findings.adversary`, risks, and `what_would_change_recommendation`.
A deterministic strategy should include critique targeted challenges and assumption reviews in `phase_findings.critique`, assumptions, readiness, and `what_would_change_recommendation`.
A deterministic strategy should treat `initial_analysis`, `pool_evidence`, `derive_assumption_review_catalog`, `critique`, `steelman`, `build_synthesis_brief`, `adversary`, `synthesize`, `assemble_final_report`, `validate_report`, and `write_report` as critical phases for readiness.
For readiness, a phase is degraded when a scheduled member fails, times out, returns invalid structured output after retry, is skipped because no successful voice can be selected, or hits an auth-policy failure; deterministic fallback selection recorded before the phase starts is not degraded if the selected fallback member succeeds.
A deterministic strategy should compute `materialDissent` mechanically before readiness.
`materialDissent` is true when a non-winning position has at least two supporters, has one supporter with grounded evidence count at least the winner's count, or any winning load-bearing assumption is contradicted or unverified by critique.
Deterministic mode should treat any `materialDissent` as unresolved because no synthesizer model is called to resolve it.
A deterministic strategy should set `decision_readiness` to `ready` only when at least two voices support the winning position, every critical phase completed without degradation, every winning-position load-bearing assumption is verified by the critique contract, and `materialDissent` is false.
A deterministic strategy should set `decision_readiness` to `conditional` when there is a winning position but unresolved assumptions, partial degradation, or `materialDissent` is true.
A deterministic strategy should set `decision_readiness` to `not_ready` when the recommendation is the no-recommendation sentinel, only one initial voice survived, or validation failed.
A deterministic strategy should set `next_action` to the highest-ranked assumption verification when readiness is conditional or not ready, otherwise to the smallest concrete next step named by the winning position.
A deterministic strategy should include a report note that the synthesis was generated by auditable aggregation code, not by another model voice.
A structured disagreement strategy must preserve major positions and dissent without forcing a recommendation.
A structured disagreement strategy must not call any model for synthesis.
A structured disagreement strategy should consume `CouncilSynthesisBriefV1`, `CouncilAdversaryOutputV1[]`, and no other mutable run state.
A structured disagreement strategy should mechanically group exact `canonicalPositionId` values, list supporters, strongest evidence, unresolved assumptions, steelmans, adversarial objections, and strongest opposition, and set `recommendation` to `No synthesized recommendation; see structured disagreement`.
Structured disagreement reports should populate `phase_findings.critique`, `phase_findings.steelman`, and `phase_findings.adversary` directly from the successful phase outputs.
If the user wants a model-written synthesis, the only MVP path is a `chair` report strategy whose `chairEntryId` references an enabled executable roster member with `role: "chair"`.
A chair synthesis prompt should receive exactly the immutable input text, roster member metadata, `CouncilPositionCatalogV1`, `CouncilEvidenceLedgerV1`, successful initial outputs, `CouncilCritiqueOutputV1[]`, `CouncilSteelmanOutputV1[]`, `CouncilAdversaryOutputV1[]`, and the final `CouncilSynthesisBriefV1`.
A chair synthesis prompt should not receive hidden host-model context, stale UI state, unvalidated failed-member prose, raw provider credentials, or mutable config files.
A chair-written draft should still preserve the report's `phase_findings` sections so critique, steelman, and adversary outputs remain visible even when the chair writes the narrative synthesis.
The current Pi host model must never be used for a model call unless its provider/model route is present as an enabled roster entry.
The engine should create one `runId` per Run using timestamp, input hash, and random suffix.
The Run button should become inactive after `confirm_run` to prevent duplicate starts.
Escape, Pi `session_shutdown`, process signals in the portable CLI, and the computed whole-run deadline should abort the per-run `AbortController`.
Member timeout handlers should never abort the per-run `AbortController`.
The computed whole-run deadline is a failure, not a user cancellation, so reports written after that abort should use `status: failed` and `reason: deadline_exceeded`.
Report writes should be idempotent by writing only to the `runId` report path.
If a report path already exists for a `runId`, the writer should fail rather than overwrite.

## Failure Modes And Recovery

Unreadable plan path should fail before route discovery.
Untrusted or out-of-root plan path should fail before route discovery unless the Pi TUI user explicitly confirms a trusted-root override that is then stored only for that run.
Multiple explicit plan files should fail with a one-plan-at-a-time message.
Oversized plan files should be rejected above a default `512 KiB` limit, with a config option to raise the limit to `2 MiB`.
Binary-looking plan files should be rejected by checking for NUL bytes.
Corrupt roster config should be quarantined and recommendations should be used.
Unwritable roster config should warn and allow one current run, but the next invocation should not pretend the roster was remembered.
Portable CLI roster JSON parse or schema failure should exit `3` before route discovery when possible, write no report, and print the offending path plus schema error summary.
Portable roster semantic failure should exit `4`, write no report, and list blockers including unsupported efforts, unavailable routes, too few executable members, invalid chair strategy, missing strategy, legacy `chair`, and unconfirmed role or strategy migration.
Portable CLI `--json` validation failures should emit `{ "ok": false, "status": "validation_failed", "exitCode": 3 | 4, "diagnostics": [...] }` and should not include secrets or raw auth headers.
Unavailable remembered routes should stay visible and should not count toward the two-member minimum.
Unsupported remembered efforts should stay visible and should block that member from being executable until edited.
Pi direct routes with missing, pending, stale, or source-hash-mismatched surface artifacts should stay visible but unavailable with reason `pi_surface_not_verified`, and `complete()` should never be called.
Pi direct routes outside verified Pi package ranges should stay visible but unavailable with `pi_runtime_version_mismatch`, and the UI should suggest a verified package for that Pi minor or an authorized portable replacement.
Pi direct routes whose live installed Pi package versions are inside range but fail the no-model runtime sanity check should stay visible but unavailable with reason `pi_runtime_surface_mismatch`, and the UI should use the same explicit portable replacement behavior.
When Pi drift disables a selected route, `validateRoster()` should keep the selected Pi route unavailable, show suggested `provider-invoke` replacements only when route discovery proves them available and authorized, and block Run until the user confirms a replacement or removes/disables that member.
The portable CLI should never rewrite a `--roster-file` entry from `pi-complete` to `provider-invoke`; it should exit `4` with the exact JSON edit needed unless the roster file already selects the authorized portable route.
Missing, inconclusive, stale, or version-mismatched live-effort artifacts should not make Pi direct routes unavailable; they should force serial Pi direct execution and produce `pi_concurrency_mode: "serial_unverified_effort_isolation"` diagnostics.
Provider auth failure at execution time should mark that member failed and continue if possible.
Provider timeout should abort only the timed-out member's controller, mark that member timed out, and continue if the run-level signal has not been aborted.
Provider malformed output after retry should preserve raw text in diagnostics but should not count as a structured voice.
Provider rate limit should mark that member failed with a retry-after hint when available.
Partial degradation should lower decision readiness and show which phases lost voices.
Failure of an explicit chair should fall back to deterministic synthesis only if at least two initial voices succeeded and the report says the chair failed.
An explicit chair output whose only authorization-field defect is wrong, true, or missing `implementation_authorized` should not count as chair failure; the engine should drop that field, force `false` in final assembly, and record a diagnostic.
An explicit chair output with any other schema defect after its JSON-only retry should count as chair failure and follow the deterministic, single-survivor, or no-survivor fallback rules.
When only one initial voice succeeds, explicit chair failure should use the single-survivor mechanical report path and should not call deterministic multi-voice synthesis or any chair model.
When `deadline_exceeded` is the run-level abort reason, deadline failure takes precedence over the single-survivor path regardless of how many initial voices succeeded before the abort.
An explicit chair that is disabled, unavailable, missing, or has unsupported effort should block Run during `validate_roster` rather than falling back silently.
An explicit chair whose entry role is not `chair` should block Run during `validate_roster` even when the route and effort are executable.
Failure of deterministic synthesis validation should fail the run rather than invent a report.
Escape in the roster editor should cancel without persistence.
Escape during execution should abort the per-run `AbortController` and write `status: canceled` only if execution had already started.
If cancellation or failure happens before `confirm_run`, no council report should be written because there is no confirmed roster or run.
If cancellation or failure happens after `persist_roster`, `write_terminal_report` should write a minimal report with frontmatter `status: canceled` or `status: failed`, member diagnostics collected so far, and `implementation_authorized: false`.
If the computed whole-run deadline fires after `persist_roster`, `write_terminal_report` should write `status: failed`, `reason: deadline_exceeded`, the aborted member diagnostics collected so far, and `implementation_authorized: false`.
Pi `/reload`, `/new`, `/resume`, `/fork`, `/clone`, or process shutdown during a run should trigger `session_shutdown`, abort active work, and avoid using stale `ctx` objects.
After reload, the next `/council` invocation should resolve the active config scope again and load the last confirmed roster from that scope, not from stale memory.
Session replacement should not resume a half-finished council automatically.

## Security And Privacy

Pi packages and extensions run with the user's local permissions, so `/council` should be opt-in through `pi install`.
The extension must never write to the reviewed plan file.
The extension must read a plan file once, hash it, and pass immutable line-numbered plan text to model calls.
The extension must normalize issue text once, hash it, and pass immutable line-numbered issue text to model calls.
The extension should include `input_sha256`, input kind, and file metadata when present in the report so the user can tell what was reviewed.
All file paths should be resolved with `realpath`.
Default allowed roots should be the current `ctx.cwd` and any configured `council.allowedRoots`.
Symlinks escaping allowed roots should be rejected.
Relative paths should resolve against `ctx.cwd`.
Absolute paths outside allowed roots should be rejected unless `council.allowedRoots` permits them.
Project-local council config should be honored only when `ctx.isProjectTrusted()` is true.
Trusted project-local council config should be read and written only at `join(ctx.cwd, CONFIG_DIR_NAME, "ai-synthesis", "council", "roster.v1.json")`.
Untrusted project-local council config should be ignored even if it exists and even if the package was installed with `pi install -l`.
User-global config under `getAgentDir()` is always user-owned and can be loaded before project trust.
Context and plan contents must be treated as data, not instructions.
Model prompts must state that council completion does not authorize implementation.
Claude council routes must not use Anthropic API keys.
Portable Claude council children must receive an environment with Anthropic credential variables and unclassified `ANTHROPIC_*` variables removed before either `bin/provider-probe` or `bin/provider-invoke` starts.
Only explicitly allowlisted verified non-credential Anthropic variables may remain in those child environments.
Other provider auth paths should be labeled honestly as subscription, OAuth, API key, gateway billing, local, or unknown.
API keys and headers must never be logged, stored in reports, stored in roster config, or included in custom Pi entries.
The existing `aisynth_redact` behavior in `bin/lib/common.sh` should remain in the portable provider-invoke executor.
Pi direct executor diagnostics should redact `sk-...`, `Bearer ...`, and known secret values before writing report diagnostics.
Cost estimation should use catalog metadata and should not require an API call.
The council engine should disable model tools for MVP to avoid hidden file edits or shell execution during review.

## Compatibility And Migration

Existing `/synthesis` behavior must remain unchanged.
Existing `bin/provider-invoke` flags must remain backward compatible.
Adding `--auth` to `bin/provider-probe` must default to `auto` and preserve existing callers.
Adding `package.json` intentionally introduces a Node/TypeScript contributor toolchain and must happen in the same commit as install-aware npm lifecycle scripts.
The implementation should add `package-lock.json`, require `scripts/ensure-node-deps.mjs` through `pretest`, `pretypecheck`, and `prebuild`, and keep `npm ci --prefer-offline --no-audit --fund=false`, `npm run test`, `npm run typecheck`, and `npm run build` green on a clean checkout in the same commit that introduces `package.json`.
Clean-checkout npm scripts must not require an installed Pi runtime; Pi-present verification remains available through `npm run verify:pi-surface` and the `pi -e` self-test, and Phase 4 clean checkout enforces their recorded artifact once Pi execution files exist.
Pending Pi surface artifacts are compatibility unblocks only; runtime route discovery and execution must require strict verified artifacts before enabling Pi direct model routes.
This repo-wide development requirement is separate from runtime installation: existing Claude Code skill users who only symlink the repo should not need Node unless they run the new portable `bin/council` fallback or contributor checks.
Existing session files in `./.ai-synthesis/sessions/` must remain readable by `expand`, `list`, `resume`, `rate`, and `revisit`.
Council reports should use `./.ai-synthesis/council-sessions/` for MVP because existing `/synthesis` `list`, `expand`, `resume`, and `rate` use the legacy `sessions/*.md` namespace broadly, and `revisit` only specifies skipping `mode: compare`.
Do not rely on `mode: council` being ignored by legacy `/synthesis` commands unless a future implementation adds explicit mode filtering there with tests.
Existing `--solo` and `--compare` should not depend on the council roster or route catalog.
Existing `revisit` can later learn to include council reports from `./.ai-synthesis/council-sessions/`, but initial council implementation should not require changing revisit.
The optional Pi package should not be installed by default and should not change `/synthesis` runtime behavior for users who only symlink the Claude Code skill.
If users install the package and later remove it with `pi remove`, their `./.ai-synthesis/council-sessions/*.md` reports remain readable markdown.
If users have a remembered roster from a future version, version mismatch should warn and start from recommendations rather than partially loading unknown fields.
The loader should keep the future-version file path and SHA-256 in `CouncilConfigLocation` diagnostics as a `future_version_preserve_required` write guard.
Before any Run persistence can overwrite that path with a v1 roster, the config layer must reread the file, verify the SHA-256 still matches the loaded future-version bytes, and copy the exact bytes to a sibling backup path such as `roster.v1.json.future.<timestamp>`.
If the future-version file changed, cannot be reread, or cannot be backed up, the Run may continue with the recommendation-seeded roster but config persistence must be skipped with a clear warning rather than overwriting the newer saved config.
If users have a remembered roster from an early council build without `routeId`, tolerant load should derive `routeId` from `(executor, provider, model)` before canonical validation and preserve the original entry id, role, effort, and enabled state.
If users have a remembered roster from an early council build with an entry-level `chair` flag, Pi TUI migration should convert one unambiguous `chair: true` marker into `reportStrategy.chairEntryId`, set that entry's draft `role` to `"chair"` before validation, and omit every entry-level chair flag from the next canonical write only after confirmed Run.
The portable `--roster-file` path is read-only and should refuse legacy entry-level `chair` flags, missing report strategies, and any migration that would change role or strategy by exiting `4` with required manual JSON edits.
If the in-file `scope` disagrees with the resolved config location, migration should keep the file in its resolved location, use the resolved scope for precedence and reports, and rewrite the field only after a confirmed Run.

## Implementation Phases

Implementation should land as three independently reviewable tracks even if one feature branch carries them: Track A toolchain/Pipelane baseline, Track B Claude subscription-only provider hardening, and Track C council product.
Each track has its own acceptance gates, and the repository must remain green after every committed phase.
Track A should add package scaffolding, `package-lock.json`, Node `>=22.19.0` engines, TypeScript types, JSON schemas, TypeScript test runner setup, repo-local Pi type stubs, package-local scripts with dependency bootstrapping, conformance fixtures, and the installed Pi API surface verifier without model execution.
Track A is a standalone repository tooling change that must be reviewed and accepted before Track C depends on it.
If registry or prewarmed-cache access is absent, Track A must stop before merging `package.json`; Track C may continue only in existing shell/fake-conformance design work that does not require Node until Track A is unblocked or a separate dependency strategy is accepted.
Phase 1 should treat installed Pipelane's effective direct npm checks as the active pre-PR gate and should not rely on tracked `.pipelane.json` edits for the current installed Pipelane version.
Phase 1 is incomplete until hermetic conformance, `npm ci --prefer-offline --no-audit --fund=false`, typecheck, build, test, and effective installed-Pipelane checks pass in clean checkout without Pi, provider CLIs, auth, or model network.
The installed-Pipelane verification must run twice: once against active machine-local config and once with `PIPELANE_HOME` set to an empty temporary directory so `resolveWorkflowContext(cwd)` uses synthesized defaults.
Phase 1 should write tracked `docs/public/pipelane-prepr-checks.v1.json` recording active and synthesized `prePrChecks`; synthesized checks must be exactly `npm run test`, `npm run typecheck`, and `npm run build` after package scaffolding lands.
Phase 1 should also run `tests/conformance/run.sh all` in a provider-present developer environment as an integration check, but that target must not be required by generic Pipelane pre-PR checks until its live sections are split out or made optional.
Phase 1 should also run `npm run verify:pi-surface` and the `pi -e ./extensions/council/index.ts` `/council --self-test` spike once in a Pi-present local environment before Phase 2 starts, with no model calls and no persistent roster writes.
Phase 2 should implement input parsing, trusted path validation, immutable plan loading, stable route IDs, route discovery, effort support, and roster config persistence.
Phase 3 should implement the Pi TUI roster editor and non-TUI fallback behavior.
Phase 4 should rerun `verify:pi-surface`, then implement Pi `complete`, provider-specific effort options, strict Pi runtime gates, serial-until-verified Pi scheduling, provider-invoke fallback, structured validation, one JSON retry, and engine-owned cancellation.
Phase 5 should implement the council engine state machine, evidence ledger, degradation, report strategies, report writer, and Pi session custom entry.
Phase 6 should add documentation, README install/update notes, and the portable `skills/council/SKILL.md` instructions.
Phase 7 should run live smoke tests manually with at least one subscription Claude route and one Codex route after the fake conformance suite is green, and should run `npm run verify:pi-effort-live -- --write-artifact` before enabling Pi direct parallelism or claiming real Pi effort honoring and concurrent no-bleed support.
Rollback has two distinct targets.
The normal Phase 2+ rollback target reverts council feature files while retaining the Phase 1 package baseline, then proves `tests/conformance/run.sh hermetic` and the effective installed-Pipelane `prePrChecks` commands are green through direct `sh -lc` execution.
The full-abandonment rollback target may remove the Track A package baseline only if the same rollback also lands a Pipelane-configured green gate outside ignored `.pipelane.json`; otherwise it must retain Track A so effective Pipelane checks stay green.
The rollback target for green package checks is the install-aware npm-script form from Phase 1, not tracked `.pipelane.json`.
The Track A baseline files `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `scripts/ensure-node-deps.mjs`, the `tests/conformance/run.sh hermetic` target, and needed fake helpers become retained baseline infrastructure after Track A lands.
The normal Phase 2+ rollback set includes council runtime code, portable skill, roles, schemas, `bin/council`, `bin/council-route-probe`, provider auth edits, conformance fixtures, Phase 2+ tests, unused Pi stubs, and council README additions.
The normal Phase 2+ rollback set must not remove Phase 1 baseline files while `package.json` scripts or effective Pipelane checks still reference them.

## Exact File-Level Changes

Add `package.json` in Phase 1 with package metadata, Node `>=22.19.0`, `pi` manifest, Pi peers, runtime loader dependency when needed, TypeScript test dev deps, and the npm scripts listed in this plan.
The `prepack` script should run `npm run verify:pi-execution-release` when Pi direct execution files exist so maintainer package creation cannot silently pack or publish an unverified Pi direct executor, but `prepack` must not be described as an end-user install gate and must not run `npm run verify:pi-effort-live` or any other model-executing check.
Do not add a `prepare` script for the council package in MVP, because installed Pi git package installs use production dependency installation and runtime route gates provide the end-user protection.
Add `package-lock.json` in Phase 1 so CI and pre-PR checks can use `npm ci --prefer-offline --no-audit --fund=false` reproducibly.
Add `tsconfig.json`, `vitest.config.ts`, `scripts/ensure-node-deps.mjs`, `scripts/verify-pi-package.mjs`, `scripts/verify-pi-surface.mjs`, and `scripts/verify-pi-effort-live.mjs` in Phase 1 unless the implementation chooses an equivalent Node built-in test setup with the same coverage.
Add `scripts/verify-pipelane-prepr.mjs` in Phase 1 to inspect installed Pipelane twice, once with active `PIPELANE_HOME` and once with an empty temp `PIPELANE_HOME`, compare both effective `prePrChecks` to `docs/public/pipelane-prepr-checks.v1.json`, and execute each check through `sh -lc`.
Add `docs/public/pipelane-prepr-checks.v1.json` in Phase 1 with active and synthesized `prePrChecks`, source paths, runner npm registry/cache status, and the synthesized default check list above.
Configure `vitest.config.ts` so clean-checkout tests include portable `extensions/council/lib/**` tests and exclude Pi-coupled entrypoint, UI, and executor modules from runtime evaluation unless a Pi-present test explicitly opts in.
`npm run build` should be a TypeScript compile or emit check that does not bundle or execute Pi-coupled modules; if a future bundler is introduced, `@earendil-works/*` imports must remain external and unevaluated in clean checkout.
Add `scripts/check-council-pi-gate.mjs` in Phase 1 as a dependency-free clean-checkout checker for the committed Pi surface gate artifact, with the static `PI_SURFACE_GATE_FILES_V1` list, `--mark-pending --reason <text>`, and `--strict-verified` modes described above.
Add `scripts/check-council-release-artifacts.mjs` in Phase 4 so release tags and default-branch refs intended for `pi install git:` fail unless the Pi surface artifact is current and `status: "verified"`.
`scripts/ensure-node-deps.mjs` should run `npm ci --prefer-offline --no-audit --fund=false` only when the dependency install stamp is missing or stale and should print `DEPENDENCY_INSTALL_UNAVAILABLE` with registry/cache diagnostics when npm registry or cache access is unavailable.
Add `tests/council/pi-fixtures/types/@earendil-works/` in Phase 1 with minimal type stubs for the Pi imports used by council code and contracts.
Do not rely on installed Pi peer dependencies for `npm run typecheck` or `npm run build`.
Modify `tests/conformance/run.sh` in Phase 1 to add a `hermetic` target that excludes live provider probe and smoke sections and runs only unit plus fake-driven Claude and Codex coverage.
Do not modify tracked `.pipelane.json` as the active pre-PR mechanism for the installed Pipelane version because `readPackageJsonOverlay()` ignores repo-local config.
`package.json` should wire `pretest`, `pretypecheck`, and `prebuild` to `node scripts/ensure-node-deps.mjs`, and `test` should include `node scripts/check-council-pi-gate.mjs` plus the hermetic conformance and TypeScript unit suites.
Add `extensions/council/index.ts` in Phase 1 as a self-test-only Pi surface spike or in Phase 3 as the real command registration, and do not expose executable `/council` behavior until the UI and engine dependencies exist.
`extensions/council/index.ts` should import installed Pi packages only through lazy calls to `extensions/council/lib/pi-runtime.ts`, and it should not be imported by clean-checkout runtime tests.
Add `extensions/council/cli.ts` in Phase 2 as the Node-backed portable entrypoint that parses inputs and route probes, then wire it to the shared engine in Phase 5.
Add `extensions/council/lib/types.ts` in Phase 1 for all interfaces listed in this plan.
Add `extensions/council/lib/runtime.ts` in Phase 2 for the `CouncilRuntimeContractReport` startup check over Node, package root, loader, `bin/provider-invoke --auth`, `bin/provider-invoke --effort`, and `bin/provider-probe --auth`.
Add `extensions/council/lib/config.ts` in Phase 2 for `getAgentDir()` based paths, non-Pi paths, tolerant config migration, authoritative location scope, quarantine, and atomic writes.
Add `extensions/council/lib/input.ts` in Phase 2 for `/council` argument parsing, `@plan-file` parsing, safe path resolution, plan loading, issue normalization, immutable plan and issue line numbering, and SHA-256 hashing.
Add `extensions/council/lib/effort.ts` in Phase 2 for `COUNCIL_EFFORT_ORDER`, `PI_THINKING_LEVEL_TO_COUNCIL_EFFORT`, `normalizePiThinkingLevels`, supported-effort validation, and nearest-effort replacement suggestions.
Add `extensions/council/lib/routes.ts` in Phase 2 for Pi route discovery, family detection, Claude subscription-only filtering, effort normalization through `extensions/council/lib/effort.ts`, and replacement suggestions.
Add `extensions/council/lib/validate-roster.ts` in Phase 2 for the exported `validateRoster(input: CouncilValidateRosterInputV1): CouncilRosterValidationResultV1` function used by portable CLI semantic validation, portable `--emit-roster`, Pi UI Run gating, and Phase 5 engine preflight.
Add `extensions/council/lib/recommend.ts` in Phase 2 for issue-versus-plan roster recommendations and composition feedback.
Add `extensions/council/lib/emit-roster.ts` in Phase 2 for the portable `--emit-roster` flow that validates input, discovers routes, calls `recommend_roster`, mints unique ids, validates the resulting roster through `validateRoster()`, and writes atomically without executing models.
Add `extensions/council/lib/engine.ts` in Phase 5 for the state machine, phase-role assignment, deterministic synthesis, degradation, cancellation, phase orchestration, and calls into the shared `validateRoster()` preflight rather than reimplementing roster gates.
Add `extensions/council/lib/pi-runtime.ts` in Phase 1 for lazy installed-Pi value imports and Pi-present surface helpers; this file and `extensions/council/lib/executors/pi-complete.ts` are the only council runtime files in MVP allowed to import `@earendil-works/*` values.
Add `extensions/council/lib/executors/pi-complete.ts` in Phase 4 for Pi direct model calls through `complete()` and the `toPiEffortOptions` mapper.
Phase 4 must add or update `docs/public/council-pi-surface-gate.v1.json` in the same commit as the first Pi direct model execution file, generated from a successful `npm run verify:pi-surface` and `pi -e ./extensions/council/index.ts /council --self-test` run against installed Pi.
Phase 4 must implement `readPiRuntimeGate()` to load the surface artifact, read live Pi versions, compare ranges, run no-model sanity for in-range non-exact versions, and return the Pi gate reasons before executable Pi direct routes are exposed.
Phase 4 must make route reconciliation convert Pi drift failures into unavailable Pi direct entries plus portable replacement suggestions, never into automatic route rewrites, and must include `originalPiRouteId` and candidate `provider-invoke` replacement route ids in diagnostics.
Phase 4 must make `extensions/council/lib/routes.ts` and `extensions/council/lib/executors/pi-complete.ts` call `readPiRuntimeGate()` independently so a stale route catalog cannot bypass the executor refusal.
Phase 4 must implement scheduler support for `pi_concurrency_mode`, with Pi direct lane width `1` unless `docs/public/council-pi-effort-live.v1.json` is verified and version-matched at runtime.
Add `extensions/council/lib/executors/provider-invoke.ts` in Phase 4 for portable provider calls through the existing `bin/provider-invoke --effort` and `--auth` flags, and make this file own child-process environment sanitizing for Claude routes.
Add `extensions/council/lib/validate-json.ts` in Phase 5 for the TypeScript-native tolerant JSON extraction and schema validation helper; it must not spawn `bin/lib/json_extract.py` or `python3`.
Add `extensions/council/lib/report.ts` in Phase 5 for structured report validation, markdown rendering, report frontmatter, and report file writes.
Add `extensions/council/ui/roster-editor.ts` in Phase 3 for the custom TUI component.
Add `extensions/council/ui/composition.ts` in Phase 3 for composition feedback rendering.
Add `extensions/council/ui/keymap.ts` in Phase 3 for key handling and `keyHint()` labels.
Add `skills/council/SKILL.md` in Phase 6 as the portable non-Pi skill.
Add `bin/council` in Phase 2 as a thin shell launcher for `extensions/council/cli.ts` that accepts `--issue`, `--plan-file`, `--roster-file`, `--emit-roster`, `--report-strategy`, `--auth-policy`, `--overwrite`, and `--json`.
Add `bin/council-route-probe` in Phase 2 as a thin shell launcher for `extensions/council/cli.ts route-probe` that emits `CouncilRouteProbeEnvelopeV1`.
Modify `bin/provider-probe` in Phase 2 to accept optional `--auth <auto|subscription|apikey>` while retaining `provider-probe <claude|codex>`.
Modify `bin/adapters/claude.sh` `adapter_probe` in Phase 2 to honor `A_AUTH=subscription` by refusing API-key-only auth.
Modify `bin/adapters/claude.sh` `_claude_exec` in Phase 2 so only explicit `A_AUTH=subscription` applies the Anthropic credential-denylist plus verified-non-credential-allowlist sanitizer before running the Claude CLI.
Add a private shell helper named `_claude_unset_anthropic_credentials` in `bin/adapters/claude.sh` that unsets the current auto-mode credential list without adding `ANTHROPIC_OAUTH_TOKEN`.
Add a private shell helper named `_claude_unset_anthropic_subscription_credentials` in `bin/adapters/claude.sh` that unsets `ANTHROPIC_API_KEY`, `ANTHROPIC_OAUTH_TOKEN`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BEARER_TOKEN`, `ANTHROPIC_CONSOLE_API_KEY`, and `ANTHROPIC_CONSOLE_AUTH_TOKEN`.
Add a private shell helper named `_claude_sanitize_subscription_env` in `bin/adapters/claude.sh` that calls `_claude_unset_anthropic_subscription_credentials`, removes unclassified `ANTHROPIC_*` names not present in the verified non-credential allowlist, and never logs values.
Keep `A_AUTH=auto` behavior backward compatible for `/synthesis`: when a first-party session exists, unset only the current known credential variables and preserve `ANTHROPIC_OAUTH_TOKEN` and non-credential `ANTHROPIC_*` variables.
Do not modify `bin/provider-invoke` default auth behavior, `--auth` parsing, or `--effort` parsing for MVP; the existing flags are sufficient, and council-owned validation prevents unsupported values from reaching adapter clamps.
Add `roles/council/initial.md`, `roles/council/critique.md`, `roles/council/steelman.md`, `roles/council/adversary.md`, and `roles/council/chair.md` in Phase 5.
The initial and critique role prompts should explicitly tell models to cite `plan.md:Lx-Ly` for `plan_line` evidence on plan input and `issue:Lx-Ly` for `issue_text` evidence on issue input.
Add `schemas/council-voice.json`, `schemas/council-critique.json`, `schemas/council-steelman.json`, `schemas/council-adversary.json`, `schemas/council-chair-report.json`, and `schemas/council-report.json` in Phase 1 as schema files and enforce them in Phase 5.
Add `tests/conformance/council.sh` and source it from `tests/conformance/run.sh` in Phase 2, with skipped or fixture-gated cases allowed until their implementation phase lands.
Add fake route fixtures under `tests/conformance/fixtures/council/` in Phase 2.
Add TypeScript unit tests under `tests/council/` across Phases 2 through 5 for input parsing, route reconciliation, effort propagation, phase-role assignment, deterministic synthesis, config persistence, cancellation, and report validation as each module lands.
Add a Phase 2 `validate-roster` TypeScript unit test that proves the same `validateRoster()` result blocks duplicate ids, unavailable routes, unsupported efforts, fewer than two executable members, missing report strategy, invalid chair strategy, and Pi drift requiring route confirmation.
Add a Phase 3 UI unit test or fixture that proves the roster editor's Run-disabled state and chair strategy warning render from `CouncilRosterValidationResultV1` rather than recomputing gates in the UI component.
Add a Phase 5 engine preflight unit test that proves the engine calls `validateRoster()` and aborts before model execution when semantic roster validation fails.
Add a TypeScript portable emit-roster unit test in Phase 2 that proves `--emit-roster` writes a valid `CouncilRosterConfigV1` with two executable members, fresh opaque ids, `scope: "explicit"`, and a valid default report strategy without calling any model executor.
Add a conformance test in Phase 2 that runs `bin/council --issue "A vs B" --emit-roster <tmp>` with fake routes, then runs `bin/council --issue "A vs B" --roster-file <tmp>` through fake model execution.
Add a portable emit-roster failure test in Phase 2 that proves insufficient routes, existing output without `--overwrite`, and invalid output paths exit before writing partial files.
Add Pi integration fixtures or fakes under `tests/pi/` or `tests/council/pi-fixtures/` in Phase 3 to simulate `ctx.modelRegistry`, `ctx.ui.custom()`, `session_shutdown`, and session replacement without live model calls.
Add `tests/council/pi-surface-contract.test-d.ts` in Phase 1 to compile-check the exact Pi imports and call signatures used by the package.
Add `tests/council/pi-effort-options-contract.test-d.ts` in Phase 1 to compile-check the council-owned `toPiEffortOptions` contract against repo-local stubs.
Add `tests/council/pi-runtime-isolation.test.ts` in Phase 1 to monkey-patch Node module loading, import portable CLI and shared library entrypoints under clean-checkout conditions, and fail on any attempted runtime load of `@earendil-works/*`.
Make `npm run verify:pi-surface` inspect installed Pi option types, `complete`, `hasApi`, and `getSupportedThinkingLevels`, and assert the raw thinking vocabulary maps exactly to `PI_THINKING_LEVEL_TO_COUNCIL_EFFORT`.
Add a TypeScript executor unit test in Phase 4 that verifies Anthropic routes receive `effort`, OpenAI Responses routes receive `reasoningEffort`, OpenAI Codex `off` maps to `"none"` only when installed support is confirmed, and other `off` routes omit explicit thinking options.
Add a Node script unit test in Phase 4 for `scripts/check-council-pi-gate.mjs` covering missing, stale, wrong-key, verified, pending default-pass, and pending `--strict-verified` failure cases.
Add a TypeScript route unit test in Phase 4 that proves Pi direct routes are unavailable with `pi_surface_not_verified` and never call `complete()` when the strict artifact check fails, even though default clean-checkout tests accept a current pending artifact.
Add a TypeScript route and executor unit test in Phase 4 that fakes live Pi package versions outside `docs/public/council-pi-surface-gate.v1.json` compatible ranges, proves Pi direct routes are unavailable with `pi_runtime_version_mismatch`, and proves `complete()` is not called even if a stale catalog entry reaches the executor.
Add a TypeScript route and roster-validation unit test in Phase 4 that fakes Pi drift plus an authorized `provider-invoke` route, proves the Pi direct row stays unchanged and unavailable, proves the portable route is presented only as a suggestion, and proves Run remains blocked until the roster explicitly selects the portable route.
Add a TypeScript route and roster-validation unit test in Phase 4 that fakes Pi drift without an authorized portable route and proves Run is blocked with an actionable compatibility error and no route mutation.
Add a TypeScript route unit test in Phase 4 that fakes a patch-level live Pi version inside `>=<verifiedVersion> <nextMinor>`, proves `readPiRuntimeGate()` allows Pi direct routes after the runtime sanity contract passes, and proves a sanity failure returns `pi_runtime_surface_mismatch`.
Add a TypeScript scheduler unit test in Phase 4 that schedules mixed-effort Pi direct members with `maxConcurrency: 4`, no live-effort artifact, and a fake clock, then proves Pi direct calls run one at a time in roster order while portable provider-invoke calls may still overlap.
Add a TypeScript scheduler unit test in Phase 4 that supplies a version-matched `CouncilPiEffortLiveGateV1` fixture and proves Pi direct calls may overlap while preserving per-call effort options.
Add a Pi-present live script test in Phase 7 for `scripts/verify-pi-effort-live.mjs` that can return pass, `PI_EFFORT_LIVE_INCONCLUSIVE` exit `77`, or a hard failure, writes `docs/public/council-pi-effort-live.v1.json` only on pass with `--write-artifact`, and leaves runtime Pi direct scheduling in serial mode on exit `77`.
Add a portable executor unit test in Phase 4 that captures `bin/provider-invoke` argv and proves selected supported efforts are forwarded with `--effort`, unsupported remembered efforts block before invocation, and the executor fails loudly if the wrapper contract check cannot find `--effort`.
Add a portable Claude effort contract test in Phase 4 that installs a fake `claude` binary, invokes `bin/provider-invoke claude --auth subscription --effort` for `low`, `medium`, `high`, `xhigh`, and `max`, proves each value reaches the CLI unchanged, and proves `off`, `minimal`, and unknown values are blocked by council before invocation.
Add a portable Claude executor unit test in Phase 4 that captures the child environment and proves Anthropic credential variables and unclassified `ANTHROPIC_*` variables are absent before `bin/provider-probe` or `bin/provider-invoke` is started, while `ANTHROPIC_BASE_URL` is preserved without logging its value.
Add a portable Claude token-only test in Phase 4 that sets only `ANTHROPIC_OAUTH_TOKEN`, provides no fake first-party Claude session, runs `provider-probe` and `provider-invoke` with `--auth subscription`, and expects `claude_subscription_login_required_after_env_token_scrub` without API fallback.
Add a TypeScript validator unit test in Phase 5 that proves `extensions/council/lib/validate-json.ts` matches checked-in `bin/lib/json_extract.py` fixture expectations without requiring Python at runtime.
Add an evidence-ledger unit test in Phase 5 that proves `pool_evidence` marks valid `plan.md:Lx-Ly` and `issue:Lx-Ly` locators grounded, marks theory, prior knowledge, malformed locators, and out-of-range lines ungrounded, and never trusts a model-supplied grounding claim.
Add a prompt assembly unit test in Phase 5 that proves issue-input initial and critique prompts include the frozen issue line-number block and `issue:Lx-Ly` citation instruction, and plan-input prompts include the frozen plan line-number block and `plan.md:Lx-Ly` citation instruction.
Add a phase-output validation unit test in Phase 5 that rejects critique, steelman, and adversary outputs containing `evidenceIds` not present in `CouncilEvidenceLedgerV1`.
Add a readiness unit test in Phase 5 proving a load-bearing assumption cited with a nonexistent evidence id or only ungrounded evidence cannot reach `decision_readiness: ready`.
Add an engine retry-budget unit test in Phase 5 that proves a malformed first attempt and JSON-only retry share one `memberTimeoutMs` budget and cannot extend the whole-run deadline.
Add a scheduler deadline unit test in Phase 5 that builds a six-member all-Pi-direct serial lane plan with `maxConcurrency: 4` and `memberTimeoutMs: 300000`, proves the initial phase budget is at least `1800000` ms, and proves the run-level deadline does not abort before all six members exhaust their budgets.
Add a synthesis input contract unit test in Phase 5 that proves deterministic, structured-disagreement, and chair strategies receive `CouncilSynthesisBriefV1` plus `CouncilAdversaryOutputV1[]`, include critique, steelman, and adversary content in `phase_findings`, and never read hidden host-model state.
Add a single-survivor input contract unit test in Phase 5 that proves `single_survivor_report` consumes only the surviving voice and failed-member diagnostics, never `CouncilSynthesisBriefV1` or `CouncilAdversaryOutputV1[]`.
Add a deadline-precedence unit test in Phase 5 that fires the run-level deadline during `initial_analysis` after one member succeeds and proves the run writes `status: failed`, `reason: deadline_exceeded`, not a single-survivor report.
Update `bin/README.md` in Phase 2 with the council route probe and subscription-only Claude behavior.
Update `README.md` in Phase 6 with optional Pi package install instructions and a short warning that the native `/council` menu is Pi-only.
Force-add any non-public docs under `docs/` because `.gitignore` intentionally ignores them.

## Test Matrix

| Scenario | Test location | Expected result |
|---|---|---|
| Single-model roster | `tests/conformance/council.sh` | Two members using the same provider/model with different roles are valid when efforts are supported. |
| Same-family roster | `tests/conformance/council.sh` | Two OpenAI-family or Claude-family routes are valid and family diversity is only a warning. |
| Cross-family roster | `tests/conformance/council.sh` | Claude plus Codex or another family is valid and receives positive diversity feedback. |
| Unsupported effort | `tests/conformance/council.sh` | Remembered effort remains visible, member is not executable, and nearest valid effort is suggested without mutation. |
| Unavailable remembered member | `tests/conformance/council.sh` | Unavailable member remains visible and is persisted only after Run if still in the confirmed draft. |
| Project roster precedence | TypeScript config unit test plus Pi fixture | Trusted project-local roster wins over user-global without merging; untrusted project-local roster is ignored; missing project roster may seed from user-global and persists back to project scope on Run. |
| Config scope authority | TypeScript config unit test | A user-path roster with in-file `scope: "project"` loads with in-memory `CouncilRosterConfigV1.scope` set to the resolved user scope, report frontmatter uses the resolved scope, no call site reads the stale on-disk value, and the field is rewritten only after Run. |
| Future-version config preservation | TypeScript config persistence unit test | A higher-version roster starts from recommendations but is copied to `roster.v1.json.future.<timestamp>` before any v1 persistence, and if the original hash changed or backup fails the Run proceeds without overwriting it. |
| Pre-routeId migration | TypeScript config migration test | A v1 roster entry with `(executor, provider, model)` but no `routeId` migrates before canonical validation; an entry missing both `routeId` and a complete tuple is quarantined. |
| RouteId tuple fallback mismatch | TypeScript route reconciliation test | A stored entry with a stale mismatched `routeId` but matching `(executor, provider, model)` remains available, emits `route_id_mismatch`, and rewrites only after Run. |
| RouteId byte stability | TypeScript route unit test | NFC plus UTF-8 percent-encoding outside `[A-Za-z0-9._~-]` gives stable `routeId` bytes, and tuple fallback is only recovery. |
| Migration pipeline precedence | TypeScript config unit test | A roster with co-occurring missing `routeId`, duplicate ids, legacy chair, and stale scope follows the ordered pipeline and duplicate-id quarantine wins before migration. |
| Legacy chair migration | TypeScript config migration test | Pi TUI migrates one old `chair: true` into chair strategy and role before validation, multiple markers warn and become deterministic, and canonical writes omit entry-level chair. |
| Portable legacy chair refusal | `tests/conformance/council.sh` plus TypeScript CLI unit test | A portable `--roster-file` containing entry-level `chair`, missing `reportStrategy`, or a migration that would change role or strategy exits `4`, prints required canonical JSON edits, writes no report, and does not execute route discovery or model calls. |
| Corrupt config | `tests/conformance/council.sh` | Corrupt file is quarantined and recommendations seed the menu. |
| Unwritable config | `tests/conformance/council.sh` | Run can proceed with a warning and no false "saved" message. |
| Cancelled menu | `tests/conformance/council.sh` | Draft changes are discarded and roster config mtime/content is unchanged. |
| Issue/path ambiguity | `tests/conformance/council.sh` | Sole readable path is a plan, mixed unmarked text is issue text, explicit `@` wins, and single bare non-file token `caching` is issue text. |
| Unreadable path-shaped input | `tests/conformance/council.sh` | Single-token candidates with separators, path prefixes, recognized plan extensions, or existing unreadable filesystem entries error before route discovery. |
| Untrusted path | `tests/conformance/council.sh` | Symlink escape or path outside allowed roots is rejected. |
| Empty input | `tests/conformance/council.sh` | TUI opens input flow and non-TUI prints usage. |
| Provider failure | `tests/conformance/council.sh` | Failed member is recorded and remaining members continue. |
| Member timeout scope | TypeScript engine/executor unit test | One member timeout aborts only that member controller; other concurrent members continue unless the run-level signal is aborted. |
| Retry shares member timeout | TypeScript scheduler/executor unit test | A malformed first attempt and JSON-only retry consume the same `memberTimeoutMs`; the retry is skipped when no positive member budget remains and the whole-run deadline is not extended. |
| Deadline beats single survivor | TypeScript engine unit test | When the run-level deadline fires during `initial_analysis` after exactly one member succeeds, active calls abort and the run writes `status: failed`, `reason: deadline_exceeded`, never a single-survivor degraded report. |
| Partial council degradation | `tests/conformance/council.sh` | One surviving voice yields degraded `not_ready`; two surviving voices yield degraded council report. |
| Hidden-host-vote prevention | `tests/conformance/council.sh` | No model call occurs for `ctx.model` unless it appears in roster. |
| Per-member Pi effort propagation | TypeScript executor unit test | `pi-complete` passes each roster entry's effort through provider-specific per-call options from `toPiEffortOptions` and never calls `pi.setThinkingLevel()`. |
| Concurrent mixed efforts | TypeScript executor unit test | Two concurrent fake Pi member calls with different efforts preserve their own per-call effort options and do not use session-global state only when the live-effort concurrency gate is verified; otherwise scheduler tests require serial Pi execution. |
| Live Pi effort honoring | `npm run verify:pi-effort-live` | Sequential and concurrent low/high calls on a qualifying route expose distinct per-call effort metadata; inconclusive metadata exits `77`, writes no artifact, and leaves Pi direct concurrency serial. |
| Pi API surface contract | `npm run verify:pi-surface` and `tests/council/pi-surface-contract.test-d.ts` | Repo-local stubs compile council imports in clean checkout, and the Pi-present verifier confirms installed Pi exports and command-context methods used by `/council` exist before route discovery, UI, or executor work is implemented. |
| Pi runtime path-mapping guard | Local Pi integration check | A `pi -e` or installed-loader self-test proves runtime imports of `@earendil-works/*` resolve installed Pi modules rather than repo-local type stubs despite `tsconfig.json` path mappings. |
| Clean-checkout Pi runtime isolation | TypeScript runtime unit test plus build smoke | A clean-checkout import/load test monkey-patches module loading, imports the portable CLI and shared `extensions/council/lib/**` modules, and proves no `@earendil-works/*` value module is requested; `npm run build` compiles but does not execute Pi-coupled modules. |
| Pi effort option contract | `npm run verify:pi-surface`, `tests/council/pi-effort-options-contract.test-d.ts`, and TypeScript executor unit test | Clean checkout tests prove council code uses `toPiEffortOptions`, and the Pi-present verifier proves installed provider-specific option types still expose the effort keys the mapper emits. |
| Pi provider-specific effort mapping | TypeScript executor unit test | Anthropic routes receive `effort`, OpenAI Responses routes receive `reasoningEffort`, OpenAI Codex `off` maps to `"none"` only when installed support is confirmed, other `off` routes omit explicit thinking options, and no route uses session-global thinking state. |
| Pi thinking-level normalization | TypeScript route unit test plus `npm run verify:pi-surface` | `getSupportedThinkingLevels()` values normalize through the exact `off|minimal|low|medium|high|xhigh|max` table, non-reasoning routes expose only `off`, empty or unknown raw levels make the route unavailable, and no Pi clamp is used. |
| Provider-invoke effort propagation | TypeScript executor unit test plus `tests/conformance/council.sh` | The portable executor verifies the existing `bin/provider-invoke --effort` flag, forwards only route-supported efforts, blocks unsupported remembered efforts before invocation, and fails loudly if the flag contract is missing. |
| Phase-role fallback | TypeScript engine unit test | Rosters without explicit critic, steelman, or adversary roles receive deterministic explicit-member phase assignments recorded in diagnostics. |
| State-machine guarded transitions | TypeScript engine unit test | Zero, one, and two-plus successful initial voices take the specified transitions; later phase failures continue to the next named phase with degradation instead of skipping straight to synthesis. |
| Synthesis input contracts | TypeScript engine/report unit test | Deterministic, structured disagreement, and chair synthesis consume `CouncilSynthesisBriefV1` plus `CouncilAdversaryOutputV1[]`, include all phase findings, and read no hidden host-model state. |
| Single-survivor input contract | TypeScript engine/report unit test | `single_survivor_report` consumes only the surviving voice plus failed-member diagnostics and never requires synthesis brief or adversary arrays. |
| Shared roster validator | TypeScript validator, UI, and engine unit tests | Phase 2 portable CLI, Phase 3 roster editor, and Phase 5 engine preflight all consume `validateRoster()` and produce the same blocking result for duplicate ids, unavailable routes, unsupported efforts, two-member minimum, and invalid chair strategy. |
| Roster entry id uniqueness | TypeScript roster validation and UI unit test | Add and duplicate-row flows mint fresh opaque ids, edit and reorder preserve ids, duplicate loaded ids quarantine or block Run, and `chairEntryId` resolves to exactly one entry. |
| Chair identity authority | TypeScript roster validation and engine unit test | `reportStrategy.chairEntryId` is the only chair synthesis authority, the referenced entry must have `role: "chair"`, and no entry-level `chair` boolean is accepted in canonical config. |
| One-survivor chair strategy | TypeScript engine unit test | With a chair strategy and exactly one surviving initial voice, no chair model call occurs and the report is single-survivor mechanical whether the chair survived or failed. |
| Whole-run deadline budget | TypeScript scheduler unit test | The computed deadline uses `CouncilPhaseLanePlanV1`, is at least the sum of scheduled effective lane budgets plus overhead, and never aborts before valid scheduled work exhausts its budget. |
| Serial Pi deadline budget | TypeScript scheduler unit test | Six serial Pi-direct members with `maxConcurrency: 4` and `memberTimeoutMs: 300000` receive at least `1800000` ms for the initial phase and are not aborted by the old `ceil(6 / 4)` budget. |
| Serial Pi global slot accounting | TypeScript scheduler unit test | A serial Pi direct call consumes one global `maxConcurrency` slot; with `maxConcurrency: 4` at most three portable calls overlap, and with `maxConcurrency: 1` no portable call overlaps. |
| Whole-run deadline abort | TypeScript engine/executor unit test | A fake slow member exceeds the computed deadline, the run-level controller aborts active members, unscheduled phases are skipped, and the terminal report is written with `status: failed`, `reason: deadline_exceeded`, diagnostics, and `implementation_authorized: false`. |
| Evidence-auditor routing | TypeScript engine unit test | A successful `evidence-auditor` roster entry is scheduled in the `critique` phase and emits `assumption_reviews`; no separate evidence-auditor phase is required. |
| Critique assumption catalog injection | TypeScript prompt and validator unit test | `prepare_prompts` injects the frozen `CouncilAssumptionReviewCatalogV1` into every critique prompt, critique prompt hashes cover the catalog bytes, and validation rejects assumption review ids not present in the catalog. |
| Deterministic report strategy | `tests/conformance/council.sh` | Explicit deterministic final synthesis uses no model executor, report says deterministic, and plan or explicit-option issue inputs can recommend deterministic by default. |
| Position catalog grouping | TypeScript engine unit test | Plan and issue inputs build deterministic position catalogs, voices can only use catalog ids or exact `other:<slug>`, and majority/plurality grouping uses `canonicalPositionId`. |
| Issue catalog extraction grammar | TypeScript catalog fixture test | Numbered lists, bullet lists, one-line `A vs B`, one-line `A versus B`, one-line `A or B`, ordinary prose containing `or`, duplicate candidates, overlong candidates, and single-option input produce the exact expected catalog ids and labels. |
| Free-form issue strategy default | TypeScript recommendation unit test plus UI composition fixture | Free-form issue prose with no extracted `issue_option_*` candidates defaults recommendations to structured disagreement unless a valid chair is selected, while explicit user selection of deterministic remains available with a warning. |
| Prompt catalog ordering | TypeScript prompt assembly unit test | `derive_position_catalog` runs before `prepare_prompts`, every initial prompt contains identical catalog bytes, and prompt hashes cover those bytes. |
| Issue prompt grounding | TypeScript prompt assembly and evidence-ledger unit tests | Issue input is normalized and line-numbered as immutable `issue:Lx` text, initial and critique prompts require `issue:Lx-Ly` citations, and valid issue locators become grounded ledger evidence. |
| Deterministic synthesis algorithm | TypeScript engine unit test | Majority, plurality, tie, no-grounded-evidence, one-survivor, degraded critical phase, verified assumption, unverified assumption, and material-dissent cases produce the specified readiness and recommendation fields. |
| Chair report strategy | `tests/conformance/council.sh` | Chair route is an explicit roster member and has its own call record. |
| Invalid chair strategy | TypeScript roster validation test | `chair:<member-id>` blocks Run when the member is disabled, unavailable, missing, or has unsupported effort. |
| Structured disagreement strategy | `tests/conformance/council.sh` | Report preserves disagreement mechanically without forcing a recommendation and no model executor is called during synthesis. |
| Portable Claude effort passthrough | Fake Claude argv contract plus TypeScript route unit test | Portable Claude routes expose `low`, `medium`, `high`, `xhigh`, and `max` only with wrapper-contract provenance, each supported value reaches `claude --effort` unchanged, and `off`, `minimal`, or unknown remembered efforts block before invocation. |
| Pi reload during menu | `tests/conformance/council.sh` or Pi integration test | Menu closes, no config write occurs, and stale context is not used. |
| Pi session replacement during run | Pi integration test | Active run aborts and no replacement-session work uses old `ctx`. |
| Non-Pi fallback | `tests/conformance/council.sh` | Portable skill or `bin/council` reports no native menu and uses JSON roster or clear usage. |
| Portable invalid roster | `tests/conformance/council.sh` | Parsed but invalid `--roster-file` exits `3` for schema failures or `4` for semantic failures, writes no report, and never falls back silently. |
| Portable first roster authoring | TypeScript CLI unit test plus `tests/conformance/council.sh` | `bin/council --issue "A vs B" --emit-roster <tmp>` with fake routes writes a valid runnable roster with fresh ids and default strategy, and that file can immediately be used by `--roster-file` without hand editing. |
| Portable emit-roster no partial write | TypeScript CLI unit test | Insufficient executable routes, existing output without `--overwrite`, unwritable parent, or invalid input exits before writing a roster file or report. |
| Portable roster-file read-only | TypeScript CLI unit test | Successful `--roster-file` execution writes no changes to the supplied file, even when canonical ids, scope, or timestamps differ in memory. |
| Portable report-strategy override | TypeScript CLI unit test plus `tests/conformance/council.sh` | `--report-strategy` overrides roster-file `reportStrategy` for the current run only, validates chair executability, records `report_strategy_source: cli`, and does not rewrite the roster strategy. |
| Claude subscription-only | `tests/conformance/council.sh` | API-key-only Claude is unavailable for council but existing `/synthesis` probe default remains auto. |
| Pi complete Claude auth guard | TypeScript executor unit test with fake Pi registry | When `ctx.modelRegistry.isUsingOAuth(model)` is false for a Claude route, the member fails with `auth_policy` and `complete()` is never called. |
| Claude mixed credentials | TypeScript executor unit test plus fake Claude CLI | OAuth/subscription route remains subscription-only when `ANTHROPIC_API_KEY` or `ANTHROPIC_OAUTH_TOKEN` is also present, no Anthropic credential or unclassified `ANTHROPIC_*` variable reaches a Claude council child, and `ANTHROPIC_BASE_URL` is preserved with a diagnostic. |
| Claude auto compatibility | Existing conformance plus fake Claude env test | Default `A_AUTH=auto` keeps today's `/synthesis` behavior, including non-credential `ANTHROPIC_*` and `ANTHROPIC_OAUTH_TOKEN` preservation in the first-party-session branch. |
| Claude explicit subscription sanitizer | Fake Claude env test | `bin/provider-invoke claude --auth subscription` removes the Anthropic credential denylist and unclassified `ANTHROPIC_*` names, preserves `ANTHROPIC_BASE_URL`, and still succeeds with a fake logged-in subscription session. |
| Claude token-only subscription env | Fake Claude env test | With only `ANTHROPIC_OAUTH_TOKEN` and no first-party Claude login, Claude council discovery is unavailable with `claude_subscription_login_required_after_env_token_scrub`, no API fallback occurs, and the child env is scrubbed. |
| Claude no-cost subscription probe | Phase 2 local integration check | When a real logged-in Claude CLI is available, `bin/provider-probe claude --auth subscription` succeeds with credential and unclassified Anthropic variables present in the parent environment and makes no paid model call. |
| Provider-invoke auth surface | TypeScript executor unit test plus shell fixture | The portable executor verifies the existing `bin/provider-invoke --auth` flag, passes `--auth subscription` for Claude routes, and fails the startup contract if a future wrapper removes that flag. |
| Provider-probe auth surface | TypeScript runtime unit test plus shell fixture | The portable executor verifies the planned `bin/provider-probe --auth` flag exists before route probing and fails the startup contract if a future wrapper removes that flag. |
| No paid probe calls | Unit test with fake executors | Route discovery calls only registry/probe methods and never invokes model execution. |
| Stable route IDs | TypeScript route unit test | Display name, auth state, billing label, cost, and availability changes do not change `routeId`; missing routes stay visible; tuple fallback works even with a stale stored `routeId`. |
| Structured output validation | Unit test with fixtures | TypeScript-native validation rejects `ok:false`, extra keys, wrong types, and prose-only responses, then retries once inside the same member budget. |
| JSON extractor parity | TypeScript validator fixture test | The TypeScript validator matches checked-in `bin/lib/json_extract.py` fixture expectations for whole JSON, fenced JSON, last-object scan preference, arrays, schema-invalid JSON, prose-only text, and scan-start capping without requiring Python at runtime. |
| Per-voice validation mapping | TypeScript engine unit test | `validateModelJson` returns `kind`, malformed voice output degrades only that member, and validator failures never become portable CLI process exit codes. |
| Engine-owned grounding | TypeScript evidence-ledger unit test | Valid immutable plan and issue locators become grounded, theory and prior knowledge remain ungrounded, malformed or out-of-range locators remain ungrounded, and model output cannot set `grounded` directly. |
| Evidence id validation | TypeScript phase-output validator unit test | Critique, steelman, and adversary outputs with fabricated `evidenceIds` are rejected after retry and degrade that phase member. |
| Readiness requires grounded ledger evidence | TypeScript deterministic synthesis unit test | A load-bearing assumption marked `verified_by_cited_evidence` with nonexistent or ungrounded evidence ids cannot produce `decision_readiness: ready`. |
| Chair authorization normalization | TypeScript report unit test | A chair draft that emits `implementation_authorized: true` or omits the field is normalized with a diagnostic, the final assembled report forces `implementation_authorized: false`, and final schema validation still rejects any post-normalization `true`. |
| Single-survivor frontmatter | TypeScript report unit test | One-survivor reports emit `report_strategy: single_survivor`, preserve `configured_report_strategy`, and do not claim `chair` when no chair call happened. |
| Plan immutability | Unit test | Plan file hash and mtime are unchanged after a run. |
| Atomic persistence | Unit test | Interrupted temp write does not corrupt last good roster. |
| Canceled terminal report | TypeScript engine unit test | Cancellation after `persist_roster` writes a minimal `status: canceled` report and cancellation before Run writes no report. |
| Failed terminal report | TypeScript engine unit test | Failure after execution starts writes `status: failed` with diagnostics and `implementation_authorized: false`. |
| Council report isolation | Existing suites plus fixture | A council report under `./.ai-synthesis/council-sessions/` does not affect `/synthesis list`, `expand`, `resume`, `rate`, or `revisit`; no `mode: council` file is written under legacy `sessions/`. |
| Node fallback parity | TypeScript CLI unit test plus `tests/conformance/council.sh` | `bin/council` invokes the shared TypeScript engine and does not contain independent shell synthesis logic. |
| Missing Node fallback dependency | `tests/conformance/council.sh` | Missing Node or runtime loader prints setup instructions and does not create config or reports. |
| Hermetic conformance target | CI/local script test | `tests/conformance/run.sh hermetic` passes with real `claude` and `codex` absent from `PATH`, no provider auth, and no model-network access. |
| Pipelane npm bootstrap | CI/local script test | On a clean checkout with no installed Pi runtime and no `node_modules`, installed Pipelane's effective `npm run test`, `npm run typecheck`, and `npm run build` checks pass through `sh -lc` when the runner has npm registry access or a prewarmed npm cache satisfying `package-lock.json`. |
| Pipelane synthesized defaults | CI/local script test | `scripts/verify-pipelane-prepr.mjs` proves active machine-local checks and isolated empty-`PIPELANE_HOME` synthesized checks match `docs/public/pipelane-prepr-checks.v1.json` and execute green through `sh -lc`. |
| Npm bootstrap offline miss | Script unit test | With no install stamp, unavailable registry, and cache miss, `scripts/ensure-node-deps.mjs` fails fast with `DEPENDENCY_INSTALL_UNAVAILABLE`, prints registry/cache remediation, and does not skip tests or write a fake stamp. |
| Package check activation | CI/local script test | On a clean checkout with no installed Pi runtime, `npm ci --prefer-offline --no-audit --fund=false`, `npm run test`, `npm run typecheck`, and `npm run build` pass in the same commit that introduces `package.json` and install-aware lifecycle scripts. |
| Provider-present conformance | Local integration check | `tests/conformance/run.sh all` remains available for developer machines with configured providers but is not required by generic Pipelane pre-PR checks. |
| Pi-present surface gate | Local Pi integration check | In an environment with installed Pi, `npm run verify:pi-surface` and `pi -e ./extensions/council/index.ts /council --self-test` pass before Phase 2 starts. |
| Pi gate artifact enforcement | Clean-checkout script test | `scripts/check-council-pi-gate.mjs` fails missing, stale, wrong-key, and `--strict-verified` pending artifacts; default mode passes current verified or current pending artifacts with diagnostics. |
| Pi install release artifact gate | Release script test | `scripts/check-council-release-artifacts.mjs` fails release tags and default-branch refs intended for `pi install git:` when the surface artifact is pending, stale, or missing. |
| Pi package install lifecycle | Local Pi package-manager inspection or smoke test | Installed Pi git package installation is verified to run production dependency installation rather than relying on `prepack`; the plan and docs treat `prepack` as pack/publish-only and runtime route gates as the end-user execution guard. |
| Pi strict runtime gate | TypeScript route/executor unit test plus `npm run verify:pi-execution-release` | A pending or stale artifact leaves Pi direct routes unavailable with `pi_surface_not_verified`, `complete()` is never called, the strict release script fails until the artifact is verified, and `npm pack --dry-run` reaches the pack/publish gate through `prepack`. |
| Pi runtime version drift | TypeScript route/executor unit test | A verified surface artifact generated for Pi minor line A plus a live fake Pi runtime outside the artifact's compatible ranges leaves every Pi direct route unavailable with `pi_runtime_version_mismatch`, suggests a verified package for the live Pi minor line, and never calls `complete()`. |
| Pi minor support policy | TypeScript route unit test plus README check | The day-one artifact targets Pi `0.80.10` and `0.80.x`; a next-minor runtime disables Pi direct routes until a newly verified artifact ships, and docs state the per-minor cadence. |
| Pi drift portable replacement safety | TypeScript route and roster-validation unit tests | Pi drift disables selected Pi direct routes for the session, authorized portable routes appear only as suggestions, Run is blocked until explicit selection, and no roster or execution path silently rewrites `pi-complete` to `provider-invoke`. |
| Pi compatible patch runtime | TypeScript route unit test | A live fake Pi runtime on a later patch inside `>=<verifiedVersion> <nextMinor>` passes only after the no-model runtime sanity contract passes; sanity failure disables Pi direct routes with `pi_runtime_surface_mismatch`. |
| Pi serial fallback without live effort proof | TypeScript scheduler/executor unit test | With missing, inconclusive, stale, or version-mismatched `docs/public/council-pi-effort-live.v1.json`, mixed-effort Pi direct members run serially in roster order with `pi_concurrency_mode: serial_unverified_effort_isolation`, while portable calls can still overlap. |
| Pi parallel only after live effort proof | TypeScript scheduler/executor unit test plus `npm run verify:pi-effort-live` artifact fixture | A version-matched `CouncilPiEffortLiveGateV1` enables parallel Pi direct calls up to `maxConcurrency`, preserves per-call effort options, and records `pi_concurrency_mode: parallel_verified_effort_isolation`. |
| Phase 2+ rollback safety | Scripted rollback checklist or manual verification | Reverting Phase 2+ while retaining Track A keeps hermetic conformance and effective Pipelane checks green, retains referenced scripts, and leaves no `run.sh` line pointing at removed tests. |
| Full abandonment rollback | Manual rollback checklist | Removing the Phase 1 package baseline is documented as returning to the pre-plan state where installed Pipelane's synthesized npm checks fail unless a separate Pipelane config decision changes those checks. |
| Backward compatibility | Existing suites | `tests/conformance/run.sh all` keeps current unit, Claude, and Codex tests green. |

## Acceptance Criteria

`/council` is absent unless the user installs the Pi package or loads the portable skill.
`/council` in Pi TUI opens a roster editor seeded from the last confirmed roster or recommendations.
Run is impossible until at least two executable members and one final report strategy are valid.
Pi TUI Run gating, portable roster semantic validation, `--emit-roster`, and engine preflight all use the same exported `validateRoster()` result.
Run is impossible with a chair strategy unless the selected chair entry has `role: "chair"` and is enabled and executable.
`reportStrategy.chairEntryId` is the only authoritative chair synthesis identity, and canonical roster config contains no entry-level `chair` boolean.
Single-model, same-family, and cross-family councils all run when they satisfy the practical minimum.
Unsupported efforts are never clamped, downgraded, removed, or hidden.
Unavailable remembered members are visibly preserved with suggestions.
Cancel never persists the roster draft.
Run persists the confirmed roster atomically before execution.
Trusted project-local and user-global roster config precedence behaves exactly as specified, with no silent merge.
Config scope is derived from the resolved config location, not trusted from an in-file field.
Higher-version roster configs are never overwritten until their exact original bytes have been backed up, and failed backup skips persistence rather than losing the newer config.
Pre-`routeId` roster entries migrate before canonical validation when the tuple is complete.
Stale stored `routeId` values do not make a route unavailable when `(executor, provider, model)` still matches.
Roster entry ids are opaque, unique within a roster, stable across edits and reorders, and collisions block Run.
Route discovery does not make paid model calls.
Claude council routes never use Anthropic API credentials.
Claude subscription-only auth is enforced both during route discovery and immediately before each Claude execution.
Pi direct Claude execution refuses API-key-only auth before calling `complete()`.
Portable Claude execution removes Anthropic credential variables and unclassified `ANTHROPIC_*` variables before starting `bin/provider-probe` or `bin/provider-invoke`, while preserving only explicitly allowlisted verified non-credential Anthropic variables.
An `ANTHROPIC_OAUTH_TOKEN`-only environment without a first-party Claude CLI login is explicitly unavailable for council with `claude_subscription_login_required_after_env_token_scrub`, while `/synthesis` auto behavior remains unchanged.
The initial verified non-credential Anthropic allowlist is exactly `ANTHROPIC_BASE_URL`, and adding any other name requires a test proving that it is non-secret and cannot trigger API-key fallback.
When `ANTHROPIC_BASE_URL` is present, diagnostics disclose only its presence, not its value, and billing is labeled unknown unless subscription billing is proven from non-secret auth status.
Direct `bin/provider-invoke claude --auth subscription` applies the same credential-denylist plus verified-non-credential-allowlist sanitizer before the Claude CLI starts after the planned adapter update.
Default `/synthesis` auto Claude execution keeps existing behavior and preserves non-credential `ANTHROPIC_*` plus `ANTHROPIC_OAUTH_TOKEN`; explicit council subscription execution is the only MVP path that removes them.
Phase 1 clean-checkout Pi contracts compile only council-owned stubs and mapper usage; maintainer installed-Pi drift is caught by `npm run verify:pi-surface`, and end-user installed-Pi drift is caught by the runtime version compatibility gate.
Clean-checkout runtime tests and build scripts do not execute any `@earendil-works/*` value import; installed Pi value imports are lazy and isolated to `extensions/council/lib/pi-runtime.ts` and the Pi executor.
Runtime Pi extension imports are verified to resolve installed Pi modules rather than repo-local type stubs despite `tsconfig.json` path mappings before any Pi-dependent phase lands.
Phase 4 cannot land Pi model execution until `npm run verify:pi-surface` passes against installed Pi and verifies the provider-specific effort option types used by `toPiEffortOptions`.
Phase 4 also cannot be considered complete until `docs/public/council-pi-surface-gate.v1.json` is committed, git-tracked, uses exactly `PI_SURFACE_GATE_FILES_V1`, has `status: "verified"`, and both default and `--strict-verified` `scripts/check-council-pi-gate.mjs` checks pass in clean checkout.
The README and surface artifact state day-one Pi direct support for installed Pi `0.80.10` and `0.80.x`, and unsupported newer minor versions disable Pi direct routes rather than relying on portable fallback.
Generic clean-checkout checks may pass a current `pending_pi_regeneration` artifact to unblock ordinary edits, but final Phase 4, release tags, and default-branch refs intended for `pi install git:` require `status: "verified"`.
Pi direct route discovery and execution enforce the strict verified artifact at runtime and keep Pi direct routes unavailable with `pi_surface_not_verified` until that gate passes.
Pi direct route discovery and execution compare live installed Pi package versions against the verified artifact's compatible ranges, keep Pi direct routes unavailable with `pi_runtime_version_mismatch` outside those ranges, and require the no-model runtime sanity check for in-range non-exact versions.
When Pi drift disables Pi direct routes, the system uses a portable `provider-invoke` route only after no-cost route discovery verifies it is available and authorized and the roster explicitly selects it.
When no verified authorized portable replacement is selected, Run is blocked with an actionable compatibility error, the selected route is not silently changed, and Pi direct compatibility is not claimed.
Package creation runs the same strict Pi execution gate through `prepack` when Pi direct execution files exist, but end-user Pi installs are protected by runtime route gates rather than by `prepack`.
Pi supported efforts are normalized through the exact installed Pi thinking-level table and any unknown or empty raw level list makes the route unavailable until the mapper is updated.
Pi direct execution maps effort per provider API and never assumes that every model accepts `reasoningEffort`.
Real Pi effort honoring and concurrent mixed-effort support are claimed only after `npm run verify:pi-effort-live -- --write-artifact` passes against a qualifying real reasoning route and the live-effort artifact matches the end user's Pi package versions.
Until the live-effort artifact is verified and version-matched, Pi direct model calls run serially even when the global `maxConcurrency` is higher.
Portable execution uses the existing `bin/provider-invoke --effort` flag only after route validation confirms the exact selected effort is supported.
Portable Claude effort support records wrapper-contract provenance and the current supported list `low`, `medium`, `high`, `xhigh`, and `max` only after the fake argv contract proves pass-through behavior.
Unsupported remembered efforts block before portable invocation and are never delegated to adapter-level clamps.
Council structured validation is TypeScript-native and does not require `python3` or spawn `bin/lib/json_extract.py` at runtime.
Only the engine may set ledger `grounded`; model outputs cannot self-certify grounding, and every critique, steelman, or adversary `evidenceIds` reference must resolve to the ledger.
Decision readiness `ready` requires grounded ledger evidence, not model-provided locator prose or fabricated ids.
Issue input is normalized, line-numbered, and prompt-addressable as immutable `issue:Lx-Ly` evidence so issue councils can produce grounded ledger evidence.
Every model voice in the final report corresponds to an explicit roster entry.
The host model is not used as a hidden chair, summarizer, or vote.
The reviewed plan file is never modified.
The final report includes recommendation, evidence, strongest dissent, assumptions, risks, what would change the recommendation, phase findings for critique, steelman, and adversary, decision readiness, next action, and `implementation_authorized: false`.
The final report explicitly says council completion does not authorize implementation.
The engine forces `implementation_authorized: false` during final assembly and treats a chair model's wrong or missing authorization field as a normalized diagnostic, not as an authorization source.
Deterministic, structured disagreement, and chair synthesis all consume `CouncilSynthesisBriefV1` plus an explicit `CouncilAdversaryOutputV1[]`, `CouncilSynthesisBriefV1` has no `adversaryOutputs` field, and none of those strategies may discard successful critique, steelman, or adversary output.
Existing `/synthesis`, `--solo`, `--compare`, and `revisit` behavior remains compatible.
Track A toolchain, Track B provider hardening, and Track C council product remain separately reviewable and mergeable, and Track C cannot depend on an unaccepted Track A or Track B gate.
Council reports are written only under `./.ai-synthesis/council-sessions/` in the MVP and do not appear in the legacy `/synthesis` session glob.
Portable CLI invalid roster files fail before execution with the specified exit codes and without writing config or reports.
Portable `--roster-file` execution is read-only and never rewrites the supplied file; canonical portable writes happen only through `--emit-roster`.
Portable CLI `--emit-roster` gives non-Pi users a supported first-run roster authoring path and writes only validated runnable rosters with fresh opaque ids.
Portable CLI `--report-strategy` overrides the roster-file strategy for one run only and validates the effective strategy before execution.
Portable CLI legacy chair booleans, missing report strategies, and role-or-strategy migrations fail with exit `4` unless the user edits the roster or supplies an explicit one-run strategy that does not rely on legacy chair metadata.
The input parser uses the specified path-shaped predicate and treats a single bare non-file token as issue text.
Zero, one, and two-plus initial survivor paths take explicit tested state transitions.
One-survivor execution always emits a mechanical single-survivor report and never calls a chair model, even when the configured strategy is chair.
One-survivor execution uses the explicit `single_survivor_report` state and never calls or feeds the normal synthesis input contract.
One-survivor report frontmatter uses `report_strategy: single_survivor` and records the originally configured strategy separately.
The whole-run deadline is computed from scheduled phase budgets and cannot abort before valid scheduled work exhausts its budget.
The whole-run deadline uses the same `CouncilPhaseLanePlanV1` lane counts and `pi_concurrency_mode` that the scheduler uses; serial Pi-direct members are budgeted serially.
Serial Pi direct scheduling consumes one global concurrency slot and never exceeds `maxConcurrency` after portable overlap is counted.
Each malformed-output JSON retry shares the member's `memberTimeoutMs` budget and cannot extend either the member timeout or the whole-run deadline.
When the whole-run deadline expires, active member calls are aborted and the terminal report records `status: failed` with `reason: deadline_exceeded`.
`deadline_exceeded` takes precedence over single-survivor reporting even if one initial voice had already succeeded.
Issue-input position catalogs are generated by the specified grammar and covered by fixtures for ordinary prose and explicit alternatives.
Free-form issue input with no extracted explicit alternatives defaults recommendations to structured disagreement unless the user selects a chair or explicitly chooses deterministic synthesis.
Every initial prompt contains the frozen position catalog bytes and prompt hashes cover those bytes.
Deterministic synthesis groups only by engine-assigned `canonicalPositionId` from a frozen position catalog.
Critique-phase prompts include the frozen assumption review catalog, and critique validation rejects any assumption review keyed to an id outside that catalog.
Deterministic readiness uses the specified `materialDissent` predicate and critique-phase assumption reviews, not an unscheduled phase or model-prose similarity.
Structured disagreement synthesis is mechanical and does not call a model; a model-written synthesis requires an explicit chair strategy.
Repository-wide pre-PR checks are made install-aware in the same commit that introduces `package.json`.
Tracked `.pipelane.json` is not the active gate for the installed Pipelane version, so Phase 1 does not depend on editing it.
`package.json` lifecycle scripts make the active `npm run test`, `npm run typecheck`, and `npm run build` checks install-aware because installed Pipelane executes those commands directly.
`scripts/verify-pipelane-prepr.mjs` records and proves both active machine-local and empty-`PIPELANE_HOME` synthesized Pipelane checks through tracked `docs/public/pipelane-prepr-checks.v1.json`.
`npm run test` also runs `scripts/check-council-pi-gate.mjs` when present so skipped Pi-present verification is detectable after Pi execution files exist.
The install-aware npm-script checks remain green when executed through `sh -lc` in a clean checkout.
The package-install bootstrap uses `scripts/ensure-node-deps.mjs` and `npm ci --prefer-offline --no-audit --fund=false`, and Phase 1 does not land if that command cannot run in the implementation runner.
Every fresh checkout runner for the recurring pre-PR gate has npm registry access or a prewarmed npm cache satisfying `package-lock.json`; otherwise bootstrap fails loudly with `DEPENDENCY_INSTALL_UNAVAILABLE` and remediation instead of skipping checks.
Normal Phase 2+ rollback keeps Track A green; full-abandonment rollback may remove Track A only with a same-change green Pipelane gate.
Clean-checkout npm checks do not require installed Pi packages.
Pi-present surface checks remain outside generic clean-checkout CI but are required before Pi-dependent phases land.
The full hermetic fake conformance suite, TypeScript unit suite, clean-checkout npm commands, and install-aware pre-PR commands pass without installed Pi packages, provider CLIs, provider auth, or model-network access, and Pi-present surface checks pass where Pi is installed.

## Rollout And Evaluation

Ship `/council` behind optional Pi package installation only.
Dogfood first with `pi -e ./extensions/council/index.ts`, `/council --self-test`, and then `pi install ./` after fake route tests pass.
Before live smoke, validate `tests/conformance/run.sh hermetic`, effective installed-Pipelane `prePrChecks` through `sh -lc`, `npm ci --prefer-offline --no-audit --fund=false`, `npm run verify:pi-surface`, `npm run test`, `npm run typecheck`, and `npm run build`.
When validating recurring Pipelane checks, record registry versus prewarmed-cache status and stop on `DEPENDENCY_INSTALL_UNAVAILABLE`.
Before Phase 4 Pi execution acceptance, replace any pending surface artifact with verified `docs/public/council-pi-surface-gate.v1.json`, run `scripts/check-council-pi-gate.mjs` in clean checkout, run `npm run verify:pi-execution-release`, and confirm `npm pack --dry-run` reaches `prepack`.
Before claiming concurrent Pi direct execution, run `npm run verify:pi-effort-live -- --write-artifact`; also dogfood the missing-artifact path to confirm serial `pi_concurrency_mode`.
Treat `tests/conformance/run.sh all` as provider-present integration only, then live-smoke one plan, one issue, one same-model roster, and one cross-family roster.
Record recommendation edits, canceled menus, failed runs, and degradation counts, but do not auto-optimize recommendations or extend `revisit` until council reports have outcome data.

## Documentation

Update `README.md` with optional `/council` install, Pi-native versus portable fallback, global/project-local `pi install`, `pi remove`, local report retention, day-one Pi `0.80.10` and `0.80.x` support, and per-minor artifact regeneration.
Document prerequisites: Pi git installs use production dependency installation, end-user safety is runtime route gating rather than `prepack` or `prepare`, `prepack` is maintainer-only, Node `>=22.19.0` is for contributors and portable CLI users, and there is no Python runtime dependency.
Document clean-checkout and Pipelane gates: installed Pipelane ignores tracked `.pipelane.json`, resolves machine-local or synthesized checks through `PIPELANE_HOME`, Phase 1 lifecycle scripts run `npm ci --prefer-offline --no-audit --fund=false` when needed, and missing registry/cache fails with `DEPENDENCY_INSTALL_UNAVAILABLE`.
Document homes and config: `AISYNTH_HOME`, `AISYNTH_CONFIG_HOME`, `PI_CODING_AGENT_DIR`, Pi `getAgentDir()`, user-global/project/explicit scopes, pre-`routeId` and stale-`routeId` migration, legacy chair migration or portable refusal, duplicate-id quarantine, future-version backup, and atomic no-overwrite writes.
Document input examples `/council plan.md`, `/council @plan.md`, `/council fix plan.md`, and `/council caching`, plus two-member minimum, family diversity as non-gating feedback, chair identity authority, and shared `validateRoster()`.
Document Claude subscription-only behavior, no Anthropic API fallback, credential denylist, `ANTHROPIC_BASE_URL` allowlist, token-only login-required failure, `/synthesis` auto preservation, and Pi direct OAuth/subscription guard before `complete()`.
Document effort and routing: provider-specific `toPiEffortOptions`, exact Pi thinking-level normalization, fail-closed unknown or empty levels, no Pi clamp, portable Claude effort provenance, billing labels, route cost limits, and no paid probes.
Document Pi gates: clean-checkout import isolation, repo-local stubs as compile-only, Pi `jiti` alias probe, `verify:pi-surface`, `pi -e`, `pi_runtime_version_mismatch`, explicit portable replacement after drift, surface artifact fields, `pending_pi_regeneration`, `--strict-verified`, `verify:pi-execution-release`, and `prepack`.
Document live-effort concurrency with `docs/public/council-pi-effort-live.v1.json`, required env vars, exit `77`, serial fallback, `pi_concurrency_mode`, and fake option tests versus real no-bleed claims.
Document execution and output: cancellation, reload, session replacement, zero/one/two-plus survivor transitions, `single_survivor_report`, deadline formula, retry budgets, terminal reports, rollback scope, no plan modification, no implementation authorization, council session directory, portable roster flags, exit codes, and JSON diagnostics.
Document deterministic synthesis and evidence semantics: position catalogs, `other:<slug>`, assumption catalog, engine-owned `plan.md:Lx-Ly` and `issue:Lx-Ly` grounding, evidence ids, phase evidence validation, free-form issue structured-disagreement default, readiness, `materialDissent`, mechanical structured disagreement, and synthesis input contracts.
