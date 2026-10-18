# TASK-248 — Text fits between 768 and 1279 px: the header pills, the occasion page note, and a gate

Row: `TASKS.md` → TASK-248. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

**Blocked: no approved clause covers this band.** Spec 004 §13 Q18 ("Does text fit between 768
and 1279 px?") is open: "No AC checks this band". Its default is "a gate in the AC-41 page set at
768 and 1024 that fails when any text node's box overflows its container or the page scrolls
sideways". Unblock by: the founder rules on Q18, a spec writer records the ruling as a spec 004
§14 amendment with AC and T ids, and the orchestrator then fills this brief's Binding with them.
Until then no agent builds it (`CLAUDE.md`: no application code without a spec).

What the fix must cover once unblocked (QA 2026-10-18, QA-1 and QA-2 on `c8d3b334`, screenshots in
`.claude/state/qa-2026-10-18/`):

- **Q18-05 (P2), every page, 768 and 820.** The second header row of nav pills runs off the right
  edge: "Destinat" is cut mid-word with no scroll hint (fits at 1024). `QA-1-N03.png`, `QA-1-N13.png`.
  AC-49's `scrollWidth` clause holds today; the row clips inside its own box.
- **Q18-04 (P1), country occasion pages, 768** (for example `/en-gb/poland/occasions/mothers-day`).
  The "P.S. Ordering opens soon. Every price here is the price you will pay..." note is a 58 px
  column, 12 lines tall, beside the date card. `QA-1-N13.png`.
- **Q18-02 and N-02 (P1), every shop and category listing, 768 and 820** (about 1,000 of 1,100
  listing URLs). "84 bouquets · page 1 of 7" is a 50 to 63 px column, one word per line, beside "Our
  order is the order we chose ourselves...". `QA-1-N01.png`, `QA-2-shop-820.png`. **TASK-241 rebuilds
  this toolbar row** and carries a 768 and 820 case; this task's gate must hold it as well.
- **Q18-03 (P1), category hubs, 1024.** "We can make 40 of them there." is a 9 px column beside
  "See them with prices for France". `QA-1-N12.png`. **TASK-188 R4 rebuilds these rows** and carries
  the case; this task's gate must hold it as well.
- **The gate.** Whatever Q18's ruling says, the gate runs over the AC-41 page set at 768, 820 and
  1024 in `en`, `en-gb`, `de`, `pl`, and fails on a text node whose box is narrower than one word
  per line (a column under 12 characters wide that holds more than one word) or that overflows its
  container.
- **Copy.** None. No new public copy; `en-gb` sits at 4.98% of the 5% line. A fix that needs a
  new string stops for the founder's batch.
- **Review class.** Presentation (CSS and its tests) is review-only; the PR keeps the breaker if the
  gate lands as a `scripts/` gate or a CI workflow change (`CLAUDE.md` DoD §4). The reviewer
  confirms the class against the diff.
- **Tests.** One regression test per bug id above, each red on `c8d3b334`'s CSS: assert the
  measured box, not the set of boxes.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §13 Q18, AC-41, AC-45, AC-49
- `docs/codebase-map.md` — the header, `ListingToolbar`, `OccasionHub` and country occasion page
- `.claude/state/qa-2026-10-18/QA-1.md` and `QA-2.md` (Q18-02 to Q18-05, N-02)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-18):** dispatch only after TASK-241 and TASK-188 merge, so the
  toolbar and the hub rows are not built twice; sibling of the same listing components, so one
  agent.

## Escalations

- 2026-10-18: Q18 is a founder ruling (spec 004 §13). Asked via the PR body of the planning PR.
  Answer: `open`.

## Progress

_Not started._

## Result

_Pending._
