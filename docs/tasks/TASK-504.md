# TASK-504 — The buying flow works end to end

Row: `TASKS.md` → TASK-504. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-504`; keep it current by editing this file, not the row.

## Context

Founder 2026-11-08: "the buying flow u made isnt good test everything on staging and make sure not to miss anything... do meaning full work".

Found by the orchestrator on staging (which still serves 4c61712bd from 2026-11-04 because builds fail, TASK-503):
1. `POST /api/checkout/start` returns 500 (empty body) for `then=basket` and `then=checkout` with countryIso=PL, sku=FO-BQ-001, tier=stems_15, date=2026-11-10, expectedCurrency=EUR, locale=en. Route: `src/app/api/checkout/start/route.ts` -> `startCheckout` in `src/modules/checkout/start.ts` (loadDraft, currentCheckoutMode, deriveQuote, appendLine / create draft). No Railway or Sentry access from here: reproduce locally on a production build against a migrated, seeded local Postgres, and check whether staging lacks a migration, grant or env var (if it is env or data only, write the exact founder step).
2. The product page date row offers 6 and 7 Nov (past on 8 Nov) and Sundays (8, 15 Nov) as enabled radios although the page says "We do not deliver on Sundays in Poland". Past dates and non-delivery days must not be choosable, also with JavaScript off, and the server must refuse them.
3. Germany product pages say "Ordering is not open yet"; Poland is the demo country. Copy on Poland reads "We are not taking orders yet" (TASK-239 wants "Ordering opens soon").
4. Listing "Our order" on /en/germany/flowers runs alphabetically (Amber Hour, Amber Hour + Chocolates, Anthurium...), and "+ Chocolates" gift sets sit beside their bouquet as near-duplicate cards. Check against spec 045/008 "Our order"; fix only if the spec says otherwise (TASK-390 owns listings: coordinate, do not edit its files while it is open).

Then walk the whole path on the production build in en and pl: product -> basket (change qty, remove, add-on) -> checkout step 1-4 (recipient, card message, details, pay in demo/fake mode) -> confirmation -> tracking page by email lookup -> buyer emails in the capturing mailer -> admin order page shows the order. Fix every break in this PR (or a sibling PR closing this task); list anything left as carry-forwards.

Founder rule: no review steps; PR description is a short list of what was broken and the fix. Use the build slot for `next build`/`next start`/Playwright and release it on failure too.

## Binding

What the spec binds this task to, in the spec's own words: the resolution notes that override
defaults, the AC ids owned, the rulings from earlier reviews that apply here, the gates that must
be green. One paragraph or a short list — no restatement of the spec.

## Read

- `specs/NNN-*.md` — read `## 0. Index` first, then only the sections the ACs name
- `docs/codebase-map.md` — where everything lives
- (the two or three files the deliverable actually touches)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-08 B504: reproduced on a local PG16 (migrated to 0036, seeded, `checkout.open` PL on). On current main `POST /api/checkout/start` answers 303 in dev; on a production build it answered 303 back to the product page with `checkout.refused {code: no_price}` until `QUOTE_SIGNING_SECRET` was set: a production Node process refuses the committed development key, so without the env var every start silently returns to the product page. The staging 500 could not be reproduced locally on main's code; staging serves 4c61712bd (same `start.ts`, `draft.ts`, `pricing.ts`), so its 500 is environmental (the database or the env), see Escalations.
- 2026-11-08 B504: start route refuses a posted live date the destination cannot deliver (`dateRefusalReason`, logs `checkout.date_refused {reason_key}`); unit test `tests/unit/checkout-date-refusal.test.ts` (6). The product page date row is already all-disabled in `preview` (Phase 0) on a fresh render; the past dates staging shows come from a cached page that has not regenerated since 6 Nov (ISR `revalidate = 3600` plus edge `stale-while-revalidate`), which again points at runtime failures on staging.
- 2026-11-08 B504: copy: `product.demo.heading`, `delivery.picker.preview`, `destinationsHub.intro` read in line with "Ordering opens soon" (en unreviewed and queued; de/pl machine drafts); `.claude/state/record-approval-504.py --check` exit 0.
- 2026-11-08 B504: walk on a production build (main + TASK-503) in en and en-gb/pl: the existing `checkout-journey` e2e passed 12/12 (desktop and mobile, JS on and off). Found: an add-on press on step 2 lost the typed card message and buyer fields (the button sat in a separate form); fixed by submitting the step form and echoing the typed values back. A missing quote key is now logged at error level (`quote_signing_unavailable`).

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
