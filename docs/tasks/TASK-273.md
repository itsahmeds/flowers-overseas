# TASK-273 — Two stale "7-day" code comments: `src/modules/ui/icons/Icon.tsx` L46 and `src/modules/ui/trust/TrustStrip.tsx` L7 still quote the retired "7-day freshness guarantee"

Row: `TASKS.md` → TASK-273. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-273`; keep it current by editing this file, not the row.

## Binding

- Spec 009 §14 A11 retires every number of days of freshness. Two code comments still quote it: `Icon.tsx` L46 (`// Hero trust row and trust strip: "7-day freshness guarantee".`) and `TrustStrip.tsx` L7 (the A6 default).
- Reword both to name the fresh-flower promise without a number of days; change nothing else.
- **Class:** review-only (comments in presentation components; no copy key, no `<title>`, meta or structured data).

## Read

- `specs/009-*` §14 A11; `docs/tasks/TASK-172.md`
- `src/modules/ui/icons/Icon.tsx`, `src/modules/ui/trust/TrustStrip.tsx`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-25: both comments reworded in PR 431 (with TASK-128). Done.

## Result

PR [#431](https://github.com/itsahmeds/flowers-overseas/pull/431), in the TASK-128 feature PR. `src/modules/ui/icons/Icon.tsx` L46 now reads "the fresh-flower promise (spec 009 §14 A11, no number of days)", and `src/modules/ui/trust/TrustStrip.tsx` L6-L10 paraphrases spec 004 §2 with the guarantee named as the fresh-flower promise "which names no number of days since spec 009 §14 A11 retired A6's default", no longer quoting the retired "7-day" wording. Comments only: no rendered text, key, `<title>`, meta or structured data changed, so no test was added; `grep -rn "7-day" src/modules/ui` finds nothing.
