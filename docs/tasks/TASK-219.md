# TASK-219 — Spec 012 flag reader: the `src/config/feature-flags.ts` registry with `checkout.open` and `checkout.demo_guard`, and `src/lib/flags.ts` `isEnabled` over `feature_flag` and `feature_flag_scope` with the 60 s in-process cache

Row: `TASKS.md` → TASK-219. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-219`; keep it current by editing this file, not the row.

## Binding

- `specs/012-admin-v0.md` §2.4 and §12 task 10 (reader half). Owns **AC-14 (registry and reader half: the registry holds exactly `checkout.open` with country scope and `checkout.demo_guard` global and high-risk, each with its scope kinds, description, risk level and dirtied tags; `isEnabled(key, scope?)` reads `feature_flag` and `feature_flag_scope` with a 60 s in-process cache and sees a change within 60 s on a fake clock; an unregistered key is refused)**; test **T-16 (unit half)**.
- **Ruling R5 (decisions log 2026-10-05, "Specs 010, 011 and 012: cross-spec ownership"):** split out of spec 012 task 10 so that spec 010's TASK-203 reads its two flags without waiting for admin sign-in and Resend. `src/config/feature-flags.ts` (`FeatureFlagRegistrySchema`) and `src/lib/flags.ts`. TASK-220 builds the page on these and changes neither contract.
- Flags live in the database, never in env (spec 002 §12). Read-only, under a system context; no write path here.
- **Class:** not review-only (`CLAUDE.md` DoD §4): the flags decide the checkout's mode, the gate before any payment. `/review` and `/break` both run.

## Read

- `specs/012-admin-v0.md`: `## 0. Index`; §2.4; §5.2 (the flags row); §9 AC-14; §10 T-16.
- `specs/010-checkout.md` §5.2 (`checkoutMode()` inputs) and §12 "Feature flags"; `docs/tasks/TASK-021.md`; `src/lib/db.ts`.

## Carry-forwards

One dated bullet per `/review`, newest last.

_None recorded._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
