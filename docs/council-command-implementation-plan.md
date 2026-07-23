# Council Command Implementation Plan

This plan covers the optional, user-installed `/council` capability for `ai-synthesis`.
It is an implementation plan only and does not implement the capability.
The design keeps `/council` as personal `ai-synthesis` customization and does not require any Firstmate repository or default behavior change.

## What Already Exists

`README.md` describes `ai-synthesis` as a Claude Code skill symlinked into `~/.claude/skills/synthesis`.
`SKILL.md` is the current `/synthesis` orchestrator and keeps orchestration in the skill file.
`SKILL.md` resolves `AISYNTH_HOME` from the skill directory and writes project-local sessions under `./.ai-synthesis/sessions/`.
`SKILL.md` supports `/synthesis <decision>`, Pi-style `@file`-like context, `--solo`, `--compare`, `rate`, `revisit`, `expand`, `list`, and `resume`.
`SKILL.md` `expand` and `list` scan `./.ai-synthesis/sessions/*.md`, while `rate` writes to the latest or matching session and `revisit` skips only `mode: compare`.
Council reports must not share that legacy glob until those commands filter or tolerate `mode: council`.
`SKILL.md` already defines independent initial analysis, shared evidence ledger construction, failed-voice degradation, adversarial review, decision grading, and frontmatter outcomes.
`roles/analyst.md`, `critic.md`, `steelman.md`, `synthesizer.md`, `adversary.md`, and `solo.md` provide reusable prompting concepts.
`schemas/analyst.json`, `critic.json`, `steelman.json`, `adversary.json`, and `solo.json` enforce `ok: true`, provenance, cruxes, gaps, and objections.
`bin/provider-probe` performs a no-cost binary and authentication check for `claude` or `codex` and emits the normalized provider envelope.
`bin/provider-invoke` runs `claude` or `codex` and emits `ok`, `status`, `provider`, `model`, `structured`, `text`, `error`, and `meta`.
`bin/provider-invoke --help` exposes `--auth <auto|subscription|apikey>` and `--effort <low|medium|high|xhigh|max>`.
`bin/provider-invoke` parses `--auth` and `--effort`, exports `A_AUTH` and `A_EFFORT`, and rejects unknown top-level flags through `aisynth_die_usage`.
`bin/provider-invoke` does not validate effort semantics; `bin/adapters/codex.sh` maps `max` to `xhigh` and clamps unknown efforts to `medium`.
`bin/adapters/claude.sh` already consumes `A_AUTH=auto|subscription|apikey`, but `bin/provider-probe` does not currently expose a CLI flag to set `A_AUTH`.
`bin/adapters/claude.sh` unsets known Claude credential variables only when its first-party-session branch is active.
`bin/adapters/claude.sh` omits `ANTHROPIC_OAUTH_TOKEN` from that auto-mode unset list, and `/council` will preserve that `/synthesis` behavior.
Installed Pi's `env-api-keys.js` treats `ANTHROPIC_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` as Anthropic credentials, so explicit council subscription sanitizing must still delete `ANTHROPIC_OAUTH_TOKEN`.
`bin/adapters/claude.sh` defaults to subscription-preferred auto mode and can fall back to `ANTHROPIC_API_KEY`, which `/council` must avoid for Claude routes.
`bin/adapters/claude.sh` passes `A_EFFORT` directly to `claude --effort "$A_EFFORT"` without adapter-level validation, mapping, or clamping.
`bin/adapters/claude.sh` currently invokes Claude with `--tools ""`, `--permission-mode dontAsk`, `--no-session-persistence`, `--strict-mcp-config`, `--setting-sources local`, and `--disable-slash-commands`.
The installed Claude CLI help advertises `--effort <level>` values `(low, medium, high, xhigh, max)`, enabling no-paid help parsing plus fake argv pass-through proof.
`bin/adapters/codex.sh` maps `max` to `xhigh` for `/synthesis`, but `/council` must not silently clamp remembered effort values.
`bin/lib/json_extract.py` provides the existing provider-layer tolerant JSON extraction algorithm and minimal JSON Schema subset for model text that is not provider-enforced.
`bin/lib/json_extract.py` is small enough to port to TS, so `/council` avoids a Python runtime dependency.
`bin/lib/frontmatter_set.py` remains for existing rating and revisit flows; council report frontmatter must be written TS-natively in `extensions/council/lib/report.ts`.
`tests/conformance/run.sh` supports the exact current targets `unit`, `claude`, `codex`, and `all`, with `all` running unit, Claude, and Codex suites.
The current `claude` and `codex` suites include live provider probe or smoke sections before their fake-only branches, so the current `all` target is not a hermetic clean-runner gate when real provider CLIs or auth are absent.
`tests/conformance/fakes.sh` provides fake CLIs for deterministic auth, timeout, malformed, retry, and argv tests.
`.gitignore` ignores `/docs/*` except `/docs/public/`, so this plan and later non-public implementation docs must be added with `git add -f`.
`.pipelane.json` declares the three npm `prePrChecks`, but installed Pipelane ignores repo-local config through `readPackageJsonOverlay()`.
Installed Pipelane `src/operator/commands/pr.ts` runs `prePrChecks` serially with `runShell(...)`, and `src/operator/state.ts` runs each as `sh -lc <check>` without `npm ci`.
Installed `resolveWorkflowContext(cwd)` loads machine-local config or `defaultWorkflowConfig()`; `pipelaneHomeDir()` honors `PIPELANE_HOME`.
Machine-local config `/Users/josephkim/.pipelane/repos/243e6e4a17556acb3aa7996c/config.json` uses the same npm checks, and no `package.json` is a known red baseline.
Because `runShell()` throws on failed `prePrChecks`, those checks block if installed Pipelane `/pr` is the merge path; Track A follows only after that path is confirmed.
The task shell reached npm, but Pipelane has no install or network guarantee, so Phase 1 must make `test`, `typecheck`, and `build` install-aware.
Inspected Pipelane source version is `0.2.0`; treat observed private execution shape as version-pinned, not an API.
Pi documentation under `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/` supports the required optional package path.
Verified Pi surface: `@earendil-works/pi-coding-agent` `0.80.10`, nested `pi-ai` and `pi-tui` `0.80.10`, Node `>=22.19.0`.
Installed Pi `0.80.10` clones git packages and runs `npm install --omit=dev`, so `/council` must not use `prepack` or `prepare` as an install gate.
Pi package resources use a `package.json` `pi` key or conventional `extensions/`, `skills/`, `prompts/`, and `themes/` directories.
Pi extension commands use `pi.registerCommand(name, { description, handler, getArgumentCompletions })` and outrank input events, skills, and prompts.
Native Pi `/council ...` will therefore be an extension command.
Pi native UI belongs behind `ctx.mode === "tui"` because `ctx.ui.custom()` is not available in RPC, JSON, or print modes.
Pi provides `ctx.ui.custom()`, `SelectList`, `SettingsList`, `BorderedLoader`, `DynamicBorder`, `keyHint`, `getSettingsListTheme()`, and width utilities.
Pi requires custom component `render(width)` output lines not to exceed `width`.
Pi state that will survive reloads inside a session can be appended with `pi.appendEntry(customType, data)` and restored by scanning `ctx.sessionManager.getBranch()`.
Pi user-global config locations must be derived with `getAgentDir()` and project config directory names with `CONFIG_DIR_NAME`, not hardcoded as `~/.pi/agent` or `.pi`.
Pi model discovery uses `ctx.modelRegistry.getAll()`, `getAvailable()`, `find()`, `hasConfiguredAuth()`, `getProviderAuthStatus()`, `getApiKeyAndHeaders()`, and `isUsingOAuth()`.
Pi model effort support is exposed by `getSupportedThinkingLevels(model)` from `@earendil-works/pi-ai`.
Installed Pi `0.80.10` defines CLI thinking levels as `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`.
Installed `@earendil-works/pi-ai` `0.80.10` defines `ModelThinkingLevel`, returns `["off"]` for non-reasoning models, filters levels, and has `clampThinkingLevel()`.
Council must normalize thinking levels itself and never clamp remembered efforts.
Pi direct model execution can use `complete(model, context, options)` from `@earendil-works/pi-ai/compat` after resolving auth with `ctx.modelRegistry.getApiKeyAndHeaders(model)`.
The installed `complete()` declaration accepts open `ProviderStreamOptions`, so compiling `complete(..., { reasoningEffort })` does not prove a provider honors that option.
Installed Pi option types expose `reasoningEffort` for OpenAI Responses/Codex and `effort` for Anthropic, so the Pi executor needs provider/API-specific effort mapping.
Pi session replacement and reload invalidate old contexts, so council must abort active work on `session_shutdown` and use replacement contexts in `withSession`.
The installed Pi extension loader in `dist/core/extensions/loader.js` creates `jiti` with Pi-owned aliases for `@earendil-works/*` packages rather than relying on the caller repository's `tsconfig.json` path mappings.
A Pi `0.80.10` loader probe with fake `tsconfig` aliases still resolved installed modules and `.pi`, so `pi -e` did not let repo-local stubs shadow Pi.
The `pi -e` self-test remains a hard gate because an installed Pi loader or packaging behavior change could still alter runtime resolution later.

## Goals

Provide first-ship review through portable `bin/council`; add `/council ...` only after the Pi command or Claude skill is installed.
Provide a portable CLI fallback that runs the same TS engine through Node without claiming Pi's native roster menu.
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
Execute prompt-isolated initial analyses before any member sees another member's output.
Same-model or same-route members are valid MVP councils but must be labeled correlated, not diverse.
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

The recommended Pi install command is `pi install git:github.com/jokim1/ai-synthesis@<tag-or-commit>` once the package exists.
Project-local installation is supported with `pi install -l git:github.com/jokim1/ai-synthesis@<tag-or-commit>` for users who want `/council` only in a project.
The package will eventually expose Pi extension command `council` and, after coexistence proof, skill `council`.
The Pi extension command will render the polished roster editor only when `ctx.mode === "tui"`.
In Pi RPC mode, `/council` will use dialog methods or a non-interactive fallback and never call `ctx.ui.custom()`.
In Pi print or JSON mode, `/council` will run only when enough input and a valid saved roster exist, otherwise it will print a usage error with no UI claim.
The portable CLI may require Node and package dependencies, and its missing-runtime error will name the exact command to run, such as `npm install` from the package root.
Non-Pi first ship uses `bin/council` plus JSON; skill waits for proof.
Post-MVP empty-input Pi TUI behavior is specified by the companion.
`bin/council` with empty input outside Pi TUI will return usage and exit without creating or changing config.
`/council @plan.md` will treat `plan.md` as the reviewed plan file when it resolves to a readable regular file under an allowed root.
`/council plan.md` will treat `plan.md` as the reviewed plan file only when the entire argument resolves to one readable regular file.
`/council fix the deployment plan` will treat the argument as issue text even though it contains words that could be filenames.
`/council notes plan.md` will treat the whole argument as issue text unless `plan.md` is explicitly marked with `@`.
For input parsing, after one leading `@`, path-shaped means absolute, `.`, `~`, separator, plan extension, or any existing filesystem entry before readability checks.
The parser will apply the path-shaped predicate only to a single-token full argument or to an explicit `@candidate`; mixed unmarked text remains issue text.
The parser will treat a single bare token such as `caching` as issue text when it does not resolve on disk and is not path-shaped by the rule above.
Unreadable path-shaped input will produce a clear validation error rather than silently falling back to issue text.
Bare `@word` will remain issue text when it is not path-shaped and does not resolve to a readable file.
Multiple explicit `@` files are rejected for MVP with a one-issue-or-plan message.
The roster screen will show a left list of roster entries and a right composition panel.
Each roster row will show route label, provider/model, role, effort, auth or billing badge, availability, and whether it is executable.
Unavailable remembered entries will remain in place, dimmed, with the original effort and a suggested replacement route or effort.
Unsupported remembered efforts will show the remembered effort verbatim and a suggested valid effort, never an automatic replacement.
The composition panel will show role coverage, model and family diversity, independent voices, effort allocation, context-window fit, estimated latency and cost, availability, and final report strategy.
Composition feedback will use warnings and suggestions, not gates, except for the practical validity minimum.
The roster editor keymap will use arrows, add/edit/delete/reorder/reset/run/cancel keys, and Pi `keyHint()` labels.
The roster editor will render key labels through Pi `keyHint()` or local equivalents so customized keybindings remain understandable where Pi exposes them.
The Run action is disabled until the shared `validateRoster()` result reports at least two executable members and a valid final report strategy.
A `chair` final report strategy is valid for Run only when the shared `validateRoster()` result proves `chairEntryId` references an enabled executable roster entry whose role is exactly `chair` and whose route and effort are available.
If the remembered chair is disabled, unavailable, missing, or unsupported, the editor keeps the strategy invalid until edit, strategy switch, or reset before Run.
The Cancel action will close the menu without writing the roster config.
The Reset action will replace the editable draft with current recommendations while keeping a visible "undo by Cancel" path.
The Run action will atomically persist the full confirmed roster draft, including visible unavailable remembered entries, then start execution.
Execution will show a `BorderedLoader` with phase, completed member count, elapsed time, and an Escape cancellation hint.
Cancellation after Run will abort active model calls, write a canceled session entry if any work started, and keep the already-confirmed roster config.
The final report will explicitly say that council completion does not authorize project implementation.

## Architecture

Ship a portable Node-backed council first from the `ai-synthesis` package as `bin/council`.
Deliver Pi's native `/council` menu only in post-MVP work after portable usefulness is proven.
The user-facing council install is user-level tooling, so it must never add `package.json`, dependencies, Pipelane config, or any other footprint to the repository being reviewed.
Use a shared council engine library for state machine, prompt assembly, validation, degradation, recommendation, and report generation.
Use `extensions/council/lib/validate-roster.ts` as the source of truth for executable members, unsupported effort, two-member minimum, composition feedback, and report strategy before Phase 5.
Use executor implementations to keep route identity separate from provider/model identity.
Use the existing provider layer only as a model executor behind the shared TS engine for portable CLI routes and non-Pi fallback.
Do not make the Pi extension shell out to `pi` itself.
Do not change the current `/synthesis` orchestration in `SKILL.md` except for documentation links if desired later.

The authoritative package shape is the phased file list in `Exact File-Level Changes`.
Governed companion index:

| Companion | Status | Main-plan contract |
|---|---|---|
| `docs/council-command-post-mvp-pi-companion.md` | Deferred until after portable MVP ship and refreshed plan review | Owns Phase 3C Pi package and TUI, Phase 4 Pi direct execution, Phase 7 parallel Pi direct proof, and post-proof `skills/council/SKILL.md`; none of these are first-MVP acceptance gates. |

Noted design choices from the stop-loss review:

| Choice | Decision |
|---|---|
| Toolchain path and gate scope | Track A `package.json` is the default and only planned first implementation path for the `ai-synthesis` repo's own toolchain; `NoPackageTrackCPlanV1` is a documented contingency activated only if the upfront Track A preconditions fail before package metadata lands. |
| Portable remembered roster | The portable remembered roster lives at `${AISYNTH_CONFIG_HOME:-$HOME/.ai-synthesis}/council/roster.v1.json`; a confirmed portable Run writes a canonical copy there atomically, while any supplied `--roster-file` remains read-only. |
| Same-route no-added-value exit | After two prompt or recommendation revisions, repeated `correlated_no_added_value` on same-route-only samples becomes a disclosed correlated-council condition rather than an implementation blocker when no authorized independent route is available. |

Final Claude stop-loss residual notes:

| Residual | Recorded implementation disposition |
|---|---|
| Correlated runtime readiness | Engine-level synthesis must cap all single-route or single-lane councils at `conditional`, not only the ship gate. |
| Subscription env scrub blast radius | Full `ANTHROPIC_*` scrubbing is council-scoped through an explicit council marker; non-council `provider-invoke --auth subscription` behavior is characterized and preserved unless separately reviewed. |
| Package classifier fail-open | Docs-only and legacy shell-only paths get a base-independent allowlist path before npm install, and unresolved or suspicious base refs fall back to full checks only for Node-surface uncertainty. |
| Phase 2C scope | Phase 2C is split into green sub-slices that can merge independently. |
| `bin/council --self-test` | `--self-test` is a no-model runtime contract command returning `CouncilRuntimeContractReport`. |

Phase 1 `package.json` is a portable toolchain baseline for the `ai-synthesis` repository's own implementation and review workflow, not an installation requirement for user repositories.
The council package may review arbitrary project repos without creating or editing their package metadata.
Phase 1 `package.json` must omit the Pi `pi` manifest and Pi peers until deferred Phase 3C.
Clean-checkout TS checks for the portable MVP must not need repo-local Pi stubs or `@earendil-works/*` path mappings.
Phase 1 must add only a portable import-isolation check that fails if portable CLI, engine, route, config, report, or test modules import `@earendil-works/*` values.
Deferred Pi package, UI, direct-execution, surface-artifact, and live-effort contracts live in `docs/council-command-post-mvp-pi-companion.md`.
Those deferred contracts are not exported from the Phase 2C portable engine and are not portable-first blockers.
`package.json` will include runtime dependencies needed by the portable Node wrapper, including `jiti` if the CLI loads TS sources directly.
`package.json` scripts `test`, `typecheck`, and `build` are meaningful for the files present in the current phase and stay green when `package.json` is introduced.
Adding `package.json` is a deliberate repo-wide gate change, not only an optional runtime install detail.
Track A hard preconditions are confirmed installed Pipelane `/pr`, no shared CI or collaborator Pipelane homes inheriting the npm gate, and owner-accepted rollback.
Run those preconditions once before implementation; if they pass, implement only Track A and leave `NoPackageTrackCPlanV1` as a contingency document.
If any precondition fails before package metadata lands, activate the approved no-package fallback and remove package-bootstrap extras from active scope.
Phase 1 step zero must prove the actual Pipelane pre-PR runner can execute the candidate npm bootstrap before `package.json` lands.
`scripts/verify-pipelane-prepr.mjs --bootstrap-smoke` will create a throwaway checkout, no `node_modules`, and run exact Pipelane `sh -lc 'npm run test'` for active and empty temporary `PIPELANE_HOME`.
That smoke must record Node, registry, cache, network/cache result, install stamp behavior, and whether `npm ci --prefer-offline --no-audit --fund=false` succeeded outside the interactive task shell.
Only after that smoke succeeds may Phase 1 commit install-aware npm scripts where `test`, `typecheck`, and `build` call `node scripts/run-package-check.mjs <script>` instead of relying on npm `pre*` lifecycle scripts.
`scripts/run-package-check.mjs` first performs changed-surface classification before `ensure-node-deps.mjs`.
For docs-only and plan-only diffs it prints `CHECK_SKIPPED_NON_NODE_SURFACE` and exits `0`.
For legacy shell-only diffs, including existing `/synthesis` shell surfaces, `test` runs dependency-free `bash -n` plus `tests/conformance/run.sh unit`, while `typecheck` and `build` print `CHECK_SKIPPED_NON_NODE_SURFACE`.
For Node, package, council extension, schema, role, TypeScript test, conformance, and council-public-governance diffs, `scripts/run-package-check.mjs` runs `scripts/ensure-node-deps.mjs` and then the underlying phase command.
If registry/cache access fails before package metadata lands, Track A must not commit `package.json`; activate the approved no-package recipe with `bash -n` over shell files and `tests/conformance/run.sh unit`.
Do not add alternate npm tarball or per-home outage mechanisms in MVP; failed package preconditions recover only through the tracked no-package contingency.
The no-package fallback must be applied to configurable `${PIPELANE_HOME:-$HOME/.pipelane}` or accepted as the active bypass before Track B or C product code merges.
`NoPackageTrackCPlanV1` approves type-stripped TS only after `node --help` shows `--experimental-strip-types`; validation is `node --experimental-strip-types --test tests/council/**/*.test.ts`, hermetic conformance, and `bash -n`; rollback deletes Track C files only.
If that capability probe fails, the captain's choices are package-deferred, package-alternative, or no-package-JS rewrite; implementers must not invent another path inside council implementation.
The no-package fallback is a contingency for this repo's owner-controlled Pipelane homes, not a parallel deliverable for fresh clones or shared CI while Track A remains viable.
Fresh owner clones restore no-package Pipelane state with `node scripts/apply-pipelane-no-package-prepr.mjs --verify` only after fallback activation.
Before relying on Track A, `scripts/verify-pipelane-prepr.mjs` must record those hard preconditions and fail closed when any are unknown or false.
After Track A, rerun and recommit it on Pipelane version change, new `PIPELANE_HOME` or collaborator, shared CI addition, or registry/cache policy change.
Track A owner acceptance includes permanent Pipelane-version and network/cache dependency for all future PRs.
After package metadata lands, `ensure-node-deps.mjs` will fail with `DEPENDENCY_INSTALL_UNAVAILABLE`, registry/cache diagnostics, `npm ci` remediation, and no fake stamp when the recurring runner precondition disappears.
Contributor docs must state that `package.json` and `package-lock.json` drift makes all npm scripts fail until the lock is repaired.
Phase 1 verification must cover a cache-hit run that avoids network and a cache-miss failure path; fallback validation runs only if the upfront precondition chooses `NoPackageTrackCPlanV1`.
Phase 1 will add a new `tests/conformance/run.sh hermetic` target before package scripts start depending on Node test tooling.
The `hermetic` target will run `unit` plus fake-only Claude and Codex cases, will make no live `provider-probe` or `provider-invoke` calls against real provider binaries, and will pass with real `claude` and `codex` absent from `PATH`.
The existing `tests/conformance/run.sh all` target may remain a provider-present integration gate that includes live no-cost probes and smoke checks.
Phase 1 must prove `npm run test`, `npm run typecheck`, and `npm run build` pass through the same `sh -lc` execution shape Pipelane uses in a clean checkout with no preexisting `node_modules`.
Phase 1 will also record the effective installed-Pipelane config source used for that verification: machine-local config path when present, otherwise synthesized defaults from the current checkout.
If `npm ci --prefer-offline --no-audit --fund=false` lacks registry or cache access, Phase 1 must use the no-package recipe or record a new dependency strategy before package scripts.
This install-aware npm-script shape is intentionally known-good after package metadata exists and does not depend on tracked `.pipelane.json` for active Pipelane behavior.
Phase 1 must not add tracked `.pipelane.json` references to `verify:pi-surface` or require Pi-present checks.
Phase 1 will add `scripts/check-council-portable-imports.mjs` as a dependency-free check that fails any portable MVP module or clean-checkout runtime test importing `@earendil-works/*` values.
Owner decision: first ship is portable-first and `bin/council`-only.
The first shippable MVP is Track A plus Phase 2B, Phase 2C, Phase 5, and minimum Phase 6 docs, with authorized portable routes.
Post-MVP Pi UI starts only after the portable council ships, and Pi-registry-only execution remains outside MVP.
MVP docs and diagnostics must say authorized portable Claude/Codex routes are required.
Owner decision: same-model two-role councils are allowed for MVP under informed consent.
Composition feedback labels single-provider or same-route councils, recommends distinct families, and never hard-blocks for lacking diversity.
Owner decision: a failed Track A package/toolchain baseline does not block the TypeScript product.
If Track A fails, stop package-based implementation and activate the approved no-package fallback before any Phase 2C product-code merge.
If `NoPackageTrackCPlanV1` cannot run because the Node type-strip capability probe fails, escalate only that fallback-capability choice to the captain as package-deferred, package-alternative, or no-package-JS rewrite.
If council stalls after `package.json`, rollback removes Phase 2+ feature files but keeps the Phase 1 package baseline green.
Full abandonment may remove Track A only when the ai-synthesis maintainer applies the tracked no-package recovery recipe or keeps an equivalent tracked replacement gate green.
Users who only symlink the existing Claude Code `/synthesis` skill are unaffected at runtime because `SKILL.md` and the provider shell scripts must not require Node for existing flows.
A future post-proof portable skill, if shipped after `bin/council`, will use relative paths from its `SKILL.md` and never require Pi APIs.
`extensions/council/cli.ts` is the non-Pi entrypoint and will call the same input parser, config loader, route catalog, engine, and report writer as the Pi extension.
The shell `bin/council` is only a thin launcher that checks for Node, loads the TS CLI through `jiti` or the chosen runtime loader, and exits with clear setup instructions when dependencies are missing.
The shell `bin/council-route-probe` is only a thin launcher for `extensions/council/cli.ts route-probe --json`.
Do not create a second shell implementation of roster validation, phase orchestration, synthesis, cancellation, or reporting.
The council runtime dependency contract is Node `>=22.19.0` plus the package-local Node dependencies; it must not require `python3` in Pi or portable runtime paths.
`extensions/council/lib/runtime.ts` will verify Node, package root, loader, `provider-invoke --auth`, `provider-invoke --effort`, and planned `provider-probe --auth` before route execution.
It will also verify `CouncilProviderInvokeToolPolicyV1` before any council model call.
For Claude routes, that policy requires the inspected adapter argv to include `--tools ""`, `--permission-mode dontAsk`, `--no-session-persistence`, `--strict-mcp-config`, `--setting-sources local`, and `--disable-slash-commands`.
For Codex routes, the current verified surface is `codex exec -s read-only --json --`, which proves no writes but does not prove no shell/tool execution.
Codex council routes are unavailable with `tool_policy_unproven` until Phase 2C either adds a real tool-less Codex invocation contract or records captain acceptance of read-only-shell risk for council.
Captain has not accepted Codex read-only-shell risk; if no tool-less Codex contract lands, gates validate a labeled two-role same-route Claude council.
Missing startup contract requirements will disable Run in Pi TUI or exit `5` from the portable CLI after printing actionable setup diagnostics.
Do not add a runtime startup check for `bin/lib/json_extract.py` or `python3`, because council structured validation is TS-native.
The shell interface is:

```sh
bin/council --issue <text> --roster-file <path> [--report-strategy deterministic|structured_disagreement|chair:<member-id>] [--json]
bin/council --plan-file <path> --roster-file <path> [--report-strategy deterministic|structured_disagreement|chair:<member-id>] [--json]
bin/council --issue <text> --emit-roster <path> [--auth-policy subscription-only|default] [--overwrite] [--json]
bin/council --plan-file <path> --emit-roster <path> [--auth-policy subscription-only|default] [--overwrite] [--json]
bin/council --self-test [--json]
bin/council-route-probe --json [--auth-policy subscription-only|default]
```

`bin/council --self-test` performs no model calls, runs `CouncilRuntimeContractReport`, validates Node/package/loader/provider flag surfaces, exits `0` when `ok:true`, exits `5` when runtime requirements fail, and prints the report as JSON under `--json`.
The portable CLI execution path will load `--roster-file <path>` when supplied, otherwise it will load the portable remembered roster at `${AISYNTH_CONFIG_HOME:-$HOME/.ai-synthesis}/council/roster.v1.json`.
If neither a supplied roster file nor the portable remembered roster exists, execution exits `4` with `no_portable_roster` and prints the matching `--emit-roster <path>` command; it must not pretend to offer Pi's native editable menu.
The portable `--emit-roster <path>` path parses input, runs no-cost discovery, recommends, mints ids, chooses a valid strategy, validates, and writes atomically without model calls.
`--emit-roster` will write runnable roster configs with at least two executable members and a valid strategy; if only one executable route exists, it will emit two entries on that route with distinct recommended roles.
When no executable route can supply two supported entries, `--emit-roster` will exit `4`, print blocking route/auth/effort diagnostics, and write no file.
`--emit-roster` will refuse to overwrite an existing file unless `--overwrite` is supplied, will use exit `2` for path or overwrite usage errors, and will emit `{ "ok": true, "path": "...", "roster": ... }` under `--json`.
`--emit-roster` rejects any target whose resolved path equals a canonical remembered-roster path from active `CouncilConfigRootsV1`, covering `${AISYNTH_CONFIG_HOME:-$HOME/.ai-synthesis}`, Pi roots, overrides, and `.ai-synthesis`.
`--emit-roster` will never persist remembered-roster state.
Portable remembered-roster persistence happens only in `persist_roster` after `confirm_run`, never during `--emit-roster`, input validation, route discovery, or failed preflight.
When `--roster-file` exists but fails JSON parsing, schema validation, route reconciliation, supported-effort validation, two-member minimum validation, or report-strategy validation, `bin/council` will exit nonzero before execution.
The portable CLI will use exit code `2` for usage/input errors, `3` for roster JSON or schema errors, `4` for roster semantic validation failures, and `5` for runtime failures after execution starts.
For portable roster validation failures, stdout will contain either human-readable diagnostics or a JSON envelope under `--json`, no roster config is written, no report is written, and no deterministic or chair fallback will run silently.
When a portable roster file and `--report-strategy` are both present, the CLI flag will override the roster file's `reportStrategy` for this run only.
The override must not be persisted to the roster file unless a future portable editor explicitly saves it.
Portable `--roster-file` execution is read-only: it must never rewrite the supplied file for `routeId`, `updatedAt`, `scope`, legacy-chair stripping, report-strategy override, or any other canonicalization.
Portable canonical roster writes happen through `--emit-roster <path>` for explicit files and through `persist_roster` to the portable remembered location after confirmed Run.
The supplied `--roster-file` remains read-only even when its confirmed draft is copied to the portable remembered roster.
Pi user/project roster canonicalization happens only after post-MVP Pi Run.
The effective report strategy will still pass the same validation as a roster-file strategy, including requiring `chair:<member-id>` to reference an enabled executable member in the reconciled roster.
The final report diagnostics will record both `report_strategy_source: cli | roster_file | recommendation` and the effective report strategy.
Post-MVP Pi direct executor, effort-option, surface-gate, serial-lane, and live-effort proof contracts are defined only in `docs/council-command-post-mvp-pi-companion.md`.
The MVP engine must not import, export, or schedule Pi direct execution code.
Portable provider-invoke council execution will pass no model tools during council MVP.
The shared input loader will read plan files into immutable, line-numbered text and will instruct models to cite `plan.md:Lx-Ly` for `plan_line` evidence.
For issue input, the shared input loader will normalize the issue text once, freeze an immutable line-numbered issue block, and instruct models to cite `issue:Lx-Ly` for `issue_text` evidence.
The engine will accept issue text or immutable plan text, a confirmed roster, a route catalog, and an abort signal.
The engine will return a structured report object plus markdown.
The report writer will save markdown under `./.ai-synthesis/council-sessions/<id>.md` for MVP.
Council reports must not be written under `./.ai-synthesis/sessions/` until existing `/synthesis` session commands filter or tolerate `mode: council`.
Post-MVP Pi may append a custom Pi session entry named `ai-synthesis-council` with run id, input summary, status, and report path.
That custom Pi session entry must not be the source of roster persistence.

## Data And Config Schemas

Use TS types as the implementation source of truth and JSON schemas for model outputs.
Keep config versioned from day one.
Post-MVP Pi runtime resolves user-global roster roots with `getAgentDir()` and passes the resulting directory to shared config code.
Post-MVP Pi runtime resolves trusted project-local roster roots with `ctx.cwd` plus `CONFIG_DIR_NAME` and passes the resulting directory to shared config code.
Store non-Pi roster config under `${AISYNTH_CONFIG_HOME:-$HOME/.ai-synthesis}/council/roster.v1.json`.
The portable CLI will treat `--roster-file` as an explicit source file and never implicitly load Pi global or project-local roster files.
The portable CLI without `--roster-file` will use the portable global config and `CouncilConfigLocation.source: "portable_user"`.
The portable CLI with `--roster-file` will use `CouncilConfigLocation.source: "portable_explicit"` for diagnostics and will set `rememberedWriteTarget` to the portable global config for post-Run persistence.
Portable report frontmatter will record both `roster_source: portable_explicit | portable_user` and `remembered_roster_written: true | false`.
Pi config scope is `project` when the current project is trusted and the active council package was installed or configured from trusted project settings, otherwise `user`.
Detect project package scope from `import.meta.url` against trusted project package resources under `join(ctx.cwd, CONFIG_DIR_NAME)` and settings; otherwise use `user`.
When `project` scope is active and a valid project-local roster exists, it is the draft source of truth.
When `project` scope is active and no project roster exists, a valid user roster may seed the draft, but Run persists to project scope and labels "seeded from user roster".
When both user-global and project-local configs exist in a trusted project, do not merge fields; project-local config wins for the draft and user-global config is only advisory evidence for recommendations.
When the project is untrusted, ignore project-local roster config entirely and load only user-global config.
When a project-local config is corrupt, quarantine that project-local file and seed from recommendations; user-global config may influence recommendations but never silently replace the corrupt project draft.
Post-MVP Pi will keep Pi and portable stores separate but may seed a first-run Pi draft from the portable global roster when no Pi roster exists and no trusted project roster exists.
That draft must set `seededFrom: "portable-global"`, revalidate every route on the live Pi/provider catalog, preserve unavailable entries visibly, and persist to the Pi target only after Run.
Pi will never import an explicit portable `--roster-file`, will never mutate the portable global file, and will document one-way first-run seeding as convenience rather than synchronization.
Resolve the `ai-synthesis` package home from the running council code's `import.meta.url` first.
Use `AISYNTH_HOME` only as a fallback for the existing symlinked skill path or when the derived package root is unavailable, and reject any resolved home that lacks the expected council roles, schemas, and package version marker.
Never hardcode Firstmate paths.
Create config files with mode `0600` where the platform supports it.
Before post-MVP Pi Run persistence, re-stat and hash the loaded target; if it changed, skip the roster write with a concurrent-write warning rather than clobbering.
Before portable remembered-roster persistence, re-stat and hash the portable global target when it existed at load time; if it changed, skip the remembered write with `portable_remembered_concurrent_write` rather than clobbering.
Write accepted config atomically by writing `<file>.tmp.<pid>`, fsyncing when practical, and renaming over the target.
On corrupt config, preserve the corrupt file as `roster.v1.json.corrupt.<timestamp>` and start from recommendations.
On unwritable config, allow the current run to proceed after Run but warn that the roster could not be remembered.

Core TypeScript interfaces:

```ts
export type CouncilEffort = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export type CouncilExecutorKind = "provider-invoke";

export type CouncilAuthPolicy = "default" | "subscription_only";

// The CLI accepts --auth-policy subscription-only|default, stores JSON and TS
// as "subscription_only" | "default", and maps hyphen to underscore only at
// CLI parse and format boundaries.

export type CouncilConfigScope = "user" | "project" | "explicit";

export interface CouncilInputSnapshotV1 {
  kind: "issue" | "plan";
  displayName: string;
  text: string;
  lineMap: Array<{ line: number; startOffset: number; endOffset: number }>;
  sha256: string;
  sourcePath?: string;
  originalFileMeta?: { dev?: number; ino?: number; size: number; mtimeMs: number; realpath: string };
  onDiskChangedAfterSnapshot?: boolean;
}

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
  routeId: string;
}

export interface CouncilRoute {
  ref: CouncilRouteRef;
  displayName: string;
  family: string;
  providerDisplayName: string;
  supportedEfforts: CouncilEffort[];
  effortSupport: {
    source: "pi_model_registry" | "provider_invoke_help_cli_help_passthrough" | "provider_adapter_static" | "none";
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

Every role uses the shared initial prompt template plus a role-specific rubric string.
`architect` focuses technical fit, maintainability, integration risk, and migration cost.
`product-operator` focuses user workflow, rollout, support burden, and decision usefulness.
These two roles have no special later-phase scheduling in MVP except ordinary fallback selection.

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
  source: "pi_user" | "pi_project" | "portable_user" | "portable_explicit";
  rememberedWriteTarget?: string;
  seededFrom?: "user" | "project" | "portable-global" | "recommendations";
  writeGuard?: {
    kind: "future_version_preserve_required";
    originalPath: string;
    originalSha256: string;
    originalVersion: number;
  };
}

export interface CouncilConfigRootsV1 {
  cwd: string;
  portableConfigHome?: string;
  piUserAgentDir?: string;
  piProjectConfigDir?: string;
  trustedProject: boolean;
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
      | "input_context_overflow"
      | "stale_dogfood_roster_shape";
    entryId?: string;
    routeId?: string;
    message: string;
    suggestedRouteIds?: string[];
    suggestedEfforts?: CouncilEffort[];
  }>;
  compositionFeedback: Array<{ kind: "warning" | "suggestion"; message: string; entryIds?: string[] }>;
  reportStrategy: { ok: boolean; effective?: CouncilReportStrategy; source: "roster_file" | "cli" | "recommendation"; message?: string };
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

// Deferred Pi direct gate interfaces, including CouncilPiSurfaceGateV1,
// CouncilPiEffortLiveGateV1, and CouncilPiRuntimeGateResultV1, live only
// in docs/council-command-post-mvp-pi-companion.md.

export interface CouncilEmitRosterResultV1 {
  ok: true;
  path: string;
  roster: CouncilRosterConfigV1;
  routeProbe: CouncilRouteProbeEnvelopeV1;
}

export interface CouncilMvpLanePlanV1 {
  phase: "initial_analysis" | "critique" | "steelman" | "adversary" | "chair";
  memberTimeoutMs: number;
  maxConcurrencyGlobalCeiling: number;
  providerInvokeLanePolicy: "serial_same_account_by_default";
  providerInvokeLanes: Array<{ laneKey: string; memberCount: number; maxConcurrency: number; budgetMs: number }>;
  portableProviderInvokeMemberCount: number;
  phaseBudgetMs: number;
  effectiveConcurrency: number;
}

export interface CouncilExecutionIdentityV1 {
  routeId: string;
  configuredModel: string;
  resolvedModel: string | "unknown";
  modelResolutionSource: "explicit_route" | "provider_envelope" | "adapter_default_unreported";
}

export interface CouncilRunIntentV1 {
  version: 1;
  id: string;
  createdAt: string;
  expiresAt: string;
  inputSnapshot: CouncilInputSnapshotV1;
  rosterHash: string;
  routeCatalogHash: string;
  lanePlanHash: string;
  expectedRunMs: number;
  estimatedCostBucket: string;
  acceptStaleInputSha?: string;
  ackLongRunToken?: string;
}
```

`types.ts` will contain pure types only.
Runtime values `COUNCIL_EFFORT_ORDER` and `PI_THINKING_LEVEL_TO_COUNCIL_EFFORT` live only in `extensions/council/lib/effort.ts`; other modules import their value or `typeof` type from that file.

Pi direct artifact invariants are deferred companion contracts and are not MVP route-discovery inputs.

`routeId` must be a deterministic stable key with the form `v1:<executor>:<provider>:<model>`.
Portable provider-invoke discovery uses model id `adapter-default` when no `--model` is configured, passes no `--model`, and never tuple-reconciles that sentinel with Pi model routes.
Execution identity uses `{routeId, configuredModel, resolvedModel, modelResolutionSource}` so reports never confuse stable route keys with the model that answered.
Each component is NFC-normalized UTF-8 and percent-encodes every byte outside `[A-Za-z0-9._~-]`, and `routeId` must never include display name, cost, auth source, billing state, or availability.
V1 is the first shipped roster format, so both in-memory and on-disk v1 require `routeId`, `reportStrategy`, and no entry-level `chair` boolean.
The config load pipeline order is parse JSON, resolve location/scope, future-version guard, required-key and shape validation, duplicate or invalid-id quarantine, canonical validation, then route reconciliation.
Missing `routeId`, missing `reportStrategy`, entry-level `chair`, or role/strategy ambiguity marks a stale dogfood file corrupt for MVP and will quarantine rather than migrate.
Migration will fill missing `updatedAt` from the file mtime when available, otherwise from the current time with a diagnostic.
Canonical writes will never omit `routeId` or include an entry-level `chair` boolean.
Roster reconciliation will first match fresh routes by exact `routeId`, then by the same `(executor, provider, model)` tuple whenever the exact match fails.
If neither key matches, the remembered roster entry remains visible and unavailable with replacement suggestions.
Changing a route's display label, auth state, billing label, cost metadata, or effort support must not change `routeId`.
When tuple fallback succeeds for an entry that already had a mismatched `routeId`, the loader will keep the member available, emit a `route_id_mismatch` diagnostic, and rewrite the canonical `routeId` only after a confirmed Run.
`CouncilConfigLocation.scope` derived from the resolved write path is the authoritative config scope.
The config loader will set in-memory `CouncilRosterConfigV1.scope` from `CouncilConfigLocation.scope` only, never from the on-disk `scope` field.
No implementation call site will read the on-disk `scope` field after load normalization; it exists only to support diagnostics and canonical rewrite after Run.
The on-disk `scope` field is compatibility metadata only; when it disagrees with the resolved location, the loader will warn, use the resolved location's scope, and overwrite the field on the next successful Run persistence.
Report frontmatter `config_scope` will always come from `CouncilConfigLocation.scope`, not from the file contents.
In a trusted project with no project roster, a user-global roster may seed the draft, but `CouncilConfigLocation.scope`, report `config_scope`, and persistence target stay project-local; `seededFrom` records origin.
Portable `--roster-file` always resolves to `scope: "explicit"` regardless of any in-file `scope`.
`CouncilRosterEntryV1.id` is an opaque generated id with the form `entry_<26 lowercase base32 chars>` derived from 128 bits of randomness, not from route, provider, model, role, order, or display text.
Entry ids must be unique within a roster config and stable across edit, reorder, disable, effort changes, and route replacement of the same row.
Add and duplicate-row actions must mint a fresh id even when the copied row keeps the same route, role, effort, and enabled state.
`validate_roster` will block Run and portable execution when any duplicate id exists, because `reportStrategy.chairEntryId` and phase fallback need exactly one target.
Config load will quarantine a saved roster with duplicate ids rather than repairing it silently, because the intended chair and persisted ordering are ambiguous.
Load normalization will preserve original ids only when they are unique and valid; missing or invalid ids are replaced with fresh ids with a diagnostic before the user confirms Run.

Roster load defect actions are authoritative:

| Defect | Stage | Pi user/project config | Portable `--roster-file` |
|---|---|---|---|
| Unreadable or invalid JSON | parse | quarantine and seed recommendations | exit `3` |
| Future version | version | preserve, warn, and seed recommendations | exit `3` |
| Missing `routeId`, missing `reportStrategy`, or entry-level `chair` | shape | quarantine stale dogfood file | exit `4` |
| Duplicate id | identity | quarantine | exit `4` |
| Missing or invalid id | identity | repair with fresh id and diagnostic before Run persistence | exit `4` |
| Stale on-disk `scope` | normalization | use resolved scope and rewrite only after Run | use `explicit` scope without rewrite |
| Unknown route or unsupported effort | reconciliation | keep row visible and block if enabled | exit `4` before execution |

The route probe JSON contract for portable CLI discovery is:

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

The model voice schema in `schemas/council-voice.json` will require:

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

`derive_position_catalog` will build a model-free `CouncilPositionCatalogV1` before prompt assembly and include it verbatim in every initial prompt.
For plan input, the catalog will contain `accept_plan`, `revise_plan`, `reject_plan`, and `needs_more_evidence`.
For issue input, explicit alternatives are extracted only by this grammar.
Normalize CRLF to LF, trim outer whitespace, and ignore blank leading and trailing lines.
List extraction applies when every nonblank line is a bullet `- text` or `* text`, or a numbered item `1. text` or `1) text`, and at least two items remain after normalization.
Inline extraction applies only when the entire issue is one line of at most 200 characters containing exactly one separator token ` vs `, ` versus `, or ` or ` with ASCII whitespace on both sides.
Inline extraction will reject candidates that contain `.`, `?`, `!`, `;`, or `:`, contain more than 10 words, or are shorter than 3 or longer than 80 characters after trimming.
List item candidates are 3 to 120 trimmed characters with one trailing `.` stripped.
Extraction will dedupe candidates by lowercase ASCII, collapsed whitespace, and stripped surrounding quotes; keep the first occurrence.
If fewer than two explicit candidates remain after validation and dedupe, emit zero `issue_option_*` entries.
Use ids `issue_option_1` through `issue_option_4` in source order for the first four explicit candidates only.
Every issue catalog will also include `propose_alternative` and `defer_for_evidence`, even when no explicit alternatives are extracted.
Models must set `position_key` to one catalog id unless none fits, then emit `other:<slug>`.
The engine will reject invalid `position_key` values after one JSON-only retry; if the retry still fails, that voice degrades rather than deriving a hidden semantic grouping.
The engine will assign `canonicalPositionId` by exact catalog id or exact `other:<slug>` match and never use display labels or prose similarity for grouping.
This means deterministic grouping is reproducible: two voices group only when they choose the same provided candidate or the same exact `other:<slug>`.
For free-form issue prose with no extracted `issue_option_*` candidates and no valid selected chair, recommendations will default the draft `reportStrategy` to `{ kind: "structured_disagreement" }`.
Bulleted issue text becomes `issue_option_*` candidates only when a lowercase nonbullet preface includes `options:`, `alternatives:`, `choices:`, `approaches:`, `recommendations:`, `decide between`, `choose between`, or `either/or`.
It also becomes candidates when every bullet begins with `option`, `alternative`, `choice`, `approach`, or `recommendation` followed by optional ordinal text and `:`, `.`, `)`, or `-`.
The inline `vs`, `versus`, and `or` extraction rule above is the only other issue-alternative predicate.
Checklist, requirement, risk, or consideration bullets will stay free-form issue prose and default to structured disagreement unless the user explicitly selects deterministic or a chair.
For plan input and issue input with at least two extracted `issue_option_*` candidates, recommendations may default to `{ kind: "deterministic" }` when no valid chair is recommended or remembered.
Users may still explicitly choose deterministic synthesis for free-form issue prose, but the composition panel will warn that exact `other:<slug>` grouping may yield `No deterministic recommendation; see structured disagreement`.
Each assumption will include `assumption_key`, and the engine will normalize it to `[a-z0-9-]{1,64}` and form the canonical assumption id as `<member_id>:<assumption_key>`.
When an assumption key is missing or invalid, the engine will derive a stable key from the first 80 characters of the assumption statement and mark it as derived in diagnostics.
When two same-voice assumptions normalize to the same key, append `-2`, `-3`, and so on before canonical ids, and record `assumption_key_collision`.
The model voice schema omits `grounded` because grounding is engine-owned.
`pool_evidence` will convert model evidence into `CouncilEvidenceLedgerV1` items with stable ids `ev_<phase>_<member_id>_<ordinal>` and will compute `grounded`, `groundingStatus`, and `groundingReason` without trusting model prose.
For `sourceType: "plan_line"`, the engine will mark evidence grounded only when `locator` is exactly `plan.md:Lx` or `plan.md:Lx-Ly` and every referenced line exists in the immutable line-numbered plan loaded before execution.
For `sourceType: "issue_text"`, the engine will mark evidence grounded only when `locator` is exactly `issue:Lx` or `issue:Lx-Ly` and every referenced line exists in the normalized issue text.
For `sourceType: "repo_context"` and `sourceType: "web"`, the MVP engine will mark evidence ungrounded unless the implementation explicitly adds immutable host-supplied context with a precomputed locator table before prompt assembly.
For `sourceType: "theory"` and `sourceType: "prior_knowledge"`, the engine will always mark evidence ungrounded.
The engine will preserve ungrounded evidence in the ledger for transparency, but deterministic readiness and material dissent will count only ledger items with `grounded: true`.
The deterministic synthesis strategy depends on `canonicalPositionId`, engine-grounded evidence, risks, and assumptions rather than free-form prose ordering.
After initial voices, the engine will freeze `CouncilAssumptionReviewCatalogV1` with canonical assumption ids, member/position ids, statements, load-bearing flags, verification hints, and ledger ids.
The catalog never expose raw model-provided locators as authority; reviewers may cite only ledger ids that the engine created before prompt assembly.
`prepare_prompts` must inject that frozen assumption review catalog into every critique prompt with the exact ids reviewers are allowed to reference.
The prompt hash recorded for each critique voice will cover the assumption review catalog bytes exactly as included in the prompt.
The critique schema will require targeted challenges and an `assumption_reviews` array keyed by canonical assumption id.
Structured validation will reject any critique `assumption_reviews` item whose canonical id is not present in the provided `CouncilAssumptionReviewCatalogV1`.
Structured validation will reject any critique, steelman, or adversary `evidenceIds` entry that does not reference an existing `CouncilEvidenceLedgerV1.items[].id`.
Each critique assumption review will require status, rationale, and grounded evidence ids for `verified_by_cited_evidence` or `contradicted`.
For readiness, an assumption is verified only when critique marks its canonical id `verified_by_cited_evidence` with grounded evidence and no successful critique contradicts or leaves it unverified.
The engine never infer verification from the initial voice's confidence, from the existence of `how_to_verify`, or from unsupported prose.
Steelman validation will accept catalog candidate ids plus any `other:<slug>` in frozen `CouncilSynthesisBriefV1.groupedPositions`; all other ids are rejected.
The adversary schema will reuse the existing bounded pattern from `schemas/adversary.json` with axes `evidence`, `framing`, and `recommendation_logic`.
The adversary schema will require `CouncilAdversaryOutputV1.objections` entries keyed to `canonicalPositionId`, and validation will reject any adversary position id outside the frozen `CouncilSynthesisBriefV1.groupedPositions`.
The chair model draft schema in `schemas/council-chair-report.json` will require the substantive report fields but omit `implementation_authorized`.
The final assembled report schema in `schemas/council-report.json` will require:

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

The `implementation_authorized` field will have `const: false`.
The engine, not any model, will set `implementation_authorized: false` in `assemble_final_report` after chair, deterministic, structured-disagreement, or single-survivor synthesis has produced the substantive fields.
If a chair emits `implementation_authorized`, drop it, record `implementation_authorized_forced_false`, and validate against `schemas/council-chair-report.json`.
If the chair draft's only defect is wrong or missing `implementation_authorized`, synthesis remains usable after normalization and final report validation forces `false`.
Other chair schema defects after retry degrade to deterministic synthesis with two initial voices, single-survivor reporting with one voice, or failure with no voices.
Failure of final `schemas/council-report.json` validation after the engine has forced `implementation_authorized: false` will fail the run because that indicates an implementation or deterministic-rendering bug.
The final markdown report will include frontmatter compatible with existing session habits:

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
report_strategy_effective: chair | deterministic | structured_disagreement | single_survivor_mechanical
configured_report_strategy: chair | deterministic | structured_disagreement
report_strategy_source: cli | roster_file | recommendation
chair_entry_id: <entry id or null>
members_total: <n>
members_executed: <n>
providers: [<provider ids>]
configured_models: [<provider/route model ids>]
resolved_models: [<provider/resolved model ids or unknown>]
families: [<family ids, excluding unresolved adapter defaults>]
decision_readiness: ready | conditional | not_ready
readiness_basis: internal_input_grounded | externally_grounded
implementation_authorized: false
---
```

For `adapter-default` routes, report diagnostics must preserve both `routeId` and the execution envelope's resolved `model` value.
If the envelope reports an empty model, record `resolved_model: unknown`, `model_resolution: adapter_default_unreported`, adapter version, and no family-diversity credit.
If a future adapter can report the backend's exact default model after execution, the report will record that value as `resolved_model` while keeping the stable roster `routeId` unchanged.

## Availability And Routing

Route discovery must not make paid model calls.
MVP `discover_routes` enumerates only authorized portable provider-invoke routes.
Post-MVP Pi route discovery, registry-only visibility, Pi auth status, and Pi direct key/header resolution are deferred to `docs/council-command-post-mvp-pi-companion.md`.
If no portable provider CLI route is authenticated, the portable CLI shows `no_executable_provider_cli_routes`; Pi-registry-only users are outside MVP.
Claude routes must be subscription-only.
Every Claude council route will carry `auth.policy: "subscription_only"` in the route catalog.
Portable Claude Code routes will call `bin/provider-probe claude --auth subscription` and `bin/provider-invoke claude --auth subscription`.
Portable route-probe, `--emit-roster`, roster validation, and report diagnostics must all use the same `adapter-default` model derivation unless a future explicit model config is added.
No `bin/provider-invoke` parser change is required for `--auth subscription` because the current parser already accepts `--auth` and exports `A_AUTH`.
Council explicit subscription mode requires a first-party Claude CLI login or Pi OAuth/subscription status, not an environment-token-only `ANTHROPIC_OAUTH_TOKEN` path.
`extensions/council/lib/executors/provider-invoke.ts` must own council Claude child env sanitizing, deleting credentials and unclassified `ANTHROPIC_*`, preserving only allowlisted names, setting `AISYNTH_COUNCIL=1`, and passing that env to provider shells.
The portable executor exposes pure helper `sanitizeProviderInvokeEnv(route: CouncilRoute, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv` for Claude scrub tests without spawning a provider.
The initial Anthropic credential denylist must be `ANTHROPIC_API_KEY`, `ANTHROPIC_OAUTH_TOKEN`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BEARER_TOKEN`, `ANTHROPIC_CONSOLE_API_KEY`, and `ANTHROPIC_CONSOLE_AUTH_TOKEN`.
The initial explicit-subscription Anthropic allowlist is empty: scrub every `ANTHROPIC_*` name, including `ANTHROPIC_BASE_URL`, before council Claude probe or invoke.
A future non-credential `ANTHROPIC_*` exception may be added only with source documentation plus a fake executor test that first-party subscription billing remains provable and credentials remain scrubbed.
If parent env contains `ANTHROPIC_BASE_URL`, the explicit subscription route is unavailable with `claude_subscription_custom_endpoint_not_allowed`; it must not run as unknown billing or silently ignore the endpoint.
The sanitizer will record a diagnostic listing deleted unclassified `ANTHROPIC_*` names without logging values.
The portable Claude executor will pass `AISYNTH_COUNCIL=1` and `--auth subscription` per member call only after that environment scrub has been applied.
`bin/adapters/claude.sh` will distinguish council-marked explicit `A_AUTH=subscription` from ordinary explicit `A_AUTH=subscription` and from `A_AUTH=auto`.
Only `AISYNTH_COUNCIL=1` plus explicit `A_AUTH=subscription` will apply the full Anthropic denylist and allowlist sanitizer, preserving `/synthesis` auto behavior and existing non-council explicit-subscription behavior.
The existing `A_AUTH=auto` path will keep today's behavior, including current credential unsets and pass-through of `ANTHROPIC_OAUTH_TOKEN` plus non-credential `ANTHROPIC_*` config.
Before changing `_claude_exec`, Phase 2B will also characterize non-council `bin/provider-invoke claude --auth subscription` with and without `ANTHROPIC_BASE_URL`, pinning behavior byte-for-byte unless a separate compatibility review changes that public surface.
Before changing `_claude_exec`, Phase 2B will characterize `/synthesis` across unset, empty, and explicit `A_AUTH=auto` crossed with session-present and session-absent fakes, and pin child env plus argv byte-for-byte.
Before changing `adapter_probe` or `bin/provider-probe`, Phase 2B will characterize `bin/provider-probe claude` across the same auth/session matrix and pin stdout, stderr, and exit status.
Auth naming is fixed: council `--auth-policy subscription-only|default` maps to JSON/TS `subscription_only|default`; it drives `AISYNTH_COUNCIL=1`, provider `--auth subscription`, and `A_AUTH=subscription`; `A_AUTH=auto` remains legacy `/synthesis`.
The implementation must not add `ANTHROPIC_OAUTH_TOKEN` to the auto-mode unset list unless a separate `/synthesis` compatibility review proves that doing so cannot break subscription-auth environments.
Add a backward-compatible optional `--auth <auto|subscription|apikey>` flag to `bin/provider-probe`.
Leave `bin/provider-probe claude` defaulting to existing `auto` behavior for `/synthesis` compatibility.
Phase 2B must prove `provider-probe --auth subscription` plus auto characterization, and Phase 2C must prove `provider-invoke --auth subscription` with fake credentials and a logged-in no-paid live probe.
When only `ANTHROPIC_API_KEY` is present, `/council` will show Claude as unavailable with the reason `Claude API key detected, but council requires subscription auth`.
When only `ANTHROPIC_OAUTH_TOKEN` is apparent and no first-party Claude CLI session remains after scrubbing, mark Claude unavailable with `claude_subscription_login_required_after_env_token_scrub` and the planned Claude CLI login message.
MVP Codex routes may use Codex CLI auth and will label billing as subscription when the route evidence proves CLI login.
Post-MVP Pi may add registry routes as companion-governed availability rows with honest billing labels and cost estimates.
Local model routes with dummy keys is labeled local or unknown rather than free unless the provider metadata clearly says zero cost.
Route family is derived deterministically from provider and model identifiers.
Examples include `claude`, `openai`, `codex`, `gemini`, `mistral`, `deepseek`, `qwen`, `kimi`, `grok`, `local`, and `unknown`.
Family derivation is advisory only.
Recommended rosters will prefer distinct families when available but must accept single-family and single-model rosters.
With exactly one executable route, `recommend_roster` creates two enabled same-route entries with distinct roles and may repeat effort when only one value exists.
Effort values must come from the route, not from generic assumptions.
Pi effort discovery, thinking-level normalization, and registry metadata are deferred companion contracts.
For portable Codex CLI routes, supported efforts are `["minimal", "low", "medium", "high", "xhigh"]`.
Portable Codex routes will record `effortSupport.source: "provider_adapter_static"`, `confidence: "static_adapter_contract"`, and `verifiedBy` entries for `bin/provider-invoke --help` and the inspected `bin/adapters/codex.sh` mapping.
For portable Claude subscription routes, supported efforts are the intersection of provider-invoke help, no-paid `claude --help`, and fake argv pass-through to `claude --effort`.
Portable Claude permits `["low", "medium", "high", "xhigh", "max"]` only when both help parsers advertise the value and fake argv proves pass-through.
Missing, unparsable, or incomplete `claude --help` marks the value unavailable before Run with `claude_effort_help_unverified` or `claude_effort_not_advertised_by_help`.
Portable Claude routes will record wrapper-contract provenance from provider-invoke help, real Claude help, adapter inspection, and fake argv tests.
Portable Claude support must not include `off`, `minimal`, or any remembered unknown value unless a future verified Claude CLI surface and wrapper contract prove exact support.
Unsupported remembered efforts will remain in config and UI until the user edits them.
Execution will reject an enabled member whose selected effort is unsupported and never call `pi.setThinkingLevel()` or `provider-invoke` with a different effort.
Post-MVP Pi execution effort propagation is defined in the companion.
Portable execution will pass the selected supported effort to the existing `bin/provider-invoke --effort` flag for each member.
Portable execution will never pass `off`, `minimal`, or any other remembered effort to `bin/provider-invoke` unless route reconciliation has confirmed that exact value is supported by the target provider adapter.
If an implementation or future refactor cannot prove `bin/provider-invoke --effort` exists, the portable executor must fail its startup contract check and must not execute at a default effort.
Effort propagation is asserted from captured executor call records before any live model smoke test is allowed.
Replacement suggestions will pick the nearest effort by the ordered list `off < minimal < low < medium < high < xhigh < max`.
Replacement suggestions are suggestions only and require explicit user confirmation through Edit or Reset.

## Council Execution State Machine

The state machine is explicit and testable.
The command starts in `idle`.
`parse_input` resolves issue text or plan file.
`validate_input` checks empty input, readable files, trusted roots, symlink escapes, regular file status, maximum size, and NUL or binary-looking content.
For plan input, `validate_input` resolves, reads once, verifies size and trust against those bytes, hashes, collects metadata, line-numbers bytes, and freezes `CouncilInputSnapshotV1`.
For issue input, `validate_input` must normalize text, line-number `issue:Lx`, compute `input_sha256`, and freeze the same `CouncilInputSnapshotV1` before `confirm_run`.
No later state will silently re-read the plan file for prompts, catalogs, report text, or `input_sha256`.
`discover_routes` builds the route catalog without paid calls.
`load_roster` reads the last confirmed roster config or creates an empty draft.
`recommend_roster` builds an advisory recommendation using input kind, available routes, prior roster, and role coverage.
`edit_roster` validates non-interactive portable config in MVP; the companion later adds the Pi TUI menu against the same `validateRoster()` contract.
`validate_roster` is a state-machine step backed by `validateRoster()` from `extensions/council/lib/validate-roster.ts`, not a second engine-local implementation.
`validate_roster` computes executable members, unavailable members, unsupported efforts, composition feedback, and report strategy validity.
`validate_roster` will mark `chair` report strategy invalid unless `chairEntryId` references an enabled executable entry in the current reconciled roster whose `role` is exactly `chair`.
`validate_roster` will estimate prompt fit using frozen input bytes plus Phase 2C reserve constants derived from near-final prompt drafts in `docs/public/council-prompt-reserve-prototype.v1.json`, not by guessing or reading mutable prompt files.
Phase 5 must fail a prompt-reserve check if real `roles/council/*.md` plus schema instructions exceed those reserved byte budgets after the pre-authorized reserve bump has been used or declined.
Phase 5 prompt edits must trim or split prompts to fit the Phase 2C reserve constants unless the one pre-release `CouncilContextReserveVersion` bump is applied.
After first public v1 release, increasing a reserve requires a `CouncilContextReserveVersion` bump, explicit revalidation of saved rosters and reports, and a compatibility note.
The estimator will use provider metadata token counts when available, otherwise `ceil(charCount / 3)` as a conservative portable estimate plus a 20 percent safety margin.
If an enabled route has a known context window and the worst-case prompt estimate exceeds 85 percent of it, the member becomes unavailable with `input_context_overflow` and a suggested smaller-input or larger-context replacement.
If the route context window is unknown, composition feedback will warn `context_window_unknown` but not block Run.
`confirm_run` re-stats plan input and, on drift, requires Accept Frozen, Re-snapshot, or Cancel; CLI exits `2` with `--accept-stale-input-sha <sha>` and changed metadata.
`confirm_run` will also compute the scheduler lane plan, expected wall-clock estimate, worst-case deadline, and estimated cost before persistence.
The expected wall-clock estimate will use route latency metadata when available, otherwise `90000` ms for provider-invoke, scheduled through the same lane planner and capped at each member timeout.
If `expectedRunMs > 2700000` or cost exceeds `2.00` USD, the portable CLI exits `2` unless `--ack-long-run <ackToken>` matches the specified hash inputs.
Post-MVP Pi acknowledgment UI must use the same lane plan and token inputs.
`estimated_cost_bucket` is `unknown` if any selected route lacks cost data, otherwise `usd:<ceil(cents)>` from worst-case cost.
The blocking portable exit must print the exact `--ack-long-run` token and the estimate fields used to derive it.
If stale-input and long-run gates both block, one exit prints all required flags; choosing re-snapshot recomputes `input_sha256` before deriving `--ack-long-run`.
When either portable acknowledgment is required, the CLI atomically writes a mode `0600` `CouncilRunIntentV1` sidecar under `./.ai-synthesis/council-intents/<id>.json`, prints `--intent <id>`, and expires it after `30` minutes.
Re-invocation with `--intent <id>` will load the frozen input snapshot, route catalog hash, roster hash, lane plan hash, estimates, and tokens from the sidecar instead of recomputing them from current disk state.
The CLI will still revalidate no-paid route availability before execution; if route identity or auth availability changed, it will invalidate the intent and print a new diagnostic rather than accepting a stale token.
Run, Cancel, or expiry will delete the sidecar best-effort, and the sidecar must contain no credentials, model outputs, or raw auth diagnostics.
Cancel or reload at this acknowledgment step must leave the last confirmed roster untouched.
`persist_roster` atomically writes the confirmed roster before model execution starts for portable remembered-roster runs and post-MVP Pi user/project scopes.
For portable `--roster-file` runs, `persist_roster` never mutates the supplied file and instead writes the canonical confirmed copy to `rememberedWriteTarget`.
When a portable run loaded the remembered roster directly, `persist_roster` rewrites that same remembered file only after the concurrent-write guard passes.
If the portable remembered target is unwritable, execution may proceed with `remembered_roster_written: false` and a warning.
`prepare_run_context` creates one per-run `AbortController` owned by the engine and consumes the immutable `CouncilInputSnapshotV1`.
For plan input, `prepare_run_context` reuses frozen `plan.md:Lx` bytes from `validate_input`; later disk changes only set `input_on_disk_changed_after_snapshot`.
For issue input, `prepare_run_context` reuses frozen `issue:Lx` bytes from `validate_input`; it never re-normalizes or re-hashes issue text.
`derive_position_catalog` builds the model-free `CouncilPositionCatalogV1` from immutable input text and freezes it for the run.
`prepare_prompts` builds immutable prompts from the frozen input evidence, frozen position catalog, confirmed roster, and role templates.
Initial and critique prompts will instruct `plan_line` citations to use `plan.md:Lx-Ly` only for plan input and `issue_text` citations to use `issue:Lx-Ly` only for issue input.
The prompt hash recorded for each initial voice will cover the position catalog bytes exactly as included in the prompt.
`initial_analysis` runs each executable member independently without seeing other member outputs.
`pool_evidence` deterministically builds a shared evidence ledger from issue text, plan lines, and member evidence.
`derive_assumption_review_catalog` builds the model-free `CouncilAssumptionReviewCatalogV1` from successful initial outputs and freezes it for critique readiness checks.
`critique` runs evidence-led critique over the ledger and initial outputs.
`steelman` runs steelman prompts over the same ledger and initial outputs.
`build_synthesis_brief` creates `CouncilSynthesisBriefV1` from immutable input, the position catalog, evidence ledger, successful initial outputs, critique outputs, and steelman outputs, before adversary runs.
`adversary` runs bounded objections against the pre-synthesis brief, grouped positions, evidence, assumptions, and steelmans, not a final draft.
`synthesize` runs either an explicit chair model, deterministic synthesis code, or mechanical structured disagreement generation using `CouncilSynthesisBriefV1` plus the collected `CouncilAdversaryOutputV1[]`.
`assemble_final_report` forces `implementation_authorized: false`, attaches strategy diagnostics, and records any chair-model authorization-field normalization before final validation.
`validate_report` validates the final assembled report schema and rejects any post-normalization value other than `implementation_authorized: false`.
`write_report` writes the markdown report through a temp file and rename.
`write_terminal_report` writes a canceled or failed report only after the roster has been confirmed and execution has started.
`write_terminal_report` must validate against `schemas/council-terminal-report.json`, not `schemas/council-report.json`.
`CouncilTerminalReportV1` requires schema, status, run/input/roster ids, timestamps, phase, reason, member diagnostics, and `implementation_authorized: false`.
It must omit recommendation, readiness, strongest dissent, and final evidence fields because no council recommendation was completed.
`done` displays the result and the report path.
`canceled` aborts active work and reports what was canceled.
`failed` reports why no council output could be produced.

Phase-role semantics are deterministic and independent of UI ordering except where explicitly stated.
Every enabled executable roster entry runs `initial_analysis`, including a designated chair.
Later phases select explicit roster members from the successful initial voices.
`reportStrategy.chairEntryId` is the only authoritative source of chair synthesis identity.
`CouncilRosterEntryV1.role === "chair"` is the user-visible role required for the entry named by `reportStrategy.chairEntryId`; it is not enough by itself to authorize a chair synthesis call.
The roster never stores a separate `chair` boolean; any chair badge in the UI is derived from the effective report strategy.
When the effective report strategy is not `chair`, entries with `role: "chair"` are ordinary initial voices and do not receive a synthesis call.
For phase fallback selection, `non-chair` means an entry whose id is not the effective `reportStrategy.chairEntryId`.
The strategy chair may run only its independent `initial_analysis` and final chair synthesis call; it must not be selected for critique, steelman, or adversary fallback while another successful member is available.
If every successful survivor is the strategy chair, the later phase is marked degraded rather than giving the chair extra critique, steelman, or adversary influence.
`critique` will run all successful members with role `implementation-critic`, `risk-critic`, or `evidence-auditor`; if none exist, select the highest-effort non-chair successful member, breaking ties by roster order.
`evidence-auditor` is not a separate phase in MVP; it is a roster role that participates in the `critique` phase and emits the same `assumption_reviews` contract.
`steelman` will run all successful non-chair members with role `steelman`.
If no successful non-chair steelman exists, `steelman` fallback will select the non-chair successful member whose `canonicalPositionId` has the fewest supporters, breaking ties by highest effort then roster order.
`adversary` will run all successful members with role `adversary`; if none exist, select a successful non-chair `risk-critic`, otherwise the highest-effort non-chair successful member.
`chair` is a report strategy role and does not satisfy critique, steelman, or adversary selection.
Phase fallback selection must be recorded in the report diagnostics so users can see when a member was reused outside its preferred role.
If a selected later-phase member fails, that phase degrades; the engine never silently substitute an unrecorded member after the phase starts.

Allowed transitions is:

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
If the computed whole-run deadline fires during `initial_analysis`, the engine will abort active members and route to `write_terminal_report -> failed` even when exactly one initial voice had already succeeded.
The single-survivor `initial_analysis -> single_survivor_report` edge applies only when initial analysis completes without run deadline, user cancellation, session shutdown, or process abort.
`single_survivor_report` consumes only the surviving `CouncilVoiceOutputV1` plus failed-member diagnostics; it must not read `CouncilSynthesisBriefV1`, `CouncilAdversaryOutputV1[]`, hidden host state, or configured chair output.
The one-survivor `single_survivor_report` state always produces a mechanical degraded, `not_ready`, `implementation_authorized: false` report naming failed initial members.
The one-survivor edge will ignore configured strategy, make no chair call, set frontmatter `report_strategy: single_survivor`, preserve `configured_report_strategy`, and record `report_strategy_effective: single_survivor_mechanical`.
If the configured chair survived as the only initial voice, the report will use that voice once and never ask it to synthesize itself.
If the configured chair failed and a non-chair survived, the report will use the non-chair survivor once and will record that the chair strategy was unavailable because fewer than two initial voices succeeded.
The normal at-least-two-survivor path must not skip `critique`, `steelman`, `build_synthesis_brief`, or `adversary` when a fallback member can be selected.
If a later phase's selected member list is empty despite the fallback rules, the engine will mark that phase degraded and continue to the next named phase, and the condition is covered as an invariant violation in tests.
If a later phase member fails, times out, or returns invalid output, that phase degrades and control continues to the next named phase rather than jumping directly to `synthesize`.
Early `critique -> synthesize` or `steelman -> synthesize` shortcuts do not exist in MVP because they hide skipped required phases.

Initial analyses will run through a bounded promise pool.
The default global concurrency ceiling is `4`, but that value is never treated as promised parallelism.
The default hard roster cap is `6` enabled members, with a config override allowed up to `8`.
Provider-invoke calls will also be partitioned by an opaque non-secret `executionLaneKey` derived from executor, provider, auth source, and normalized account/session identity when the route can expose one.
The default provider-invoke lane width is `1` for members sharing an `executionLaneKey`, including two same-route Claude subscription members emitted for a single-route roster.
A provider-invoke lane may use width greater than `1` only after a no-paid contract or provider metadata proves parallel same-account calls are supported without violating rate-limit or auth-session semantics.
Before scheduling an MVP phase, the engine will derive a `CouncilMvpLanePlanV1` from selected provider-invoke members, `maxConcurrencyGlobalCeiling`, lane keys, and phase timeout.
The scheduler, deadline calculator, long-run acknowledgment, and report diagnostics will all consume that single lane plan for the phase.
For a same-account or same-route MVP council, `effectiveConcurrency` may be `1` even when `maxConcurrencyGlobalCeiling` is `4`, and the UI must label that as serial shared-account execution rather than hidden parallelism.
The default `memberTimeoutMs` is `300000` ms for each scheduled member in initial, critique, steelman, and adversary phases.
The default `memberTimeoutMs` is `420000` ms for an explicit chair synthesis member.
The default whole-run deadline is computed from scheduled phase budgets and the exact lane plan the scheduler will use rather than from a flat wall-clock cap or raw global concurrency.
For each phase, compute `parallelEligibleMs` from the same lane scheduler used for execution, respecting `maxConcurrencyGlobalCeiling`, provider-invoke lane widths, and roster order.
The MVP phase budget is `parallelEligibleMs`, and the whole-run deadline formula is `max(1200000, sum(phaseBudgetMs for initial, critique, steelman, and adversary) + chairMemberTimeoutMsWhenScheduled + 120000)`.
Recalculate the deadline after each phase selection using recorded lane counts, never below remaining scheduled work budget, and abort the run-level controller only after that budget expires.
The deferred Pi companion may later extend the lane plan with Pi direct fields, but MVP scheduling reads only `CouncilMvpLanePlanV1`.
The default `1200000` ms value is a minimum safety floor for small councils, not a cap for full rosters.
Each member call will receive a `memberSignal` from a per-member `AbortController` that is linked to the run-level signal.
Run-level aborts from Escape, Pi `session_shutdown`, process signals, or the computed whole-run deadline will propagate to every active member controller.
When the computed whole-run deadline fires, the engine will set abort reason `deadline_exceeded`, abort every active member controller, skip unscheduled remaining phases, and proceed directly to terminal failure reporting.
Per-member timeout handlers will abort only that member's controller or rely on the executor's per-call `timeoutMs`; they must never abort the run-level controller.
The provider retry count is `0` for transport-level retries so Pi can surface rate limits instead of waiting silently.
Malformed structured output will get at most one JSON-only retry per voice inside that voice's `memberTimeoutMs` budget.
The first attempt and JSON-only retry are not separate whole-run budget units.
Each attempt receives provider `timeoutMs` equal to remaining `memberTimeoutMs`; no positive budget skips JSON retry and records `retry_skipped_no_member_budget`.
Structured validation will use `extractModelJson(rawText)`, `validateModelJson(schemaPath, rawText)`, and `validateModelJsonValue(schemaPath, value)` TS helpers.
Chair synthesis must use `extractModelJson`, normalize away any `implementation_authorized`, then call `validateModelJsonValue`; raw strict validation is used only after normalization.
The helper mirrors `bin/lib/json_extract.py` in TS: whole input, one stripped fence, `512` starts, shortest complete JSON, last satisfying object, object over array, and local schema subset.
That supported schema subset is `type`, `const`, `enum`, `required`, `properties`, `additionalProperties: false`, and object `items`.
The council runtime must not spawn `bin/lib/json_extract.py`; parity is enforced with checked-in fixture cases derived from the existing helper.
The engine will map `no_json` and `schema_invalid` to voice degradation with one JSON-only retry, and will map `validator_usage_error` to a failed voice plus implementation diagnostic unless every initial voice fails.
Auth, timeout, malformed, budget, rate limit, and invocation failures will degrade that voice rather than crash the whole council.
If no initial voices succeed, the run will fail with no recommendation.
If exactly one initial voice succeeds after at least one runtime failure, the report is `degraded`, `not_ready`, and clearly label the output as a single surviving voice, not a valid council recommendation.
If at least two initial voices succeed, the report may complete as a council even when later critique, steelman, adversary, or chair phases degrade.
A designated chair must be a roster entry with `role: "chair"` and must also run an independent initial analysis before the synthesis phase.
A deterministic strategy must not call any model for synthesis.
A deterministic strategy will produce a mechanical synthesis with narrower guarantees than a chair model.
A deterministic strategy will consume `CouncilSynthesisBriefV1`, `CouncilAdversaryOutputV1[]`, and no other mutable run state.
A deterministic strategy will group successful initial voices by engine-assigned `canonicalPositionId`, not raw model-generated prose or label similarity.
A deterministic strategy will choose `recommendation` as the majority position when one position has more than half of successful voices.
A deterministic strategy will choose `recommendation` as the plurality position only when it has at least two voices and at least one more supporter than the runner-up.
`propose_alternative`, `defer_for_evidence`, and `needs_more_evidence` are catch-all or deferral buckets and must never become a deterministic winning recommendation.
A majority or plurality of catch-all buckets will map to `No deterministic recommendation; see structured disagreement`.
A deterministic strategy will set `recommendation` to `No deterministic recommendation; see structured disagreement` when there is a tie, one surviving voice, no grounded evidence, or no plurality that meets the rule above.
A deterministic strategy will rank `evidence_summary` by grounded evidence cited by the most voices, then by source locator, then by first appearance.
A deterministic strategy will choose `strongest_dissent` from the largest non-winning position, breaking ties by count of grounded counter-evidence, count of load-bearing assumptions, and roster order.
A deterministic strategy will include steelman outputs, let improved evidence strengthen strongest dissent without regrouping positions, and include adversary objections in risks and change criteria.
A deterministic strategy will include critique targeted challenges and assumption reviews in `phase_findings.critique`, assumptions, readiness, and `what_would_change_recommendation`.
A deterministic strategy will treat every named phase from `initial_analysis` through `write_report` as critical for readiness.
For readiness, a phase is degraded by failure, timeout, invalid output after retry, no selectable voice, or auth-policy failure; successful pre-recorded fallback selection is not degradation.
A deterministic strategy will compute `materialDissent` mechanically before readiness.
`materialDissent` is true when any non-winning canonical position has `supporterMemberIds.length >= 2`.
`materialDissent` is also true when the maximum grounded ledger-item count cited by any single non-winning supporter for that position is greater than or equal to the same count for any single winning supporter.
`materialDissent` is also true when any winning-position load-bearing assumption in `CouncilAssumptionReviewCatalogV1` is contradicted or not verified by the critique contract.
Deterministic mode will treat any `materialDissent` as unresolved because no synthesizer model is called to resolve it.
A deterministic strategy will compute route correlation before readiness.
When all successful executable initial voices share one `routeId` or one `executionLaneKey`, the engine records `route_correlation: single_route | single_lane`, emits no family-diversity credit, and caps `decision_readiness` at `conditional`.
A deterministic strategy will set `decision_readiness` to `ready` only when two voices support the winner, every critical phase is clean, load-bearing assumptions are verified, `materialDissent` is false, and the route-correlation cap does not apply.
A deterministic strategy will set `decision_readiness` to `conditional` when there is a winning position but unresolved assumptions, partial degradation, or `materialDissent` is true.
A deterministic strategy will set `decision_readiness` to `not_ready` when the recommendation is the no-recommendation sentinel, only one initial voice survived, or validation failed.
A deterministic strategy will set `next_action` to the highest-ranked assumption verification when readiness is conditional or not ready, otherwise to the smallest concrete next step named by the winning position.
A deterministic strategy will include a report note that the synthesis was generated by auditable aggregation code, not by another model voice.
A structured disagreement strategy must preserve major positions and dissent without forcing a recommendation.
A structured disagreement strategy must not call any model for synthesis.
A structured disagreement strategy will consume `CouncilSynthesisBriefV1`, `CouncilAdversaryOutputV1[]`, and no other mutable run state.
A structured disagreement strategy will group exact `canonicalPositionId` values, list supporters/evidence/assumptions/steelmans/objections/opposition, and set the no-synthesized-recommendation sentinel.
Structured disagreement reports will populate `phase_findings.critique`, `phase_findings.steelman`, and `phase_findings.adversary` directly from the successful phase outputs.
If the user wants a model-written synthesis, the only MVP path is a `chair` report strategy whose `chairEntryId` references an enabled executable roster member with `role: "chair"`.
A chair prompt will receive only immutable input, roster metadata, position catalog, ledger, successful phase outputs, adversary outputs, and `CouncilSynthesisBriefV1`.
A chair synthesis prompt never receive hidden host-model context, stale UI state, unvalidated failed-member prose, raw provider credentials, or mutable config files.
A chair-written draft will still preserve the report's `phase_findings` sections so critique, steelman, and adversary outputs remain visible even when the chair writes the narrative synthesis.
The current Pi host model must never be used for a model call unless its provider/model route is present as an enabled roster entry.
The engine will create one `runId` per Run using timestamp, input hash, and random suffix.
The Run button iscome inactive after `confirm_run` to prevent duplicate starts.
Escape, Pi `session_shutdown`, process signals in the portable CLI, and the computed whole-run deadline will abort the per-run `AbortController`.
Member timeout handlers will never abort the per-run `AbortController`.
The computed whole-run deadline is a failure, not a user cancellation, so reports written after that abort will use `status: failed` and `reason: deadline_exceeded`.
Report writes is idempotent by writing only to the `runId` report path.
If a report path already exists for a `runId`, the writer will fail rather than overwrite.

## Failure Modes And Recovery

Unreadable plan path will fail before route discovery.
Untrusted or out-of-root plan path will fail before route discovery unless the Pi TUI user explicitly confirms a trusted-root override that is then stored only for that run.
Multiple explicit plan files will fail with a one-plan-at-a-time message.
Oversized plan files are rejected above a default `512 KiB` limit, with a config option to raise the limit to `2 MiB`.
Binary-looking plan files are rejected by checking for NUL bytes.
Corrupt roster config is quarantined and recommendations is used.
Unwritable roster config will warn and allow one current run, but the next invocation never pretend the roster was remembered.
Portable CLI roster JSON parse or schema failure will exit `3` before route discovery when possible, write no report, and print the offending path plus schema error summary.
Portable roster semantic failure exits `4`, writes no report, and lists blockers including unsupported efforts, unavailable routes, invalid member count, strategy errors, legacy `chair`, and stale dogfood shape.
Portable CLI `--json` validation failures will emit `{ "ok": false, "status": "validation_failed", "exitCode": 3 | 4, "diagnostics": [...] }` and never include secrets or raw auth headers.
Unavailable remembered routes will stay visible and never count toward the two-member minimum.
Unsupported remembered efforts will stay visible and will block that member from being executable until edited.
The portable CLI will never rewrite a `--roster-file` entry from a future `pi-complete` route to `provider-invoke`; it will exit `4` with the exact JSON edit needed unless the roster file already selects the authorized portable route.
Post-MVP Pi drift, surface-artifact, and live-effort recovery rules are deferred companion contracts and are not MVP execution paths.
Provider auth failure at execution time will mark that member failed and continue if possible.
Provider timeout will abort only the timed-out member's controller, mark that member timed out, and continue if the run-level signal has not been aborted.
Provider malformed output after retry will preserve raw text in diagnostics but never count as a structured voice.
Provider rate limit will mark that member failed with a retry-after hint when available.
Partial degradation will lower decision readiness and show which phases lost voices.
Failure of an explicit chair will fall back to deterministic synthesis only if at least two initial voices succeeded and the report says the chair failed.
An explicit chair output with only wrong or missing `implementation_authorized` is not chair failure; the engine drops it, forces `false`, and records a diagnostic.
An explicit chair output with any other schema defect after its JSON-only retry will count as chair failure and follow the deterministic, single-survivor, or no-survivor fallback rules.
When only one initial voice succeeds, explicit chair failure will use the single-survivor mechanical report path and never call deterministic multi-voice synthesis or any chair model.
When `deadline_exceeded` is the run-level abort reason, deadline failure takes precedence over the single-survivor path regardless of how many initial voices succeeded before the abort.
An explicit chair that is disabled, unavailable, missing, or has unsupported effort will block Run during `validate_roster` rather than falling back silently.
An explicit chair whose entry role is not `chair` will block Run during `validate_roster` even when the route and effort are executable.
Failure of deterministic synthesis validation will fail the run rather than invent a report.
Escape in the roster editor will cancel without persistence.
Escape during execution will abort the per-run `AbortController` and write `status: canceled` only if execution had already started.
If cancellation or failure happens before `confirm_run`, no council report is written because there is no confirmed roster or run.
If cancellation or failure happens after `persist_roster`, `write_terminal_report` will write a `CouncilTerminalReportV1` with member diagnostics collected so far and `implementation_authorized: false`.
If the computed whole-run deadline fires after `persist_roster`, `write_terminal_report` will write `status: failed`, `reason: deadline_exceeded`, and the aborted member diagnostics under that terminal schema.
Pi `/reload`, `/new`, `/resume`, `/fork`, `/clone`, or process shutdown during a run will trigger `session_shutdown`, abort active work, and avoid using stale `ctx` objects.
After reload, the next `/council` invocation will resolve the active config scope again and load the last confirmed roster from that scope, not from stale memory.
Session replacement never resume a half-finished council automatically.

## Security And Privacy

Pi packages and extensions run with the user's local permissions, so `/council` is opt-in through `pi install`.
The extension must never write to the reviewed plan file.
The extension must read a plan file once during `validate_input`, hash those exact bytes, and pass only that immutable line-numbered text to model calls.
If the source file changes before Run, the council still reviews the frozen snapshot and records the post-snapshot change as diagnostics rather than mixing validation bytes with execution bytes.
The extension must normalize issue text once, hash it, and pass immutable line-numbered issue text to model calls.
The extension will include `input_sha256`, input kind, and file metadata when present in the report so the user can tell what was reviewed.
All file paths is resolved with `realpath`.
Default allowed roots is the current `ctx.cwd` and any configured `council.allowedRoots`.
Symlinks escaping allowed roots are rejected.
Relative paths will resolve against `ctx.cwd`.
Absolute paths outside allowed roots are rejected unless `council.allowedRoots` permits them.
Project-local council config is honored only when `ctx.isProjectTrusted()` is true.
Trusted project-local council config is read and written only at `join(ctx.cwd, CONFIG_DIR_NAME, "ai-synthesis", "council", "roster.v1.json")`.
Untrusted project-local council config is ignored even if it exists and even if the package was installed with `pi install -l`.
User-global config under `getAgentDir()` is always user-owned and can be loaded before project trust.
Context and plan contents must be treated as data, not instructions.
Model prompts must state that council completion does not authorize implementation.
Claude council routes must not use Anthropic API keys.
Portable Claude council children must receive an environment with Anthropic credential variables and unclassified `ANTHROPIC_*` variables removed before either `bin/provider-probe` or `bin/provider-invoke` starts.
Only explicitly allowlisted verified non-credential Anthropic variables may remain in those child environments.
Other provider auth paths is labeled honestly as subscription, OAuth, API key, gateway billing, local, or unknown.
API keys and headers must never be logged, stored in reports, stored in roster config, or included in custom Pi entries.
The existing `aisynth_redact` behavior in `bin/lib/common.sh` will remain in the portable provider-invoke executor.
Post-MVP Pi direct redaction requirements live in the companion.
Cost estimation will use catalog metadata and never require an API call.
The council engine will disable model tools for MVP to avoid hidden file edits or shell execution during review.
Provider-invoke council execution will treat tool policy as route availability, not as a prompt instruction.
Claude routes satisfy the MVP only when the startup contract proves the existing no-tools argv.
Codex routes satisfy the MVP only after a no-tools or accepted read-only-shell contract is proven; otherwise they remain visible but unavailable with a replacement suggestion.

## Compatibility And Migration

Existing `/synthesis` behavior must remain unchanged.
Existing `bin/provider-invoke` flags must remain backward compatible.
Adding `--auth` to `bin/provider-probe` must default to `auto` and preserve existing callers.
Adding `package.json` intentionally introduces a Node/TS contributor toolchain and must happen in the same commit as install-aware npm lifecycle scripts.
Add `package-lock.json`, lifecycle dependency bootstrap, and green clean-checkout `npm ci`, `test`, `typecheck`, and `build` in the same commit as `package.json`.
Clean-checkout MVP npm scripts must not require Pi, Pi stubs, Pi-present verification, or Pi surface artifacts.
Post-MVP Pi compatibility artifacts and strict runtime gates are companion scope.
This repo-wide development requirement is separate from runtime installation: existing Claude Code skill users who only symlink the repo never need Node unless they run the new portable `bin/council` fallback or contributor checks.
Existing session files in `./.ai-synthesis/sessions/` must remain readable by `expand`, `list`, `resume`, `rate`, and `revisit`.
Council reports use `./.ai-synthesis/council-sessions/` for MVP because legacy `/synthesis` session commands scan `sessions/*.md` broadly.
Do not rely on `mode: council` being ignored by legacy `/synthesis` commands unless a future implementation adds explicit mode filtering there with tests.
Existing `--solo` and `--compare` never depend on the council roster or route catalog.
Existing `revisit` can later learn to include council reports from `./.ai-synthesis/council-sessions/`, but initial council implementation does not require changing revisit.
The optional Pi package is not installed by default and does not change `/synthesis` runtime behavior for users who only symlink the Claude Code skill.
If users install the package and later remove it with `pi remove`, their `./.ai-synthesis/council-sessions/*.md` reports remain readable markdown.
If users have a remembered roster from a future version, version mismatch will warn and start from recommendations rather than partially loading unknown fields.
The loader will keep the future-version file path and SHA-256 in `CouncilConfigLocation` diagnostics as a `future_version_preserve_required` write guard.
Before v1 persistence can overwrite that path, reread it, verify the SHA-256, and back up exact future-version bytes beside it.
If the future-version file changed, cannot be reread, or cannot be backed up, Run may continue with the seeded roster but persistence must skip with a warning.
Because v1 is the first shipped roster format, MVP treats missing `routeId`, missing `reportStrategy`, and entry-level `chair` as stale dogfood corruption and quarantines the file with repair guidance.
The portable `--roster-file` path is read-only and will refuse stale dogfood roster shapes with exit `4`, required manual JSON edits, and no model calls.
If the in-file `scope` disagrees with the resolved config location, load normalization will keep the file in its resolved location, use the resolved scope for precedence and reports, and rewrite the field only after a confirmed Run.

## Implementation Phases

Implementation will land as three reviewable tracks: Track A toolchain/Pipelane baseline, Track B Claude subscription hardening, and Track C council product.
Each track has its own acceptance gates, and the repository must remain green after every committed phase.
Before product code, generate three force-added MVP reference subplans under `docs/council/`: `track-a-toolchain.md`, `track-b-provider-hardening.md`, and `track-c-portable-mvp.md`.
This file remains the governing MVP requirements index, while `docs/council-command-post-mvp-pi-companion.md` is the governed deferred companion for post-MVP Pi work.
The generated subplans link to exact section anchors and may not add, weaken, or reinterpret settled owner decisions.
Add `docs/public/council-plan-split.v1.json` with the governing plan SHA-256, section ids, decision keys, generated subplan paths, companion status table, and source-line ranges used to create each subplan.
Run `scripts/check-council-plan-split.mjs` before product code and on every later plan edit; if this governing plan changes without regenerated subplans and manifest, the check fails with `COUNCIL_PLAN_SPLIT_STALE`.
The split manifest must enumerate decision keys `first-ship-order`, `pi-registry-mvp-users`, `track-a-product-fallback`, `package-gate-default`, `mvp-plan-scope-split`, and `claude-525ce69-followups` with exact required text, forbidden text, anchor, snippet hash, and subplan or companion targets.
The checker performs exact required-text presence, forbidden-text absence, anchor, and snippet-hash checks only; no semantic prose analysis.
Track A will add package scaffolding, lockfile, Node `>=22.19.0`, TS/schema/test setup, bootstrapped npm scripts, conformance fixtures, and the portable import-isolation check.
Track A is not a side effect of `/council` and is not installed into reviewed user repositories; it needs explicit `ai-synthesis` maintainer acceptance, confirmed Pipelane `/pr` merge path, confirmed single-owner/no-shared-CI scope, and a named rollback owner before merge.
The rollback and mid-plan Pipelane/Pi drift owner is the ai-synthesis maintainer who owns `${PIPELANE_HOME:-$HOME/.pipelane}`; without owner acceptance, Track A must not merge.
Before Track A, run a toolchain-free usefulness probe with `bin/provider-invoke`, near-final role prompt drafts, and a shell report template on at least one plan and one issue.
The probe must add no package metadata, npm scripts, Pipelane config, TS setup, or reusable product code.
The probe must draft near-final Phase 5 role prompts before reserve measurement rather than disposable temporary prompts.
The probe must write `docs/public/council-prompt-reserve-prototype.v1.json` with prompt hashes, schema byte counts, reserve estimates, at least `35` percent prompt-growth headroom, and worst-case sample prompt sizes used to choose Phase 2C reserves.
The probe must inspect current `bin/adapters/claude.sh` fake argv and record all six Claude no-tools flags in `docs/public/council-claude-tool-policy.v1.json`; any miss moves flag work into Track B.
Both usefulness gates use the fixed usefulness set and scorecard with stable sample ids, hashes, routes, evidence, recommendation, dissent, assumptions/risks, and next-action checks.
The usefulness set will contain three samples: one plan-file review, one issue with explicit alternatives, and one free-form issue with no extracted alternatives.
Probe prompts must require exact `plan.md:Lx-Ly` or `issue:Lx-Ly` citations; the scorecard counts only manually verified existing lines.
The pass threshold applies per sample: all report fields, at least `3` verified citations, `1` dissent, `2` assumptions or risks, and one concrete next action.
The maintainer note on whether planning would change is recorded as evidence only and cannot pass or fail the gate.
If the toolchain-free probe does not pass the scorecard, abandon council without merging Track A.
If registry/cache, merge-path, owner, or single-clone preconditions fail, Track A must stop before `package.json` and activate the approved no-package fallback.
If the `NoPackageTrackCPlanV1` type-strip capability probe fails, append `needs-decision [key=no-package-fallback-capability]` asking whether to defer Track C, choose a package alternative, or rewrite the fallback in plain JS.
Until the fallback is active or Track A is repaired, Track C may continue only on docs, shell, or fake-conformance work that needs no Node package baseline.
Phase 1 will treat installed Pipelane's effective direct npm checks as the active blocking pre-PR gate and never rely on tracked `.pipelane.json` edits for the current installed Pipelane version.
Current red-baseline PRs merge only through an explicit recorded plan-review or Pipelane bypass that runs the non-Node checks named in that bypass.
Shell-only Track B may land before Track A through that same recorded bypass when it changes only shell/provider files and fake conformance, runs `bash -n` plus `tests/conformance/run.sh unit`, and records why npm checks are inapplicable.
Track C Node/TS product code must not merge through the package-based implementation path before Track A lands and proves that gate green.
A no-package product-code path is already approved as the failure-triggered fallback, with default scope, validation, and rollback from `NoPackageTrackCPlanV1`.
Pre-Track-A docs-only plan changes are exempt only through an explicit recorded plan-review/Pipelane bypass owned outside council implementation.
Phase 1 is incomplete until hermetic conformance, `npm ci`, typecheck, build, test, and installed-Pipelane checks pass in a clean checkout without Pi, provider CLIs, auth, or model network.
The installed-Pipelane verification must run twice: once against active machine-local config and once with `PIPELANE_HOME` set to an empty temporary directory so `resolveWorkflowContext(cwd)` uses synthesized defaults.
Phase 1 writes `docs/public/pipelane-prepr-checks.v1.json` recording active and synthesized `prePrChecks`; synthesized checks are `npm run test`, `npm run typecheck`, and `npm run build`.
That artifact must record Pipelane `0.2.0`, resolved package path, derived active config path, and observed `pr.ts`/`runShell()` shape; mismatch fails loudly.
Every PR after Phase 1 must run explicit `npm run verify:pipelane-prepr` or dependency-free `node scripts/verify-pipelane-prepr.mjs --assert-shape` before package tests.
`--assert-shape` is scoped to that pre-PR verifier, not ordinary local `npm test`, `npm run typecheck`, or `npm run build`.
It fails with `PIPELANE_SHAPE_DRIFT` on version/path/shape mismatch and prints `--check-drift` plus no-package recovery guidance when npm bootstrap is broken.
Phase 1 must expose `node scripts/verify-pipelane-prepr.mjs --check-drift`, a dep-free version/path/shape compare that runs no npm or package tests.
Maintainer docs should run `--check-drift` at session start and before resuming long-lived branches so drift appears before unrelated pre-PR failure.
After Track A lands, a benign docs-only or legacy shell-only PR blocked by runner drift, offline npm, or unresolved-base ambiguity may use the same recorded manual bypass style as the red-baseline bypass: record the reason, run the dependency-free checks named by the changed-surface classifier, and explicitly accept or block the PR.
Phase 1 also runs `tests/conformance/run.sh all` in a provider-present environment, but generic Pipelane pre-PR checks must not require live sections until they are optional.
Phase 2B will implement only Track B provider hardening: `provider-probe --auth`, explicit subscription sanitizer, `A_AUTH=auto` preservation, and fake/no-paid subscription tests.
Phase 2B must merge before Phase 2C because Phase 2C route discovery and runtime checks call the new provider `--auth` surfaces.
Phase 2C is split into green sub-slices rather than one mega-merge.
Phase 2C-a implements config, input parsing, immutable plan loading, route catalog loading, effort support, and `validateRoster()`.
Phase 2C-b implements provider-invoke executor plumbing, council-scoped Claude env scrub, provider tool-policy checks, and fake executor coverage.
Phase 2C-c implements `--emit-roster`, portable remembered-roster persistence, run intent, and long-run/stale-input acknowledgment.
Phase 2C-d implements deterministic engine execution, report validation, terminal reports, and fake two-voice vertical conformance.
Each 2C sub-slice must leave the repository green and may merge independently.
The Phase 2C slices exercise validation, grounding, deterministic synthesis, report writing, fake executors, and provider-invoke without Pi direct or Pi UI.
Phase 2C will call the deterministic function with empty critique, steelman, and adversary inputs, cap readiness at `conditional` or `not_ready`, and serve only as a continuation gate.
Immediately after Phase 2C, run every fixed usefulness-set sample; failure abandons or revises the engine before Phase 5, but does not authorize TUI work.
Phase 5 will expand the portable engine to full critique, steelman, adversary, degradation, and report strategies before any polished Pi roster UI is built.
After Phase 5, run the MVP usefulness gate on every fixed sample with at least two executable members using authorized portable provider-invoke routes.
The gate permits single-route and same-family rosters; if Codex tool policy remains unproven, use two distinct Claude roles on the same subscription route rather than blocking first ship on Codex.
For same-route or same-model samples, the MVP usefulness gate must compare against a solo baseline and pass only when the council report contains at least one material dissent, cited-evidence delta, load-bearing assumption delta, or next-action delta that is absent from the solo report and used by the final report.
If the same-route comparison adds no value, record `correlated_no_added_value` and revise recommendations or prompts; this is a usefulness failure, not a diversity hard-block.
The modest exit heuristic is two same-route prompt or recommendation revision attempts after Phase 5.
If both attempts still record `correlated_no_added_value`, no authorized independent route is available, and all other fixed usefulness samples pass, first ship may proceed with `same_route_added_value: not_demonstrated`.
That ship path must disclose `correlated_no_added_value` in the scorecard, final reports, README, and route recommendations, cap same-route-only `decision_readiness` at `conditional`, and recommend adding an independent route when available.
If an authorized independent route is available, the heuristic does not apply; recommendations must use the independent route for the fixed usefulness gate.
First ship follows only after that portable usefulness gate passes.
Post-MVP Pi UI, Pi direct execution, and parallel Pi direct proof are deferred to the companion and require a refreshed plan review before implementation.
Phase 2C/5 will enforce `docs/public/council-mvp-symbols.v1.json`, excluding Pi UI, Pi direct gates, Pi drift symbols, and `pi-complete.ts`.
Phase mapping: Track A is Phase 1; Track B is Phase 2B; portable Track C MVP is Phase 2C plus Phase 5 plus Phase 6 docs; Pi UI is post-ship Phase 3C.
Phase 6 adds README install/usage; `skills/council/SKILL.md` is post-MVP after nested-skill invocation/coexistence proof.
Rollback has two distinct targets.
The normal Phase 2+ rollback target reverts feature files, keeps Track A, and proves hermetic conformance plus effective Pipelane checks green.
The full-abandonment rollback target is owned by the ai-synthesis maintainer and must either keep Track A green or apply the tracked no-package Pipelane recovery recipe.
Rollback green is scoped to homes where the package baseline remains or the recipe has been applied; an empty `PIPELANE_HOME` without package metadata is expected to fail with a documented recipe-required diagnostic.
That recipe will live in `docs/pipelane-no-package-recovery.md` and `docs/public/pipelane-no-package-prepr.v1.json`, name `${PIPELANE_HOME:-$HOME/.pipelane}`, and include exact replacement-check config bytes.
The rollback target for green package checks is the install-aware npm-script form from Phase 1, not tracked `.pipelane.json`.
Track A baseline files, hermetic conformance, and needed fake helpers become retained infrastructure after Track A lands.
The normal Phase 2+ rollback set includes runtime code, any future post-proof portable skill, roles, schemas, `bin/council`, route probe, provider edits, fixtures, tests, unused Pi stubs, and docs.
The normal Phase 2+ rollback set must not remove Phase 1 baseline files while `package.json` scripts or effective Pipelane checks still reference them.

## Exact File-Level Changes

Add `package.json` in Phase 1 with portable package metadata, Node `>=22.19.0`, runtime loader dependency when needed, TS test dev deps, and the npm scripts listed in this plan.
Do not add the Pi `pi` manifest, Pi peers, `extensions/council/index.ts`, Pi UI files, `pi-complete.ts`, Pi surface artifacts, Pi direct tests, or `skills/council/SKILL.md` in the first-shippable MVP.
Those post-MVP files are enumerated in `docs/council-command-post-mvp-pi-companion.md`.
Add three generated MVP reference docs under `docs/council/` before implementation: `track-a-toolchain.md`, `track-b-provider-hardening.md`, and `track-c-portable-mvp.md`.
Add `docs/public/council-plan-split.v1.json` and `scripts/check-council-plan-split.mjs` before product code so plan hash, section links, fixed decision keys, exact required/forbidden text, generated subplan frontmatter, and companion index status stay in sync.
Add `package-lock.json` in Phase 1 so CI and pre-PR checks can use `npm ci --prefer-offline --no-audit --fund=false` reproducibly.
Add `tsconfig.json`, `vitest.config.ts`, and `scripts/ensure-node-deps.mjs` in Phase 1 unless an equivalent Node built-in test setup provides the same coverage.
Add `scripts/verify-pipelane-prepr.mjs` in Phase 1 to inspect active and empty-`PIPELANE_HOME`, assert Pipelane `0.2.0` shape, compare artifacts, and execute through `sh -lc`.
The same script must expose `--assert-shape` as a dependency-free per-PR check that reads the artifact, runs no network or npm install, and fails with `PIPELANE_SHAPE_DRIFT` plus conformance guidance.
`scripts/verify-pipelane-prepr.mjs` will also implement `--bootstrap-smoke` for the pre-`package.json` throwaway checkout proof described above.
Add `docs/public/pipelane-prepr-checks.v1.json` in Phase 1 with active and synthesized `prePrChecks`, derived config paths, Pipelane version/path, observed execution shape, runner npm registry/cache status, and synthesized defaults.
Add `docs/public/pipelane-no-package-prepr.v1.json`, `docs/pipelane-no-package-recovery.md`, and `scripts/apply-pipelane-no-package-prepr.mjs` only if the upfront Track A precondition activates `NoPackageTrackCPlanV1`.
When Track A preconditions pass, keep the no-package fallback to a short contingency note and do not add fallback scripts or artifacts.
Add `docs/public/council-usefulness-set.v1.json` and `docs/public/council-usefulness-scorecard.v1.json` before Track A and reuse both for the Phase 2C and Phase 5 gates.
Add `docs/public/council-prompt-reserve-prototype.v1.json` from the toolchain-free probe before Track A, and derive Phase 2C context reserve constants from near-final prompt drafts plus explicit headroom.
Add `docs/public/council-claude-tool-policy.v1.json` from the toolchain-free probe before Track A, recording the current adapter argv proof for all six no-tools flags.
Add `docs/public/council-mvp-symbols.v1.json` in Phase 2C and test that Phase 2C/3C exports only MVP symbols.
Add `scripts/check-council-governance.mjs` in Phase 2C to validate the MVP symbols manifest, portable import boundaries, and exported surface together.
`scripts/check-council-plan-split.mjs` will hash this plan, parse the manifest, and verify subplan frontmatter, anchors, snippets, and exact required/forbidden decision strings.
Configure `vitest.config.ts` so clean-checkout tests include portable `extensions/council/lib/**` and exclude Pi-coupled entrypoint, UI, and executors unless Pi-present tests opt in.
`npm run build` is a TS compile or emit check that does not bundle or execute Pi-coupled modules; if a future bundler is introduced, `@earendil-works/*` imports must remain external and unevaluated in clean checkout.
Add `scripts/check-council-portable-imports.mjs` in Phase 1 as the dependency-free import-boundary check for portable MVP modules.
`scripts/ensure-node-deps.mjs` will first fail with `NODE_VERSION_UNSUPPORTED` when `process.version < 22.19.0`, then use an advisory lock/stamp and run `npm ci` only when needed.
Add `scripts/run-package-check.mjs` in Phase 1 as the only entrypoint used by npm `test`, `typecheck`, and `build`.
`scripts/run-package-check.mjs <test|typecheck|build>` resolves the changed-surface base ref in order from `PIPELANE_BASE_REF`, `git symbolic-ref refs/remotes/origin/HEAD --short`, `origin/main`, `origin/master`, `main`, then `master`.
Before trusting any base ref, it builds a base-independent path list from unstaged files, staged files, and optional newline-delimited `PIPELANE_CHANGED_FILES`.
If every base-independent path is docs-only, plan-only, or legacy shell-only, the wrapper may take the documented skip or shell-check path without npm install.
It computes `mergeBase = git merge-base HEAD "$baseRef"` and unions changed files from committed, unstaged, and staged `git diff --name-only --diff-filter=ACMRTUXB` calls.
If no base ref or merge base can be resolved, the wrapper fails open to dependency install and full checks rather than skipping.
When `gh pr view --json baseRefName` is available, the resolved base must match that PR target or the wrapper fails open to full checks.
If `PIPELANE_BASE_REF` is supplied, diagnostics must record it as user-specified and still fail open when the computed diff is empty but `git rev-list --count "$mergeBase"..HEAD` is greater than `0`.
If the changed-file union is empty while HEAD differs from the merge base, or if the base ref cannot be proven to name the intended target, the wrapper fails open to full checks.
If base resolution is unavailable and no base-independent path list exists, committed-diff classification is ambiguous and the wrapper fails open to full checks.
It may skip Node install only when that union excludes tracked Node, package, council extension, council schema, council role, TypeScript test, conformance, and council-public-governance surfaces.
On a skip it prints `CHECK_SKIPPED_NON_NODE_SURFACE`, exits `0`, and writes no install stamp.
On a legacy shell-only diff, `test` runs dependency-free shell checks and unit conformance without npm install, while `typecheck` and `build` skip with `CHECK_SKIPPED_NON_NODE_SURFACE`.
On a Node-surface non-skip it runs `node scripts/ensure-node-deps.mjs`, then dispatches `test` to hermetic conformance plus TS unit tests, `typecheck` to `tsc --noEmit`, and `build` to the chosen TS compile or emit check.
`scripts/ensure-node-deps.mjs` must not contain changed-surface skip logic; it owns only Node version, dependency stamp, locking, and `npm ci`.
Do not rely on installed Pi peer dependencies for `npm run typecheck` or `npm run build`.
Modify `tests/conformance/run.sh` in Phase 1 to add a `hermetic` target that excludes live provider probe and smoke sections and runs only unit plus fake-driven Claude and Codex coverage.
Do not modify tracked `.pipelane.json` as the active pre-PR mechanism for the installed Pipelane version because `readPackageJsonOverlay()` ignores repo-local config.
`package.json` scripts will be `"test": "node scripts/run-package-check.mjs test"`, `"typecheck": "node scripts/run-package-check.mjs typecheck"`, `"build": "node scripts/run-package-check.mjs build"`, and `"verify:pipelane-prepr": "node scripts/verify-pipelane-prepr.mjs --assert-shape && npm run test && npm run typecheck && npm run build"`.
Do not use npm lifecycle pre-hooks for MVP because the changed-surface skip must happen before dependency installation.
Add `extensions/council/cli.ts` in Phase 2C as the Node-backed portable entrypoint that parses inputs, route probes, emit-roster, and the thin engine slice.
Add `extensions/council/lib/types.ts` in Phase 1 for pure types only.
Add `extensions/council/lib/runtime.ts` in Phase 2C for the `CouncilRuntimeContractReport` startup check over Node, package root, loader, `bin/provider-invoke --auth`, `bin/provider-invoke --effort`, and `bin/provider-probe --auth`.
Add `extensions/council/lib/config.ts` in Phase 2C for injected `CouncilConfigRootsV1`, non-Pi paths, authoritative location scope, remembered-path guards, stale dogfood quarantine, and atomic writes; it must not import Pi values.
Add `extensions/council/lib/input.ts` in Phase 2C for `/council` argument parsing, `@plan-file` parsing, safe path resolution, plan loading, issue normalization, immutable plan and issue line numbering, and SHA-256 hashing.
Add `extensions/council/lib/run-intent.ts` in Phase 2C for portable acknowledgment sidecars, intent expiry, atomic mode `0600` writes, and route-catalog revalidation.
Add `extensions/council/lib/effort.ts` in Phase 2C as the only owner of `COUNCIL_EFFORT_ORDER`, `PI_THINKING_LEVEL_TO_COUNCIL_EFFORT`, `normalizePiThinkingLevels`, supported-effort validation, and nearest-effort replacement suggestions.
Add `extensions/council/lib/context-fit.ts` in Phase 2C for `COUNCIL_CONTEXT_RESERVE_VERSION = 1`, fixed prompt reserve constants, and context-window estimates reused by `validateRoster()`.
Add `extensions/council/lib/routes.ts` in Phase 2C for shared provider-invoke discovery, Pi-visible direct route discovery, family detection, Claude subscription-only filtering, effort normalization, and replacement suggestions.
Add `extensions/council/lib/validate-roster.ts` in Phase 2C for exported `validateRoster(input: CouncilValidateRosterInputV1): CouncilRosterValidationResultV1` shared by CLI, `--emit-roster`, Pi UI gating, and engine preflight.
Add `extensions/council/lib/recommend.ts` in Phase 2C for issue-versus-plan roster recommendations and composition feedback.
Add `extensions/council/lib/emit-roster.ts` in Phase 2C for `--emit-roster`: validate input, discover routes, recommend, mint ids, validate, and write atomically without model calls.
Add `extensions/council/lib/engine.ts` in Phase 2C for the thin deterministic portable slice, then expand it in Phase 5 for critique, steelman, adversary, degradation, cancellation, and phase orchestration.
Add `extensions/council/lib/executors/provider-invoke.ts` in Phase 2C for portable calls through `bin/provider-invoke --effort` and `--auth`, and make it own Claude child-env sanitizing.
That executor will map provider envelopes to `CouncilExecutionIdentityV1`, with roster model as `configuredModel`, envelope model as `resolvedModel`, and `adapter_default_unreported` for unknown adapter defaults.
Add `extensions/council/lib/validate-json.ts` in Phase 2C for TS-native tolerant JSON extraction; it must not spawn `bin/lib/json_extract.py` or `python3`.
Add `extensions/council/lib/report.ts` in Phase 2C for TS-native report validation, markdown rendering, frontmatter, and writes with no `frontmatter_set.py` calls.
Do not add `extensions/council/ui/roster-editor.ts`, `extensions/council/ui/composition.ts`, or `extensions/council/ui/keymap.ts` before the post-MVP Pi companion is refreshed and accepted.
Do not add `skills/council/SKILL.md` in first ship.
Add it only after a Claude Code smoke test proves nested skill invocation does not alter symlinked `/synthesis`; otherwise keep `bin/council` and docs.
Add `bin/council` in Phase 2C as a thin shell launcher for `extensions/council/cli.ts` that accepts `--issue`, `--plan-file`, `--roster-file`, `--emit-roster`, `--report-strategy`, `--auth-policy`, `--overwrite`, and `--json`.
Add `bin/council-route-probe` in Phase 2C as a thin shell launcher for `extensions/council/cli.ts route-probe` that emits `CouncilRouteProbeEnvelopeV1`.
Modify `bin/provider-probe` in Phase 2B to accept optional `--auth <auto|subscription|apikey>` while retaining `provider-probe <claude|codex>`.
Modify `bin/adapters/claude.sh` `adapter_probe` in Phase 2B to honor `A_AUTH=subscription` by refusing API-key-only auth.
Modify `bin/adapters/claude.sh` `_claude_exec` in Phase 2B so only `AISYNTH_COUNCIL=1` plus explicit `A_AUTH=subscription` applies the Anthropic credential-denylist plus empty initial `ANTHROPIC_*` allowlist before running Claude CLI.
Add a private shell helper named `_claude_unset_anthropic_credentials` in `bin/adapters/claude.sh` that unsets the current auto-mode credential list without adding `ANTHROPIC_OAUTH_TOKEN`.
Add `_claude_unset_anthropic_subscription_credentials` in `bin/adapters/claude.sh` to unset known Anthropic API, OAuth, auth, bearer, and console credential variables.
Add `_claude_sanitize_subscription_env` in `bin/adapters/claude.sh` to call `_claude_unset_anthropic_subscription_credentials`, remove every `ANTHROPIC_*` name in MVP only for council-marked subscription calls, and never log values.
Keep `A_AUTH=auto` behavior backward compatible for `/synthesis`: when a first-party session exists, unset only the current known credential variables and preserve `ANTHROPIC_OAUTH_TOKEN` and non-credential `ANTHROPIC_*` variables.
Keep non-council `A_AUTH=subscription` behavior backward compatible unless a separate compatibility review explicitly changes that public provider-invoke surface.
Do not modify `bin/provider-invoke` default auth behavior, `--auth` parsing, or `--effort` parsing for MVP; the existing flags are sufficient, and council-owned validation prevents unsupported values from reaching adapter clamps.
Add `roles/council/initial.md`, `roles/council/critique.md`, `roles/council/steelman.md`, `roles/council/adversary.md`, and `roles/council/chair.md` in Phase 5.
Phase 5 must add a prompt-reserve test that those role prompts still fit Phase 2C reserves.
If real Phase 5 prompts exceed the measured reserve before any public v1 council release, one `CouncilContextReserveVersion` bump is pre-authorized inside first-ship acceptance with regenerated prompt-reserve artifact, saved-roster revalidation, and an explicit compatibility note.
The initial and critique role prompts will explicitly tell models to cite `plan.md:Lx-Ly` for `plan_line` evidence on plan input and `issue:Lx-Ly` for `issue_text` evidence on issue input.
Add council voice, critique, steelman, adversary, chair-report, final-report, and terminal-report schemas in Phase 1.
Enforce `schemas/council-voice.json` and `schemas/council-report.json` in Phase 2C, then enforce critique, steelman, adversary, and chair-report schemas in Phase 5.
Enforce `schemas/council-terminal-report.json` for canceled, failed, and deadline terminal reports in Phase 2C.
Add `tests/conformance/council.sh` and source it from `tests/conformance/run.sh` in Phase 2C, with skipped or fixture-gated cases allowed until their implementation phase lands.
Add fake route fixtures under `tests/conformance/fixtures/council/` in Phase 2C.
Add TS unit tests under `tests/council/` across Phases 2 through 5 for parsing, route reconciliation, effort propagation, phase-role assignment, deterministic synthesis, persistence, cancellation, and report validation.
Add a Phase 2C `validate-roster` unit test covering duplicate ids, unavailable routes, unsupported efforts, minimum members, strategy, chair, and context overflow.
Post-MVP Pi UI fixtures are listed in `docs/council-command-post-mvp-pi-companion.md` and are not Phase 2C/5 acceptance gates.
Add a Phase 5 engine preflight unit test that proves the engine calls `validateRoster()` and aborts before model execution when semantic roster validation fails.
Add a Phase 2C TS test proving `--emit-roster` writes a valid `CouncilRosterConfigV1` with two executable members, fresh ids, `scope: "explicit"`, a valid strategy, and no model calls.
Add a single-route emit-roster test in Phase 2C that one executable route emits two same-route entries with distinct roles, allows repeated effort when the route has only one supported value, and can immediately run.
Add a Phase 2C portable remembered-roster test that runs a fake `--roster-file` council, proves the supplied file hash is unchanged, proves the canonical remembered roster is written after `persist_roster`, and then runs without `--roster-file` from that remembered roster.
Add a plan snapshot TOCTOU test in Phase 2C that the engine reviews and reports the frozen bytes from `validate_input` even when the file changes during roster editing, and records `input_on_disk_changed_after_snapshot`.
Add a Phase 2C vertical-slice conformance test that runs `--emit-roster`, then `--roster-file` through two fake voices and verifies validation, grounding, deterministic report write, and read-only roster input.
Add a portable emit-roster failure test in Phase 2C that proves insufficient routes, existing output without `--overwrite`, and invalid output paths exit before writing partial files.
Add a portable executor unit test in Phase 2C that supported efforts reach `bin/provider-invoke --effort`, unsupported efforts block, and missing wrapper support fails loudly.
Add a Phase 2C provider tool-policy test that Claude council calls use the existing no-tools argv and that unproven Codex routes are unavailable with `tool_policy_unproven`.
Add a Phase 2C side-effect canary: snapshot a temp repo, run fake provider write/shell attempts, and prove no file changes without an accepted read-only-shell contract.
Add a Phase 2C Claude token-only test expecting `claude_subscription_login_required_after_env_token_scrub` with only `ANTHROPIC_OAUTH_TOKEN`, no first-party session, and no API fallback.
Add `tests/council/portable-imports.test.ts` in Phase 1 to import portable CLI/shared entrypoints under clean-checkout conditions and fail on any attempted runtime load of `@earendil-works/*`.
Add a clean-checkout import-scan test in Phase 1 that `scripts/check-council-portable-imports.mjs` fails any portable MVP module importing `@earendil-works/*` values.
Add a Phase 2C scheduler test that two same-account provider-invoke members serialize by default, use separate retry budgets, and get serial deadline budget.
Add a Phase 2C scheduler test that `maxConcurrencyGlobalCeiling: 4` with one shared provider lane yields `effectiveConcurrency: 1`, serial wall-clock estimates, and serial long-run acknowledgment thresholds.
Add a portable Claude effort contract test in Phase 2C covering provider-invoke help, real `claude --help`, fake `claude --effort` pass-through, help drift, and blocking for `off`, `minimal`, and unknown values.
Add a Phase 2C portable Claude env test that parent `ANTHROPIC_BASE_URL` blocks the route, while credentials and unclassified `ANTHROPIC_*` are absent before any allowed probe/invoke.
Add a Phase 2B non-council subscription compatibility test proving `bin/provider-invoke claude --auth subscription` without `AISYNTH_COUNCIL=1` preserves current `ANTHROPIC_BASE_URL` behavior and does not run the council scrub.
Add a TS validator unit test in Phase 2C that proves `extensions/council/lib/validate-json.ts` matches checked-in `bin/lib/json_extract.py` fixture expectations without requiring Python at runtime.
Add a Phase 5 chair validation test that a parsed chair draft containing `implementation_authorized:true` is normalized before schema validation and remains usable.
Add a Phase 5 evidence-ledger test that valid plan/issue locators ground, invalid/theory/prior locators do not, and models cannot self-certify grounding.
Add a Phase 5 prompt test that issue and plan prompts include frozen line-number blocks, citation instructions, and prompt hashes covering them.
Add a phase-output validation unit test in Phase 5 that rejects critique, steelman, and adversary outputs containing `evidenceIds` not present in `CouncilEvidenceLedgerV1`.
Add a readiness unit test in Phase 5 that a load-bearing assumption cited with a nonexistent evidence id or only ungrounded evidence cannot reach `decision_readiness: ready`.
Add a readiness unit test in Phase 5 that duplicate normalized assumption keys receive suffixes and every load-bearing assumption remains in the catalog.
Add deterministic catch-all tests that `propose_alternative`, `defer_for_evidence`, and `needs_more_evidence` pluralities produce the no-recommendation sentinel.
Add an engine retry-budget unit test in Phase 5 that proves a malformed first attempt and JSON-only retry share one `memberTimeoutMs` budget and cannot extend the whole-run deadline.
Add a Phase 5 synthesis-contract test that all strategies consume brief plus adversary outputs, preserve phase findings, and never read hidden host-model state.
Add a Phase 5 deterministic readiness test proving two agreeing same-route or same-lane voices cannot emit `decision_readiness: ready` and must record the correlation cap.
Add a single-survivor input contract unit test in Phase 5 that proves `single_survivor_report` consumes only the surviving voice and failed-member diagnostics, never `CouncilSynthesisBriefV1` or `CouncilAdversaryOutputV1[]`.
Add a Phase 5 deadline-precedence test that a run-level deadline during `initial_analysis` writes `deadline_exceeded`, not a single-survivor report.
Add a Phase 5 usefulness-gate comparison test that same-route samples fail with `correlated_no_added_value` unless the council report uses a material dissent, evidence, assumption, or next-action delta absent from the solo baseline.
Add a Phase 5 correlated-exit test proving two failed same-route revision attempts plus no independent authorized route produce `same_route_added_value: not_demonstrated`, cap readiness at `conditional`, disclose the solo-baseline miss, and still allow first ship.
Update `bin/README.md` in Phase 2B or Phase 2C with the council route probe and subscription-only Claude behavior matching the code that has landed.
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
| Project roster precedence | TS config unit test plus Pi fixture | Trusted project roster wins; untrusted project roster is ignored; user roster may seed but Run persists to project scope. |
| Fresh project seed scope | TS config unit test | A trusted project seeded from user-global config uses project `CouncilConfigLocation.scope`, project report scope, and `seededFrom: user`. |
| Portable-to-Pi first seed | TS config test plus Pi fixture | First Pi run without Pi roster seeds from portable global config, labels `seededFrom: "portable-global"`, revalidates, writes only after Run, and never imports `--roster-file`. |
| Config scope authority | TS config unit test | Resolved config location controls in-memory scope and report frontmatter; stale on-disk scope is ignored and rewritten only after Run. |
| Future-version config preservation | TS config persistence unit test | A higher-version roster is backed up before v1 persistence; changed hash or backup failure skips overwrite. |
| Stale dogfood roster quarantine | TS config test | Missing `routeId`, missing `reportStrategy`, entry-level `chair`, duplicate ids, and invalid ids quarantine before recommendations seed the menu. |
| RouteId tuple fallback mismatch | TS route reconciliation test | A stored entry with a stale mismatched `routeId` but matching `(executor, provider, model)` remains available, emits `route_id_mismatch`, and rewrites only after Run. |
| RouteId byte stability | TS route unit test | NFC plus UTF-8 percent-encoding outside `[A-Za-z0-9._~-]` gives stable `routeId` bytes, and tuple fallback is only recovery. |
| Config pipeline precedence | TS config unit test | Required-key and shape validation happen before reconciliation; stale dogfood files quarantine and no role or strategy migration is attempted. |
| Portable stale roster refusal | Conformance plus TS CLI unit test | Missing `routeId`, legacy `chair`, or missing strategy exits `4` with JSON edits, no report, and no model calls. |
| Corrupt config | `tests/conformance/council.sh` | Corrupt file is quarantined and recommendations seed the menu. |
| Unwritable config | `tests/conformance/council.sh` | Run can proceed with a warning and no false "saved" message. |
| Cancelled menu | `tests/conformance/council.sh` | Draft changes are discarded and roster config mtime/content is unchanged. |
| Issue/path ambiguity | `tests/conformance/council.sh` | Sole readable path is a plan, mixed unmarked text is issue text, explicit `@` wins, and single bare non-file token `caching` is issue text. |
| Unreadable path-shaped input | `tests/conformance/council.sh` | Single-token candidates with separators, path prefixes, recognized plan extensions, or existing unreadable filesystem entries error before route discovery. |
| Untrusted path | `tests/conformance/council.sh` | Symlink escape or path outside allowed roots is rejected. |
| Context-window input fit | TS roster validation test | Phase 2C reserves derive from `council-prompt-reserve-prototype.v1.json`, mark oversized members unavailable, and Phase 5 prompts fit. |
| Empty input | `tests/conformance/council.sh` | TUI opens input flow and non-TUI prints usage. |
| Provider failure | `tests/conformance/council.sh` | Failed member is recorded and remaining members continue. |
| Member timeout scope | TS engine/executor unit test | One member timeout aborts only that member controller; other concurrent members continue unless the run-level signal is aborted. |
| Retry shares member timeout | TS scheduler/executor unit test | Malformed output and retry share `memberTimeoutMs`; no retry extends member or whole-run deadline. |
| Deadline beats single survivor | TS engine unit test | A run-level deadline during `initial_analysis` aborts active calls and writes `deadline_exceeded`, not a single-survivor report. |
| Partial council degradation | `tests/conformance/council.sh` | One surviving voice yields degraded `not_ready`; two surviving voices yield degraded council report. |
| Hidden-host-vote prevention | `tests/conformance/council.sh` | No model call occurs for `ctx.model` unless it appears in roster. |
| Clean-checkout portable runtime isolation | TS runtime unit test plus build smoke | Clean checkout import/load proves portable modules request no `@earendil-works/*` values and build does not execute Pi-coupled modules. |
| Post-MVP Pi companion boundary | Governance script test | MVP symbol and import scans fail if Phase 2C/5 exports Pi UI, Pi direct gates, `pi-complete`, or live-effort symbols named only by the companion. |
| Provider-invoke effort propagation | TS executor unit test plus conformance | The portable executor verifies `--effort`, forwards only supported values, blocks unsupported remembered efforts, and fails if the flag disappears. |
| Phase-role fallback | TS engine unit test | Rosters without explicit critic, steelman, or adversary roles receive deterministic explicit-member phase assignments recorded in diagnostics. |
| State-machine guarded transitions | TS engine unit test | Zero, one, and two-plus initial survivors take specified transitions, and later failures degrade without skipping phases. |
| Synthesis input contracts | TS engine/report unit test | Deterministic, disagreement, and chair synthesis consume `CouncilSynthesisBriefV1` plus `CouncilAdversaryOutputV1[]`, include phase findings, and read no hidden host state. |
| Single-survivor input contract | TS engine/report unit test | `single_survivor_report` consumes only the surviving voice plus failed-member diagnostics and never requires synthesis brief or adversary arrays. |
| Shared roster validator | TS validator, UI, and engine tests | Portable CLI, editor, and engine preflight all consume `validateRoster()` and agree on ids, routes, efforts, minimum, and chair validity. |
| Roster entry id uniqueness | TS roster and UI unit test | Add and duplicate mint fresh opaque ids, edit and reorder preserve ids, duplicates quarantine or block Run, and `chairEntryId` resolves once. |
| Chair identity authority | TS roster and engine unit test | Only `reportStrategy.chairEntryId` authorizes chair synthesis; the referenced entry must have `role: "chair"`; entry-level `chair` is invalid. |
| One-survivor chair strategy | TS engine unit test | With a chair strategy and exactly one surviving initial voice, no chair model call occurs and the report is single-survivor mechanical whether the chair survived or failed. |
| Whole-run deadline budget | TS scheduler unit test | The computed deadline uses `CouncilMvpLanePlanV1`, is at least the sum of scheduled effective lane budgets plus overhead, and never aborts before valid scheduled work exhausts its budget. |
| Long-run acknowledgment | TS state-machine and CLI test | Portable CLI derives `estimated_cost_bucket` and `--ack-long-run` from `CouncilMvpLanePlanV1`; post-MVP Pi must reuse the same token inputs. |
| Combined portable acknowledgments | TS CLI test | One exit prints stale-input and long-run flags together, and re-snapshot recomputes the long-run token from the new input hash. |
| Same-account provider lane | TS scheduler unit test | Two same-route or same-auth provider-invoke members serialize by default, their lane budget is included in the whole-run deadline, diagnostics identify the non-secret lane key, and `effectiveConcurrency` is `1` when one lane is active. |
| Whole-run deadline abort | TS engine/executor unit test | A fake slow member exceeds the computed deadline; active calls abort, unscheduled phases skip, and the report records `deadline_exceeded`. |
| Evidence-auditor routing | TS engine unit test | A successful `evidence-auditor` roster entry is scheduled in the `critique` phase and emits `assumption_reviews`; no separate evidence-auditor phase is required. |
| Critique assumption catalog injection | TS prompt and validator unit test | Critique prompts include the frozen assumption catalog, hashes cover it, and validation rejects unknown assumption ids. |
| Deterministic report strategy | `tests/conformance/council.sh` | Explicit deterministic final synthesis uses no model executor, report says deterministic, and plan or explicit-option issue inputs can recommend deterministic by default. |
| Position catalog grouping | TS engine unit test | Plan and issue inputs build deterministic position catalogs, voices can only use catalog ids or exact `other:<slug>`, and majority/plurality grouping uses `canonicalPositionId`. |
| Steelman other positions | TS phase-output validation test | Steelman accepts `other:<slug>` ids present in grouped positions and rejects unknown ids. |
| Issue catalog extraction grammar | TS catalog fixture test | Alternative markers, checklist bullets, binary separators, duplicates, overlong text, and single-option input produce expected ids. |
| Free-form issue strategy default | TS recommendation unit test plus UI fixture | Free-form issue prose defaults to structured disagreement unless a valid chair or explicit deterministic choice is selected. |
| Prompt catalog ordering | TS prompt assembly unit test | `derive_position_catalog` runs before `prepare_prompts`, every initial prompt contains identical catalog bytes, and prompt hashes cover those bytes. |
| Issue prompt grounding | TS prompt and ledger tests | Issue input is immutable `issue:Lx` text, prompts require citations, and valid locators become grounded evidence. |
| Deterministic synthesis algorithm | TS engine unit test | Majority, plurality, catch-all plurality, tie, no-grounded-evidence, one-survivor, degraded phase, assumption, and dissent cases produce specified readiness and recommendation fields. |
| Correlated readiness cap | TS deterministic synthesis unit test | A same-route or same-lane council with agreeing voices and no material dissent is capped at `conditional` and records `route_correlation`. |
| Chair report strategy | `tests/conformance/council.sh` | Chair route is an explicit roster member and has its own call record. |
| Invalid chair strategy | TS roster validation test | `chair:<member-id>` blocks Run when the member is disabled, unavailable, missing, or has unsupported effort. |
| Structured disagreement strategy | `tests/conformance/council.sh` | Report preserves disagreement mechanically without forcing a recommendation and no model executor is called during synthesis. |
| Portable Claude effort support | Help parser, fake argv, and route unit test | Claude exposes `low` through `max` only when help and argv pass-through prove support; help drift removes values without model calls. |
| Deferred Pi UI lifecycle | Companion test index | Pi reload, session replacement, TUI render width, and registry-only fallback tests are specified in the companion and are not first-MVP gates. |
| Non-Pi fallback | `tests/conformance/council.sh` | `bin/council`, and any future post-proof portable skill, reports no native menu and uses JSON roster or clear usage. |
| Portable invalid roster | `tests/conformance/council.sh` | Parsed but invalid `--roster-file` exits `3` for schema failures or `4` for semantic failures, writes no report, and never falls back silently. |
| Portable first roster authoring | TS CLI unit test plus conformance | `--emit-roster` writes a runnable many-route or one-route roster, and that file immediately runs. |
| Portable self-test | TS CLI unit test plus conformance | `bin/council --self-test --json` emits `CouncilRuntimeContractReport`, makes no model calls, exits `0` when runtime checks pass, and exits `5` when required surfaces fail. |
| Portable emit-roster no partial write | TS CLI unit test | Insufficient executable routes, existing output without `--overwrite`, unwritable parent, or invalid input exits before writing a roster file or report. |
| Portable emit-roster remembered path guard | TS CLI unit test | `--emit-roster` refuses resolved canonical remembered paths, including `.ai-synthesis/council/roster.v1.json` and `AISYNTH_CONFIG_HOME` overrides, with exit `2`. |
| Portable roster-file read-only | TS CLI unit test | Successful `--roster-file` execution writes no changes to the supplied file, even when canonical ids, scope, or timestamps differ in memory. |
| Portable remembered persistence | TS engine/config unit test | A confirmed `--roster-file` run writes the canonical roster to `${AISYNTH_CONFIG_HOME:-$HOME/.ai-synthesis}/council/roster.v1.json`, leaves the supplied file untouched, and later runs without `--roster-file` load that remembered roster. |
| Portable remembered concurrency | TS config unit test | If the remembered target changed after load, persistence skips with `portable_remembered_concurrent_write` and execution proceeds with `remembered_roster_written: false`. |
| Portable report-strategy override | TS CLI unit test plus conformance | `--report-strategy` is a one-run override, validates chair executability, records source, and does not rewrite the roster. |
| Claude subscription-only | `tests/conformance/council.sh` | API-key-only Claude is unavailable for council but existing `/synthesis` probe default remains auto. |
| Claude mixed credentials | TS executor unit test plus fake Claude CLI | OAuth/subscription stays subscription-only with mixed env credentials, and child env scrubs all `ANTHROPIC_*` names for explicit council subscription calls. |
| Claude auto compatibility | Existing conformance plus fake Claude env test | Unset, empty, and explicit `A_AUTH=auto` crossed with session-present/absent fakes keep `/synthesis` child env and argv byte-for-byte equal. |
| Claude probe auto compatibility | Existing conformance plus fake Claude env test | `bin/provider-probe claude` and `adapter_probe` keep byte-for-byte stdout, stderr, and exit status for the same auth/session matrix. |
| Claude council subscription sanitizer | Fake Claude env test | Parent `ANTHROPIC_BASE_URL` blocks council-marked subscription routes with `claude_subscription_custom_endpoint_not_allowed`; otherwise `AISYNTH_COUNCIL=1 --auth subscription` scrubs Anthropic env before fake logged-in success. |
| Claude non-council subscription compatibility | Fake Claude env test | `bin/provider-invoke claude --auth subscription` without `AISYNTH_COUNCIL=1` keeps pre-existing `ANTHROPIC_BASE_URL` behavior and does not run the council scrub. |
| Claude token-only subscription env | Fake Claude env test | With only `ANTHROPIC_OAUTH_TOKEN` and no first-party login, discovery returns `claude_subscription_login_required_after_env_token_scrub` with no API fallback. |
| Claude no-cost subscription probe | Phase 2B/2C local check | Logged-in Claude CLI makes `provider-probe` and `provider-invoke --auth subscription` succeed with scrubbed env and no paid probe call. |
| Provider-invoke auth surface | TS executor test plus shell fixture | The executor verifies `bin/provider-invoke --auth`, passes subscription for Claude, and fails if the flag disappears. |
| Provider-probe auth surface | TS runtime unit test plus shell fixture | Startup verifies planned `provider-probe --auth` before probing and fails if the flag disappears. |
| Provider-invoke tool policy | Fake argv and side-effect canary tests | Claude routes prove no-tools argv, unproven Codex routes stay unavailable, and fake write/shell attempts leave the repo unchanged. |
| Claude no-tools argv artifact | Toolchain-free probe plus fake argv test | `docs/public/council-claude-tool-policy.v1.json` records all six current Claude no-tools flags; missing flags block Claude execution until Track B adds them. |
| No paid probe calls | Unit test with fake executors | Route discovery calls only registry/probe methods and never invokes model execution. |
| Stable route IDs | TS route unit test | Display/auth/cost changes do not change `routeId`; provider-invoke defaults use `adapter-default`; tuple fallback never maps that sentinel to Pi model routes. |
| Adapter-default execution identity | TS executor/report test | Reports preserve `adapter-default`, record resolved models when present, and mark unknown defaults without counting them as family diversity. |
| Structured output validation | Unit test with fixtures | TS-native validation rejects `ok:false`, extra keys, wrong types, and prose-only responses, then retries once inside the same member budget. |
| JSON extractor parity | TS validator fixture test | TS validation matches extractor fixtures for JSON, fences, arrays, schema failures, prose-only text, and scan caps without Python. |
| Per-voice validation mapping | TS engine unit test | `validateModelJson` returns `kind`, malformed voice output degrades only that member, and validator failures never become portable CLI process exit codes. |
| Engine-owned grounding | TS evidence-ledger unit test | Valid plan/issue locators ground evidence; theory, prior knowledge, malformed locators, and model `grounded` claims do not. |
| Evidence id validation | TS phase-output validator unit test | Critique, steelman, and adversary outputs with fabricated `evidenceIds` are rejected after retry and degrade that phase member. |
| Readiness requires grounded ledger evidence | TS deterministic synthesis unit test | A load-bearing assumption marked `verified_by_cited_evidence` with nonexistent or ungrounded evidence ids cannot produce `decision_readiness: ready`. |
| MVP readiness disclosure | TS report unit test | MVP reports include `readiness_basis: internal_input_grounded` and disclose that repo/web claims were not independently verified. |
| Chair authorization normalization | TS report unit test | Chair JSON is extracted, `implementation_authorized` is stripped before strict value validation, final assembly forces `false`, and post-normalization `true` is rejected. |
| Single-survivor frontmatter | TS report unit test | One-survivor reports emit `report_strategy: single_survivor`, preserve `configured_report_strategy`, and do not claim `chair` when no chair call happened. |
| Plan immutability | Unit test | Plan file hash and mtime are unchanged after a run. |
| Plan snapshot TOCTOU | TS input/engine unit test | A changed plan before Run requires Accept Frozen, Re-snapshot, or Cancel; portable CLI prints the required `--accept-stale-input-sha` and proceeds only when it matches. |
| Issue snapshot acknowledgment | TS input/CLI unit test | Issue input is normalized, line-numbered, hashed, and frozen in `validate_input`; `--ack-long-run` and `CouncilRunIntentV1.inputSnapshot` exist before `prepare_run_context`. |
| Portable run intent | TS CLI/config unit test | A blocking portable exit writes a secret-free intent sidecar, re-invocation with `--intent` reuses frozen values, changed route availability invalidates it, and expiry cleans it up. |
| Atomic persistence | Unit test | Interrupted temp write does not corrupt the last good roster, and changed target hash causes a concurrent-write warning instead of clobber. |
| Canceled terminal report | TS engine unit test | Cancellation after `persist_roster` validates against `schemas/council-terminal-report.json`; cancellation before Run writes no report. |
| Failed terminal report | TS engine unit test | Failure after execution starts validates a terminal report with diagnostics and `implementation_authorized: false`. |
| Council report isolation | Existing suites plus fixture | Council reports stay under `./.ai-synthesis/council-sessions/` and do not affect legacy session commands. |
| Node fallback parity | TS CLI unit test plus `tests/conformance/council.sh` | `bin/council` invokes the shared TS engine and does not contain independent shell synthesis logic. |
| Missing Node fallback dependency | `tests/conformance/council.sh` | Missing Node or runtime loader prints setup instructions and does not create config or reports. |
| Hermetic conformance target | CI/local script test | `tests/conformance/run.sh hermetic` passes with real `claude` and `codex` absent from `PATH`, no provider auth, and no model-network access. |
| Plan split reviewability | Scripted governance check | `scripts/check-council-plan-split.mjs` verifies manifest plan hash, anchors, snippets, and exact required/forbidden decision strings before product code. |
| Pipelane blocking pre-PR gate | CI/local script test | `scripts/verify-pipelane-prepr.mjs` proves installed `pr.ts` blocks on failed `prePrChecks`, hard preconditions are true, and Track A is first to make them green. |
| Pipelane version and shape drift | CI/local script test | `--assert-shape` runs no network or npm install on every PR, fails with `PIPELANE_SHAPE_DRIFT`, and prints the no-package recovery command on drift. |
| Pipelane proactive drift check | Script unit test | `--check-drift` compares installed Pipelane version/path/shape to the artifact without npm or package tests and reports drift before pre-PR execution. |
| Pipelane manual bypass | Manual gate checklist | On Pipelane version/shape drift, the maintainer records `pipelane-version-drift`, runs equivalent checks manually, and explicitly accepts or blocks the PR. |
| Pipelane npm bootstrap | CI/local script test | `--bootstrap-smoke` proves candidate npm scripts install in a no-`node_modules` throwaway checkout through exact Pipelane `sh -lc`; only then may `package.json` land. |
| Pipelane synthesized defaults | CI/local script test | Active and empty-`PIPELANE_HOME` checks match `docs/public/pipelane-prepr-checks.v1.json` and execute green through `sh -lc`. |
| Pipelane no-package fallback | Activation-only manual plus script gate | If Track A preconditions fail, applying `docs/public/pipelane-no-package-prepr.v1.json` makes `bash -n ...` plus `tests/conformance/run.sh unit` green without package metadata. |
| No-package Track C path | Activation-only scripted check | `NoPackageTrackCPlanV1` validates type-stripped TS only when Node exposes `--experimental-strip-types`; otherwise the fallback-capability decision is package-deferred, package-alternative, or JS rewrite. |
| Fresh-clone no-package recovery | Activation-only script unit test | After fallback activation, `scripts/apply-pipelane-no-package-prepr.mjs --verify` applies tracked `${PIPELANE_HOME}` config bytes atomically and proves the conformance recipe green. |
| Pipelane manual-scope rollback | Manual plus script-recorded gate | Fresh empty `PIPELANE_HOME` without package metadata reports recipe required, while recipe-applied homes or retained Track A homes are green. |
| Pipelane Node version | Script unit test plus artifact check | `ensure-node-deps` fails with `NODE_VERSION_UNSUPPORTED` below Node `22.19.0`, and the Pipelane artifact records the observed runner Node version. |
| Pipelane changed-surface guard | Script unit test | Docs-only diffs skip Node install/tests, legacy shell-only diffs run dependency-free shell checks, Node/package/council/conformance/public-governance diffs do not skip, unresolved base refs fail open, and stale or wrong base refs fail open to full checks. |
| Package check activation | CI/local script test | Clean checkout without Pi passes `npm ci`, `test`, `typecheck`, and `build` in the same commit as `package.json` and install-aware scripts. |
| Track A fallback activation | Scripted precondition test | Failed registry/cache or Pipelane preconditions stop before `package.json` and activate the approved `NoPackageTrackCPlanV1` fallback; only a failed type-strip capability probe emits `needs-decision [key=no-package-fallback-capability]`. |
| Provider-present conformance | Local integration check | `tests/conformance/run.sh all` remains available for developer machines with configured providers but is not required by generic Pipelane pre-PR checks. |
| Deferred Pi companion coverage | Companion test index | Pi package install, surface gates, runtime drift, direct effort mapping, release artifacts, and parallel proof tests stay in `docs/council-command-post-mvp-pi-companion.md` until post-MVP review. |
| Phase 2 readiness cap | Phase 2 vertical-slice test | The thin deterministic slice uses final synthesis code but cannot emit `ready` before Phase 5 critique exists. |
| Toolchain-free usefulness probe | Shell-only checklist plus scorecard | Draft prompts require exact citations, and every fixed usefulness-set sample has a passing manual scorecard before Track A. |
| MVP usefulness gate | Manual dogfood checklist plus scorecard | After Phase 5, two authorized portable members review every sample; same-route Claude is allowed, labeled correlated, must beat the solo baseline or record `correlated_no_added_value`, and may ship only through the two-attempt disclosed correlated exit. |
| MVP governance drift | Script/export-scan test | `check-council-governance.mjs` enforces MVP symbols, portable import boundaries, and exported surface together. |
| Claude skill coexistence | Claude Code loader smoke test | `skills/council/SKILL.md` ships only after a pinned smoke test proves nested discovery/invocation cannot alter symlinked `/synthesis`. |
| Phase 2+ rollback safety | Scripted rollback checklist or manual verification | Reverting Phase 2+ while retaining Track A keeps hermetic conformance and Pipelane checks green. |
| Full abandonment rollback | Manual rollback checklist | Track A removal is green only on retained-baseline or recipe-applied homes, and empty homes report the tracked recipe-required diagnostic. |
| Backward compatibility | Existing suites | `tests/conformance/run.sh all` keeps current unit, Claude, and Codex tests green. |

## Acceptance Criteria

First-shippable MVP acceptance covers portable-first Track A plus Phase 2B, Phase 2C, Phase 5, and minimum Phase 6 docs scope.
Post-MVP Phase 3C-7 criteria live in `docs/council-command-post-mvp-pi-companion.md` and are not first-MVP acceptance gates.
The three generated MVP subplans, split manifest, split checker, and governed companion index are force-added before product code, and the checker proves they preserve this governing plan's settled decisions.
`/council` is absent unless the user installs the Pi package or, post-proof, loads the portable skill; first ship exposes `bin/council`.
Post-MVP `/council` in Pi TUI is deferred to the companion; first ship provides portable JSON roster authoring and execution.
Run is impossible until at least two executable members and one final report strategy are valid.
Portable roster semantic validation, `--emit-roster`, and engine preflight all use the same exported `validateRoster()` result.
Run is impossible with a chair strategy unless the selected chair entry has `role: "chair"` and is enabled and executable.
`reportStrategy.chairEntryId` is the only authoritative chair synthesis identity, and canonical roster config contains no entry-level `chair` boolean.
Single-model, same-family, and cross-family councils all run when they satisfy the practical minimum.
Unsupported efforts are never clamped, downgraded, removed, or hidden.
Unavailable remembered members are visibly preserved with suggestions.
Cancel never persists the roster draft.
Run persists the confirmed roster atomically before execution.
For plan input, the reviewed bytes, citations, and `input_sha256` come from the frozen snapshot, and a source-file change before Run requires Accept Frozen Snapshot, Re-snapshot, or Cancel.
For issue input, normalized bytes, citations, and `input_sha256` also come from the `validate_input` snapshot before long-run acknowledgment or intent creation.
With one executable route, `--emit-roster` writes two same-route entries with distinct roles and may repeat the same supported effort.
Trusted project-local and user-global roster config precedence behaves exactly as specified, with no silent merge.
Post-MVP Pi first-run seeding is specified in the companion and must remain one-way from portable global roster to a Pi draft, with no mutation of explicit portable `--roster-file` inputs.
Package home resolution prefers the running council package root and uses `AISYNTH_HOME` only as a validated fallback with expected council resources.
Config scope is derived from the resolved config location, not trusted from an in-file field.
Higher-version roster configs are never overwritten until their exact original bytes have been backed up, and failed backup skips persistence rather than losing the newer config.
Missing `routeId`, missing `reportStrategy`, or entry-level `chair` in a v1 roster is stale dogfood corruption and is quarantined or refused before execution.
Stale stored `routeId` values do not make a route unavailable when `(executor, provider, model)` still matches.
Roster entry ids are opaque, unique within a roster, stable across edits and reorders, and collisions block Run.
Route discovery does not make paid model calls.
Known route context windows are checked before Run, and oversized inputs mark affected members unavailable with explicit diagnostics rather than failing after invocation.
Phase 2C context reserves are derived from the checked-in near-final prompt prototype artifact with explicit headroom, and Phase 5 prompt changes must fit those reserves or use the one pre-release `CouncilContextReserveVersion` bump.
Council route discovery marks any provider-invoke route without a proven council tool policy unavailable.
Claude provider-invoke routes must prove the existing no-tools argv before they can execute.
Codex provider-invoke routes must remain unavailable until a no-tools or accepted read-only-shell contract is proven.
Claude council routes never use Anthropic API credentials; explicit subscription-only auth, child-env scrubbing, token-only refusal, and unchanged `/synthesis` auto behavior are all tested.
`adapter_probe` and `bin/provider-probe claude` keep byte-for-byte `/synthesis` auto behavior across unset, empty, and explicit `A_AUTH=auto` crossed with session-present and session-absent fakes.
Post-MVP Pi direct route, surface, drift, effort, and concurrency acceptance is deferred companion scope.
Same-account provider-invoke lanes serialize by default in the MVP, and the user-facing estimate is based on `CouncilMvpLanePlanV1.effectiveConcurrency`.
Portable execution delegates only validated supported efforts to the existing `bin/provider-invoke --effort` surface and never relies on adapter clamps.
Council structured validation is TS-native and does not require `python3` or spawn `bin/lib/json_extract.py` at runtime.
Only the engine may set ledger `grounded`; model outputs cannot self-certify grounding, and every critique, steelman, or adversary `evidenceIds` reference must resolve to the ledger.
Decision readiness `ready` requires grounded ledger evidence, not model-provided locator prose or fabricated ids.
Issue input is normalized, line-numbered, and prompt-addressable as immutable `issue:Lx-Ly` evidence so issue councils can produce grounded ledger evidence.
Every model voice in the final report corresponds to an explicit roster entry.
Adapter-default provider-invoke reports distinguish configured route model from resolved execution model and mark unresolved defaults honestly.
The host model is not used as a hidden chair, summarizer, or vote.
The reviewed plan file is never modified.
The final report includes recommendation, evidence, strongest dissent, assumptions, risks, change conditions, critique/steelman/adversary findings, readiness, next action, and `implementation_authorized: false`.
MVP reports must label readiness as internal-input grounded and state that repo_context and web claims were not independently verified.
The final report explicitly says council completion does not authorize implementation.
The engine forces `implementation_authorized: false` during final assembly and treats a chair model's wrong or missing authorization field as a normalized diagnostic, not as an authorization source.
Canceled, failed, and deadline terminal reports validate against `schemas/council-terminal-report.json` and never pretend to satisfy the completed council report schema.
Deterministic, structured disagreement, and chair synthesis consume `CouncilSynthesisBriefV1` plus explicit `CouncilAdversaryOutputV1[]`; none may discard successful phase output.
Existing `/synthesis`, `--solo`, `--compare`, and `revisit` behavior remains compatible.
Track A toolchain, Track B provider hardening, and Track C council product remain separately reviewable and mergeable, and Track C cannot depend on an unaccepted Track A or Track B gate.
Track A package scaffolding is first merge after usefulness and bootstrap pass; if upfront Track A preconditions fail, the approved `NoPackageTrackCPlanV1` fallback plus no-package recovery become the merge gate.
Shell-only Track B may precede Track A only through the recorded red-gate bypass with `bash -n` and `tests/conformance/run.sh unit`; Track C Node/TS product code remains behind Track A or the approved no-package fallback.
Track B provider hardening lands as Phase 2B and portable Track C product lands as Phase 2C/5, so council product code consumes provider auth changes rather than mixing them in one merge.
A failed Track A package baseline activates predefined `NoPackageTrackCPlanV1` and does not permanently block TS product delivery.
Only a failed `NoPackageTrackCPlanV1` type-strip capability probe escalates `needs-decision [key=no-package-fallback-capability]`.
MVP cannot run with Pi-registry-only auth; it shows `no_executable_provider_cli_routes` and docs explain that authorized portable routes are required.
Post-MVP Pi TUI and Pi direct execution start only after portable first ship and a refreshed companion plan review.
Council reports are written only under `./.ai-synthesis/council-sessions/` in the MVP and do not appear in the legacy `/synthesis` session glob.
Portable CLI invalid roster files fail before execution with the specified exit codes and without writing config or reports.
Portable roster-file execution never mutates the supplied file, `--emit-roster` is the canonical explicit-file authoring path for non-Pi users, and `--report-strategy` is a validated one-run override.
Confirmed portable Run writes the remembered roster only to `${AISYNTH_CONFIG_HOME:-$HOME/.ai-synthesis}/council/roster.v1.json` after the concurrent-write guard passes.
`--emit-roster` refuses canonical remembered-config paths derived from `CouncilConfigRootsV1` because remembered state is written only after Run.
Portable CLI stale dogfood roster shapes fail with exit `4` until the user edits the roster into canonical v1.
The input parser uses the specified path-shaped predicate and treats a single bare non-file token as issue text.
Zero, one, and two-plus initial survivor paths take explicit tested state transitions.
One-survivor execution uses `single_survivor_report`, never calls a chair, never feeds the normal synthesis contract, and records the originally configured strategy separately.
Single-survivor frontmatter sets `report_strategy_effective: single_survivor_mechanical`.
The whole-run deadline is computed from scheduled phase budgets and cannot abort before valid scheduled work exhausts its budget.
Runs whose computed deadline or cost estimate exceeds the configured acknowledgment thresholds require an explicit Run-time acknowledgment before roster persistence.
The MVP deadline, scheduler, long-run acknowledgment, and diagnostics share `CouncilMvpLanePlanV1`; deferred Pi-direct work must extend that plan only in companion-governed post-MVP work.
Each malformed-output JSON retry shares the member's `memberTimeoutMs` budget and cannot extend either the member timeout or the whole-run deadline.
When the whole-run deadline expires, active calls abort, the terminal report records `deadline_exceeded`, and that failure beats single-survivor reporting.
Issue-input position catalogs are generated by the specified marker-token grammar and covered by fixtures for ordinary prose, explicit alternatives, and checklist bullets.
Usefulness gates are pass/fail only on objective scorecard fields; maintainer notes are recorded evidence, not gate operands.
Same-route or same-model usefulness gates include a solo baseline and fail with `correlated_no_added_value` unless the council report uses a material dissent, evidence, assumption, or next-action delta absent from the solo report.
After two failed same-route revision attempts and no authorized independent route, the gate may exit through disclosed correlated ship mode rather than blocking first ship.
Disclosed correlated ship mode sets `same_route_added_value: not_demonstrated`, caps readiness at `conditional`, and tells the user that the roster is a structured second pass rather than an independent council.
Free-form issue input with no extracted explicit alternatives defaults recommendations to structured disagreement unless the user selects a chair or explicitly chooses deterministic synthesis.
Every initial prompt contains the frozen position catalog bytes and prompt hashes cover those bytes.
Deterministic synthesis groups only by engine-assigned `canonicalPositionId` from a frozen position catalog.
Deterministic synthesis treats catch-all and deferral position ids as no-recommendation sentinels.
Critique-phase prompts include the frozen assumption review catalog, and critique validation rejects any assumption review keyed to an id outside that catalog.
Deterministic readiness uses the specified `materialDissent` predicate and critique-phase assumption reviews, not an unscheduled phase or model-prose similarity.
Structured disagreement synthesis is mechanical and does not call a model; a model-written synthesis requires an explicit chair strategy.
Repository-wide pre-PR checks become install-aware in the `package.json` commit only after the bootstrap smoke proves the active Pipelane `sh -lc` path, and tracked `.pipelane.json` remains non-authoritative for installed Pipelane.
This repo-wide gate applies only to `ai-synthesis` development and must never install package metadata into repositories reviewed by `bin/council`.
`scripts/verify-pipelane-prepr.mjs` records active and empty-`PIPELANE_HOME` checks, version shape, registry/cache state, and fallback status in tracked artifacts.
`--assert-shape` is wired into `npm run verify:pipelane-prepr`, and `npm run verify:pipelane-prepr` is the cheap per-PR drift assertion before the package checks.
`scripts/verify-pipelane-prepr.mjs --check-drift` reports installed-Pipelane drift proactively without npm install or package tests.
`npm run test`, `npm run typecheck`, and `npm run build` all call `scripts/run-package-check.mjs`, which runs changed-surface classification before dependency installation and prints `CHECK_SKIPPED_NON_NODE_SURFACE` only for non-Node surfaces.
Legacy shell-only `/synthesis` and provider-adapter diffs avoid npm installation but still run dependency-free shell syntax and unit conformance checks.
The changed-surface wrapper fails open to full Node checks when the base ref is unresolved, mismatched with the PR target, empty despite branch commits, or otherwise suspicious.
Missing registry/cache access on a Node-surface diff fails with `DEPENDENCY_INSTALL_UNAVAILABLE` instead of skipping checks.
Normal rollback keeps Track A green; full removal is green only for retained Track A homes, recipe-applied homes, or an equivalent tracked replacement gate.
Clean-checkout npm checks do not require installed Pi packages.
Pi-present surface checks remain outside MVP clean-checkout CI and are deferred companion gates.
Hermetic fake conformance, TS tests, clean-checkout npm commands, and install-aware pre-PR checks pass without Pi packages, provider CLIs, auth, or model network.
First ship requires the fixed usefulness gate to pass with two executable authorized portable members, not two distinct providers or route ids.
Single-model or same-route first ship requires correlated-voice labeling and diversity recommendations.

## Rollout And Evaluation

Ship portable `bin/council` first after the fixed usefulness gate passes.
Ship `skills/council/SKILL.md` only after nested-skill proof on a pinned Claude Code version.
Dogfood first with `bin/council --self-test`, fake routes, `--emit-roster`, and one portable plan plus issue run before any Pi UI work starts.
Before portable live smoke, validate hermetic conformance, effective Pipelane `prePrChecks`, `npm ci`, test, typecheck, and build.
When validating recurring Pipelane checks, record registry versus prewarmed-cache status and stop on `DEPENDENCY_INSTALL_UNAVAILABLE`.
After portable ship, refresh `docs/council-command-post-mvp-pi-companion.md` before starting Pi TUI, Pi package, Pi direct execution, or parallel Pi proof work.
Treat `tests/conformance/run.sh all` as provider-present integration only, then live-smoke one plan, one issue, one same-model roster, and one cross-family roster.
Record recommendation edits, canceled menus, failed runs, and degradation counts, but do not auto-optimize recommendations or extend `revisit` until council reports have outcome data.

## Documentation

Update `README.md` with portable-first `/council` install, MVP authorized-route requirements, Pi-registry-only exclusion, install/remove commands, report retention, and Node and no-Python prerequisites.
Document Pipelane gates, per-home recovery, homes/config scope, stale dogfood quarantine, future-version backup, and atomic writes.
Document that portable and Pi roster stores are separate, with one-way first-run Pi draft seeding from portable global config only when no Pi roster exists.
Document invocation examples, two-member minimum, non-gating family diversity, chair identity, shared `validateRoster()`, context-fit diagnostics, effort/routing provenance, billing labels, and no paid probes.
Document Claude subscription-only behavior, no Anthropic API fallback, child-env policy, token-only failure, `/synthesis` auto preservation, and Pi direct OAuth/subscription guards.
Document post-MVP Pi surface gates, strict release checks, Phase 7 live-effort proof, and Pi TUI lifecycle in the companion rather than as MVP user instructions.
Document execution cancellation/reload/deadline/retry/report semantics, adapter-default model resolution, no authorization, and deterministic synthesis contracts in the MVP docs.
