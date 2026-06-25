#!/usr/bin/env bash
# Claude adapter conformance suite. Uses globals from run.sh:
#   PROBE INVOKE LIB FIXTURES, plus assert_* and the fake_* helpers.
#
# probe/smoke/structured are LIVE (real integration). timeout + malformed/error
# paths use hermetic fakes so they are deterministic, free, and exercise branches
# a live call can't reliably trigger (budget cap, auth failure, non-JSON output).

claude_suite() {
  local p s st schema authed fdir fb fa fn ft

  section "probe — binary + auth (no model call)"
  p="$("$PROBE" claude)"
  assert_true     "probe ok"              "$(printf '%s' "$p" | jq -r '.ok')"
  assert_eq       "probe status=ok"       "ok" "$(printf '%s' "$p" | jq -r '.status')"
  assert_true     "probe authed"          "$(printf '%s' "$p" | jq -r '.structured.authed')"

  authed="$(printf '%s' "$p" | jq -r '.structured.authed')"
  if [ "$authed" != "true" ]; then
    skip "claude live smoke/structured/timeout (not authenticated)"
  else
    section "smoke — tiny live call, no schema"
    s="$("$INVOKE" claude --prompt 'Reply with exactly one word: pong' --model haiku --max-budget-usd 0.10 --timeout 90)"
    assert_true     "smoke ok"            "$(printf '%s' "$s" | jq -r '.ok')"
    assert_eq       "smoke status=ok"     "ok" "$(printf '%s' "$s" | jq -r '.status')"
    assert_nonempty "smoke text present"  "$(printf '%s' "$s" | jq -r '.text')"
    assert_eq       "smoke parsed=raw"    "raw" "$(printf '%s' "$s" | jq -r '.meta.parsed')"

    section "structured-output — schema enforced"
    schema='{"type":"object","properties":{"ok":{"const":true}},"required":["ok"],"additionalProperties":false}'
    st="$("$INVOKE" claude --prompt 'Preflight probe. Return {"ok": true} and nothing else.' --schema "$schema" --model haiku --max-budget-usd 0.10 --timeout 90)"
    assert_true     "structured ok"            "$(printf '%s' "$st" | jq -r '.ok')"
    assert_eq       "structured parsed=schema" "schema" "$(printf '%s' "$st" | jq -r '.meta.parsed')"
    assert_true     "structured .ok==true"     "$(printf '%s' "$st" | jq -r '.structured.ok')"
  fi

  # --- hermetic fakes: deterministic, no spend ---
  fdir="$(fake_dir_new)"; write_fake_claude "$fdir"

  section "timeout — wrapper fires, maps to timeout envelope"
  ft="$(PATH="$fdir:$PATH" FAKE=sleep "$INVOKE" claude --prompt x --timeout 1)"
  assert_eq       "timeout status"        "timeout" "$(printf '%s' "$ft" | jq -r '.status')"
  assert_true     "timeout not ok"        "$(printf '%s' "$ft" | jq -r '(.ok|not)')"
  assert_true     "timeout flag set"      "$(printf '%s' "$ft" | jq -r '.meta.timed_out')"

  section "malformed / error classification — graceful envelope, never crash"
  fb="$(PATH="$fdir:$PATH" FAKE=iserror_budget "$INVOKE" claude --prompt x --timeout 10)"
  assert_true     "budget not ok"         "$(printf '%s' "$fb" | jq -r '(.ok|not)')"
  assert_eq       "budget status"         "budget" "$(printf '%s' "$fb" | jq -r '.status')"

  fa="$(PATH="$fdir:$PATH" FAKE=iserror_auth "$INVOKE" claude --prompt x --timeout 10)"
  assert_eq       "auth status"           "auth" "$(printf '%s' "$fa" | jq -r '.status')"

  fn="$(PATH="$fdir:$PATH" FAKE=nonjson "$INVOKE" claude --prompt x --timeout 10)"
  assert_true     "nonjson not ok"        "$(printf '%s' "$fn" | jq -r '(.ok|not)')"
  assert_nonempty "nonjson well-formed envelope (status set)" "$(printf '%s' "$fn" | jq -r '.status')"
  # The envelope itself must always be valid JSON the orchestrator can read.
  assert_true     "nonjson envelope is valid json" "$(printf '%s' "$fn" | jq -e . >/dev/null 2>&1 && echo true || echo false)"

  section "classify off STRUCTURED fields, not the model's free text"
  # is_error whose .result mentions 'maximum budget'/'authentication' but whose
  # subtype/api_error_status are generic must NOT be mislabeled budget/auth.
  local fc; fc="$(PATH="$fdir:$PATH" FAKE=iserror_topic_budget "$INVOKE" claude --prompt x --timeout 10)"
  assert_eq       "topic-text 'budget' not mislabeled" "invocation_failed" "$(printf '%s' "$fc" | jq -r '.status')"

  rm -rf "$fdir"
}
