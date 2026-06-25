# Provider layer

The auth-agnostic substrate the `/ai-synthesis` orchestrator calls to run a role
on any model backend. The orchestrator (the skill file) never shells out to
`claude` / `codex` / `curl` directly — it calls these two entrypoints and reads
**one normalized envelope**, so the heterogeneous reality (Claude's enforced
schema, Codex's prompt-instructed JSON + JSONL stream, future curl backends) is
hidden behind a single contract.

Substrate: bash (thin, bash 3.2-safe) + `jq` + `python3` for the JSON-heavy bits.
No SDK, no framework — "the skill file is the orchestrator."

## Entrypoints

### `bin/provider-probe <claude|codex>`
Cheap "can this backend run?" check — binary present + auth resolvable. **No model
call, no cost.** Emits the envelope with `structured = {available, authed, …}`;
`ok = available && authed`.

### `bin/provider-invoke <claude|codex> [options]`
Run one role call. Always emits the envelope on stdout. Invocation *outcomes*
(auth / timeout / malformed / budget) are envelopes with **exit 0**; only a usage
error exits non-zero (2). Never crashes the caller.

| Option | Meaning |
|---|---|
| `--prompt <text>` / `--prompt-file <path>` | the task prompt (required) |
| `--role <text>` / `--role-file <path>` | role/persona system prompt |
| `--schema <json>` / `--schema-file <path>` | JSON schema (see asymmetry below) |
| `--require-keys <csv>` | override required keys (else derived from `schema.required`) |
| `--model <id>` · `--effort <low…max>` · `--timeout <s>` | backend tuning |
| `--web` | enable web grounding where supported (codex) |
| `--max-budget-usd <n>` | hard cost cap (claude; default 1.00) |
| `--auth <auto\|subscription\|apikey>` | claude auth preference (default auto) |

Per-backend quirks the layer absorbs so the orchestrator can pass one uniform set
of flags: `--effort max` maps to codex's `xhigh` (codex has no `max`); `--model`
is forwarded to codex (`-m`) so `envelope.model` is truthful; `--web` maps to
codex `web_search="live"` (the older `web_search_cached` is rejected by ≥0.125);
the codex prompt is passed after a `--` sentinel so a dash-leading prompt isn't
parsed as a flag. `--timeout` is honored even without coreutils (python3 fallback).
`--auth auto` prefers the first-party session and **falls back to** `ANTHROPIC_API_KEY`
when no session exists (so the probe and the real call agree).

## The normalized envelope

```json
{
  "ok": true,
  "status": "ok",                 // ok|blocked|timeout|malformed|auth|budget|invocation_failed|unavailable|needs_input
  "provider": "codex",
  "model": "",
  "structured": { "...": "..." },  // parsed object, or null
  "text": "raw model text",
  "error": null,                   // human-readable summary when ok=false
  "meta": {
    "parsed": "schema|tolerant|raw|none",
    "timed_out": false,
    "attempts": 1,
    "tokens": 20182,
    "cost_usd": 0
  }
}
```

The orchestrator's rule of thumb: parse stdout, branch on `.ok` / `.status`;
degrade a voice on `ok:false` (drop it, note it, continue) rather than aborting
the synthesis.

## Structured-output asymmetry (by design)

Only Claude enforces a schema. The layer squares this so the orchestrator doesn't
have to care:

| | Claude | Codex |
|---|---|---|
| Schema | `--json-schema` (enforced) → `.structured_output` | instructed in prompt |
| Parse | pre-validated (`parsed:schema`) | tolerant-parse + **validate** (`parsed:tolerant`) |
| On bad JSON | n/a | **retry once** with a sharpened "JSON only" instruction; still failing → `status:malformed`, raw `text` preserved |

The tolerant path doesn't just check that the keys are present — it **validates the
extracted value against the full schema** (a minimal stdlib check of
type/const/enum/required/properties/additionalProperties), so a reply with the
right keys but wrong values (`{"ok":false}` against `ok: const true`) is rejected
and retried, never folded in as a trusted answer. It prefers the **last**
schema-satisfying object (a model that restates the schema/example puts its real
answer last) and uses `raw_decode` scanning, so it still recovers a valid object
that appears after an unclosed prose brace.

"Verified/grounded" downstream means provenance-backed; this layer only guarantees
*shape*, never *truth*.

## Secret hygiene

Keys are never stored in the repo. Claude is subscription-preferred: when a
first-party session exists the bridge unsets `ANTHROPIC_*` so the session is used;
with no session, `auto` keeps `ANTHROPIC_API_KEY` as a fallback (`--auth apikey`
forces the key, `--auth subscription` forces the session). Codex uses its authed
CLI session (`~/.codex/auth.json`) or `$OPENAI_API_KEY`/`$CODEX_API_KEY`. Adapters
reference auth; they never persist it. As defense-in-depth, the envelope emitter
**redacts** known secret values and `sk-…`/`Bearer …` token shapes from `text`/`error`
before emission, so a backend CLI that echoes a key in an error can't leak it.

## Conformance tests (the build-order gate)

```
tests/conformance/run.sh [unit|claude|codex|all]   # default all; exits non-zero on any failure
```

Five categories per adapter — **probe, smoke, structured-output, timeout,
malformed-output**. probe/smoke/structured run live; timeout + the error/retry
branches use hermetic fake binaries (deterministic, free) plus offline fixtures
for the tolerant parser. The `unit` suite pins the substrate regressions surfaced
by code review (falsy-payload survival, timeout fallback, echoed-schema defense,
arg-validation, effort mapping). These must stay green before orchestration is
built on top. Current: **85 tests** (unit + claude + codex), all passing.

## Layout

```
bin/
  provider-invoke      # dispatch + uniform interface  -> envelope
  provider-probe       # binary+auth probe             -> envelope
  lib/
    common.sh          # bin resolution (alias-proof), timeout wrapper (+py fallback), envelope emitter
    json_extract.py    # tolerant text->JSON (raw_decode scan, schema-validated, last-wins)
    codex_parse.py     # codex --json JSONL -> {text,tokens,thread_id,…}
    run_timeout.py     # wall-clock timeout (process-group kill) for hosts without coreutils
  adapters/
    claude.sh          # headless claude, schema-enforced, subscription bridge + apikey fallback
    codex.sh           # codex exec, instructed JSON, tolerant-parse + retry-once
tests/conformance/     # assert.sh · fakes.sh · run.sh · unit.sh · {claude,codex}.sh · fixtures/
```

**Status:** host Claude (headless) + Codex done and conformance-green. Next external
adapter per the spec: DeepSeek via NVIDIA-free (pure curl) — needs `$NVIDIA_API_KEY`.
Orchestration (roles, grounded round flow, synthesis) is the next phase and was
gated on this layer.
