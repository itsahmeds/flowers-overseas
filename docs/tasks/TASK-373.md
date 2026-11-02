# TASK-373 — Spec 022a display and policy: the review policy in spec 041's legal machinery, `/{locale}/reviews` (existence, the index threshold, pagination, the star filter), the PDP and corridor blocks, `aggregateRating` on the PDP `Product` node only, footer links, the honesty and schema gates with `[data-fo-reviews]`, `checkout.reviewNotice`, the RoPA rows and the Trustpilot processor entry

Row: `TASKS.md` → TASK-373. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-373`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size L. Merges after: TASK-372, TASK-262, PR 338 (design).
- Spec 022a §2 (display), §5.3, §5.4, §6, §7, §8, §12 order (5) and requests on specs 010 (`checkout.reviewNotice` on the pay step, TASK-262's), 041 (registry, `site-links.ts`). Owns AC-18's page half, AC-23 to AC-28, AC-31, AC-32 and AC-33's records half.
- Review markup only on a PDP `Product` node that spec 009 emits, equal to the visible summary; never on `Organization`, the reviews page, corridors or anything with Trustpilot's numbers. The policy is `noindex` until `lawyerReviewed`. `plan/02` §9 and `plan/07` §7 edits (Q11, approved) are the orchestrator's, not this task's.
- **Built from the merged artboards** of PR 338 (`reviews-page-*`, `product-*`, `corridor-country-*`, `chrome-*`); match them pixel for pixel. If the board you need is missing, stop and escalate; never build a page from the description alone.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** fixtures of 0, 1, 9 and 10 reviews with text; a 21-review fixture with one 1-star; `?page=1` (301) and `?stars=1`; 2 and 3 reviews of a product and of a country; a planted `[data-fo-reviews]` region with zero reviews (red); a JSON-LD crawl over every page type; the pay step in four locales with no checkbox.
- **Founder rulings bind every buyer line** (specs 013, 016, 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Copy: never `reviewed: true` (the founder's act). Keys under `checkout`, `orderConfirmation`, `orderTracking`, `florist`, `admin`, `demo`, `dev`, `email` may be added `reviewed: false`; any other new key text is reported in the PR for the founder's batch (spec 003 §14 A17).
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/022a-order-close-reviews.md` §2, §5.3, §5.4, §6 to §8, AC-23 to AC-28, AC-31 to AC-33
- `specs/041-trust-help-legal-pages.md` (legal machinery, `site-links.ts`); `docs/tasks/TASK-262.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-10-24 (from TASK-368, PR 408): `0029` dropped the public `review_read` but left `0018`\'s `review_build_read` for `app_build`; when the reviews page and blocks are built, grant `app_build` `SELECT` on `public_review` and drop `review_build_read` (and its row in `BUILD_ROLE_FILTERED_TABLES`), so the build reads no private column either.

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
