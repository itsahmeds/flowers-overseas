# TASK-203 — Spec 010 draft, start route and step actions: migration `NNNN_checkout_draft` + rollback, the draft service and the `fo_checkout` cookie, `POST /api/checkout/start`, `saveRecipientStep`, `saveCardAndBuyerStep`, `updateSelection`, quote issue and verification, the price-changed flow, the cookie register row

Row: `TASKS.md` → TASK-203. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-203`; keep it current by editing this file, not the row.

## Binding

- `specs/010-checkout.md` §12 task 4. Owns **AC-6, AC-10 (server half: 201 graphemes refused by the server, NFC stored), AC-11, AC-13, AC-17, AC-36 (cookie-register half: `fo_checkout` essential, server-written, `status: "set"`; no `fo_csrf` row)**; tests **T-06, T-10 (integration half), T-11, T-13, T-17, T-36 (cookie half)**.
- **Scope:** migration `NNNN_checkout_draft` with `.down.sql` (§5.1 B: the cookie token's SHA-256 only, `order_id UNIQUE` as the idempotency key, money pairs with currency FKs, RLS enabled with one `system` policy, numbered after the chain's last); `src/modules/checkout/draft.ts` (`createDraft`, `loadDraft`, `saveStep`, `expireDrafts`), `pricing.ts` (`draftTotals`, re-quote on expiry); `src/app/api/checkout/start/route.ts` (POST only, Origin-checked, 405, 403, 303 to the PDP with no query string, 303 to `/{locale}/checkout`); `saveRecipientStep`, `saveCardAndBuyerStep`, `updateSelection` in `actions.ts` (`placeOrderAction` is TASK-205's); `src/config/cookies.ts`.
- **Every action** loads the draft by cookie, re-runs `checkoutMode()`, parses its schema, verifies the quote, saves, and answers 303 to the next step or re-renders the step with errors. Nothing personal in a URL; `?step=` is the only query.
- **Quote (spec 005):** `quote()` / `verifyQuote()`, 30 minutes, constant-time digest comparison. Expired and unchanged: reissued silently. Expired and changed: the price-changed notice naming both amounts, placement blocked until confirmed. Tampered: the quote is discarded and the draft restarts at step 1. A posted `expectedTotalMinor` that differs opens step 1 with the notice. Every amount comes from the price provider; nothing here reads `country_price`.
- **Ruling R5:** the mode's database inputs (`checkout.open` for the country, `checkout.demo_guard`) are read through TASK-219's `isEnabled`, and the call sits in `src/modules/checkout/mode.ts` only (AC-1).
- **Cookie `fo_checkout`:** a 256-bit random token; `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`. Logs carry `draft_id`, never the token; the redaction list gains `email`, `sign_as`, `delivery_note`, `token` and `*_snapshot` (§8).
- **Class:** not review-only (`CLAUDE.md` DoD §4): money and the signed quote, a migration, a cookie, and personal data in drafts. `/review` and `/break` both run.

## Read

- `specs/010-checkout.md`: `## 0. Index`; §2 (the entry, the checkout, money); §5.1 B; §5.2 (server actions and the route); §5.4; §8 (consent gating, logs, security); §9 AC-6, AC-10, AC-11, AC-13, AC-17, AC-36; §12 task 4 and "Migration order".
- `specs/005-catalogue-pricing-module.md` (the quote); `docs/tasks/TASK-219.md`.
- `docs/codebase-map.md`; `src/lib/db.ts`, `src/config/cookies.ts`, `src/lib/logger.ts`, `db/migrations/`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-05):** the founder sets `QUOTE_SIGNING_SECRET` per environment on Railway (a secret: founder action) before this runs on staging; say so in the PR.
- **From `/plan-tasks` (2026-10-05):** same backend agent as TASK-200, TASK-205 and TASK-207.
- **From `/break 201` round 3 (2026-10-05, HOLDS on `ae480772`):** residual AC-1 scan evasions to close here: `globalThis.eval`, `(0,eval)`, `constructor.constructor` and `createRequire` slip past the source scan. Plus nits on the text validators: U+2065, U+2060, U+FEFF and the Unicode tag characters (U+E0000 block) are not refused.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-19, AC-36 cookie half needs one new public key (to the founder, through the orchestrator): `open`.** The `fo_checkout` register row needs a purpose key under `consent.cookies.*`, which counts toward `en-gb`'s unreviewed share (zero headroom, work order). Not committed. Proposed: key `consent.cookies.checkout.purpose`, text "Keeps the order you are placing while you go through checkout. Deleted 24 hours after your last step." Once approved, the change is: in `src/config/cookies.ts` replace the `fo_csrf` row by `{ name: "fo_checkout", kind: "cookie", category: "essential", consentRequired: false, party: "first", writer: "server", status: "set", lifetime: { kind: "maxAge", seconds: DAY }, purposeKey: "consent.cookies.checkout.purpose", spec: "010", scope: "Path=/; SameSite=Lax; HttpOnly; Secure" }`, let the schema's "server + set" refusal admit a cookie written only on `no-store` responses (`fo_checkout`), delete `consent.cookies.csrf.purpose` from the catalogues, and regenerate `docs/compliance/cookie-register.md` (`node scripts/cookie-register.ts --write`). Until then the route sets a cookie the register does not list; no page links to the route before TASK-206.
- **2026-10-19, AC-3's start-route half has no URL to answer with (to TASK-204's owner): `open`.** AC-3 says the start route answers 303 to the closed state, but a closed start writes no draft (`checkout_draft.mode` admits only `demo`, `test`, `live`) and `?step=` is the only query, so `/{locale}/checkout` cannot know which country and product were refused. Today a closed start answers 303 to the product page, writes nothing and logs `checkout.closed`. Options: a `closed` draft mode (schema change), or a closed-state path segment. TASK-204 decides.
- **2026-10-19, spec 005's quote cannot verify an add-on line (note, handled here):** `verifyQuote()` re-resolves only bouquet price versions (`cp:`), so a quote with an add-on line (`acp:`) is always `expired`. `verifyDraftQuote()` re-derives on `expired` and keeps the stored quote while it is inside its 30 minutes with identical amounts, so the observable rule is spec 010's. A spec 005 amendment teaching `resolveByPriceVersion` the `acp:` form would remove the re-derivation; not needed for correctness. A free add-on (`card`, 0) is a summary line but not a signed line (`QuoteLineSchema` is positive).

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-19 03:35Z: worktree `../fo-wt-203` on `task/TASK-203-checkout-draft`; row `in_progress`; PG16 for integration on `127.0.0.1:55203` (embedded-postgres, data in the agent's scratch `impl-203/`). Next: the migration `0015_checkout_draft`.
- 2026-10-19 03:45Z: `0015_checkout_draft` + down, Drizzle mirror, `db/rls.ts` `SYSTEM_ONLY_TABLES`, snapshot regenerated; migrate, rollback, migrate on PG16. Draft service, cookie, pricing, start route, step runners and actions committed.
- 2026-10-19 04:05Z: unit + integration tests written and mutation-checked; carry-forwards closed (AC-1 scan evasions, U+2060–U+206F / U+FEFF / tag characters); cheap gates green. Next: PR ready, `ci:full`.
- 2026-10-19 06:05Z: `/review 275` r1 change 1 and `/break 275` r1 holes 1–14 fixed: `verifyDraftQuote` answers `changed` for a quote whose lines are not exactly the draft's product, size and paid add-ons; `draftTotals` gives a 0 line only for a free add-on; `saveStep` is a compare-and-set on the loaded selection, quote digest and last-seen total, so a stale runner writes nothing and reloads the step; only the England, Scotland and Wales tag sequences pass, and U+200B, U+034F, U+115F, U+1160, U+180E, U+3164 are refused among visible text. 12 integration and 7 unit cases added, each mutation-checked red. Hole 15 (placed draft writable, AC-52) is TASK-205's.
- 2026-10-19 06:50Z: `/break 275` r2 hole 16 (ruled blocking): the compare-and-set now compares the quote's digest as stored (`quoteStamp`), so a stored quote that no longer parses falls through to AC-17's restart instead of reloading the step until expiry; integration case "restarts at step 1 when the stored quote no longer parses" (three step-2 posts, two broken-quote shapes), red when the compare reads the parsed quote again. Holes 17 and 18 carried to TASK-205 / TASK-204.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#275](https://github.com/itsahmeds/flowers-overseas/pull/275). Migration `0015_checkout_draft` (+ down): the token's SHA-256 only, `order_id UNIQUE`, two money pairs with currency FKs, RLS with one `system` policy (`db/rls.ts` gains `SYSTEM_ONLY_TABLES`). `src/modules/checkout`: `cookie.ts` (256-bit token, AC-6 attributes), `draft.ts` (`createDraft`, `loadDraft` deleting at expiry, `saveStep` sliding 24 h and refusing a placed draft, `expireDrafts`), `pricing.ts` (`deriveQuote` signing bouquet and add-ons into one spec 005 quote, `verifyDraftQuote` ok / reissued / changed / tampered, `priceChange`, `draftTotals` with VAT by rate), `start.ts` + `src/app/api/checkout/start/route.ts`, `steps.ts` runners + `actions.ts` (`saveRecipientStep`, `saveCardAndBuyerStep`, `updateSelection` incl. `confirmPrice`), `currentCheckoutMode()` in `mode.ts` reading both flags through `isEnabled`. Logger redacts `sign_as`, `delivery_note`, `*_snapshot`. Round 2 (after `/review 275` and `/break 275` r1): the quote is bound to the selection and saves are compare-and-set; unit `checkout-draft-pricing` grew to 15, `checkout-boundary` +5, integration `checkout-draft` to 36. Round 1 tests: unit `checkout-draft-pricing` (9), `checkout-cookie` (7), scan and validator cases added to `checkout-mode` (+9) and `checkout-boundary` (+6); integration `checkout-draft` (24, PG16). 23 mutations watched red (list in the PR). No build or browser run locally (CI's). Handed on: AC-36 cookie row (founder key, Escalations), AC-3 start-route URL (TASK-204), the `retention.sweep` handler calling `expireDrafts` (TASK-207), placement reading `priceChange()` to block (TASK-205).
