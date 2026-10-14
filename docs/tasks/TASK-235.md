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

## Result

_Pending._
