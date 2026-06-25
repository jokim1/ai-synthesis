#!/usr/bin/env bash
# Minimal assertion library for the provider conformance suites.
# Sourced by run.sh; suites use the assert_* helpers and the shared counters.

T_PASS=0
T_FAIL=0
T_SKIP=0
T_FAILED=""

_green() { printf '\033[32m%s\033[0m' "$1"; }
_red()   { printf '\033[31m%s\033[0m' "$1"; }
_yellow(){ printf '\033[33m%s\033[0m' "$1"; }

pass() { T_PASS=$((T_PASS + 1)); printf '    %s %s\n' "$(_green PASS)" "$1"; }
skip() { T_SKIP=$((T_SKIP + 1)); printf '    %s %s\n' "$(_yellow SKIP)" "$1"; }
fail() {
  T_FAIL=$((T_FAIL + 1))
  T_FAILED="${T_FAILED}
    - $1"
  printf '    %s %s\n' "$(_red FAIL)" "$1"
  [ -n "${2:-}" ] && printf '         %s\n' "$2"
  return 0
}

# assert_eq <name> <expected> <actual>
assert_eq() {
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "expected [$2], got [$3]"; fi
}

# assert_true <name> <value>   (value must be the literal string "true")
assert_true() {
  if [ "$2" = "true" ]; then pass "$1"; else fail "$1" "expected true, got [$2]"; fi
}

# assert_nonempty <name> <value>
assert_nonempty() {
  if [ -n "$2" ] && [ "$2" != "null" ]; then pass "$1"; else fail "$1" "expected non-empty, got [$2]"; fi
}

# assert_contains <name> <haystack> <needle>
assert_contains() {
  case "$2" in
    *"$3"*) pass "$1" ;;
    *) fail "$1" "[$2] does not contain [$3]" ;;
  esac
}

# assert_in <name> <value> <space-separated-allowed>
assert_in() {
  local v="$2" allowed=" $3 "
  case "$allowed" in
    *" $v "*) pass "$1" ;;
    *) fail "$1" "[$v] not in [$3]" ;;
  esac
}

section() { printf '\n  %s\n' "$1"; }

summary() {
  printf '\n========================================\n'
  printf '  passed: %s   failed: %s   skipped: %s\n' "$T_PASS" "$T_FAIL" "$T_SKIP"
  if [ "$T_FAIL" -gt 0 ]; then
    printf '  failures:%b\n' "$T_FAILED"
    printf '========================================\n'
    return 1
  fi
  printf '  ALL CONFORMANCE TESTS PASSED\n'
  printf '========================================\n'
  return 0
}
