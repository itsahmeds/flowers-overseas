# TASK-220 — Spec 012 flags page: `/admin/flags` listing and toggling registry keys only, orphaned keys shown and refused, the typed-key confirmation for high-risk flags, `invalidate(['catalog:{iso2}'])` on a `checkout.open` toggle and the tag in `urlsForTag`

Row: `TASKS.md` → TASK-220. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-220`; keep it current by editing this file, not the row.

## Binding

- `specs/012-admin-v0.md` §12 task 10 (page half). Owns **AC-14 (page half: `/admin/flags` lists and toggles registry keys only and refuses an unknown or orphaned key; `checkout.demo_guard` needs the admin role and the typed key; a `checkout.open` toggle for a country calls `invalidate()` once with exactly `catalog:{iso2}`)**; tests **T-16 (integration half), T-24 and T-25 for `/admin/flags`**.
- **Scope:** the page on TASK-219's registry and reader; toggles inside `withAdminContext` with an action (audited by TASK-218's trigger); `urlsForTag` learns `catalog:{iso2}` in `src/lib/cache.ts`; `invalidate` revalidates the origin and then purges the edge, and a failure is `warn` + Sentry with the tags. The locale and site-link overlays are spec 012b's and are not built.
- **Design.** `docs/design/` is the source of truth: match the artboards named under Read pixel for pixel, and keep `system/components.dc.html` in step with `src/modules/ui` in the same PR.
- **Why TASK-202 is a dependency** (spec 012 task 10 does not list it): the `checkout.open` flag and its `PL` scope row come from spec 010 §5.1 A, seeded by TASK-021 or, if TASK-021 merged without them, by TASK-202's fallback migration; the page needs the rows to exist.
- **Class:** not review-only (`CLAUDE.md` DoD §4): cache invalidation and a high-risk switch over the checkout's mode. `/review` and `/break` both run.

## Read

- `specs/012-admin-v0.md`: `## 0. Index`; §2.4; §5.3 (the flags row); §5.4 "Invalidation"; §11; §9 AC-14; §12 task 10.
- `specs/010-checkout.md` §5.4 (the PDP button and the tag); `docs/tasks/TASK-219.md`; `src/lib/cache.ts`.
- Artboards (merged in PR 197; `docs/design/audits/2026-10-05-specs-011-012.md`): `docs/design/wireframes/admin-flags-desktop.dc.html`, `docs/design/wireframes/admin-flags-mobile.dc.html`. The typed-key confirmation keeps its button enabled and refuses a mismatch with a message (the audit's decision 5; spec 004 §14 A20).

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
