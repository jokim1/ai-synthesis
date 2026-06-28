#!/usr/bin/env bash
# Shared helpers for the /synthesis provider layer.
#
# Sourced by bin/provider-invoke, bin/provider-probe, and the adapters. Keep it
# bash 3.2 compatible (macOS system bash): no associative arrays, no ${v,,}.
#
# The provider layer's whole job is to give the orchestrator ONE uniform contract
# across heterogeneous backends — the "normalized envelope" below. Adapters set
# ENV_* variables and call aisynth_emit_envelope; everything else (auth, schema
# asymmetry, timeouts, malformed output) is squashed into that single shape.

# Resolve our own location so adapters can find the python helpers regardless of
# the caller's cwd.
AISYNTH_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AISYNTH_BIN_DIR="$(cd "$AISYNTH_LIB_DIR/.." && pwd)"
AISYNTH_JSON_EXTRACT="$AISYNTH_LIB_DIR/json_extract.py"
AISYNTH_CODEX_PARSE="$AISYNTH_LIB_DIR/codex_parse.py"
AISYNTH_RUN_TIMEOUT="$AISYNTH_LIB_DIR/run_timeout.py"

# --- diagnostics ------------------------------------------------------------

aisynth_log() {
  # Diagnostics go to stderr so they never corrupt the envelope on stdout.
  printf '[ai-synthesis] %s\n' "$*" >&2
}

# Env vars whose VALUES must never surface in an emitted envelope. A backend CLI
# that echoes a key in an error message would otherwise leak it via text/error.
AISYNTH_SECRET_VARS="ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BEARER_TOKEN ANTHROPIC_CONSOLE_API_KEY ANTHROPIC_CONSOLE_AUTH_TOKEN OPENAI_API_KEY CODEX_API_KEY NVIDIA_API_KEY DEEPSEEK_API_KEY"

aisynth_redact() {
  # Echo stdin with known secret values + common token shapes masked. Defends the
  # "secrets never leave the process" rule against a CLI that prints a key.
  local text name val
  text="$(cat)"
  for name in $AISYNTH_SECRET_VARS; do
    val="${!name:-}"
    [ -n "$val" ] && text="${text//"$val"/***REDACTED***}"
  done
  printf '%s' "$text" | sed -E \
    -e 's/sk-[A-Za-z0-9_-]{16,}/***REDACTED***/g' \
    -e 's/(Bearer|bearer)[[:space:]]+[A-Za-z0-9._-]{16,}/\1 ***REDACTED***/g'
}

aisynth_die_usage() {
  # Usage errors are the ONLY non-zero exit from the entrypoints (exit 2).
  # Invocation *outcomes* (auth/timeout/malformed/...) are envelopes with exit 0.
  printf '%s\n' "$*" >&2
  exit 2
}

# --- binary + runtime resolution -------------------------------------------

aisynth_resolve_bin() {
  # Print the PATH executable for a name, ignoring shell aliases/functions.
  # `type -P` is the alias-proof resolver (the interactive `claude` alias must
  # never shadow the real binary inside these scripts).
  local name="$1" p=""
  p="$(type -P "$name" 2>/dev/null || true)"
  [ -n "$p" ] || return 1
  printf '%s' "$p"
}

aisynth_python() {
  # Prefer python3; fall back to python. The parse helpers are stdlib-only.
  if command -v python3 >/dev/null 2>&1; then
    printf 'python3'
  elif command -v python >/dev/null 2>&1; then
    printf 'python'
  else
    return 1
  fi
}

aisynth_run_with_timeout() {
  # Usage: aisynth_run_with_timeout <seconds> cmd args...
  # Returns 124 on timeout. Prefers gtimeout/timeout; on stock macOS (neither
  # exists) falls back to the python3 wrapper so --timeout stays real. Only with
  # NO timeout mechanism at all (no coreutils + no python) does it run unbounded.
  # -k 5 hard-kills 5s after the soft SIGTERM if the child ignores it.
  local secs="$1"; shift
  case "$secs" in
    ''|*[!0-9]*) secs=0 ;;
  esac
  if [ "$secs" -le 0 ]; then
    "$@"
    return $?
  fi
  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout -k 5 "$secs" "$@"
    return $?
  fi
  if command -v timeout >/dev/null 2>&1; then
    timeout -k 5 "$secs" "$@"
    return $?
  fi
  local py; py="$(aisynth_python || true)"
  if [ -n "$py" ]; then
    "$py" "$AISYNTH_RUN_TIMEOUT" "$secs" "$@"
    return $?
  fi
  aisynth_log "no timeout mechanism available (coreutils/python missing); running '$1' unbounded"
  "$@"
}

# --- envelope ---------------------------------------------------------------

_aisynth_num() {
  # Echo $1 iff it is a valid non-negative JSON number (int or single-decimal),
  # else $2 (default). Strict on purpose: a malformed numeric reaching jq
  # --argjson (e.g. "1.2.3") aborts the emitter and prints no envelope.
  if printf '%s' "$1" | grep -Eq '^[0-9]+(\.[0-9]+)?$'; then
    printf '%s' "$1"
  else
    printf '%s' "$2"
  fi
}

_aisynth_bool() {
  # Normalize to literal true/false for jq --argjson.
  case "$1" in
    true|1|yes) printf 'true' ;;
    *) printf 'false' ;;
  esac
}

aisynth_emit_envelope() {
  # Emit the normalized provider envelope on stdout from ENV_* variables:
  #   ENV_OK         true|false
  #   ENV_STATUS     ok|blocked|timeout|malformed|auth|budget|invocation_failed|unavailable|needs_input
  #   ENV_PROVIDER   claude|codex|nvidia|...
  #   ENV_MODEL      resolved model id ("" if unknown)
  #   ENV_STRUCTURED a JSON value string, or "" -> null
  #   ENV_TEXT       raw text content ("" allowed)
  #   ENV_ERROR      human-readable summary ("" -> null)
  #   ENV_PARSED     schema|tolerant|raw|none   (how `structured` was obtained)
  #   ENV_TIMED_OUT  true|false
  #   ENV_ATTEMPTS   integer (default 1)
  #   ENV_TOKENS     integer (default 0)
  #   ENV_COST       decimal usd (default 0)
  local ok status provider model structured text error parsed timed_out attempts tokens cost
  ok="$(_aisynth_bool "${ENV_OK:-false}")"
  status="${ENV_STATUS:-invocation_failed}"
  provider="${ENV_PROVIDER:-unknown}"
  model="${ENV_MODEL:-}"
  structured="${ENV_STRUCTURED:-}"
  [ -n "$structured" ] || structured="null"
  # Redact any leaked secrets before they enter the envelope (hard rule).
  text="$(printf '%s' "${ENV_TEXT:-}" | aisynth_redact)"
  error="$(printf '%s' "${ENV_ERROR:-}" | aisynth_redact)"
  parsed="${ENV_PARSED:-none}"
  timed_out="$(_aisynth_bool "${ENV_TIMED_OUT:-false}")"
  attempts="$(_aisynth_num "${ENV_ATTEMPTS:-1}" 1)"
  tokens="$(_aisynth_num "${ENV_TOKENS:-0}" 0)"
  cost="$(_aisynth_num "${ENV_COST:-0}" 0)"

  # --argjson for structured can fail if an adapter handed us non-JSON; fall back
  # to null rather than crashing the whole envelope. Use `jq empty` (a parse
  # check), NOT `jq -e .`: the latter exits non-zero for the valid-but-falsy
  # literals `false`/`null`, which would silently drop a real `false` payload
  # (e.g. a yes/no judge's answer).
  if ! printf '%s' "$structured" | jq empty >/dev/null 2>&1; then
    structured="null"
  fi

  jq -n \
    --argjson ok "$ok" \
    --arg status "$status" \
    --arg provider "$provider" \
    --arg model "$model" \
    --argjson structured "$structured" \
    --arg text "$text" \
    --arg error "$error" \
    --arg parsed "$parsed" \
    --argjson timed_out "$timed_out" \
    --argjson attempts "$attempts" \
    --argjson tokens "$tokens" \
    --argjson cost "$cost" \
    '{
      ok: $ok,
      status: $status,
      provider: $provider,
      model: $model,
      structured: $structured,
      text: $text,
      error: (if $error == "" then null else $error end),
      meta: {
        parsed: $parsed,
        timed_out: $timed_out,
        attempts: $attempts,
        tokens: $tokens,
        cost_usd: $cost
      }
    }'
}

# --- input loading ----------------------------------------------------------

aisynth_load_value() {
  # Resolve a "--x VALUE" / "--x-file PATH" pair into a single string on stdout.
  # Args: <inline-value> <file-path>. If a file path is given it takes precedence
  # and MUST exist (return 1 otherwise) — a named-but-missing file is a caller bug
  # we surface, not silently fall back to a possibly-stale inline value. Emptiness
  # of the file's contents is the caller's concern (provider-invoke rejects it).
  local inline="$1" file="$2"
  if [ -n "$file" ]; then
    if [ ! -f "$file" ]; then
      return 1
    fi
    cat "$file"
    return 0
  fi
  printf '%s' "$inline"
}
