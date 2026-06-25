#!/usr/bin/env bash
# Hermetic fake CLIs for deterministic conformance tests.
#
# The adapters resolve their binary via `type -P claude|codex`, which honors
# PATH. By writing a fake `claude`/`codex` into a temp dir and prepending it to
# PATH, we drive the adapters' error/malformed/retry branches deterministically
# — no spend, no network, no flakiness — which live calls can't reliably trigger.
#
# Behavior is switched by the $FAKE env var read by the fake at runtime.

fake_dir_new() {
  mktemp -d "${TMPDIR:-/tmp}/aisynth-fake-XXXXXX"
}

write_fake_claude() {
  local dir="$1"
  cat > "$dir/claude" <<'FAKE'
#!/usr/bin/env bash
# Fake claude. Ignores args; emits canned stdout per $FAKE. `claude -p ...`
# always prints a JSON envelope on stdout (mirrors --output-format json), except
# the nonjson scenario which deliberately violates that.
for a in "$@"; do
  case "$a" in
    "auth")    echo '{"loggedIn":true,"apiProvider":"firstParty","authMethod":"claude.ai","subscriptionType":"max"}'; exit 0 ;;
    "-v"|"--version") echo "fake-claude 0.0.0"; exit 0 ;;
  esac
done
case "${FAKE:-ok}" in
  iserror_budget)
    echo '{"is_error":true,"subtype":"error_max_budget_usd","result":"Reached maximum budget of $0.01","total_cost_usd":0.01}' ;;
  iserror_auth)
    echo '{"is_error":true,"subtype":"error","result":"Not logged in. Run claude auth login.","api_error_status":"401 Unauthorized"}' ;;
  iserror_topic_budget)
    # is_error whose MODEL TEXT mentions budget/authentication but whose structured
    # error fields are generic -> must classify invocation_failed, not budget/auth.
    echo '{"is_error":true,"subtype":"error","result":"Here is your maximum budget analysis for Q3, including authentication flows.","api_error_status":"","total_cost_usd":0}' ;;
  nonjson)
    echo 'totally not json'; exit 1 ;;
  sleep)
    sleep 5; echo '{"is_error":false,"result":"too late"}' ;;
  *)
    echo '{"is_error":false,"subtype":"success","result":"pong","structured_output":null,"total_cost_usd":0,"usage":{"input_tokens":3,"output_tokens":1}}' ;;
esac
exit 0
FAKE
  chmod +x "$dir/claude"
}

write_fake_codex() {
  local dir="$1"
  cat > "$dir/codex" <<'FAKE'
#!/usr/bin/env bash
# Fake codex. Honors --version; otherwise streams canned JSONL per $FAKE.
# $FAKE_STATE points at a counter file so prose_then_json can differ across the
# initial call and the retry.
for a in "$@"; do
  if [ "$a" = "--version" ]; then echo "codex-cli 9.9.9-fake"; exit 0; fi
done

emit_prose() {
  echo '{"type":"thread.started","thread_id":"t-fake"}'
  echo '{"type":"turn.started"}'
  echo '{"type":"item.completed","item":{"type":"agent_message","text":"Here is my analysis in prose, with no JSON whatsoever."}}'
  echo '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}'
}
emit_json() {
  echo '{"type":"thread.started","thread_id":"t-fake"}'
  echo '{"type":"turn.started"}'
  echo '{"type":"item.completed","item":{"type":"agent_message","text":"{\"ok\": true}"}}'
  echo '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}'
}

case "${FAKE:-ok}" in
  echoargs)
    # Record the exact argv codex was invoked with, then succeed. Lets tests
    # assert flag construction (-m model, -- sentinel, web_search config, effort map).
    [ -n "${FAKE_STATE:-}" ] && printf '%s\n' "$*" > "$FAKE_STATE"
    emit_json ;;
  empty_turn)
    # Turn completes with NO agent_message (empty turn / error item).
    echo '{"type":"thread.started","thread_id":"t-fake"}'
    echo '{"type":"turn.started"}'
    echo '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":0}}' ;;
  prose)
    emit_prose ;;
  prose_then_json)
    n=0
    if [ -n "${FAKE_STATE:-}" ]; then
      n="$(cat "$FAKE_STATE" 2>/dev/null || echo 0)"
      echo $((n + 1)) > "$FAKE_STATE"
    fi
    if [ "$n" -eq 0 ]; then emit_prose; else emit_json; fi ;;
  sleep)
    sleep 5 ;;
  *)
    emit_json ;;
esac
exit 0
FAKE
  chmod +x "$dir/codex"
}
