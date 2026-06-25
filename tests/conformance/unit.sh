#!/usr/bin/env bash
# Substrate unit regressions — deterministic, offline. Each guards a specific
# code-review finding so the bug can't silently return. Uses globals from run.sh:
#   ROOT INVOKE LIB, assert_* helpers.

# Emit an envelope in a clean subshell. Each ENV_* assignment is passed as a real
# environment entry (one argv each) via `env`, so JSON values survive intact
# instead of being mangled by a bash -c string layer.
_emit() {
  env "$@" bash -c "source '$LIB/common.sh'; aisynth_emit_envelope"
}

unit_suite() {
  local out rc big

  section "envelope — falsy structured payloads survive (jq empty, not jq -e .)"
  out="$(_emit ENV_OK=true ENV_STATUS=ok ENV_PROVIDER=p ENV_PARSED=schema ENV_STRUCTURED=false)"
  assert_eq "structured false preserved" "false" "$(printf '%s' "$out" | jq -r '.structured')"
  out="$(_emit ENV_OK=true ENV_STATUS=ok ENV_PROVIDER=p ENV_PARSED=schema ENV_STRUCTURED=null)"
  assert_eq "structured null stays null" "null" "$(printf '%s' "$out" | jq -r '.structured')"
  out="$(_emit ENV_OK=true ENV_STATUS=ok ENV_PROVIDER=p ENV_STRUCTURED='{"a":1}')"
  assert_eq "structured object preserved" "1" "$(printf '%s' "$out" | jq -r '.structured.a')"
  out="$(_emit ENV_OK=false ENV_STATUS=malformed ENV_PROVIDER=p ENV_STRUCTURED=not-json)"
  assert_eq "non-JSON structured -> null" "null" "$(printf '%s' "$out" | jq -r '.structured')"

  section "envelope — malformed numerics never crash the emitter (strict _aisynth_num)"
  out="$(_emit ENV_OK=true ENV_STATUS=ok ENV_PROVIDER=p ENV_TOKENS=1.2.3 ENV_COST=9..9)"
  assert_true "still valid JSON envelope" "$(printf '%s' "$out" | jq -e . >/dev/null 2>&1 && echo true || echo false)"
  assert_eq   "bad tokens -> default 0"   "0" "$(printf '%s' "$out" | jq -r '.meta.tokens')"
  assert_eq   "bad cost -> default 0"     "0" "$(printf '%s' "$out" | jq -r '.meta.cost_usd')"

  section "envelope — leaked secrets are redacted before emission (hard rule)"
  out="$(_emit OPENAI_API_KEY=topsecretvalue999 ENV_OK=false ENV_STATUS=auth ENV_PROVIDER=codex ENV_ERROR='auth failed: key topsecretvalue999 rejected')"
  assert_eq   "env secret value not in envelope" "false" "$(printf '%s' "$out" | jq -r '.error | contains("topsecretvalue999")')"
  assert_true "redaction marker present"         "$(printf '%s' "$out" | jq -r '.error | contains("***REDACTED***")')"
  out="$(_emit ENV_OK=false ENV_STATUS=auth ENV_PROVIDER=codex ENV_TEXT='leaked sk-abcdefghij0123456789KLMN here')"
  assert_eq   "sk- token shape masked" "false" "$(printf '%s' "$out" | jq -r '.text | contains("sk-abcdefghij")')"

  section "run_timeout.py — wall-clock bound on hosts without coreutils timeout"
  python3 "$LIB/run_timeout.py" 1 sleep 5 >/dev/null 2>&1; rc=$?
  assert_eq "sleep 5 under 1s bound -> 124" "124" "$rc"
  out="$(python3 "$LIB/run_timeout.py" 5 printf hi 2>/dev/null)"; rc=$?
  assert_eq "fast cmd passes through rc 0" "0" "$rc"
  assert_eq "fast cmd stdout flows"        "hi" "$out"
  # Process-group kill: a backgrounded grandchild must die too (no runaway spend).
  local gcpid_file gcpid; gcpid_file="$(mktemp "${TMPDIR:-/tmp}/aisynth-gc-XXXXXX")"
  python3 "$LIB/run_timeout.py" 1 bash -c "sleep 30 & echo \$! > '$gcpid_file'; wait" >/dev/null 2>&1
  sleep 1
  gcpid="$(cat "$gcpid_file" 2>/dev/null)"
  if [ -n "$gcpid" ] && kill -0 "$gcpid" 2>/dev/null; then
    fail "timeout kills the whole process group" "grandchild $gcpid survived"; kill -9 "$gcpid" 2>/dev/null
  else
    pass "timeout kills the whole process group"
  fi
  rm -f "$gcpid_file"

  section "json_extract — prefers the LAST satisfying object (echoed-schema defense)"
  out="$(printf 'I will return {"verdict": "<your decision>"} format. My answer: {"verdict": "reject"}' | python3 "$LIB/json_extract.py" --require-keys verdict)"
  assert_eq "echoed example skipped for real answer" "reject" "$(printf '%s' "$out" | jq -r '.verdict')"

  section "json_extract — O(n) scan: 60k unmatched braces returns fast, not quadratic"
  big="$(python3 -c "import sys; sys.stdout.write('{'*60000)")"
  printf '%s' "$big" | gtimeout 5 python3 "$LIB/json_extract.py" >/dev/null 2>&1; rc=$?
  # 124 would mean it blew the 5s bound (old O(n^2)); 3 = parsed nothing, fast.
  assert_eq "huge-brace input did not time out" "3" "$rc"

  section "json_extract — full-schema validation, not just key presence"
  local cs='{"type":"object","properties":{"ok":{"const":true}},"required":["ok"],"additionalProperties":false}'
  printf '%s' '{"ok": true}'        | python3 "$LIB/json_extract.py" --schema "$cs" >/dev/null 2>&1; assert_eq "const-true satisfied -> 0"        "0" "$?"
  printf '%s' '{"ok": false}'       | python3 "$LIB/json_extract.py" --schema "$cs" >/dev/null 2>&1; assert_eq "const violation -> 4 (retry)"     "4" "$?"
  printf '%s' '{"ok": true, "x":1}' | python3 "$LIB/json_extract.py" --schema "$cs" >/dev/null 2>&1; assert_eq "additionalProperties false -> 4"  "4" "$?"

  section "json_extract — recovers JSON nested after an unclosed prose brace"
  out="$(printf 'prose {a, b, later {"ok": true}' | python3 "$LIB/json_extract.py" --require-keys ok)"
  assert_eq "valid trailing object recovered" "true" "$(printf '%s' "$out" | jq -r '.ok')"

  section "_codex_effort — maps Claude's 'max' to codex's xhigh, clamps unknown"
  assert_eq "max -> xhigh"   "xhigh"  "$(bash -c "source '$LIB/common.sh'; source '$ROOT/bin/adapters/codex.sh'; _codex_effort max")"
  assert_eq "high passes"    "high"   "$(bash -c "source '$LIB/common.sh'; source '$ROOT/bin/adapters/codex.sh'; _codex_effort high")"
  assert_eq "garbage -> medium" "medium" "$(bash -c "source '$LIB/common.sh'; source '$ROOT/bin/adapters/codex.sh'; _codex_effort wat")"

  section "provider-invoke — boundary validation (no silent footguns)"
  "$INVOKE" codex --prompt x --timeout 1.5 >/dev/null 2>&1; rc=$?
  assert_eq "decimal --timeout rejected (exit 2)" "2" "$rc"
  "$INVOKE" codex --prompt x --timeout -5 >/dev/null 2>&1; rc=$?
  assert_eq "negative --timeout rejected (exit 2)" "2" "$rc"
  gtimeout 8 "$INVOKE" codex --prompt >/dev/null 2>&1; rc=$?
  assert_eq "value-less trailing flag exits 2, no hang" "2" "$rc"
  "$INVOKE" claude --prompt x --max-budget-usd "" >/dev/null 2>&1; rc=$?
  assert_eq "empty --max-budget-usd rejected (exit 2)" "2" "$rc"
  local emptied; emptied="$(mktemp "${TMPDIR:-/tmp}/aisynth-empty-XXXXXX")"
  : > "$emptied"
  "$INVOKE" codex --prompt x --schema-file "$emptied" >/dev/null 2>&1; rc=$?
  assert_eq "empty --schema-file rejected (exit 2)" "2" "$rc"
  "$INVOKE" codex --prompt x --prompt-file /no/such/file/xyz >/dev/null 2>&1; rc=$?
  assert_eq "missing --prompt-file rejected (exit 2)" "2" "$rc"
  rm -f "$emptied"
}
