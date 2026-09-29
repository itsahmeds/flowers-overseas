# TASK-157 — Launch texts (`launch.md`, `/launch`, work-order Role: launch) and the founder-action runbook F1–F6 with click-by-click Railway steps

Row: `TASKS.md` → TASK-157. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-157`; keep it current by editing this file, not the row.

## Binding

`specs/040-hosting-railway-cloudflare.md` §14 A3 L907: AC-37, AC-41, AC-42 (T-41, T-44). Production launch is two visits: gates → `RELEASE: READY | HALTED` naming the SHA; the orchestrator promotes `release` to that SHA; the watch visit reports `PROMOTED | ROLLED BACK`. The release note is committed on `HALTED` too. The founder is Railway Admin and does F1–F4; F5 is the token scope; F6 is the deletion-only ruleset on `release`. Founder answers of 2026-09-28 (`docs/decisions-log.md`, last rows) and the advisor fixes are already written into the amendment; do not reopen them.

## Read

- `specs/040-hosting-railway-cloudflare.md`: read `## 0. Index` first, then only A19/A3's changes and the ACs named above
- `docs/codebase-map.md`: where everything lives
- .claude/agents/launch.md
- .claude/skills/launch/SKILL.md
- .claude/templates/work-order.md Role: launch
- docs/runbooks/railway-cloudflare-setup.md

## Carry-forwards

- **From `/review 104` (2026-09-28):** your test rows are **T-41** and **T-44** (spec 040's new AC-42 row, added after `/break 104` round 1). You depend on TASK-152 (`framework-text.test.ts`) and TASK-153 (`work-order.md`) as well as TASK-156. T-42, the first release, is a `/launch`, not this task.

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/break 108` round 3 (2026-09-28):** you wait for TASK-154 too, because it adds `maxTurns` to every `.claude/agents/*.md` frontmatter, `launch.md` included, and you edit `launch.md`. Rebase on it and keep its frontmatter.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-09-29: T-41's seven framework-text cases written in `tests/unit/framework-text.test.ts`, red on the current texts (8 failed / 22 passed, the eighth being the unmodified-scratch case). Next: rewrite `launch.md`, `/launch` and the work order's Role: launch.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
