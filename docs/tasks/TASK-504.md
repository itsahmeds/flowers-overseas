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

- **From B504's walk (2026-11-08), left open:**
  - **Staging itself is not walked.** It sits behind basic auth and serves 4c61712bd until TASK-503's build fix deploys; after the deploy, click Add to basket and Try a demo order on staging once (founder steps in Escalations first).
  - **Admin order page not walked locally:** on a plain-http production build Auth.js issues no session cookie, so the admin magic link lands on `?state=expired` (environmental, staging is https). The demo orders are in the database as `routed`; check `/admin/orders` on staging after the deploy.
  - **Buyer emails and tracking by email lookup cannot be walked with a demo order, by design:** `demo` writes no buyer outbox row (spec 010 §5 outbox targets, `notifications/rules.ts`: "demo has no row at all"), so the lookup answers "If that order exists, we have emailed its link" and nothing is captured. They need a `test` order, which needs Stripe test keys on the environment (spec 013).
  - **The live-mode date refusal is unit-tested only** (`dateRefusalReason`); no environment reaches `live` (no live payment step, legal not ready).
  - **pl checkout copy is English:** basket and checkout strings in `pl` are machine drafts that copy the English text ("Your basket", "Remove", "To Polska"), awaiting the native review queue.
  - **Em dashes in 13 reviewed `en` keys** (founder: no em dash anywhere), the one on every page being `company.support.hours` in the footer ("Message us any time, 24/7 — we reply within a few hours."); also `consent.*`, `corridor.*`, `occasionsIndex.undatedNote`. A copy task, not changed here.
  - **Listing "Our order" alphabetical, "+ Chocolates" sets beside their bouquet (brief item 4):** owned by TASK-390 (listings, open) and TASK-406 (margin preference); not touched here, as the brief asked.
- **From B504b (2026-11-08), left open:**
  - **Staging's own cause is not read from its logs** (no Railway access). If Add to basket still lands back on the product page after this deploy, Railway Logs show one `checkout.refused` error line: `sql_state 42P01` means `DATABASE_URL` (pooled) is not the database `DATABASE_URL_UNPOOLED` migrates (point both at the same Neon branch); `42501` a role grant; `product_not_in_database` means `pnpm db:seed --insert-only` was not run; `quote_signing_unavailable` the secret.
  - **The seed is not part of the deploy:** product rows (FK of every basket line) come only from `pnpm db:seed --insert-only`; the pre-deploy step runs migrations only. Founder step until a task adds it.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-11-08 B504 to the orchestrator/founder (open): **the staging 500 is environmental.** Main's code answers 303 on a production build against a migrated database, and the staging commit has the same `start.ts`/`draft.ts`/`pricing.ts`. The start route reads `feature_flag` and writes `checkout_draft`/`checkout_draft_line` at runtime as `app_web` through `DATABASE_URL`; the product page's buttons come from the build (`DATABASE_BUILD_URL`), so a broken runtime database shows the buttons and then 500s, and it also stops ISR regeneration, which is why staging still shows 6 and 7 Nov. Founder steps: (1) Railway, staging service, Logs: filter `checkout/start` and read the error under the 500 (a `relation ... does not exist` means migrations, `permission denied` means the role). (2) Check the database the runtime uses: `curl -u <staging basic auth> -H "x-internal-cron-secret: <INTERNAL_CRON_SECRET>" https://staging.flowersoverseas.com/api/internal/db-health`; `latest_migration` must be `0036_buyer_sign_in`. If it is lower, run `DATABASE_URL_UNPOOLED=<staging DATABASE_URL, direct host> pnpm db:migrate` then `pnpm db:seed --insert-only` against the same URL. Note: the Neon `production` branch that `.env.local` names holds only migrations 0001 and 0002 (read-only check by B504), so if staging's `DATABASE_URL` points there, that is the cause. (3) Railway staging variables: `QUOTE_SIGNING_SECRET` must be set (`openssl rand -hex 32`); without it every Add to basket returns to the product page (now logged as `checkout.refused {code: quote_signing_unavailable}` at error level). (4) In admin, Flags: `checkout.open` on for Poland.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-08 B504: reproduced on a local PG16 (migrated to 0036, seeded, `checkout.open` PL on). On current main `POST /api/checkout/start` answers 303 in dev; on a production build it answered 303 back to the product page with `checkout.refused {code: no_price}` until `QUOTE_SIGNING_SECRET` was set: a production Node process refuses the committed development key, so without the env var every start silently returns to the product page. The staging 500 could not be reproduced locally on main's code; staging serves 4c61712bd (same `start.ts`, `draft.ts`, `pricing.ts`), so its 500 is environmental (the database or the env), see Escalations.
- 2026-11-08 B504: start route refuses a posted live date the destination cannot deliver (`dateRefusalReason`, logs `checkout.date_refused {reason_key}`); unit test `tests/unit/checkout-date-refusal.test.ts` (6). The product page date row is already all-disabled in `preview` (Phase 0) on a fresh render; the past dates staging shows come from a cached page that has not regenerated since 6 Nov (ISR `revalidate = 3600` plus edge `stale-while-revalidate`), which again points at runtime failures on staging.
- 2026-11-08 B504: copy: `product.demo.heading`, `delivery.picker.preview`, `destinationsHub.intro` read in line with "Ordering opens soon" (en unreviewed and queued; de/pl machine drafts); `.claude/state/record-approval-504.py --check` exit 0.
- 2026-11-08 B504: walk on a production build (main + TASK-503) in en and en-gb/pl: the existing `checkout-journey` e2e passed 12/12 (desktop and mobile, JS on and off). Found: an add-on press on step 2 lost the typed card message and buyer fields (the button sat in a separate form); fixed by submitting the step form and echoing the typed values back. A missing quote key is now logged at error level (`quote_signing_unavailable`).
- 2026-11-08 B504b: **the staging 500 reproduced and fixed.** A production build (clean env, standalone `node server.js` as Railway runs it) answers exactly staging's signature, `POST /api/checkout/start` 500 with an empty body while `/en/basket`, `/en/checkout`, `/en/track` and `/api/prices/en/pl` answer 200, when `DATABASE_URL` points at a database that is not the migrated one: the flag read throws `relation "feature_flag" does not exist` (42P01) and nothing caught it. Pages answer 200 because none of them touches the database without a basket cookie. The same empty 500 follows from a server env that fails validation (the Stripe wiring threw before the route ran). A migrated but unseeded database, a closed `checkout.open` and a missing `QUOTE_SIGNING_SECRET` each already answered 303 back to the product page; all flag rows come from migrations, not the seed. Fixed in PR (task/TASK-504-start-500): `startCheckout` catches every failure, logs `checkout.refused {code: start_failed, error_name, sql_state}` at error level and 303s to the product page; a missing flag row reads as its safe value (`checkout.open` off, demo guard on, Stripe off); the wiring logs `payments.wiring {code: payments_env_invalid, keys}` and returns; a product missing from the database logs at error level. Verified on the fixed build: unmigrated runtime DB 303 + 42P01 line; bad env 303; seeded PL off 303 closed; PL on no secret 303 + `quote_signing_unavailable`; unseeded 303 + `product_not_in_database`; seeded PL on with secret 303 to `/en/basket` with cookies.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 511. Fixed: (1) an add-on press on checkout step 2 discarded the typed card message, signature and buyer details (the button now submits the step form and the action echoes the typed values back); (2) the start route stores no live date the destination cannot deliver (past, closed weekday, holiday, past cutoff) and logs `checkout.date_refused {reason_key}`; (3) a missing `QUOTE_SIGNING_SECRET` is logged at error level instead of a quiet `no_price`; (4) three lines now read in line with "Ordering opens soon" (`product.demo.heading`, `delivery.picker.preview`, `destinationsHub.intro`; record with `.claude/state/record-approval-504.py`, `--check` exit 0). Tests: unit `checkout-date-refusal` (6); e2e `checkout-journey` add-on case (2 modes x 2 viewports). Walked on a local production build (main + TASK-503, build slot taken for `next build`, `next start` and Playwright because the bug report is about the deployed path): `checkout-journey` + `checkout-ui` 26/26 green; en, pl and en with JavaScript off: product, basket (two lines, remove, header count 2), step 1 (past days absent, Sundays and 11 Nov disabled), step 2 with an add-on, step 3, demo place, confirmation with reference. Integration `checkout-basket` + `checkout-draft` 57/57 on a local PG16. The staging 500 is environmental: founder steps in Escalations.
