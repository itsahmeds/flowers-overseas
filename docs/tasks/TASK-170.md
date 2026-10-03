# TASK-170 — Every 404 under a known locale renders a real localised document with `lang` (spec 003 AC-8)

Row: `TASKS.md` → TASK-170. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-170`; keep it current by editing this file, not the row.

## Binding

- **AC-8** (spec 003, quoted): "`GET /fr`, `/xx`, `/EN`, `/nope` each return **404** (not 3xx, not
  200) with a document whose `lang` is the x-default locale; `GET /en/does-not-exist` returns 404
  with `lang="en"` and localised 404 copy." The orchestrator reads AC-8's intent (WCAG 3.1.1,
  document language) as covering every 404 shape under `/{locale}/`, not only the examples it
  names. "(not 3xx, not 200)" binds the fix: no redirect, no soft 404.
- **Measured on production `4ea52972`, 2026-10-03:** `/en/send-flowers-to/nowhere` and
  `/xx/send-flowers-to/poland` → 404 inside `<html id="__next_error__">` with **no `lang`**;
  `/en/nope-segment` and `/fr` → 404 with `lang="en"` (correct). The orchestrator's TASK-127 E-1
  spike reported the same two shapes on PR 135's build (in its report to the orchestrator; the
  written E-1 record in TASK-127 and spec 009 §14 A6 covers only the layout-flip option).
- **Cause to confirm, not assume:** spec 003 §14 A3 records that a `notFound()` from a *matching*
  route renders inside the framework's error document with no `lang`, while a routing-layer
  refusal (`dynamicParams = false`) reaches `src/app/not-found.tsx`. `src/app/[locale]/[segment]/[child]/page.tsx`
  calls `notFound()` in several branches, but `/xx/send-flowers-to/poland` (an unknown locale)
  may be a routing refusal at depth 3 rather than a `notFound()` call, so search every path that
  can produce a 404 under `[locale]`, not only `notFound()` calls. Fix each so it renders the
  localised not-found document with the right `lang`, without a redirect.
- **Tests:** an e2e case per 404 shape found (depth 2, 3 and 4 under a known locale; an unknown
  locale with a deeper path), each asserting status 404, `<html lang>` set, no
  `id="__next_error__"`, and the localised not-found copy. Each watched red against today's code.
- **Gates:** the cheap gates, then CI green, browser jobs included.
- **Stop and report, do not proceed, if the fix needs:** a change to `dynamicParams` on
  `src/app/[locale]/layout.tsx`; a different `lang` for an unknown locale than the x-default; or a
  change to AC-8's text or spec 003 §14 A3. Adding test cases for more 404 shapes is this task's
  job and needs no amendment.

## Read

- `specs/003-i18n-foundation.md` — `## 0. Index`, then §6, AC-8, §14 A3.
- `src/app/[locale]/layout.tsx` (its header), `src/app/not-found.tsx`,
  `src/app/[locale]/[segment]/[child]/page.tsx`.
- `docs/codebase-map.md` — the `src/app/` rows.

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
