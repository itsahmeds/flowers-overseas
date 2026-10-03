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

- 2026-10-03 — **E-1, to the orchestrator (for the founder): the depth-3 404s cannot be fixed inside this task's fence.** Open.
  - **Cause (measured on a local production build of `844afd10`, Next 16.3.6).** `/[locale]/[segment]/[child]` is a `ƒ` route: spec 008 §13 Q2 makes the country shop root's listing paths read `searchParams`, so those paths prerender with `revalidate: 0`, and Next then writes **no `dynamicRoutes` entry** for the route (`node_modules/next/dist/build/index.js`: the entry is added only `if (!hasRevalidateZero && isDynamicRoute(page))`). The router enforces `dynamicParams = false` only through that entry (`build/templates/app-page-runtime.js`: `NoFallbackError` needs `isSSG` and `fallbackMode === NOT_FOUND`), so on this route — and only this one — **both** the page's and the layout's `dynamicParams = false` are inert. An unknown depth-3 path, under a real or an unknown locale, renders the page; `resolveLocalePath()` finds nothing; the page calls `notFound()`; and a request-time `notFound()` reaches the Fizz shell, which Next answers with `<html id="__next_error__">` and status 404 (`server/app-render/app-render.js`, `getErrorRSCPayload`). `prerender-manifest.json` lists `/[locale]`, `/[locale]/[segment]` and `/[locale]/[segment]/[child]/[grandchild]` with `fallback: false`, and not the depth-3 route.
  - **Nested `not-found.tsx` measured and rejected.** `src/app/[locale]/not-found.tsx` (rendering inside the locale layout's `<html lang>`) was built twice — once with next-intl copy, once as a static `<h1>` — plus once with the depth-3 `generateMetadata` no longer calling `notFound()`: all three still served `__next_error__`; the boundary's markup appears only in the RSC payload. Spec 003 §14 A3's finding holds on 16.3.6, for pages as well as layouts.
  - **What would fix it, each outside the fence:** (a) spec 008 §13 Q2 — the country shop root's bare URL prebuilt (ISR) and its `?page=`/`?sort=` variants served another way, so the depth-3 route is SSG again and the router refuses unknown params with the x-default document; (b) spec 003 §2 — let `src/proxy.ts` *rewrite* (never redirect) a depth-3 path outside the existence set to an unmatched path, which needs the existence set in the proxy; (c) spec 003 §14 A3's tripwire, Cache Components, which replaces the gate altogether; (d) accept the hole until Next renders a request-time `notFound()` as a document, with the seven red cases kept as the tracker.
  - **Not affected:** depth 2, depth 4 (product and listing) and every unknown-locale shape at depth 2 or 4 are already the x-default document — pinned green in the same block.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-03 — e2e first: `tests/e2e/locale-routing.spec.ts` gains "every 404 shape is the localised not-found document" (15 shapes, depths 2–4, known and unknown locale); each asserts 404, no `Location`, `<html lang="en">`, no `__next_error__`, the rendered `<h1>`. Next: build, watch it red, diagnose.
- 2026-10-03 — red, on a production build of `844afd10` (`next start`, port 3170): 7 of 15 cases fail, exactly the depth-3 shapes (`/en/send-flowers-to/nowhere`, `/de/blumen-verschicken/nirgendwo`, `/en/atlantis/flowers`, `/en/poland/nope`, `/en/flowers/no-such-kind`, `/xx/send-flowers-to/poland`, `/fr/poland/flowers`), each `lang` undefined inside `<html id="__next_error__">`; the 8 depth-2, depth-4 and unknown-locale depth-2/4 shapes pass.
- 2026-10-03 — diagnosed (the cause is in E-1): the depth-3 route is `ƒ`, so it has no `dynamicRoutes` entry and `dynamicParams = false` is not enforced there; its `notFound()` at request time is Next's error shell. Three builds measured a nested `[locale]/not-found.tsx` and a metadata-free `notFound()`: still the error shell. Every remaining lever is another spec's decision → `blocked`, E-1 open. Experiments reverted; the PR carries only the tests.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

**Partial, blocked on E-1.** PR #143 (draft) carries the e2e block only: 15 shapes in `tests/e2e/locale-routing.spec.ts`, "every 404 shape is the localised not-found document" — 8 green, 7 red (the depth-3 shapes) on a local production build, which is the hole this task found. No application file changed. One build slot taken, for the reason DoD §2 gives (404 rendering is only observable on a production build): four builds (~1 min 40 s each; load average 2.4 at the start), red run plus three measured experiments, all reverted. `pnpm gates:cheap` PASS on `844afd10`.
