# TASK-395 — Not delivering yet and the waitlist: migration `NNNN_commerce_structure` + down (`waitlist_signup`, `country.sort_weight`, `product.core_rank`), the not-live page, the opt-in form (unticked), double opt-in emails through Resend, the 7-day and retention sweeps, the rate limit, the RoPA row and the privacy link

Row: `TASKS.md` → TASK-395. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-395`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- **One migration** `NNNN_commerce_structure` with its `.down.sql` (next free number at implementation, after TASK-293's and TASK-294's): `waitlist_signup` (id, email, country_iso2 FK, locale, consent_text_hash, created_at, confirmed_at, notified_at, unsubscribed_at; unique on (lower(email), country_iso2) where not unsubscribed), `country.sort_weight int NOT NULL DEFAULT 0` if absent, `product.core_rank smallint NULL` with `CHECK (1..20)` unique where not null. Up, down, up on a throwaway PG16 (never `.env.local`).
- The not-live page (AC-85): 200, `noindex`, `destination.notLive.line`, the waitlist form, the chooser's form again, no card, no amount; a published guide linked. TASK-385's non-shop branch points here.
- The waitlist (AC-86): POST server action, one unticked consent box with `waitlist.consent` and the privacy link, double opt-in (Q-24j) with a token link (no email in any URL), Resend through the existing mailer (`email.waitlist.*` keys may be `reviewed: false`), unconfirmed rows deleted after 7 days, retention sweep (30 days after `notified_at` or 24 months after `confirmed_at`) as pg-boss jobs, spec 045 §2.8's per-IP rate limit (the eleventh in a minute refused), logs with row id and country only, RoPA row (consent, Resend). The admin-count clause is TASK-396's.
- Class: keeps the breaker (migration, consent, personal data).

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-24a item 3 (the not-live page and the waitlist), "Data model", "Compliance", AC-85, AC-86
- `docs/design/wireframes/destination-not-live-*`
- `docs/compliance/` (RoPA)
- `docs/codebase-map.md`

## Carry-forwards

- **From `/plan-tasks` (orchestrator, 2026-10-24), keyless strings:** the boards mark several strings `[slot]` with no message key. Do not invent a key or text: list each one this PR needs, with a proposed key and text, in the PR and here as an escalation for the founder's copy batch.
- From TASK-070 (PR 324, 2026-10-25): `src/modules/catalog/db/catalogue.ts` reads `coreRank` from the static provider by SKU because `product.core_rank` does not exist yet. When this task's migration adds the column, select it in `productRows`, backfill it from `products.data.ts`, drop the repository overlay, and keep `tests/integration/catalog-db-providers.test.ts` (AC-27 parity) green.

## Escalations

- **2026-10-24, the privacy link** (design PR 372 → orchestrator; `open`): the waitlist's consent text links the privacy notice, which must be published (spec 041's legal set) before this form goes live. If it is not, keep the form off and say so.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
