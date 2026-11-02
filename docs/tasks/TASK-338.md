# TASK-338 — Spec 018 tracking page (task 2, part a): `tracking.linkFor` / `resolve`, `getTrackingView` (strict allowlist), `buyerStep` fold, the five-step timeline, the florist card from `order.in_production` on, `/{locale}/track/{token}`, the photo proxy, `calendar.ics`, the not-working page, headers and robots meta, `rotateTrackingToken` CLI

Row: `TASKS.md` → TASK-338. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-338`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-337, TASK-202.
- Spec 018 §12 task 2 (tracking half); §5.2 read projections; §5.3; §6. AC-3 to AC-7, AC-11, AC-12, AC-35 (tracking half), AC-41.
- Headline is `buyerStep` of the stored `buyer_projection`; `with_florist` folds into `confirmed`; no copy key for `with_florist`. Steps dated at first entry in the destination zone with the short zone name.
- No florist name or city before an `order.in_production` event; never the word "accepted". The photo route returns `private, max-age=300` and 404 on any token failure.
- Every route: `X-Robots-Tag: noindex, nofollow`, `no-store` (photo `private`), robots meta, no canonical or alternate, `Referrer-Policy: no-referrer`.
- Refund lines, cancelled states, lookup and T16 are TASK-339; the confirmation block and cancel are TASK-340. Leave the view model's `refundLines`, `refundPending` and `cancelledBy` keys in the allowlist, filled by TASK-339.
- **ACs owned:** AC-3, AC-4, AC-5, AC-6, AC-7, AC-11, AC-12, AC-35 (tracking half), AC-41 (T-03 to T-07, T-11, T-12, T-34 tracking half, T-41).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** each of the 26 statuses via `walkOrderTo`; a DST boundary in Europe/Warsaw on the timeline; invalid, forged, rotated, expired-by-delivery and expired-by-cancellation tokens at exactly +90 days (identical 404 body per locale); marker values for recipient name, phone, street, postcode, card message and buyer email absent from every state, the `.ics` and the not-working page; `closed` then `disputed` shows `closed` as future. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/018: §5.2, §5.3, §6, §9 AC-3 to AC-7, AC-11, AC-12, AC-35, AC-41, §10 matching T
- docs/design/wireframes/track-order-*.dc.html
- `tests/fixtures/order-machine.ts`, spec 002 A6.4
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From the implementer's self-review (2026-11-02), handed on:**
  - **TASK-339:** the not-working page's form posts `reference` and `email` to `/{locale}/track`, which TASK-339 builds (`lookupTracking`); until then a submit lands on no route. `refundLines`, `refundPending` and `cancelledBy` are in the view's allowlist and always empty: TASK-339 fills them and adds the cancelled sentences (`tracking.cancelled.*`, `tracking.refundLine`), so a cancelled order shows the headline and the dated cancelled line with no lede until then. `trackHeaderRules()` already covers `/:locale/track` (robots and `no-store`).
  - **TASK-082 / TASK-215:** the photo route has no storage: `PRIVATE_STORAGE` in `photo/route.ts` is `undefined` until the R2 adapter exists, so every photo request answers 404 (as for no photo). Wiring it is that one constant.
  - **TASK-343:** axe, keyboard and visual baselines for the tracking states (none taken here: no local server allowed, and CI's preview has no database, so only the not-working page renders there). The e2e spec `tests/e2e/tracking.spec.ts` covers the not-working 404 headers, `lang`, meta and form for malformed links.
  - **Spec 018 owner:** the boards' "Send this again" link is not built: AC-4's allowlist has no product or destination key, so the view cannot carry its target. Also not built from the boards: the "Anna is making it this morning" lede and the freshness promise line (its refund wording breaks the founder's no-refund-on-tracking rule).
  - **Main:** `docs/codebase-map.md` is over spec 001 A21's 20 480-byte cap on `main` itself (22 378 B at 3e8ff72b3; 23 163 B with this PR), so `codebase-map.test.ts`'s size case is red before and after; the map needs TASK-095's compression or a new cap.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-01 (agent AA, stopped because the laptop is turning off): row set `in_progress`, draft PR 446 open, worktree `/Users/ahmed/dev/fo-wt-338`; reading done, no code written yet. Next agent: `tracking.linkFor`/`resolve`/`rotateTrackingToken` already exist in `src/modules/orders/tracking.ts` (TASK-337). Still to build: `src/modules/orders/tracking-view.ts` (`buyerStep`, strict `TrackingView` with `timeline` as `{ timeZone, steps, cancelled }` so the top-level keys equal AC-4's list; florist card from the latest accepted `order_assignment`, only after an `order.in_production` event; photo state from `delivery_proof`, where deleted means an `order.photo_uploaded` event with no row, dated by `retention_policy.delivery_photo`); the page under `src/app/[locale]/(track)/track/[token]/` with a same-segment `not-found.tsx` for the not-working page (`getLocale()`); its `@header` slot page (`tests/unit/header-slot.test.tsx` requires one); photo and `calendar.ics` route handlers; header rules placed after `securityHeaderRules` in `next.config.ts` so `Referrer-Policy: no-referrer` wins; a `track` page type set to `never` in `seo/indexability.ts` and `transactional.ts`; a `tracking` scope entry in `src/modules/i18n/review-scope.ts`; keys in `messages/en.json` and its meta, then `pnpm i18n:draft` for de and pl; the rotate CLI; and `.claude/state/record-approval-338.py`. CI's preview has no database and no `SIGNED_LINK_SECRET`, so e2e can only cover malformed tokens; forged, rotated and expired tokens go in integration. Storage has no `get`: the photo proxy reads through `Storage.getSignedUrl` plus fetch and returns 404 until R2 is wired (TASK-082). Do not render `product.trust.freshness.body` (it talks about refunds) on tracking. No process is running and the build slot is released.

- 2026-11-02 (agent AA, paused for load): code and tests built and pushed (head after this commit). Done: `tracking-view.ts` (`buyerStep`, `foldTimeline`, `getTrackingView`, `trackingPhotoLocation`), the page, not-found, header slot, photo and `.ics` routes, `trackHeaderRules()`, `trackOrder` page type, `tracking`/`trackLookup` keys (42, queued) with de/pl drafts, `pnpm orders:rotate-tracking`, unit (23) + integration (6, green on a local PG16) + e2e spec, 13 mutations all red (M11/M13 caught by unit and by the strengthened integration headline). `.claude/state/record-approval-338.py --check` passes. Last `gates:cheap` (abcfe1a38): six gates exit 0; tests had 3 red files outside the diff that passed in the previous full run (`catalog-photo-first`, `dev-os`, `seo-sitemap-listings`, likely load timeouts at load 9 to 19). Still to do: re-run those 3 files, update TASKS.md to in_review, fill - 2026-11-02 (agent AA, resumed): rebased (squashed) on `main` 3e8ff72b3, conflicts merged by hand (next.config imports, scope paths, page types, README, the queue and namespace pins; messages merged as main plus the two new namespaces; map and sitemap fixtures regenerated). The 3 timed-out files pass; typecheck clean; tracking unit 23/23 and integration 6/6 on PG16. Adapted one unit case to spec 002 A9.1 on main (accepted and paid now store `confirmed`). PR marked ready.

## Result and carry-forwards (Send this again has no allowlist key; R2 storage for the photo is TASK-082; the lookup POST target and refund/cancel lines are TASK-339; visual/axe are TASK-343), rebase on origin/main, PR body with ## Self-review, `gh pr ready`, `ci:full`. No process running.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#446](https://github.com/itsahmeds/flowers-overseas/pull/446), one squashed commit on `main` 3e8ff72b3 (with the orchestrator's delegated record of the 42 copy keys, 2f333c02e, folded in). Ships `src/modules/orders/tracking-view.ts` (`buyerStep`, `foldTimeline`, `TrackingViewSchema` with exactly AC-4's 14 keys, `getTrackingView`, `trackingPhotoLocation`), `/{locale}/track/{token}` with its `not-found.tsx` (the one not-working 404 per locale) and quiet `@header` slot, the photo proxy (`private, max-age=300`), `calendar.ics` (RFC 5545 all-day event), `trackHeaderRules()` after the security rules (`noindex, nofollow`, `private, no-store`, `Referrer-Policy: no-referrer`), the `trackOrder` page type, the `tracking` and `trackLookup` keys (42, en reviewed under the delegation; de and pl machine drafts), two `formatDate` styles (`stepTime`, `weekdayDayMonth`) and `pnpm orders:rotate-tracking`. Tests: unit `tracking-page.test.tsx` (23), integration `tracking-page.test.ts` (6, on a local PG16), e2e `tracking.spec.ts` (3); pins updated in 10 existing unit files. 13 mutations, each red. No build, server, Playwright or Lighthouse was run locally; founder 2026-11-02: no CI for now. Handed on: see Carry-forwards.
