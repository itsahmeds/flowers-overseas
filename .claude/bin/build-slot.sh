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
# Why a token (spec 001 §14 A19 AC-41): anyone could `release` another agent's slot. `acquire`
# now writes a random token into the lock beside the owner line and prints it; only `release
# <token>` removes the lock. `release --force` removes any lock and is the orchestrator's alone:
# `.claude/hooks/bash_guard.py` refuses it inside a subagent. The token stops accidents, not
# malice: it sits in a readable file under $TMPDIR.
#
#   .claude/bin/build-slot.sh acquire [max-wait-seconds]   # default 2700; prints `build-slot: token <hex>`
#   .claude/bin/build-slot.sh release <token>              # exit 3 without it, or with a wrong one
#   .claude/bin/build-slot.sh release --force              # orchestrator only; names whose lock it removed
#   .claude/bin/build-slot.sh status                       # holder and age, never the token
set -euo pipefail

LOCK="${TMPDIR:-/tmp}/fo-build-slot.lock"
STALE_MINUTES="${STALE_MINUTES:-45}"

holder() { cat "$LOCK/owner" 2>/dev/null || echo unknown; }

age() {
  local since now
  since="$(cat "$LOCK/since" 2>/dev/null || echo "")"
  now="$(date +%s)"
  if [[ "$since" =~ ^[0-9]+$ ]]; then echo "$(( (now - since) / 60 ))m"; else echo "unknown age"; fi
}

new_token() {
  # 128 bits of hex from the kernel's CSPRNG; `od` is on macOS and Linux alike.
  od -An -N16 -tx1 /dev/urandom | tr -d ' \n'
}

reap_if_stale() {
  [ -d "$LOCK" ] || return 0
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin "+$STALE_MINUTES" 2>/dev/null)" ]; then
    echo "build-slot: reaping a lock older than ${STALE_MINUTES}m (owner: $(holder))" >&2
    rm -rf "$LOCK"
  fi
}

case "${1:-}" in
  acquire)
    deadline=$(( $(date +%s) + ${2:-2700} ))
    until mkdir "$LOCK" 2>/dev/null; do
      reap_if_stale
      [ -d "$LOCK" ] || continue
      [ "$(date +%s)" -ge "$deadline" ] && { echo "build-slot: timed out after ${2:-2700}s; holder $(holder), held $(age)" >&2; exit 1; }
      sleep 10
    done
    token="$(new_token)"
    ( umask 077; printf '%s\n' "$token" > "$LOCK/token" )
    date +%s > "$LOCK/since"
    printf '%s %s\n' "${TASK_ID:-unknown}" "$(date -u +%FT%TZ)" > "$LOCK/owner"
    echo "build-slot: acquired by ${TASK_ID:-unknown}"
    echo "build-slot: token $token"
    ;;
  release)
    if [ ! -d "$LOCK" ]; then
      echo "build-slot: free (nothing to release)"
      exit 0
    fi
    if [ "${2:-}" = "--force" ]; then
      who="$(holder)"; held="$(age)"
      rm -rf "$LOCK"
      echo "build-slot: forced release of the lock held by ${who} (${held})"
      exit 0
    fi
    if [ -z "${2:-}" ] || [ "${2:-}" != "$(cat "$LOCK/token" 2>/dev/null || echo)" ]; then
      if [ -z "${2:-}" ]; then why="no token given"; else why="wrong token"; fi
      echo "build-slot: release refused (${why}); held by $(holder) for $(age). Release with the token acquire printed; the orchestrator forces a dead owner's lock." >&2
      exit 3
    fi
    rm -rf "$LOCK"
    echo "build-slot: released"
    ;;
  status)
    if [ -d "$LOCK" ]; then echo "held: $(holder) ($(age))"; else echo "free"; fi
    ;;
  *)
    echo "usage: build-slot.sh {acquire [max-wait-seconds]|release <token>|release --force|status}" >&2
    exit 2
    ;;
esac
