# Council Command Implementation Plan

This plan covers the optional, user-installed `/council` capability for `ai-synthesis`.
It is an implementation plan only and does not implement the capability.
The design keeps `/council` as personal `ai-synthesis` customization and does not require any Firstmate repository or default behavior change.

## What Already Exists

`README.md` describes `ai-synthesis` as a Claude Code skill installed by symlinking the whole repository into `~/.claude/skills/synthesis`.
`SKILL.md` is the current `/synthesis` orchestrator and intentionally keeps orchestration in the skill file instead of a framework.
`SKILL.md` resolves `AISYNTH_HOME` from the directory containing the skill and writes durable project-local sessions under `./.ai-synthesis/sessions/`.
`SKILL.md` supports `/synthesis <decision>`, Pi-style `@file`-like context parsing for `/synthesis`, `--solo`, `--compare`, `rate`, `revisit`, `expand`, `list`, and `resume`.
`SKILL.md` already defines independent initial analysis, shared evidence ledger construction, degradation on failed voices, adversarial review, decision-grade versus exploratory grading, and frontmatter-backed ratings and outcomes.
`roles/analyst.md`, `roles/critic.md`, `roles/steelman.md`, `roles/synthesizer.md`, `roles/adversary.md`, and `roles/solo.md` provide the strongest reusable prompting concepts for council phases.
`schemas/analyst.json`, `schemas/critic.json`, `schemas/steelman.json`, `schemas/adversary.json`, and `schemas/solo.json` enforce `ok: true`, provenance discipline, cruxes, capability gaps, and bounded adversarial objections.
`bin/provider-probe` performs a no-cost binary and authentication check for `claude` or `codex` and emits the normalized provider envelope.
`bin/provider-invoke` runs a role call through `claude` or `codex` and emits the same envelope with `ok`, `status`, `provider`, `model`, `structured`, `text`, `error`, and `meta`.
`bin/adapters/claude.sh` already supports `--auth auto|subscription|apikey`, but `bin/provider-probe` does not currently expose a CLI flag to set `A_AUTH`.
`bin/adapters/claude.sh` defaults to subscription-preferred auto mode and can fall back to `ANTHROPIC_API_KEY`, which `/council` must avoid for Claude routes.
`bin/adapters/codex.sh` maps `max` to `xhigh` for `/synthesis`, but `/council` must not silently clamp remembered effort values.
`bin/lib/json_extract.py` provides tolerant JSON extraction plus full schema validation and is the correct shared validator for model text that is not provider-enforced.
`bin/lib/frontmatter_set.py` updates session frontmatter fields for rating and revisit flows and should remain available for council report metadata updates if needed.
`tests/conformance/run.sh` runs `unit`, `claude`, and `codex` suites, while `tests/conformance/fakes.sh` provides fake CLIs for deterministic auth, timeout, malformed, retry, and argv tests.
`.gitignore` ignores `/docs/*` except `/docs/public/`, so this plan and later non-public implementation docs must be added with `git add -f`.
`.pipelane.json` declares generic npm pre-PR checks that do not currently match the shell-only repository, so package scripts or `.pipelane.json` must be aligned in the same phase that adds `package.json`.
Pi documentation under `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/` supports the required optional package path.
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
Pi direct model execution can use `complete(model, context, options)` from `@earendil-works/pi-ai/compat` after resolving auth with `ctx.modelRegistry.getApiKeyAndHeaders(model)`.
Pi session replacement and reload invalidate old extension contexts, so any council command must abort active work on `session_shutdown` and use only replacement contexts inside `withSession` callbacks.

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
The Run action should be disabled until at least two executable members and a valid final report strategy are present.
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
Use executor implementations to keep route identity separate from provider/model identity.
Use the existing provider layer only as a model executor behind the shared TypeScript engine for portable CLI routes and non-Pi fallback.
Do not make the Pi extension shell out to `pi` itself.
Do not change the current `/synthesis` orchestration in `SKILL.md` except for documentation links if desired later.

The package shape should be:

```text
package.json
tsconfig.json
vitest.config.ts
extensions/council/index.ts
extensions/council/cli.ts
extensions/council/lib/types.ts
extensions/council/lib/config.ts
extensions/council/lib/input.ts
extensions/council/lib/routes.ts
extensions/council/lib/recommend.ts
extensions/council/lib/engine.ts
extensions/council/lib/executors/pi-complete.ts
extensions/council/lib/executors/provider-invoke.ts
extensions/council/lib/report.ts
extensions/council/ui/roster-editor.ts
extensions/council/ui/composition.ts
extensions/council/ui/keymap.ts
skills/council/SKILL.md
bin/council
bin/council-route-probe
scripts/verify-pi-package.mjs
roles/council/initial.md
roles/council/critique.md
roles/council/steelman.md
roles/council/adversary.md
roles/council/chair.md
schemas/council-voice.json
schemas/council-critique.json
schemas/council-adversary.json
schemas/council-report.json
tests/conformance/council.sh
tests/conformance/fixtures/council/
tests/council/
tests/council/pi-fixtures/
```

`package.json` should include `"keywords": ["pi-package"]` and a `pi` manifest that exposes `extensions/council/index.ts` and `skills/council`.
`package.json` should list Pi core packages as peer dependencies with `"*"` ranges, matching Pi package documentation.
`package.json` should include runtime dependencies needed by the portable Node wrapper, including `jiti` if the CLI loads TypeScript sources directly.
`package.json` scripts should make `npm run test`, `npm run typecheck`, and `npm run build` meaningful before `.pipelane.json` pre-PR checks see the new package.
The Pi extension should import `ExtensionAPI`, `CONFIG_DIR_NAME`, `getAgentDir`, `DynamicBorder`, `BorderedLoader`, `getSettingsListTheme`, `complete` and `getSupportedThinkingLevels` from the installed Pi packages, and `@earendil-works/pi-tui` controls.
The portable skill should use relative paths from its `SKILL.md` and should not require Pi APIs.
`extensions/council/cli.ts` should be the non-Pi entrypoint and should call the same input parser, config loader, route catalog, engine, and report writer as the Pi extension.
The shell `bin/council` should be only a thin launcher that checks for Node, loads the TypeScript CLI through `jiti` or the chosen runtime loader, and exits with clear setup instructions when dependencies are missing.
The shell `bin/council-route-probe` should be only a thin launcher for `extensions/council/cli.ts route-probe --json`.
Do not create a second shell implementation of roster validation, phase orchestration, synthesis, cancellation, or reporting.
The shell interface should be:

```sh
bin/council --issue <text> --roster-file <path> [--report-strategy deterministic|structured_disagreement|chair:<member-id>] [--json]
bin/council --plan-file <path> --roster-file <path> [--report-strategy deterministic|structured_disagreement|chair:<member-id>] [--json]
bin/council-route-probe --json [--auth-policy subscription-only|default]
```

The portable CLI path should refuse to run without a roster file because it cannot present Pi's native editable menu.
The Pi extension should use `ctx.modelRegistry` for Pi routes and should not parse Pi auth files directly.
The Pi extension should call `complete(model, context, { apiKey, headers, env, signal: runSignal, timeoutMs, maxRetries: 0, reasoningEffort: entry.effort })` for Pi model routes.
The Pi executor must use the per-call `reasoningEffort` option shown by the installed Pi examples, not session-global `pi.setThinkingLevel()`, to avoid cross-member effort bleed during concurrent calls.
If a future installed Pi version renames that option, Phase 1 should update the executor contract and type tests before model execution is implemented.
The Pi extension should pass no model tools during council MVP.
The extension itself should read plan files into immutable, line-numbered text and should instruct models to cite `plan.md:Lx-Ly`.
The engine should accept issue text or immutable plan text, a confirmed roster, a route catalog, and an abort signal.
The engine should return a structured report object plus markdown.
The report writer should save markdown under `./.ai-synthesis/sessions/<id>-council.md` to reuse existing session browsing concepts without changing old sessions.
The Pi extension should append a custom Pi session entry named `ai-synthesis-council` with run id, input summary, status, and report path.
The custom Pi session entry should not be the source of roster persistence.

## Data And Config Schemas

Use TypeScript types as the implementation source of truth and JSON schemas for model outputs.
Keep config versioned from day one.
Store user-global roster config under `join(getAgentDir(), "ai-synthesis", "council", "roster.v1.json")` in Pi.
Store non-Pi roster config under `${AISYNTH_CONFIG_HOME:-$HOME/.ai-synthesis}/council/roster.v1.json`.
Resolve the `ai-synthesis` package home from `AISYNTH_HOME` when set, otherwise from the package root derived from `import.meta.url` or the directory containing `skills/council/SKILL.md`.
Never hardcode Firstmate paths.
Create config files with mode `0600` where the platform supports it.
Write config atomically by writing `<file>.tmp.<pid>`, fsyncing the file when practical, and renaming it over the target.
On corrupt config, preserve the corrupt file as `roster.v1.json.corrupt.<timestamp>` and start from recommendations.
On unwritable config, allow the current run to proceed after Run but warn that the roster could not be remembered.

Core TypeScript interfaces should be:

```ts
export type CouncilEffort = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export type CouncilExecutorKind = "pi-complete" | "provider-invoke";

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

export interface CouncilRoute {
  ref: CouncilRouteRef;
  displayName: string;
  family: string;
  providerDisplayName: string;
  supportedEfforts: CouncilEffort[];
  auth: {
    configured: boolean;
    runnable: boolean;
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
  chair: boolean;
}

export type CouncilReportStrategy =
  | { kind: "chair"; chairEntryId: string }
  | { kind: "deterministic" }
  | { kind: "structured_disagreement" };

export interface CouncilRosterConfigV1 {
  version: 1;
  updatedAt: string;
  entries: CouncilRosterEntryV1[];
  reportStrategy: CouncilReportStrategy;
}
```

`routeId` must be a deterministic stable key with the form `v1:<executor>:<provider>:<model>`.
Each component should be Unicode-normalized, percent-encoded, and never include display name, cost, auth source, billing state, or availability.
Roster reconciliation should first match fresh routes by exact `routeId`, then by the same `(executor, provider, model)` tuple for old configs that predate `routeId`.
If neither key matches, the remembered roster entry remains visible and unavailable with replacement suggestions.
Changing a route's display label, auth state, billing label, cost metadata, or effort support must not change `routeId`.

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
  "position_key": "stable lowercase short key for the member's recommendation position",
  "recommendation": "role-specific recommendation or position",
  "evidence": [
    {
      "claim": "string",
      "source_type": "plan_line|issue_text|repo_context|web|theory|prior_knowledge",
      "locator": "string",
      "grounded": true
    }
  ],
  "assumptions": [
    {
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

`position_key` should be generated by the model under instructions to use a short lowercase ASCII slug and should be normalized by the engine to `[a-z0-9-]{1,64}`.
When the model omits or emits an invalid `position_key`, the engine should derive one from the first 80 characters of `recommendation` and mark it as derived in diagnostics.
The deterministic synthesis strategy depends on `position_key`, grounded evidence, risks, and assumptions rather than free-form prose ordering.
The critique schema should require targeted challenges, steelmans, and crux verification status.
The adversary schema should reuse the existing bounded pattern from `schemas/adversary.json` with axes `evidence`, `framing`, and `recommendation_logic`.
The final report schema should require:

```json
{
  "recommendation": "string",
  "decision_readiness": "ready|conditional|not_ready",
  "evidence_summary": ["string"],
  "strongest_dissent": "string",
  "assumptions": ["string"],
  "risks": ["string"],
  "what_would_change_recommendation": ["string"],
  "next_action": "string",
  "implementation_authorized": false
}
```

The `implementation_authorized` field should have `const: false`.
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
report_strategy: chair | deterministic | structured_disagreement
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
Recommendation should also use the current `ctx.model`, the prior confirmed roster, user-global Pi `settings.json`, trusted project `.pi/settings.json`, and `enabledModels` patterns when those files are readable through Pi's configured homes.
Pi execution should call `ctx.modelRegistry.getApiKeyAndHeaders(model)` only when the user has selected Run and the route is about to execute.
Resolving API keys or headers is allowed at execution time because it is not a paid probe call, but it may execute user-configured commands and should be treated as sensitive.
Claude routes must be subscription-only.
Pi Claude routes should be included only when auth is OAuth or another Pi subscription route, not when the only available source is an Anthropic API key.
Portable Claude Code routes should call `bin/provider-probe claude --auth subscription` and `bin/provider-invoke claude --auth subscription`.
Add a backward-compatible optional `--auth <auto|subscription|apikey>` flag to `bin/provider-probe`.
Leave `bin/provider-probe claude` defaulting to existing `auto` behavior for `/synthesis` compatibility.
When only `ANTHROPIC_API_KEY` is present, `/council` should show Claude as unavailable with the reason `Claude API key detected, but council requires subscription auth`.
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
For non-reasoning Pi routes, supported efforts should be `["off"]`.
For portable Codex CLI routes, supported efforts should be `["minimal", "low", "medium", "high", "xhigh"]`.
For portable Claude Code subscription routes, supported efforts should be the adapter-supported set, initially `["low", "medium", "high", "max"]`, unless a future no-cost capability probe provides better model-specific metadata.
Unsupported remembered efforts should remain in config and UI until the user edits them.
Execution should reject an enabled member whose selected effort is unsupported and should not call `pi.setThinkingLevel()` or `provider-invoke` with a different effort.
Pi execution should pass the selected supported effort to `complete()` as per-call `reasoningEffort` for each member.
Portable execution should pass the selected supported effort to `bin/provider-invoke --effort` for each member.
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
`validate_roster` computes executable members, unavailable members, unsupported efforts, composition feedback, and report strategy validity.
`confirm_run` fires when the user selects Run.
`persist_roster` atomically writes the confirmed roster before model execution starts.
`prepare_prompts` builds immutable prompts and line-numbered plan evidence.
`prepare_prompts` also creates one per-run `AbortController` that is owned by the engine, not by `ctx.signal`, because Pi command contexts can be idle and may not provide a signal.
`initial_analysis` runs each executable member independently without seeing other member outputs.
`pool_evidence` deterministically builds a shared evidence ledger from issue text, plan lines, and member evidence.
`critique` runs evidence-led critique over the ledger and initial outputs.
`steelman` runs steelman prompts over the same ledger and initial outputs.
`adversary` runs bounded adversarial objections against the draft result or structured disagreement.
`synthesize` runs either an explicit chair model, deterministic synthesis code, or structured disagreement generation.
`validate_report` validates the final report schema and `implementation_authorized: false`.
`write_report` writes the markdown report through a temp file and rename.
`write_terminal_report` writes a canceled or failed report only after the roster has been confirmed and execution has started.
`done` displays the result and the report path.
`canceled` aborts active work and reports what was canceled.
`failed` reports why no council output could be produced.

Phase-role semantics should be deterministic and independent of UI ordering except where explicitly stated.
Every enabled executable roster entry runs `initial_analysis`, including a designated chair.
Later phases select explicit roster members from the successful initial voices.
`critique` should run all successful members with role `implementation-critic` or `risk-critic`; if none exist, select the highest-effort non-chair successful member, or the highest-effort successful member if every survivor is a chair, breaking ties by roster order.
`steelman` should run all successful members with role `steelman`; if none exist, select the successful member whose `position_key` has the fewest supporters, breaking ties by highest effort then roster order.
`adversary` should run all successful members with role `adversary`; if none exist, select a successful `risk-critic`, otherwise the highest-effort non-chair successful member, or the highest-effort successful member if every survivor is a chair.
`chair` is a report strategy role only and does not automatically satisfy critique, steelman, or adversary selection unless its roster role also matches that phase.
Phase fallback selection must be recorded in the report diagnostics so users can see when a member was reused outside its preferred role.
If a selected later-phase member fails, that phase degrades; the engine should not silently substitute an unrecorded member after the phase starts.

Allowed transitions should be:

```text
idle -> parse_input -> validate_input -> discover_routes -> load_roster -> recommend_roster -> edit_roster
edit_roster -> validate_roster -> edit_roster
edit_roster -> canceled
validate_roster -> confirm_run
confirm_run -> persist_roster -> prepare_prompts -> initial_analysis -> pool_evidence
pool_evidence -> critique -> steelman -> adversary -> synthesize -> validate_report -> write_report -> done
initial_analysis -> write_terminal_report -> failed
initial_analysis -> pool_evidence
critique -> synthesize
steelman -> synthesize
adversary -> synthesize
any_running_state_after_persist -> write_terminal_report -> canceled
any_running_state_after_persist -> write_terminal_report -> failed
any_running_state_before_persist -> canceled
any_pre_confirm_state -> failed
```

Initial analyses should run through a bounded promise pool.
The default max concurrent member calls should be `4`.
The default hard roster cap should be `6` enabled members, with a config override allowed up to `8`.
The default timeout should be `300000` ms for initial, critique, steelman, and adversary calls.
The default timeout should be `420000` ms for explicit chair synthesis.
The provider retry count should be `0` for transport-level retries so Pi can surface rate limits instead of waiting silently.
Malformed structured output should get one JSON-only retry per voice.
Structured validation should use a helper with the concrete signature `validateModelJson(schemaPath: string, rawText: string): Promise<{ ok: true; value: unknown } | { ok: false; exitCode: 3 | 4 | 2; rawText: string; error: string }>` and should delegate to `bin/lib/json_extract.py` for parity with the existing provider layer.
Auth, timeout, malformed, budget, rate limit, and invocation failures should degrade that voice rather than crash the whole council.
If no initial voices succeed, the run should fail with no recommendation.
If exactly one initial voice succeeds after at least one runtime failure, the report should be `degraded`, `not_ready`, and clearly label the output as a single surviving voice, not a valid council recommendation.
If at least two initial voices succeed, the report may complete as a council even when later critique, steelman, adversary, or chair phases degrade.
A designated chair must be a roster entry and must also run an independent initial analysis before the synthesis phase.
A deterministic strategy must not call any model for synthesis.
A deterministic strategy should produce a mechanical synthesis with narrower guarantees than a chair model.
A deterministic strategy should group successful initial voices by normalized `position_key`.
A deterministic strategy should choose `recommendation` as the majority position when one position has more than half of successful voices.
A deterministic strategy should choose `recommendation` as the plurality position only when it has at least two voices and at least one more supporter than the runner-up.
A deterministic strategy should set `recommendation` to `No deterministic recommendation; see structured disagreement` when there is a tie, one surviving voice, no grounded evidence, or no plurality that meets the rule above.
A deterministic strategy should rank `evidence_summary` by grounded evidence cited by the most voices, then by source locator, then by first appearance.
A deterministic strategy should choose `strongest_dissent` from the largest non-winning position, breaking ties by count of grounded counter-evidence, count of load-bearing assumptions, and roster order.
A deterministic strategy should set `decision_readiness` to `ready` only when at least two voices support the winning position, no critical phase degraded, and no winning-position load-bearing assumption is unverified.
A deterministic strategy should set `decision_readiness` to `conditional` when there is a winning position but unresolved assumptions, partial degradation, or material dissent.
A deterministic strategy should set `decision_readiness` to `not_ready` when the recommendation is the no-recommendation sentinel, only one initial voice survived, or validation failed.
A deterministic strategy should set `next_action` to the highest-ranked assumption verification when readiness is conditional or not ready, otherwise to the smallest concrete next step named by the winning position.
A deterministic strategy should include a report note that the synthesis was generated by auditable aggregation code, not by another model voice.
A structured disagreement strategy must preserve major positions and dissent without forcing a recommendation.
The current Pi host model must never be used for a model call unless its provider/model route is present as an enabled roster entry.
The engine should create one `runId` per Run using timestamp, input hash, and random suffix.
The Run button should become inactive after `confirm_run` to prevent duplicate starts.
Escape, Pi `session_shutdown`, process signals in the portable CLI, and timeout handlers should all abort the per-run `AbortController`.
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
Unavailable remembered routes should stay visible and should not count toward the two-member minimum.
Unsupported remembered efforts should stay visible and should block that member from being executable until edited.
Provider auth failure at execution time should mark that member failed and continue if possible.
Provider timeout should mark that member timed out and continue if possible.
Provider malformed output after retry should preserve raw text in diagnostics but should not count as a structured voice.
Provider rate limit should mark that member failed with a retry-after hint when available.
Partial degradation should lower decision readiness and show which phases lost voices.
Failure of an explicit chair should fall back to deterministic synthesis only if at least two initial voices succeeded and the report says the chair failed.
Failure of deterministic synthesis validation should fail the run rather than invent a report.
Escape in the roster editor should cancel without persistence.
Escape during execution should abort the per-run `AbortController` and write `status: canceled` only if execution had already started.
If cancellation or failure happens before `confirm_run`, no council report should be written because there is no confirmed roster or run.
If cancellation or failure happens after `persist_roster`, `write_terminal_report` should write a minimal report with frontmatter `status: canceled` or `status: failed`, member diagnostics collected so far, and `implementation_authorized: false`.
Pi `/reload`, `/new`, `/resume`, `/fork`, `/clone`, or process shutdown during a run should trigger `session_shutdown`, abort active work, and avoid using stale `ctx` objects.
After reload, the next `/council` invocation should load the last confirmed roster from global config, not from stale memory.
Session replacement should not resume a half-finished council automatically.

## Security And Privacy

Pi packages and extensions run with the user's local permissions, so `/council` should be opt-in through `pi install`.
The extension must never write to the reviewed plan file.
The extension must read a plan file once, hash it, and pass immutable line-numbered text to model calls.
The extension should include `input_sha256` and file metadata in the report so the user can tell what was reviewed.
All file paths should be resolved with `realpath`.
Default allowed roots should be the current `ctx.cwd` and any configured `council.allowedRoots`.
Symlinks escaping allowed roots should be rejected.
Relative paths should resolve against `ctx.cwd`.
Absolute paths outside allowed roots should be rejected unless `council.allowedRoots` permits them.
Project-local council config should be honored only when `ctx.isProjectTrusted()` is true.
User-global config under `getAgentDir()` is always user-owned and can be loaded before project trust.
Context and plan contents must be treated as data, not instructions.
Model prompts must state that council completion does not authorize implementation.
Claude council routes must not use Anthropic API keys.
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
Adding `package.json` must not activate failing pre-PR checks; package scripts and `.pipelane.json` must be aligned in the same implementation phase.
Existing session files in `./.ai-synthesis/sessions/` must remain readable by `expand`, `list`, `resume`, `rate`, and `revisit`.
Council reports can share the session directory by using `mode: council` frontmatter and should be ignored by older `/synthesis` commands that expect other modes.
Existing `--solo` and `--compare` should not depend on the council roster or route catalog.
Existing `revisit` can later learn to include `mode: council`, but initial council implementation should not require changing revisit.
The optional Pi package should not be installed by default and should not affect users who only symlink the Claude Code skill.
If users install the package and later remove it with `pi remove`, their `./.ai-synthesis/sessions/*-council.md` reports remain readable markdown.
If users have a remembered roster from a future version, version mismatch should warn and start from recommendations rather than partially loading unknown fields.
If users have a remembered roster from an early council build without `routeId`, migration should derive `routeId` from `(executor, provider, model)` and preserve the original entry id, role, effort, enabled state, and chair flag.

## Implementation Phases

Phase 1 should add package scaffolding, TypeScript types, JSON schemas, TypeScript test runner setup, package scripts, `.pipelane.json` alignment, and conformance fixtures without model execution.
Phase 2 should implement input parsing, trusted path validation, immutable plan loading, stable route IDs, route discovery, effort support, and roster config persistence.
Phase 3 should implement the Pi TUI roster editor and non-TUI fallback behavior.
Phase 4 should implement the Pi `complete` executor with per-call `reasoningEffort`, the provider-invoke fallback executor, structured validation, retry-once behavior, and cancellation through an engine-owned `AbortController`.
Phase 5 should implement the council engine state machine, evidence ledger, degradation, report strategies, report writer, and Pi session custom entry.
Phase 6 should add documentation, README install/update notes, and the portable `skills/council/SKILL.md` instructions.
Phase 7 should run live smoke tests manually with at least one subscription Claude route and one Codex route after the fake conformance suite is green.

## Exact File-Level Changes

Add `package.json` with package metadata, `pi` manifest, peer dependencies, runtime `jiti` dependency if TypeScript is loaded directly by the CLI, dev dependencies for TypeScript testing, and scripts for `test`, `test:sh`, `test:ts`, `typecheck`, and `build`.
Add `tsconfig.json`, `vitest.config.ts`, and `scripts/verify-pi-package.mjs` unless the implementation chooses an equivalent Node built-in test setup with the same coverage.
Modify `.pipelane.json` in the same phase as `package.json` if needed so its `npm run test`, `npm run typecheck`, and `npm run build` checks call real scripts and stay green.
Add `extensions/council/index.ts` to register `/council`, load config, handle Pi mode branching, and call the UI and engine.
Add `extensions/council/cli.ts` as the Node-backed portable entrypoint that calls the same shared engine as the Pi extension.
Add `extensions/council/lib/types.ts` for all interfaces listed in this plan.
Add `extensions/council/lib/config.ts` for `getAgentDir()` based paths, non-Pi paths, config migration, quarantine, and atomic writes.
Add `extensions/council/lib/input.ts` for `/council` argument parsing, `@plan-file` parsing, safe path resolution, plan loading, line numbering, and SHA-256 hashing.
Add `extensions/council/lib/routes.ts` for Pi route discovery, family detection, supported effort calculation, Claude subscription-only filtering, and replacement suggestions.
Add `extensions/council/lib/recommend.ts` for issue-versus-plan roster recommendations and composition feedback.
Add `extensions/council/lib/engine.ts` for the state machine, phase-role assignment, deterministic synthesis, degradation, cancellation, and phase orchestration.
Add `extensions/council/lib/executors/pi-complete.ts` for Pi direct model calls through `complete()`.
Add `extensions/council/lib/executors/provider-invoke.ts` for portable provider calls through `bin/provider-invoke`.
Add `extensions/council/lib/report.ts` for structured report validation, markdown rendering, report frontmatter, and report file writes.
Add `extensions/council/ui/roster-editor.ts` for the custom TUI component.
Add `extensions/council/ui/composition.ts` for composition feedback rendering.
Add `extensions/council/ui/keymap.ts` for key handling and `keyHint()` labels.
Add `skills/council/SKILL.md` as the portable non-Pi skill.
Add `bin/council` as a thin shell launcher for `extensions/council/cli.ts` that accepts `--issue`, `--plan-file`, `--roster-file`, `--report-strategy`, and `--json`.
Add `bin/council-route-probe` as a thin shell launcher for `extensions/council/cli.ts route-probe` that emits `CouncilRouteProbeEnvelopeV1`.
Modify `bin/provider-probe` to accept optional `--auth <auto|subscription|apikey>` while retaining `provider-probe <claude|codex>`.
Modify `bin/adapters/claude.sh` `adapter_probe` to honor `A_AUTH=subscription` by refusing API-key-only auth.
Do not modify `bin/provider-invoke` default auth behavior except to document that council passes `--auth subscription`.
Add `roles/council/initial.md`, `roles/council/critique.md`, `roles/council/steelman.md`, `roles/council/adversary.md`, and `roles/council/chair.md`.
Add `schemas/council-voice.json`, `schemas/council-critique.json`, `schemas/council-adversary.json`, and `schemas/council-report.json`.
Add `tests/conformance/council.sh` and source it from `tests/conformance/run.sh`.
Add fake route fixtures under `tests/conformance/fixtures/council/`.
Add TypeScript unit tests under `tests/council/` for input parsing, route reconciliation, effort propagation, phase-role assignment, deterministic synthesis, config persistence, cancellation, and report validation.
Add Pi integration fixtures or fakes under `tests/pi/` or `tests/council/pi-fixtures/` to simulate `ctx.modelRegistry`, `ctx.ui.custom()`, `session_shutdown`, and session replacement without live model calls.
Update `bin/README.md` with the council route probe and subscription-only Claude behavior.
Update `README.md` with optional Pi package install instructions and a short warning that the native `/council` menu is Pi-only.
Force-add any non-public docs under `docs/` because `.gitignore` intentionally ignores them.

## Test Matrix

| Scenario | Test location | Expected result |
|---|---|---|
| Single-model roster | `tests/conformance/council.sh` | Two members using the same provider/model with different roles are valid when efforts are supported. |
| Same-family roster | `tests/conformance/council.sh` | Two OpenAI-family or Claude-family routes are valid and family diversity is only a warning. |
| Cross-family roster | `tests/conformance/council.sh` | Claude plus Codex or another family is valid and receives positive diversity feedback. |
| Unsupported effort | `tests/conformance/council.sh` | Remembered effort remains visible, member is not executable, and nearest valid effort is suggested without mutation. |
| Unavailable remembered member | `tests/conformance/council.sh` | Unavailable member remains visible and is persisted only after Run if still in the confirmed draft. |
| Corrupt config | `tests/conformance/council.sh` | Corrupt file is quarantined and recommendations seed the menu. |
| Unwritable config | `tests/conformance/council.sh` | Run can proceed with a warning and no false "saved" message. |
| Cancelled menu | `tests/conformance/council.sh` | Draft changes are discarded and roster config mtime/content is unchanged. |
| Issue/path ambiguity | `tests/conformance/council.sh` | Sole readable path is a plan, mixed unmarked text is issue text, and explicit `@` wins. |
| Unreadable path-shaped input | `tests/conformance/council.sh` | Command errors before route discovery. |
| Untrusted path | `tests/conformance/council.sh` | Symlink escape or path outside allowed roots is rejected. |
| Empty input | `tests/conformance/council.sh` | TUI opens input flow and non-TUI prints usage. |
| Provider failure | `tests/conformance/council.sh` | Failed member is recorded and remaining members continue. |
| Partial council degradation | `tests/conformance/council.sh` | One surviving voice yields degraded `not_ready`; two surviving voices yield degraded council report. |
| Hidden-host-vote prevention | `tests/conformance/council.sh` | No model call occurs for `ctx.model` unless it appears in roster. |
| Per-member Pi effort propagation | TypeScript executor unit test | `pi-complete` passes each roster entry's effort as per-call `reasoningEffort` and never calls `pi.setThinkingLevel()`. |
| Concurrent mixed efforts | TypeScript executor unit test | Two concurrent Pi member calls with different efforts preserve their own effort options and do not bleed session-global state. |
| Phase-role fallback | TypeScript engine unit test | Rosters without explicit critic, steelman, or adversary roles receive deterministic explicit-member phase assignments recorded in diagnostics. |
| Deterministic report strategy | `tests/conformance/council.sh` | Final synthesis uses no model executor and report says deterministic. |
| Deterministic synthesis algorithm | TypeScript engine unit test | Majority, plurality, tie, no-grounded-evidence, one-survivor, and degraded cases produce the specified readiness and recommendation fields. |
| Chair report strategy | `tests/conformance/council.sh` | Chair route is an explicit roster member and has its own call record. |
| Structured disagreement strategy | `tests/conformance/council.sh` | Report preserves disagreement without forcing a recommendation. |
| Pi reload during menu | `tests/conformance/council.sh` or Pi integration test | Menu closes, no config write occurs, and stale context is not used. |
| Pi session replacement during run | Pi integration test | Active run aborts and no replacement-session work uses old `ctx`. |
| Non-Pi fallback | `tests/conformance/council.sh` | Portable skill or `bin/council` reports no native menu and uses JSON roster or clear usage. |
| Claude subscription-only | `tests/conformance/council.sh` | API-key-only Claude is unavailable for council but existing `/synthesis` probe default remains auto. |
| No paid probe calls | Unit test with fake executors | Route discovery calls only registry/probe methods and never invokes model execution. |
| Stable route IDs | TypeScript route unit test | Display name, auth state, billing label, cost, and availability changes do not change `routeId`; missing routes stay visible. |
| Structured output validation | Unit test with fixtures | `ok:false`, extra keys, wrong types, and prose-only responses fail validation and retry once. |
| Report authorization guard | Unit test | `schemas/council-report.json` rejects `implementation_authorized: true`. |
| Plan immutability | Unit test | Plan file hash and mtime are unchanged after a run. |
| Atomic persistence | Unit test | Interrupted temp write does not corrupt last good roster. |
| Canceled terminal report | TypeScript engine unit test | Cancellation after `persist_roster` writes a minimal `status: canceled` report and cancellation before Run writes no report. |
| Failed terminal report | TypeScript engine unit test | Failure after execution starts writes `status: failed` with diagnostics and `implementation_authorized: false`. |
| Node fallback parity | TypeScript CLI unit test plus `tests/conformance/council.sh` | `bin/council` invokes the shared TypeScript engine and does not contain independent shell synthesis logic. |
| Missing Node fallback dependency | `tests/conformance/council.sh` | Missing Node or runtime loader prints setup instructions and does not create config or reports. |
| Package check activation | CI/local script test | `npm run test`, `npm run typecheck`, and `npm run build` all resolve to real checks before `.pipelane.json` relies on them. |
| Backward compatibility | Existing suites | `tests/conformance/run.sh all` keeps current unit, Claude, and Codex tests green. |

## Acceptance Criteria

`/council` is absent unless the user installs the Pi package or loads the portable skill.
`/council` in Pi TUI opens a roster editor seeded from the last confirmed roster or recommendations.
Run is impossible until at least two executable members and one final report strategy are valid.
Single-model, same-family, and cross-family councils all run when they satisfy the practical minimum.
Unsupported efforts are never clamped, downgraded, removed, or hidden.
Unavailable remembered members are visibly preserved with suggestions.
Cancel never persists the roster draft.
Run persists the confirmed roster atomically before execution.
Route discovery does not make paid model calls.
Claude council routes never use Anthropic API credentials.
Every model voice in the final report corresponds to an explicit roster entry.
The host model is not used as a hidden chair, summarizer, or vote.
The reviewed plan file is never modified.
The final report includes recommendation, evidence, strongest dissent, assumptions, risks, what would change the recommendation, decision readiness, next action, and `implementation_authorized: false`.
The final report explicitly says council completion does not authorize implementation.
Existing `/synthesis`, `--solo`, `--compare`, and `revisit` behavior remains compatible.
The full fake conformance suite and TypeScript unit suite pass.

## Rollout And Evaluation

Ship `/council` behind optional Pi package installation only.
Dogfood first with a local path install using `pi -e ./extensions/council/index.ts` and then `pi install ./`.
Validate with fake route tests before any live model spend.
Validate `npm run test`, `npm run typecheck`, and `npm run build` locally before live smoke so the new package checks are not discovered first by pre-PR automation.
Run live smoke with one plan file, one issue text, one same-model roster, and one cross-family roster.
Record whether users choose recommended rosters or edit them heavily.
Track canceled menus separately from failed runs.
Track runtime degradation counts in council report frontmatter for later calibration.
Do not optimize recommendations from usefulness ratings automatically.
Use a future `revisit` extension only after council reports have enough outcome data.

## Documentation

Update `README.md` with an optional `/council` section that distinguishes Pi-native UI from portable skill fallback.
Document `pi install` global and project-local installation paths.
Document `pi remove` and the fact that reports remain local markdown.
Document Node and package dependency requirements for the portable `bin/council` fallback.
Document `AISYNTH_HOME`, `AISYNTH_CONFIG_HOME`, `PI_CODING_AGENT_DIR`, and Pi's `getAgentDir()` based storage behavior.
Document the plan-file parser rules with examples for `/council plan.md`, `/council @plan.md`, and `/council fix plan.md`.
Document the minimum valid council and explicitly state that family diversity is not required.
Document Claude subscription-only behavior and the absence of Anthropic API fallback.
Document provider billing labels and cost estimation limits.
Document cancellation, reload, and session replacement behavior.
Document that `/council` never modifies the reviewed plan and never authorizes implementation.
