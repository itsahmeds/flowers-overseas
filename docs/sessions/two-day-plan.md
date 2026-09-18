# The two-day plan — a complete, indexable website

Written 2026-09-18 at the founder's instruction: everything except payments, in two days.
This file is the operating plan; `TASKS.md` stays the source of truth for status.

## What "done" means here, exactly

**In scope — a visitor can do all of this, and Google can index it:**
choose a locale · read fourteen country guides · browse the all-destinations hub · open a country
shop, a category, an occasion, and the destination-less hubs · sort and page through products ·
open a product page, pick a delivery date and a size, and see a real price · see photographs, not
placeholders · on `flowersoverseas.com`, in Google.

**Out of scope, and it is not close:** taking money. Checkout, payment, order records, florist
routing and the emails around them are Phase 1, have **no spec written at all**, and are not
two days of work. Nothing below pretends otherwise.

**Deliberately deferred, and this is the decision that makes two days possible:** the sixteen
`specs/002` database tasks (TASK-017…TASK-031) and the four blocked on TASK-013 provisioning
(TASK-070, 071, 082, 083). The Phase 0 site reads its catalogue from committed config files and
builds with `DATABASE_URL` unset — `check:no-db` enforces exactly that. Those tables are Phase 1
groundwork. Shipping them now buys the visitor nothing.

That leaves **39 tasks**, not 59.

## Why the last day was slower than it should have been, in numbers

| Measure | Value |
|---|---|
| Median implementer run | 30 min |
| Median reviewer run | 13 min |
| Worst four runs | 346 · 243 · 199 · 196 min |
| 15-minute load average, 8 agents on 8 cores | 32 |
| Browser tests each agent re-ran that CI runs anyway | ~950 |

Two causes, both fixable and both now fixed or being fixed:

1. **Every agent duplicated CI.** Full production build, e2e in four locales, axe, visual baselines
   and Lighthouse — locally, then again on GitHub. Fixed in `CLAUDE.md`'s definition of done: the
   expensive gates are CI's, implementers keep the cheap ones.
2. **Eight agents queued for one build slot.** Two Next builds at once exhaust 16 GB, so the slot is
   serialized; past four or five agents the extra ones only add contention. Fixed by capping
   concurrency, not by adding machines.

## The seven rules that make the next two days fast

1. **CI is the gate of record.** Implementers run types, lint, `i18n:check`, `check:no-db`,
   `codebase:map --check` and the unit files their diff touches. Nothing else locally unless the
   change cannot be judged without it.
2. **Four or five agents, never eight.** Throughput is capped by the build slot and by review, not
   by agent count. The ninth agent makes the first eight slower.
3. **Batch sibling tasks into one agent.** Page types that share a resolver, a view model or a test
   file go to the same agent: 110+111 together, 112+113 together, 115+116 together, 130+131
   together. One context load, one branch, one review, no resolver conflict between siblings.
4. **One gates task per spec, not per task.** Lighthouse, axe, visual and the honesty sweep run once
   in TASK-095, TASK-117 and TASK-132 — not in every page task.
5. **Reviews are scoped.** Round 2 judges the diff since round 1 and reruns only what that diff
   touches. A reviewer that re-reads the spec it already read is burning an hour.
6. **Docs-only review failures are fixed by the orchestrator on the branch**, not by a fresh
   implementer round. Three of today's four review failures were documentation.
7. **Merge on green.** See the ask below — this is the single biggest remaining lever and it is
   not mine to pull.

## Day one — the site becomes real

**Wave A (in flight now):** TASK-080 imagery · TASK-093 schema builders · TASK-094 sitemaps
(PR 84) · TASK-119 locale dialog · TASK-135 container (PR 82) · TASK-016 migration (PR 83).

**Wave B:** TASK-110 + 111 (one agent) · TASK-112 + 113 (one agent) · TASK-114 sort and paging ·
TASK-106 `de`/`pl` slugs **(needs the founder's words)**.

**Wave C:** TASK-115 + 116 (schema and sitemap children) · TASK-117 shop gates · TASK-095 the
spec 007 closing gate · TASK-118 docs close.

**End of day one:** every shop page type exists, photographs render, sitemaps and structured data
are complete, and the honesty sweep is green across four locales.

## Day two — the product page, then Google

**Wave D:** TASK-121 slug plumbing · TASK-123 delivery calendar · TASK-124 operational data ·
TASK-125 `productView()`.

**Wave E:** TASK-126 gallery and picker primitives · TASK-127 the page itself · TASK-128 form and
parameter policy · TASK-129 the date island (the one piece of client JavaScript the site ships).

**Wave F:** TASK-130 + 131 (schema and product sitemap) · TASK-132 gates · TASK-133 docs close.

**Then the flip:** TASK-096. `flowersoverseas.com` is already on Cloudflare nameservers, so this is
a configuration act — point the apex at the app, set `NEXT_PUBLIC_SITE_URL`, and `noindex` lifts
from data. Minutes, not hours, and everything before it exists to make it safe.

**Hosting runs alongside and blocks nothing visible:** TASK-099 · 100 · 101 · 102 · 103 · 104.

## What the founder has to do, or two days does not happen

1. **Merge fast, or let me merge on green.** Eight agents produce pull requests faster than one
   person clicks. The offer: once `/review` passes **and** CI is green, auto-merge. The review is
   still the gate; only the clicking changes hands. Without this, merges are the bottleneck and
   no amount of parallelism helps.
2. **`de`/`pl` category and occasion slugs, plus curation order** (TASK-106). Without them the shop
   ships English-only and two of four locales stay empty.
3. **Say yes to pointing `flowersoverseas.com` at the app.** Without it there is no indexable site,
   only a hidden one.
4. **Unpark TASK-013** only if Phase 1 matters this week. It changes nothing a visitor sees.

## What will go wrong, and the plan for it

- **A structural surprise like the route collision.** One agent found that spec 008's routes could
  not coexist with spec 007's, and the ruling saved four later tasks. Budget one of these per day;
  they are cheapest when an implementer stops and escalates rather than improvising.
- **Reviews failing on documentation.** Three of four did today. The orchestrator fixes those on the
  branch in minutes.
- **Lighthouse numbers collected under load.** They describe the machine. Any performance figure
  arrives with its load average or it is not evidence.
- **Two days may end with the product page unfinished.** It is thirteen tasks and the most intricate
  work left. If something slips, it is Wave E — and the site is still complete, indexed and
  browsable without it, because the shop pages stand on their own.
