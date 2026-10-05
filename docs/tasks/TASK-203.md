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
