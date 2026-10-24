# TASK-397 — Commerce crawl gates: core products only before a country, no money on any country-less page, every priced link through the chooser, no basket, checkout or search form without a country, the same HTML for everyone (bots, cookies, headers), plus the Lighthouse, axe and visual run over the commerce boards

Row: `TASKS.md` → TASK-397. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-397`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- The spec's one gates task (Lighthouse, axe, visual and the honesty sweep run once here): AC-74 (country-less pages hold only `coreRange()` products; the local special only on its country's listings, two-open fixture), AC-75 (no money, currency, inclusive label or equivalents in the header or `<main>` of any country-less page; `noMoney` once; no amount in JSON-LD, meta, OG or sitemaps; AC-53 re-run), AC-76 (every priced target from a country-less page is a chooser path with `rel="nofollow"` and no query string; links naming their country go direct; country-less targets plain), AC-87 (no basket, checkout or add-to-basket form on a country-less page; the header search through the chooser with `next=search` once spec 045 is published), AC-91 (bodies byte-identical across user agents, cookies and geo/language headers; no `Vary`, no `Set-Cookie` on cached routes; the same prebuilt route table as `main`).
- Class: review-only (tests and gates). A defect found in a price or cookie path becomes a new row, not a fix here.

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-24a items 2, 3, "SEO", AC-74 to AC-76, AC-87, AC-91
- `docs/codebase-map.md` (the e2e crawl helpers)
- `docs/codebase-map.md`

## Carry-forwards

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
