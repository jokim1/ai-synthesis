#!/usr/bin/env bash
# Codex adapter conformance suite. Uses globals from run.sh:
#   PROBE INVOKE LIB FIXTURES, plus assert_* and the fake_* helpers.
#
# Codex is the non-Claude path: no schema enforcement, so structured output is
# prompt-instructed + tolerant-parsed + retried once. probe/smoke/structured are
# LIVE; retry/malformed/timeout use hermetic fakes; the tolerant parser is also
# unit-tested offline against committed fixtures.

# Echo the json_extract exit code for a fixture file (+ optional require-keys).
_extract_rc() {
  if [ -n "${2:-}" ]; then
    python3 "$LIB/json_extract.py" --require-keys "$2" < "$1" >/dev/null 2>&1
  else
    python3 "$LIB/json_extract.py" < "$1" >/dev/null 2>&1
  fi
  echo $?
}

codex_suite() {
  local p authed s schema st fdir fp fr ftext fcount rc

  section "probe — binary + auth (no model call)"
  p="$("$PROBE" codex)"
  assert_true     "probe ok"              "$(printf '%s' "$p" | jq -r '.ok')"
  assert_eq       "probe status=ok"       "ok" "$(printf '%s' "$p" | jq -r '.status')"
  assert_true     "probe authed"          "$(printf '%s' "$p" | jq -r '.structured.authed')"
  assert_nonempty "probe version present" "$(printf '%s' "$p" | jq -r '.structured.version')"

  authed="$(printf '%s' "$p" | jq -r '.structured.authed')"
  if [ "$authed" != "true" ]; then
    skip "codex live smoke/structured (not authenticated)"
  else
    section "smoke — tiny live call, no schema"
    s="$("$INVOKE" codex --prompt 'Reply with exactly one word: pong' --effort low --timeout 120)"
    assert_true     "smoke ok"            "$(printf '%s' "$s" | jq -r '.ok')"
    assert_eq       "smoke status=ok"     "ok" "$(printf '%s' "$s" | jq -r '.status')"
    assert_nonempty "smoke text present"  "$(printf '%s' "$s" | jq -r '.text')"
    assert_eq       "smoke parsed=raw"    "raw" "$(printf '%s' "$s" | jq -r '.meta.parsed')"

    section "structured-output — instructed JSON, tolerant-parsed"
    schema='{"type":"object","properties":{"ok":{"const":true}},"required":["ok"],"additionalProperties":false}'
    st="$("$INVOKE" codex --prompt 'Preflight. Confirm operational.' --schema "$schema" --effort low --timeout 120)"
    assert_true     "structured ok"             "$(printf '%s' "$st" | jq -r '.ok')"
    assert_eq       "structured parsed=tolerant" "tolerant" "$(printf '%s' "$st" | jq -r '.meta.parsed')"
    assert_true     "structured .ok==true"      "$(printf '%s' "$st" | jq -r '.structured.ok')"
  fi

  # --- hermetic fakes: deterministic retry / malformed / timeout ---
  fdir="$(fake_dir_new)"; write_fake_codex "$fdir"
  schema='{"type":"object","properties":{"ok":{"const":true}},"required":["ok"],"additionalProperties":false}'

  section "timeout — wrapper fires, maps to timeout envelope"
  ft="$(PATH="$fdir:$PATH" FAKE=sleep "$INVOKE" codex --prompt x --schema "$schema" --timeout 1)"
  assert_eq       "timeout status"        "timeout" "$(printf '%s' "$ft" | jq -r '.status')"
  assert_true     "timeout flag set"      "$(printf '%s' "$ft" | jq -r '.meta.timed_out')"

  section "retry-once — recovers when the 2nd attempt returns valid JSON"
  fr="$(PATH="$fdir:$PATH" FAKE=prose_then_json FAKE_STATE="$fdir/counter" "$INVOKE" codex --prompt x --schema "$schema" --timeout 10)"
  assert_true     "retry recovers ok"     "$(printf '%s' "$fr" | jq -r '.ok')"
  assert_eq       "retry status=ok"       "ok" "$(printf '%s' "$fr" | jq -r '.status')"
  assert_eq       "retry attempts=2"      "2" "$(printf '%s' "$fr" | jq -r '.meta.attempts')"
  assert_true     "retry .ok==true"       "$(printf '%s' "$fr" | jq -r '.structured.ok')"

  section "malformed — prose on both attempts -> malformed, raw text preserved"
  fp="$(PATH="$fdir:$PATH" FAKE=prose "$INVOKE" codex --prompt x --schema "$schema" --timeout 10)"
  assert_eq       "malformed status"      "malformed" "$(printf '%s' "$fp" | jq -r '.status')"
  assert_true     "malformed not ok"      "$(printf '%s' "$fp" | jq -r '(.ok|not)')"
  assert_eq       "malformed attempts=2"  "2" "$(printf '%s' "$fp" | jq -r '.meta.attempts')"
  assert_nonempty "malformed preserves text" "$(printf '%s' "$fp" | jq -r '.text')"
  assert_true     "malformed envelope is valid json" "$(printf '%s' "$fp" | jq -e . >/dev/null 2>&1 && echo true || echo false)"

  section "empty turn — completed turn with no agent_message is a failure, not ok"
  local fe; fe="$(PATH="$fdir:$PATH" FAKE=empty_turn "$INVOKE" codex --prompt x --timeout 10)"
  assert_true "empty turn not ok"        "$(printf '%s' "$fe" | jq -r '(.ok|not)')"
  assert_eq   "empty turn invocation_failed" "invocation_failed" "$(printf '%s' "$fe" | jq -r '.status')"

  section "argv construction — model forwarded, -- sentinel, web/effort mapped"
  local argf; argf="$fdir/argv"
  PATH="$fdir:$PATH" FAKE=echoargs FAKE_STATE="$argf" "$INVOKE" codex \
    --prompt 'hello' --model gpt-x --web --effort max --timeout 10 >/dev/null 2>&1
  local argv; argv="$(cat "$argf" 2>/dev/null || true)"
  assert_contains "forwards -m <model>"          "$argv" "-m gpt-x"
  assert_contains "uses -- end-of-options"       "$argv" " -- "
  assert_contains "--web -> web_search=live"     "$argv" 'web_search="live"'
  assert_contains "effort max -> xhigh"          "$argv" 'model_reasoning_effort="xhigh"'
  case "$argv" in
    *web_search_cached*) fail "does not use deprecated web_search_cached" "argv: $argv" ;;
    *) pass "does not use deprecated web_search_cached" ;;
  esac

  rm -rf "$fdir"

  section "tolerant parser — offline fixtures (the malformed-handling core)"
  assert_eq "prose-wrapped JSON -> exit 0" "0" "$(_extract_rc "$FIXTURES/prose_wrapped.txt" ok)"
  assert_eq "fenced JSON -> exit 0"        "0" "$(_extract_rc "$FIXTURES/fenced.txt" ok)"
  assert_eq "garbage -> exit 3 (none)"     "3" "$(_extract_rc "$FIXTURES/garbage.txt")"
  assert_eq "missing required key -> exit 4" "4" "$(_extract_rc "$FIXTURES/missing_keys.txt" ok)"

  section "codex JSONL parse — prose agent_message extracted, then fails JSON parse"
  ftext="$(python3 "$LIB/codex_parse.py" < "$FIXTURES/codex_prose.jsonl" | jq -r '.text')"
  assert_nonempty "codex_parse extracts agent_message" "$ftext"
  fcount="$(python3 "$LIB/codex_parse.py" < "$FIXTURES/codex_prose.jsonl" | jq -r '.turn_completed')"
  assert_true    "codex_parse sees turn.completed" "$fcount"
  printf '%s' "$ftext" | python3 "$LIB/json_extract.py" --require-keys ok >/dev/null 2>&1; rc=$?
  assert_eq "prose agent_message -> json_extract exit 3" "3" "$rc"
}
