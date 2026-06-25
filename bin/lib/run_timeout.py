#!/usr/bin/env python3
"""Run a command under a wall-clock timeout, inheriting stdio. Exit 124 on timeout.

Fallback for stock macOS, where neither `timeout` nor `gtimeout` exists (they ship
with GNU coreutils, not the base system). python3 is already a hard dependency of
the provider layer, so this keeps `--timeout` real on the documented target.

The child runs in a NEW process group/session (start_new_session=True). On timeout
we signal the whole group, not just the direct child, so model CLIs that spawn
their own subprocesses can't survive the kill and keep spending tokens. SIGTERM
first, then SIGKILL after a short grace period.

stdio is inherited (not captured), so the caller's redirections — `</dev/null`,
`2>errfile`, and `$(...)` capture of stdout — apply to the child exactly as if the
command ran directly.

  run_timeout.py <seconds> <cmd> [args...]
"""
import os
import signal
import subprocess
import sys


def _kill_group(proc, sig):
    try:
        os.killpg(os.getpgid(proc.pid), sig)
    except (ProcessLookupError, PermissionError):
        try:
            proc.send_signal(sig)
        except ProcessLookupError:
            pass


def main():
    if len(sys.argv) < 3:
        sys.stderr.write("usage: run_timeout.py <seconds> cmd [args...]\n")
        return 2
    try:
        secs = float(sys.argv[1])
    except ValueError:
        secs = 0
    cmd = sys.argv[2:]

    try:
        proc = subprocess.Popen(cmd, start_new_session=True)
    except FileNotFoundError:
        sys.stderr.write("command not found: %s\n" % cmd[0])
        return 127

    timeout = secs if secs > 0 else None
    try:
        return proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        _kill_group(proc, signal.SIGTERM)
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _kill_group(proc, signal.SIGKILL)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
        return 124


if __name__ == "__main__":
    sys.exit(main())
