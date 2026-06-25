#!/usr/bin/env bash
# Claude headless adapter (sourced by provider-invoke / provider-probe).
#
# Claude is the only backend that ENFORCES `--json-schema`, so its structured
# output arrives pre-validated in `.structured_output` (parsed=schema). Auth is
# subscription-preferred: by default we unset ANTHROPIC_* so the CLI uses the
# first-party session (avoids spending API credits); --auth apikey keeps the key.
#
# Reads A_* globals set by the entrypoint. Emits exactly one envelope.

_claude_resolve() {
  aisynth_resolve_bin claude
}

# Is there a usable first-party (subscription) session?
_claude_session_logged_in() {
  local bin status
  bin="$(_claude_resolve || true)"
  [ -n "$bin" ] || return 1
  status="$(aisynth_run_with_timeout 20 "$bin" auth status 2>/dev/null || true)"
  printf '%s' "$status" | jq -e '.loggedIn == true' >/dev/null 2>&1
}

# Run the claude CLI honoring the auth preference, inside the caller's
# command-substitution subshell so any unset is scoped to claude only.
#   apikey       -> keep ANTHROPIC_* (use the API key)
#   subscription -> unset them (force first-party; fail if no session)
#   auto         -> prefer the session: unset ONLY if a session exists, else keep
#                   the key as a fallback. This keeps `auto` consistent with the
#                   probe (which reports authed when EITHER a session or a key is
#                   present) — without the fallback, a key-only host probes green
#                   but every invoke fails auth.
_claude_exec() {
  local mode="${A_AUTH:-auto}" do_unset=false
  case "$mode" in
    apikey)       do_unset=false ;;
    subscription) do_unset=true ;;
    *)            if _claude_session_logged_in; then do_unset=true; fi ;;
  esac
  if [ "$do_unset" = "true" ]; then
    unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BEARER_TOKEN \
          ANTHROPIC_CONSOLE_API_KEY ANTHROPIC_CONSOLE_AUTH_TOKEN 2>/dev/null || true
  fi
  aisynth_run_with_timeout "${A_TIMEOUT:-300}" "$@"
}

adapter_probe() {
  local bin status logged_in provider auth_method sub authed method structured
  bin="$(_claude_resolve || true)"
  if [ -z "$bin" ]; then
    ENV_OK=false ENV_STATUS=unavailable ENV_PROVIDER=claude \
      ENV_STRUCTURED='{"available":false,"authed":false}' \
      ENV_ERROR="Claude Code CLI not found on PATH. Install: https://docs.anthropic.com/en/docs/claude-code" \
      aisynth_emit_envelope
    return 0
  fi

  status="$(aisynth_run_with_timeout 20 "$bin" auth status 2>/dev/null || true)"
  logged_in="$(printf '%s' "$status" | jq -r '.loggedIn // false' 2>/dev/null || echo false)"
  provider="$(printf '%s' "$status" | jq -r '.apiProvider // ""' 2>/dev/null || echo "")"
  auth_method="$(printf '%s' "$status" | jq -r '.authMethod // ""' 2>/dev/null || echo "")"
  sub="$(printf '%s' "$status" | jq -r '.subscriptionType // ""' 2>/dev/null || echo "")"

  authed=false; method=""
  if [ "$logged_in" = "true" ]; then
    authed=true; method="${auth_method:-session}"
  elif [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    authed=true; method="ANTHROPIC_API_KEY"
  fi

  structured="$(jq -n \
    --argjson authed "$authed" \
    --arg method "$method" \
    --arg provider "$provider" \
    --arg sub "$sub" \
    '{available:true, authed:$authed, auth_method:$method, api_provider:$provider, subscription:$sub}')"

  if [ "$authed" = "true" ]; then
    ENV_OK=true ENV_STATUS=ok ENV_PROVIDER=claude ENV_MODEL="${A_MODEL:-}" \
      ENV_STRUCTURED="$structured" ENV_TEXT="claude ready (${method}${provider:+/$provider})" \
      aisynth_emit_envelope
  else
    ENV_OK=false ENV_STATUS=auth ENV_PROVIDER=claude \
      ENV_STRUCTURED="$structured" \
      ENV_ERROR="Claude Code found but not authenticated. Run: claude auth login (or set ANTHROPIC_API_KEY)" \
      aisynth_emit_envelope
  fi
  return 0
}

# Classify a claude failure (nonzero exit or .is_error) from combined output.
_claude_classify() {
  local blob="$1"
  if printf '%s' "$blob" | grep -Eqi 'max_budget|maximum budget|error_max_budget_usd'; then
    printf 'budget'
  elif printf '%s' "$blob" | grep -Eqi 'not logged in|auth login|authentication|invalid x-api-key|401 unauthorized|anthropic_api_key'; then
    printf 'auth'
  else
    printf 'invocation_failed'
  fi
}

adapter_invoke() {
  local bin errfile out rc args
  bin="$(_claude_resolve || true)"
  if [ -z "$bin" ]; then
    ENV_OK=false ENV_STATUS=unavailable ENV_PROVIDER=claude \
      ENV_ERROR="Claude Code CLI not found on PATH. Install: https://docs.anthropic.com/en/docs/claude-code" \
      aisynth_emit_envelope
    return 0
  fi

  errfile="$(mktemp "${TMPDIR:-/tmp}/aisynth-claude-XXXXXX")"

  # Build args. tools off, no persistence, local settings only — a clean,
  # deterministic, side-effect-free role call.
  args=(-p "$A_PROMPT"
        --output-format json
        --permission-mode dontAsk
        --no-session-persistence
        --tools ""
        --strict-mcp-config
        --setting-sources local
        --disable-slash-commands)
  [ -n "$A_ROLE" ]       && args+=(--append-system-prompt "$A_ROLE")
  [ -n "$A_SCHEMA" ]     && args+=(--json-schema "$A_SCHEMA")
  [ -n "$A_MODEL" ]      && args+=(--model "$A_MODEL")
  [ -n "$A_EFFORT" ]     && args+=(--effort "$A_EFFORT")
  [ -n "$A_MAX_BUDGET" ] && args+=(--max-budget-usd "$A_MAX_BUDGET")

  out="$(_claude_exec "$bin" "${args[@]}" 2>"$errfile")"
  rc=$?
  local err; err="$(cat "$errfile" 2>/dev/null || true)"
  rm -f "$errfile"

  if [ "$rc" -eq 124 ]; then
    ENV_OK=false ENV_STATUS=timeout ENV_PROVIDER=claude ENV_MODEL="${A_MODEL:-}" \
      ENV_TIMED_OUT=true \
      ENV_ERROR="Claude call exceeded ${A_TIMEOUT}s timeout." \
      aisynth_emit_envelope
    return 0
  fi

  # claude --output-format json should always emit a JSON object on stdout, even
  # for errors (is_error:true). If it didn't, treat as a failed invocation. The
  # blob here is CLI-level diagnostics (the model never produced JSON), so it's
  # safe to grep; classify off it + stderr.
  if [ "$rc" -ne 0 ] && ! printf '%s' "$out" | jq empty >/dev/null 2>&1; then
    local kind; kind="$(_claude_classify "$out
$err")"
    ENV_OK=false ENV_STATUS="$kind" ENV_PROVIDER=claude ENV_MODEL="${A_MODEL:-}" \
      ENV_TEXT="$(printf '%s' "$err" | head -c 400)" \
      ENV_ERROR="Claude invocation failed (exit $rc). $(printf '%s' "$err" | head -1)" \
      aisynth_emit_envelope
    return 0
  fi

  if ! printf '%s' "$out" | jq empty >/dev/null 2>&1; then
    ENV_OK=false ENV_STATUS=malformed ENV_PROVIDER=claude ENV_MODEL="${A_MODEL:-}" \
      ENV_TEXT="$(printf '%s' "$out" | head -c 400)" \
      ENV_ERROR="Claude returned non-JSON output." \
      aisynth_emit_envelope
    return 0
  fi

  local is_error result cost tokens
  is_error="$(printf '%s' "$out" | jq -r '.is_error // false')"
  result="$(printf '%s' "$out" | jq -r '.result // ""')"
  cost="$(printf '%s' "$out" | jq -r '.total_cost_usd // 0')"
  tokens="$(printf '%s' "$out" | jq -r '((.usage.input_tokens // 0) + (.usage.output_tokens // 0))' 2>/dev/null || echo 0)"

  if [ "$is_error" = "true" ]; then
    local subtype apistat blob kind
    subtype="$(printf '%s' "$out" | jq -r '.subtype // ""' 2>/dev/null || echo "")"
    apistat="$(printf '%s' "$out" | jq -r '.api_error_status // ""' 2>/dev/null || echo "")"
    # Classify from claude's STRUCTURED error fields (subtype, api_error_status) +
    # stderr — NEVER the model's free-text .result, which can contain the user's
    # topic (e.g. "your maximum budget for Q3") and trip the budget/auth greps.
    blob="$subtype $apistat $err"
    kind="$(_claude_classify "$blob")"
    ENV_OK=false ENV_STATUS="$kind" ENV_PROVIDER=claude ENV_MODEL="${A_MODEL:-}" \
      ENV_TEXT="$result" ENV_COST="$cost" ENV_TOKENS="$tokens" \
      ENV_ERROR="Claude reported is_error (${kind}). ${result:0:200}" \
      aisynth_emit_envelope
    return 0
  fi

  # Success. Schema-enforced output lands in .structured_output (parsed=schema);
  # otherwise the free-text result is the payload (parsed=raw).
  local has_structured structured parsed
  has_structured="$(printf '%s' "$out" | jq -e '.structured_output != null' >/dev/null 2>&1 && echo true || echo false)"
  if [ -n "$A_SCHEMA" ] && [ "$has_structured" = "true" ]; then
    structured="$(printf '%s' "$out" | jq -c '.structured_output')"
    parsed="schema"
  else
    structured=""
    parsed="raw"
  fi

  ENV_OK=true ENV_STATUS=ok ENV_PROVIDER=claude ENV_MODEL="${A_MODEL:-}" \
    ENV_STRUCTURED="$structured" ENV_TEXT="$result" ENV_PARSED="$parsed" \
    ENV_COST="$cost" ENV_TOKENS="$tokens" \
    aisynth_emit_envelope
  return 0
}
