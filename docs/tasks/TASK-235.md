# TASK-235 — Lighthouse: warm the subresources before the measured runs

Row: `TASKS.md` → TASK-235. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

Keeps the breaker (CI workflow and a `scripts/` gate).

- **Spec 004 §9 AC-24:** the `lighthouse` job blocks (no `continue-on-error`), LCP < 2,000 ms on
  every URL of the set. **§14 A18:** the assertion "is not weakened and the page is not changed";
  the measurement basis is the Brotli origin, **warmed**; a server start-up cost "would decide a
  required check by whichever run happened to be first". **Spec 001 AC-23** re-verified.
- **What is already there:** `.github/workflows/ci.yml` (the `lighthouse` job, about L1845–L1850)
  curls each path of `tests/fixtures/seo/lighthouse-urls.json` once before the run. That warms
  the documents only. The stylesheets, the preloaded fonts and, on `/en-gb`, the home
  photograph's image variant (the LCP element on the photo pages, spec 004 AC-46) are first
  fetched by the first measured run.
- **What failed:** PR 223 (docs only) run 38592098548: "largest-contentful-paint failure …
  expected <=2000 found 2023.42", 14 URLs × 3 runs. `lighthouserc.json` sets no
  `aggregationMethod`, so LHCI uses `optimistic` (the fastest of three, A18), which means all
  three `/en-gb` runs were above 2,000 ms, not just the first. **First establish the cause** from
  that run's per-URL summary and its `lhr-*.json` (LCP element, LCP sub-parts, which resources
  were slow), and write the numbers in `## Result`.
- **The change:** before the measured collect, fetch every audited URL **with its subresources**
  (for example one discarded Lighthouse or headless-browser pass per URL, or the document plus
  every `<link rel="preload|stylesheet">` and the LCP image `srcset` candidate it names), so no
  measured run pays a cold path. The budget, the URL set, `numberOfRuns` and the throttling stay
  as they are. If the cause turns out to be the page and not the warm-up, stop and escalate: A18
  forbids weakening the assertion.
- **TASK-103** (todo, spec 040 AC-27) moves LHCI to `median` over HTTP/2; this warm-up must keep
  working under `median`, where a cold run would count.
- **Gates:** cheap gates (including `tests/unit/ci-workflow.test.ts`, which pins this job); CI
  green with `ci:full` on the head; `/review` and `/break`. Never `gh workflow run` (CLAUDE.md).
  A unit case pins that the warm-up step runs before `lhci autorun` and fetches subresources;
  watched red by deleting the step.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, AC-24, §14 A12, A14, A18
- `specs/001-repo-dev-os-bootstrap.md` — AC-23
- `specs/040-hosting-railway-cloudflare.md` — AC-27 (TASK-103)
- `docs/codebase-map.md`
- `.github/workflows/ci.yml` (`lighthouse` job), `lighthouserc.json`, `scripts/seo/lighthouse-urls.ts`, `scripts/seo/brotli-origin.ts`, `tests/unit/ci-workflow.test.ts`

## Carry-forwards

- **From the founder's work order (2026-10-14):** the `lighthouse` check went red on docs-only
  PRs 222 and 223 (LCP 2,023 ms on `/en-gb`). The orchestrator found the curl warm-up already in
  the job; this task covers what it leaves cold.

## Escalations

- **E1 ruling (founder, 2026-10-15): "go with option a".** The page keeps non-critical chunks
  from finishing before the LCP paint; that is TASK-244 (a spec 004 change), not this PR. This PR
  keeps the warm-up and the evidence. Options b and c are not taken.
- **E1 (implementer, 2026-10-15): the LCP edge is not a cold path, so no warm-up moves it.** The
  binding clause says: "If the cause turns out to be the page and not the warm-up, stop and
  escalate". The evidence is in `## Result` (C1 to C3). In short: the home documents' simulated
  LCP is their simulated FCP plus about 450 ms in every run. That FCP follows the origin's
  per-request quality-11 Brotli encode, which costs the same warm or cold. Taking that cost away
  made LCP worse (6 of 9 runs over 2,000 ms), because the page's async script chunks then finish
  before first paint and Lantern counts them toward the LCP. The margin depends on the page's
  script-versus-paint race and on the measurement basis (A12, A18), and those are decisions
  above an implementer. Options for the orchestrator or founder: (a) the page keeps
  non-critical chunks from finishing before the LCP paint (a spec 004 change); (b) TASK-103's
  basis (median, HTTP/2), knowing that a faster origin alone made the race worse here; (c)
  accept that the margin is thin. This PR delivers the binding warm-up, and with it the evidence
  that was missing: the job had kept no Lighthouse report since `upload-artifact@v4` started
  skipping dot-directories.

## Progress

- 2026-10-15: cause investigated (30 CI runs, 18 local runs; see `## Result`); warm-up script,
  discarded first-URL pass, per-run LCP table and the artifact fix written test-first; cheap
  gates pass; pushed for the CI dry run.
- 2026-10-15: CI run 38641145234 on 9570fde0 failed `test-unit` (`codebase-map.test` size cap:
  the new script's map row took the map from 17,375 B to 17,499 B, over 17,408 B), so `build` and
  `lighthouse` skipped. The warm-up moved into `lighthouse-urls.ts --warm` and the map is back to
  17,375 B. Rebased on `origin/main` (TASKS.md conflict resolved to main plus this row). CI is green on f55552d0 (run
  39072642233, `lighthouse` job success; `## Result` "After").
- 2026-10-15: founder ruled on E1 ("go with option a"); the fix moves to TASK-244. Review r1
  failed on docs only; this brief's `## Result` and the PR body are brought up to date.

## Result

### Cause (what was measured before any change)

**C0. The failed run kept no report.** `actions/upload-artifact@v4` skips dot-directories by
default, so run 38592098548 logged "No files were found with the provided path: .lighthouseci/"
and no `lhr-*.json` exists for it. The evidence below comes from the step logs of 30 `lighthouse`
jobs (2026-10-14, every completed run in the last 80 workflow runs) and from 18 local runs of the
measured profile (`lighthouserc.json` settings, `next start` behind `brotli-origin.ts`, inside the
build slot, at load average 9 to 26, so local numbers show the mechanism and not the margin).

**C1. It is not a cold first run.** Run 38592098548 failed `/en-gb` on all three runs: 2,042,
2,023 and 2,062 ms. The best run was over, and the three runs sit within 40 ms of each other.
Run 38522199662 is the same pattern on `/en-gb/poland/flowers` (2,018, 2,022, 2,017). Main's
run 38602496628 failed five URLs at once (`/en` and the four listing pages), which is a slow
runner, not a cold path. A cold first run does show, but only on the first URL and only twice
in 30 jobs: `/en` read 2,627, then 2,158, then 2,005 (38602496628), and 2,600, then 2,210, then
2,070 (38550156697). Representative-run LCP across the 30 jobs: `/en` 1,680 to 2,627,
`/en-gb` 1,775 to 2,070, `/de` 1,768 to 2,140, `/pl` 1,720 to 1,992, listings 1,467 to 2,270,
send-flowers-to pages 1,401 to 1,786. The home and listing pages sit 50 to 250 ms under the
budget in every run.

**C2. The LCP is the photo, and its number is FCP plus about 450 ms, driven by the proxy's
encode.** Local runs, before (`/en`, `/en-gb`, `/de`, three runs each): the LCP element is
`div.photo > picture > img` (spec 004 AC-46). Simulated LCP 1,819 to 2,227 ms. LCP minus FCP is
450 ms in all nine runs, and FCP follows the origin's server latency as Lighthouse measured it:
85 to 289 ms. That latency comes from `brotli-origin.ts` encoding at quality 11 on **every**
request: 90 ms for the 15 KB stylesheet, 180 ms for a 38 KB chunk, 300 ms for the 63 KB chunk
and 170 ms for the 211 KB `/en` document. The same files come from `next start` in 1 to 4 ms.
The cost is identical on the first request and the hundredth, so warming does not remove it.
The encode also runs on the proxy's one thread, so it moves with the runner's CPU, which is the
run-to-run spread in C1.

**C3. Removing the encode cost made it worse, because the page then loses a race.** As a
prototype (not shipped), the proxy kept its encoded bytes, keyed by content, and was warmed
first. Server latency fell to 24 to 67 ms and FCP to 1,290 to 1,473 ms. LCP went bimodal:
1,634, 1,740 and 1,770 in three runs, and 2,474 to 2,920 in the other six. In the unthrottled
load the async script chunks now finished before the first paint (for example `/de`: chunks
done at 126 to 226 ms, paint at 222 ms). Lantern then counts them as LCP dependencies, with
1.1 to 1.7 s of render delay. In the before state the slow encode held most chunks back until
after the paint (chunks from 340 to 380 ms, paint at 368 to 425 ms), so only the first small
chunk was counted. That is the constant 450 ms. The margin depends on when the page's async
chunks arrive relative to its first paint, under the measurement origin. That makes it the page
and the measurement basis (A12, A18), not the warm-up: escalation E1.

### What this PR changes (and does not)

- `scripts/seo/lighthouse-urls.ts --warm` (not a new script: `docs/codebase-map.md` had 33 B left
  under its 17 KB cap): every audited document and every same-origin subresource
  it names (stylesheets, font and image preloads including `imageSrcSet`, script chunks,
  `<img>`/`<source>` candidates, the icon), each URL once, with `br` and Chrome's `accept`. It
  exits 1 on any non-2xx response or on a document that names nothing. Locally: 14 documents and
  25 distinct subresources in about 9 s.
- One discarded Lighthouse run of the first URL in `$RUNNER_TEMP`, so the cold browser start
  seen in C1 is never a measured run (it matters under TASK-103's `median`).
- The step summary prints every measured run's LCP per URL, and the upload keeps
  `.lighthouseci/` (`include-hidden-files: true`).
- Unchanged: budgets, URL set, `numberOfRuns`, throttling, aggregation, `brotli-origin.ts`, the
  page.

### After (CI dry runs on this branch)

CI run 39072642233 on head f55552d0 (`ci:full`): every job green, including `lighthouse`
(blocking, no `continue-on-error`). The warm-up step fetched 14 documents and 25 distinct
subresources, then one discarded Lighthouse pass of `/en`, then the measured runs. Budgets
measured and met; no assertion fired. LCP of the three measured runs per URL (ms), from the job's
step summary:

| URL | LCP per run (ms) |
|---|---|
| `/en` | 1812 / 2019 / 1990 |
| `/en-gb` | 1884 / 1946 / 1858 |
| `/de` | 1849 / 1877 / 1943 |
| `/pl` | 1964 / 1881 / 1795 |
| `/en/send-flowers-to` | 1577 / 1669 / 1580 |
| `/en-gb/send-flowers-to` | 1596 / 1582 / 1561 |
| `/en/send-flowers-to/poland` | 1517 / 1685 / 1510 |
| `/en-gb/send-flowers-to/poland` | 1582 / 1567 / 1617 |
| `/en/poland/flowers` | 1845 / 1840 / 1778 |
| `/en-gb/poland/flowers` | 1835 / 1778 / 1847 |
| `/en/poland/flowers/roses` | 1792 / 1845 / 1845 |
| `/en-gb/poland/flowers/roses` | 1782 / 1854 / 1780 |
| `/en/occasions/mothers-day` | 1794 / 1798 / 1792 |
| `/en-gb/occasions/mothers-day` | 1829 / 1790 / 1799 |

The reported (optimistic, fastest-of-three) LCP is 1,517 to 1,990 ms. One single run is over
2,000 ms (`/en` run 2, 2,019 ms) and `/en` run 3 reads 1,990, so the home-page margin is thin,
as C2 and C3 predicted. One green run does not close it: the warm-up removes the cold path and
keeps `median` honest, and the script-versus-paint race is TASK-244's.

**Carry-forward to TASK-244 (spec 004):** make the page keep non-critical script chunks from
finishing before the LCP paint (the founder's option a, E1), so the simulated LCP no longer
depends on the origin's encode time. Acceptance: LCP under 2,000 ms on every run of every URL of
`tests/fixtures/seo/lighthouse-urls.json`, not only the fastest of three, and it must hold under
TASK-103's `median` over HTTP/2. The per-run LCP table this PR adds is the measure.

### Gates

- `pnpm gates:cheap`: PASS (typecheck, lint, format:check, i18n:check, check:no-db,
  codebase:map --check, tests). `tests/unit/lighthouse-warmup.test.ts` has 16 cases;
  `tests/unit/ci-workflow.test.ts` gains 5.
- Mutations watched red: deleting the warm-up step fails 3 `ci-workflow` cases; setting
  `include-hidden-files: false` fails 1; skipping the subresource loop fails 3 warm-up cases;
  dropping `accept-encoding` fails 2.
- No expensive gate was run for the gate itself. Lighthouse ran locally inside the build slot
  only to find the cause (C2, C3), because the failed run kept no report.
