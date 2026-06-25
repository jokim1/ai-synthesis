#!/usr/bin/env bash
# Provider conformance runner.  ./run.sh [claude|codex|all]   (default: all)
#
# Build-order gate: these must pass before any orchestration is built on the
# provider layer. Exits non-zero if any test fails.
set -uo pipefail

TESTDIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$TESTDIR/../.." && pwd)"
INVOKE="$ROOT/bin/provider-invoke"
PROBE="$ROOT/bin/provider-probe"
LIB="$ROOT/bin/lib"
FIXTURES="$TESTDIR/fixtures"
export ROOT INVOKE PROBE LIB FIXTURES

# shellcheck source=tests/conformance/assert.sh
source "$TESTDIR/assert.sh"
# shellcheck source=tests/conformance/fakes.sh
source "$TESTDIR/fakes.sh"

which="${1:-all}"
printf '=== /ai-synthesis provider conformance ===\n'

case "$which" in
  unit)
    # shellcheck source=tests/conformance/unit.sh
    source "$TESTDIR/unit.sh"; printf '\n[unit]\n'; unit_suite ;;
  claude)
    # shellcheck source=tests/conformance/claude.sh
    source "$TESTDIR/claude.sh"; printf '\n[claude]\n'; claude_suite ;;
  codex)
    # shellcheck source=tests/conformance/codex.sh
    source "$TESTDIR/codex.sh"; printf '\n[codex]\n'; codex_suite ;;
  all)
    # shellcheck source=tests/conformance/unit.sh
    source "$TESTDIR/unit.sh"
    # shellcheck source=tests/conformance/claude.sh
    source "$TESTDIR/claude.sh"
    # shellcheck source=tests/conformance/codex.sh
    source "$TESTDIR/codex.sh"
    printf '\n[unit]\n';   unit_suite
    printf '\n[claude]\n'; claude_suite
    printf '\n[codex]\n';  codex_suite ;;
  *)
    echo "usage: run.sh [unit|claude|codex|all]" >&2; exit 2 ;;
esac

summary
