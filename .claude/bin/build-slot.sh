#!/usr/bin/env bash
# One build/Playwright/Lighthouse at a time on this Mac.
#
# Why a lock directory and not `pgrep`: the previous instruction told agents to
# sleep until `pgrep -f "next build|next start|playwright|lighthouse"` came back
# empty. That pattern matches the *waiting shell's own command line*, so every
# waiter kept itself and every sibling waiting — measured on 2026-09-18 as 4
# waiting shells against 16 real processes, and it is the likeliest cause of the
# 346-, 243- and 199-minute agent runs. `mkdir` is atomic, so this cannot happen.
#
# Why staleness and not a pid: acquire and release arrive as separate tool calls,
# each in its own short-lived shell, so no pid survives to own the lock. A lock is
# instead reaped once it is older than STALE_MINUTES (default 45) — longer than
# any honest build here, short enough that a killed agent does not wedge the fleet.
#
#   .claude/bin/build-slot.sh acquire [max-wait-seconds]   # default 2700
#   .claude/bin/build-slot.sh release
#   .claude/bin/build-slot.sh status
set -euo pipefail

LOCK="${TMPDIR:-/tmp}/fo-build-slot.lock"
STALE_MINUTES="${STALE_MINUTES:-45}"

reap_if_stale() {
  [ -d "$LOCK" ] || return 0
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin "+$STALE_MINUTES" 2>/dev/null)" ]; then
    echo "build-slot: reaping a lock older than ${STALE_MINUTES}m (owner: $(cat "$LOCK/owner" 2>/dev/null || echo unknown))" >&2
    rm -rf "$LOCK"
  fi
}

case "${1:-}" in
  acquire)
    deadline=$(( $(date +%s) + ${2:-2700} ))
    until mkdir "$LOCK" 2>/dev/null; do
      reap_if_stale
      [ -d "$LOCK" ] || continue
      [ "$(date +%s)" -ge "$deadline" ] && { echo "build-slot: timed out after ${2:-2700}s; holder $(cat "$LOCK/owner" 2>/dev/null || echo unknown)" >&2; exit 1; }
      sleep 10
    done
    printf '%s %s\n' "${TASK_ID:-unknown}" "$(date -u +%FT%TZ)" > "$LOCK/owner"
    echo "build-slot: acquired by ${TASK_ID:-unknown}"
    ;;
  release)
    rm -rf "$LOCK"
    echo "build-slot: released"
    ;;
  status)
    if [ -d "$LOCK" ]; then echo "held: $(cat "$LOCK/owner" 2>/dev/null || echo unknown)"; else echo "free"; fi
    ;;
  *)
    echo "usage: build-slot.sh {acquire [max-wait-seconds]|release|status}" >&2
    exit 2
    ;;
esac
