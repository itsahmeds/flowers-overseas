# TASK-145 — The honesty sweep scans `body.innerText` and **cannot see `<head>`**. From TASK-112's merge the hubs are the first page type to render the copy corpus's authored `seoTitle`/`seoDescription`, so the `<title>` and meta description became page surface that spec 007 §14 A19's forbidden-claim scan does not reach. `/review 88` scanned all 102 hub heads by hand and found **no breach** — the cutoff mentions are the pointing-not-promising form spec 006 §14 A4 licenses. A gap, not a defect: extend the sweep to `<head>` before a page ships a claim there that nothing checks.

Row: `TASKS.md` → TASK-145. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-145`; keep it current by editing this file, not the row.

## Binding

**Owned: spec 007 AC-19 (T-20), widened to `<head>`; the rule it extends is spec 004 §14 A19.** The row says "spec 007 §14 A19": there is no A19 in spec 007. A19 is **spec 004 §14 A19** (the chrome-promise rule: no same-day, cutoff or ranking promise renders while no destination is live), which TASK-120 built into `tests/e2e/chrome-honesty.spec.ts` and widened after `/review 70`. Spec 007 AC-19 supplies the forbidden set: "No corridor page, hub page or their JSON-LD contains a review, rating, star, testimonial, review count, Trustpilot mark, partner name, partner photo, florist count, delivery-photo claim, or, in guide state, a price, cutoff, delivery date or same-day claim; asserted by a DOM/text assertion over both states in all locales and by the `corridor:check` grep over the source files." Spec 004 §14 A-founder-2026-10-14c's AC-34 (no cutoff text while a country is not open) is the same surface.

- **The gap (`/review 88` S5, 2026-09-22).** The sweep reads `document.body.innerText`, which cannot see `<head>`. Since TASK-112 the hubs render the corpus's authored `seoTitle` and `seoDescription`, so `<title>` and `<meta name="description">` are page surface nothing scans. `/review 88` read all 102 hub heads by hand and found no breach. This task makes the check run so nobody has to read them again.
- **What to scan.** Per page in the sweep's `PAGES` list (and add one product page, `/en/poland/product/<slug>`, which is the third page type with authored head copy): `<title>`, `meta[name=description]`, `og:title`, `og:description`, `twitter:title`, `twitter:description` if emitted (read the real head; scan only what exists), and the `name`/`description` strings inside every JSON-LD block. Use the **same patterns** as the body sweep (`FORBIDDEN_RANKING_TEXT`, `FORBIDDEN_DELIVERY_PROMISE_TEXT` from `tests/support/listing-honesty.ts`) plus spec 007 AC-19's review/rating/star/florist-count shapes from `tests/e2e/honesty.spec.ts`. Do not invent a second pattern list.
- **The control that matters.** The existing suite plants a promise into the served DOM and requires the scan to catch it. Do the same for the head: plant a claim into `<title>` and into the meta description in the live document and require red, in one synchronous `evaluate` that restores the DOM (never leave a removed server node; see the React #418 note in that file). A scan that cannot fail is this project's signature failure.
- **Keep the pointing-not-promising form legal.** Hub descriptions mention a cutoff in the form spec 006 §14 A4 licenses ("pointing, not promising"); `DELIVERY_TIMING_PATTERN` permits it on purpose. A scan that goes red on the committed corpus is wrong, not the corpus. Verify green on the committed tree first.
- **No product change.** If the scan finds a real breach in a head, do not edit copy here: record it as an escalation with file and key, and stop. This task writes tests and test support only.
- **Copy.** None. No message key, no authored text. en-gb's unreviewed share is 4.98% of the 5% line; a task that needs new public copy stops for the founder's batch, and this one must not.
- **Class: keeps the breaker.** It is an SEO-adjacent gate over `<title>`, meta and JSON-LD, and "when in doubt, a PR keeps the breaker". The breaker's job is the mutation list below.
- **Watch red, then restore (name each in `## Result`):** a ranking claim planted in `<title>`; a delivery-timing claim planted in the meta description; an order-by cutoff promise planted in a JSON-LD `description`; the head read replaced by `body.innerText` (control must go red); one page type dropped from `PAGES` (a count assertion must catch it); the patterns import swapped for an empty list.
- **Gates:** `pnpm gates:cheap` with its block pasted; unit files the diff touches; the e2e spec itself is CI's (`ci:full`). No build slot needed unless the head cannot be read from a running server any other way, and then say so.

## Read

- `specs/007-corridor-pages.md`: `## 0. Index`, then §9 AC-19, §10 T-20, §8 (honesty), §14 A1 (what the greps mean). `specs/004-design-system-layout.md` §14 A19 and A-founder-2026-10-14c (AC-34's surface). `specs/006-*.md` §14 A4 (the pointing-not-promising licence).
- Files: `tests/e2e/chrome-honesty.spec.ts` (the sweep, `PAGES`, `sweptText()`, the plant controls), `tests/support/listing-honesty.ts` (the patterns), `tests/unit/chrome-honesty.test.tsx` (the catalogue half), `tests/e2e/honesty.spec.ts` (AC-19's review/rating shapes), `src/modules/seo/metadata.ts` (`pageMetadata()`: what the head actually carries).
- `docs/tasks/TASK-120.md` (the lift and mark design, `data-fo-cutoff`) and `docs/tasks/TASK-112.md` S5.

## Carry-forwards

- **From `/review 88` (2026-09-22), S5:** the sweep cannot see `<head>`; widen it to `<title>` and `<meta name="description">` (this task's reason for existing). All 102 hub heads were clean by hand on that date.
- **From `/review 70` (2026-09-16), via TASK-120:** a sweep scoped to `<main>` passed while the header promised same-day delivery; every honesty scan covers the whole document, and the assertion is an absence, so it is only worth making if a planted control makes it fail.
- **From `/review 135` round 1 (2026-10-03, TASK-127):** read and plant inside one synchronous `evaluate`; removing a server node before hydration is React #418 and re-renders the lifted lines back (the `e2e-mobile` race).
- **From the TASK-242 and TASK-243 brief (2026-10-15):** that feature adds a built-site head scan for em dashes (`tests/e2e/phrase-scan.spec.ts`, beside `relay-scan.spec.ts`) and the head-punctuation check of `i18n:check`. This task scans for *claims*, not punctuation. Do not run beside TASK-242 or TASK-243, and do not share a helper with them unless one of the two has merged; if both want a "read the head" helper, the second to land reuses the first's.
- **Pages now exist that the list lacks:** the product page (`/en/poland/product/<slug>`, TASK-127) is not in `PAGES`; add it.
- **From the site test (2026-10-18, QA-1 and QA-2 on `c8d3b334`; screenshots in `.claude/state/qa-2026-10-18/`):**
  - Q18-08 (P2): the fr and ro guide `seoDescription`s say "what we can honestly offer there today" and "what we can offer in Romania today"; `RELAY_PATTERNS` does not match "offer" and the sweep cannot see `<head>`. TASK-251 asks the founder whether the word is banned; if it is, add it to the head scan this task widens.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
