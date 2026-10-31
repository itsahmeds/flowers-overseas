# TASK-432 — The product page date e2e tests stop failing every Sunday after 14:00 Warsaw: `product-page.spec.ts` "a closed date says why" (line ~197) and `product-size-card-dates.spec.ts` (line ~346) read the real clock, so on a Sunday afternoon the Sunday they look for is past the cutoff and has another reason; pin the clock the app already honours for tests (or pick the Sunday from the rendered window), so the assertion still names the one Sunday rule

Row: `TASKS.md` → TASK-432. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-432`; keep it current by editing this file, not the row.

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

- **2026-10-31, to the orchestrator: the edit guard refuses every write under `tests/`.** The
  guard reads the **main checkout's** `TASKS.md`, and the TASK-432 row exists only on this branch
  (commit 8c465c85d, PR 444); `origin/main` (fc74ec5d3) has no row, so the task "counts as none".
  Needed: the row on main and the main checkout pulled, then re-dispatch on this branch. `open`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-31 (agent W): **diagnosis.** No server clock seam exists for the product page: the
  route is ISR (`revalidate` 3600) and `productView()` reads `options.now ?? new Date()`
  (`src/modules/catalog/product.ts` ~L1478) with no env or header override, so Playwright's
  `page.clock` cannot reach it. The window is 14 days from today in Warsaw, so it always holds
  **two** Sundays. The tests go red only when **neither** carries `sundayClosed`: today is a
  Sunday rendered after 14:00 (`pastCutoff`, which `reasonFor()` checks first) **and** the next
  Sunday is a closing holiday (`publicHoliday`, also checked first). On 2026-10-25 the next Sunday
  was 2026-11-01, All Saints' Day. Not every Sunday: from `seed/data/holidays.json` the red
  afternoons are 2026-03-29, 04-26, 05-17, 10-25; 2027-03-21, 05-09, 08-08, 12-19; 2028-04-09,
  05-28, 12-17. **2026-11-01 is safe** (its window's other Sunday, 11-08, is no holiday), so the
  next red afternoon is 2027-03-21 13:00 to 23:00 UTC.
- 2026-10-31 (agent W): **fix chosen, not written (guard).** Pick the Sunday from the rendered
  window: a new `tests/support/delivery-sundays.ts` reads each chip's `data-fo-date`, keeps the
  Sundays that are not the window's first date and not a closing PL holiday from
  `seed/data/holidays.json`, and both specs assert the radios named by "We do not deliver on
  Sundays in Poland" are exactly those dates (today's Sunday excepted), each a Sunday and
  disabled; `test.skip` only when the set is empty (the afternoons listed above). Draft of the
  helper and the assertion is in the orchestrator's scratchpad,
  `/private/tmp/claude-501/-Users-ahmed-dev-flowers-overseas/ec0074d2-7713-4d02-8ba5-da1ef28554c3/scratchpad/W-432/delivery-sundays.ts`. Next: once the guard opens, write it, mutate
  `reasonFor()`'s Sunday branch for the red run in CI, revert, self-review, ready, `ci:full`.

### Other e2e that read the real clock against a date rule

- `tests/e2e/product-v3.spec.ts` ~L575 (chip heights, at least 7 chips, no reason inside a chip):
  window-dependent only through which chip has an occasion tag; heights are asserted equal, not
  pinned, so no clock failure is reachable.
- `tests/e2e/listing-v2.spec.ts` ~L48: `isFxRateStaleAt(fxAsOf, new Date())` compares the FX
  rate's age with the test's clock, not a delivery cutoff; it reads the served `fxAsOf` and
  derives its expectation, so it agrees with the page unless the rate crosses its staleness bound
  between the health read and the page load (milliseconds).
- `tests/e2e/dev-components.spec.ts` ~L479 asserts the Sunday rule over fixtures with fixed
  dates: clock-free.
- `tests/visual/product.spec.ts` leaves the grid out of every baseline for this reason: clock-free.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
