#!/usr/bin/env bash
# Codex adapter (sourced by provider-invoke / provider-probe).
#
# Codex has no schema enforcement and no system-prompt flag, so: the role goes
# into the prompt text, JSON is *requested* in the prompt, then tolerant-parsed
# (parsed=tolerant). If the first reply doesn't parse / lacks required keys we
# retry ONCE with a sharpened instruction; still failing -> status=malformed with
# the raw text preserved (the orchestrator degrades that voice, never crashes).
#
# Hard rules: `< /dev/null` (stdin-deadlock guard) and read-only sandbox. codex
# logs a benign rollout ERROR to stderr on exit 0 — success keys off the exit
# code + presence of an agent_message, never off stderr noise.
#
# Reads A_* globals. Emits exactly one envelope.

CODEX_BIN=""
PYTHON=""

# Results of the last raw call (bash can't return structured data cleanly).
CX_RC=0 ; CX_TEXT="" ; CX_TOKENS=0 ; CX_TURN="false" ; CX_ERR=""

adapter_probe() {
  local bin version authed method warn structured
  bin="$(aisynth_resolve_bin codex || true)"
  if [ -z "$bin" ]; then
    ENV_OK=false ENV_STATUS=unavailable ENV_PROVIDER=codex \
      ENV_STRUCTURED='{"available":false,"authed":false}' \
      ENV_ERROR="Codex CLI not found on PATH. Install: npm install -g @openai/codex" \
      aisynth_emit_envelope
    return 0
  fi

  version="$(aisynth_run_with_timeout 10 "$bin" --version 2>/dev/null | head -1 | tr -d '\r')"

  # Multi-signal auth: env key OR a codex-login auth.json. Avoids false negatives
  # for env-auth users that a file-only check would reject.
  authed=false; method=""
  if [ -n "${CODEX_API_KEY:-}" ]; then
    authed=true; method="CODEX_API_KEY"
  elif [ -n "${OPENAI_API_KEY:-}" ]; then
    authed=true; method="OPENAI_API_KEY"
  elif [ -f "${CODEX_HOME:-$HOME/.codex}/auth.json" ]; then
    authed=true; method="codex login (auth.json)"
  fi

  warn=""
  case "$version" in
    *0.120.0*|*0.120.1*|*0.120.2*) warn=" — WARNING: known stdin-deadlock version, please upgrade codex" ;;
  esac

  structured="$(jq -n \
    --argjson authed "$authed" \
    --arg method "$method" \
    --arg version "$version" \
    '{available:true, authed:$authed, auth_method:$method, version:$version}')"

  if [ "$authed" = "true" ]; then
    ENV_OK=true ENV_STATUS=ok ENV_PROVIDER=codex ENV_MODEL="${A_MODEL:-}" \
      ENV_STRUCTURED="$structured" ENV_TEXT="codex ready (${method}) ${version}${warn}" \
      aisynth_emit_envelope
  else
    ENV_OK=false ENV_STATUS=auth ENV_PROVIDER=codex \
      ENV_STRUCTURED="$structured" \
      ENV_ERROR="Codex found but no authentication. Run: codex login (or set OPENAI_API_KEY / CODEX_API_KEY)" \
      aisynth_emit_envelope
  fi
  return 0
}

# Map effort vocab to codex's accepted set (none|minimal|low|medium|high|xhigh).
# Claude's "max" has no codex equivalent -> use codex's highest tier, xhigh.
_codex_effort() {
  case "$1" in
    none|minimal|low|medium|high|xhigh) printf '%s' "$1" ;;
    max) printf 'xhigh' ;;
    *)   printf 'medium' ;;
  esac
}

# Run codex once with the given prompt; populate CX_* globals.
_codex_raw_call() {
  local prompt="$1" effort errfile out rc pj cargs
  effort="$(_codex_effort "${A_EFFORT:-medium}")"
  errfile="$(mktemp "${TMPDIR:-/tmp}/aisynth-codex-XXXXXX")"

  # Flags first, then `--`, then the positional prompt: a prompt/role line that
  # begins with '-' would otherwise be parsed as a flag. --model is forwarded so
  # the envelope's model is truthful (codex was silently running its default);
  # --web maps to the 0.125+ config key (`--enable web_search_cached` is rejected
  # as deprecated — verified against codex-cli 0.125.0).
  cargs=(exec -s read-only)
  [ -n "${A_MODEL:-}" ] && cargs+=(-m "$A_MODEL")
  cargs+=(-c "model_reasoning_effort=\"$effort\"")
  [ "${A_WEB:-false}" = "true" ] && cargs+=(-c 'web_search="live"')
  cargs+=(--json -- "$prompt")

  # `< /dev/null` is mandatory: without it codex blocks reading stdin.
  out="$(aisynth_run_with_timeout "${A_TIMEOUT:-300}" "$CODEX_BIN" "${cargs[@]}" </dev/null 2>"$errfile")"
  rc=$?
  CX_ERR="$(cat "$errfile" 2>/dev/null || true)"
  rm -f "$errfile"
  CX_RC=$rc

  if [ "$rc" -eq 124 ]; then
    CX_TEXT=""; CX_TOKENS=0; CX_TURN="false"
    return 0
  fi

  pj="$(printf '%s' "$out" | "$PYTHON" "$AISYNTH_CODEX_PARSE" 2>/dev/null || echo '{}')"
  CX_TEXT="$(printf '%s' "$pj" | jq -r '.text // ""')"
  CX_TOKENS="$(printf '%s' "$pj" | jq -r '.tokens // 0')"
  CX_TURN="$(printf '%s' "$pj" | jq -r '.turn_completed // false')"
  return 0
}

_codex_auth_failed_err() {
  printf '%s' "$1" | grep -Eqi 'unauthorized|not logged in|auth|login|401|invalid api key'
}

# Tolerant-extract JSON from CX_TEXT and validate it. Echoes the JSON on stdout;
# returns the json_extract exit code (0 ok, 3 none, 4 parsed-but-unsatisfied).
# Validates against the FULL schema when present (not just key presence) so a
# reply with the right keys but wrong values isn't trusted.
_codex_extract() {
  local xargs
  xargs=()
  if [ -n "${A_SCHEMA:-}" ]; then
    xargs=(--schema "$A_SCHEMA")
  elif [ -n "${A_REQUIRE_KEYS:-}" ]; then
    xargs=(--require-keys "$A_REQUIRE_KEYS")
  fi
  printf '%s' "$CX_TEXT" | "$PYTHON" "$AISYNTH_JSON_EXTRACT" ${xargs[@]+"${xargs[@]}"}
}

# Inspect the last raw call (CX_* globals). If it failed — timeout, nonzero exit,
# or an empty agent message (empty turn / injected error item, regardless of
# turn_completed) — emit the matching failure envelope and return 0 ("handled").
# Return 1 only when CX_TEXT is a usable voice. Shared by both attempts.
_codex_emit_if_failed() {
  local attempts="$1" tokens="$2"
  if [ "$CX_RC" -eq 124 ]; then
    ENV_OK=false ENV_STATUS=timeout ENV_PROVIDER=codex ENV_MODEL="${A_MODEL:-}" \
      ENV_TIMED_OUT=true ENV_TOKENS="$tokens" ENV_ATTEMPTS="$attempts" \
      ENV_ERROR="Codex call exceeded ${A_TIMEOUT}s timeout." \
      aisynth_emit_envelope
    return 0
  fi
  if [ "$CX_RC" -ne 0 ]; then
    local kind="invocation_failed"
    _codex_auth_failed_err "$CX_ERR" && kind="auth"
    ENV_OK=false ENV_STATUS="$kind" ENV_PROVIDER=codex ENV_MODEL="${A_MODEL:-}" \
      ENV_TEXT="$(printf '%s' "$CX_ERR" | head -c 400)" ENV_TOKENS="$tokens" ENV_ATTEMPTS="$attempts" \
      ENV_ERROR="Codex invocation failed (exit $CX_RC). $(printf '%s' "$CX_ERR" | grep -v 'rollout items' | head -1)" \
      aisynth_emit_envelope
    return 0
  fi
  if [ -z "$CX_TEXT" ]; then
    # Exit 0 but no agent message: an empty turn or an injected error item
    # (context-length / rate-limit / refusal). Not a usable voice — never ok:true.
    ENV_OK=false ENV_STATUS=invocation_failed ENV_PROVIDER=codex ENV_MODEL="${A_MODEL:-}" \
      ENV_TOKENS="$tokens" ENV_ATTEMPTS="$attempts" \
      ENV_ERROR="Codex returned no agent message (empty turn or error item; turn_completed=${CX_TURN})." \
      aisynth_emit_envelope
    return 0
  fi
  return 1
}

adapter_invoke() {
  CODEX_BIN="$(aisynth_resolve_bin codex || true)"
  if [ -z "$CODEX_BIN" ]; then
    ENV_OK=false ENV_STATUS=unavailable ENV_PROVIDER=codex \
      ENV_ERROR="Codex CLI not found on PATH. Install: npm install -g @openai/codex" \
      aisynth_emit_envelope
    return 0
  fi
  PYTHON="$(aisynth_python || true)"
  if [ -z "$PYTHON" ]; then
    ENV_OK=false ENV_STATUS=invocation_failed ENV_PROVIDER=codex \
      ENV_ERROR="python3 is required to parse Codex output but was not found." \
      aisynth_emit_envelope
    return 0
  fi

  # Compose the prompt: role persona + task + (schema instruction).
  local full_prompt="$A_PROMPT"
  if [ -n "$A_ROLE" ]; then
    full_prompt="$A_ROLE

$A_PROMPT"
  fi
  if [ -n "$A_SCHEMA" ]; then
    full_prompt="$full_prompt

Return ONLY a single JSON object that conforms to this JSON Schema. Output no prose, no explanation, and no markdown code fences — just the JSON object:
$A_SCHEMA"
  fi

  local total_tokens=0 structured ec attempts=1

  _codex_raw_call "$full_prompt"
  total_tokens="$CX_TOKENS"
  _codex_emit_if_failed "$attempts" "$total_tokens" && return 0

  # No schema requested -> the usable free text is the payload.
  if [ -z "$A_SCHEMA" ]; then
    ENV_OK=true ENV_STATUS=ok ENV_PROVIDER=codex ENV_MODEL="${A_MODEL:-}" \
      ENV_TEXT="$CX_TEXT" ENV_PARSED=raw ENV_TOKENS="$total_tokens" \
      aisynth_emit_envelope
    return 0
  fi

  # Schema requested -> tolerant parse; retry once on parse failure.
  structured="$(_codex_extract)"; ec=$?
  if [ "$ec" -eq 0 ]; then
    ENV_OK=true ENV_STATUS=ok ENV_PROVIDER=codex ENV_MODEL="${A_MODEL:-}" \
      ENV_STRUCTURED="$structured" ENV_TEXT="$CX_TEXT" ENV_PARSED=tolerant \
      ENV_TOKENS="$total_tokens" ENV_ATTEMPTS="$attempts" \
      aisynth_emit_envelope
    return 0
  fi

  # Retry once with a sharpened "JSON only" instruction.
  attempts=2
  local retry_prompt="$full_prompt

IMPORTANT: Your previous reply could not be parsed as the required JSON object. Return ONLY a single valid JSON object matching the schema above — no prose, no explanation, no markdown code fences, no restated schema or example, nothing before or after the JSON."
  _codex_raw_call "$retry_prompt"
  total_tokens=$(( total_tokens + CX_TOKENS ))
  _codex_emit_if_failed "$attempts" "$total_tokens" && return 0

  structured="$(_codex_extract)"; ec=$?
  if [ "$ec" -eq 0 ]; then
    ENV_OK=true ENV_STATUS=ok ENV_PROVIDER=codex ENV_MODEL="${A_MODEL:-}" \
      ENV_STRUCTURED="$structured" ENV_TEXT="$CX_TEXT" ENV_PARSED=tolerant \
      ENV_TOKENS="$total_tokens" ENV_ATTEMPTS="$attempts" \
      aisynth_emit_envelope
    return 0
  fi

  # Still unparseable after retry -> malformed, but preserve the raw text so the
  # orchestrator can show a best-guess / degrade this voice honestly.
  ENV_OK=false ENV_STATUS=malformed ENV_PROVIDER=codex ENV_MODEL="${A_MODEL:-}" \
    ENV_TEXT="$CX_TEXT" ENV_PARSED=none ENV_TOKENS="$total_tokens" ENV_ATTEMPTS="$attempts" \
    ENV_ERROR="Codex output was not valid JSON conforming to the schema after one retry." \
    aisynth_emit_envelope
  return 0
}
