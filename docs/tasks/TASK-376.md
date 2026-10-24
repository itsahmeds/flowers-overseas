# TASK-376 — Trim the page script back under 128 KiB Brotli after the Next 16.4.2 bump: find the 0.4 KB (plus margin) that Next 16.4 added, restore `CLIENT_JS_BUDGET_BYTES` and the lighthouserc assertions to 131 072 B (product 133 120 B), and add unit cases for the 16.4 flight-format parser in `scripts/client-js-budget.ts` carried forward from TASK-375

Row: `TASKS.md` → TASK-376. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-376`; keep it current by editing this file, not the row.

## Binding

- Spec 004 §14 A-founder-2026-10-23: the 132 096 B (product 134 144 B) script budget is temporary, "headroom for the bump only, never for new features"; this task trims the script back under 131 072 B and restores the original budget (product 133 120 B).
- AC-24 (as amended by §14 A1, A12 and the product-page rule): Brotli `resource-summary:script:size` on all 16 Lighthouse URLs, blocking.
- Carry-forward from TASK-375: unit cases for the Next 16.4 flight-format parser in `scripts/client-js-budget.ts` (the old inline path form, the new `$row` form, and the throw on an unresolvable row).
- No feature is removed to get under; if that is the only way, stop and report the numbers.

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-23, AC-24
- `scripts/client-js-budget.ts`, `lighthouserc.json`, `tests/fixtures/seo/bundle-baseline.json`
- `tests/unit/client-js-budget.test.ts`, `tests/unit/product-script-budget.test.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24: worktree and branch; measuring CI run 39965504535 (16.4.2): 131 428 B on all 16 URLs, 11 scripts.
- 2026-10-24: numbers restored (128 KiB constant, lighthouserc 131 072 / 133 120 B, baseline, unit pins, synthetic chunk 132_000) and the 16.4 parser cases added (542db060).
- 2026-10-24: the trim. Split CI's 16.4.2 chunks by module: `next/dynamic`'s runtime (app-dynamic, loadable, PreloadChunks, BailoutToCSR, async storage) is 1 272 B of the layout loader chunk's 2 331 B Brotli, used only by our four loaders. Loaders moved to `React.lazy` (consent behind `useHydrated()`), and `budget:client-js` now reads lazy candidates from Turbopack's loader stubs less `ON_INPUT_CHUNK_MARKERS` (45b2c75a). No local build: the build needs a seeded Postgres; CI measures.

## Result

PR #363. `next/dynamic` left the four island loaders (motion, language popup, consent sheet, consent settings panel) for `React.lazy`; its runtime was 1 272 B Brotli of the layout loader chunk on every page. Lighthouse script transfer on all 16 URLs: 131 428 B (main, Next 16.4.2) to **130 060 B** (CI run 40014204409), 1 012 B inside the restored **131 072 B** (product 133 120 B). Every temporary number is back: `CLIENT_JS_BUDGET_BYTES = 128 * 1024`, both lighthouserc assertions, the baseline fixture, the unit pins and the 132_000 synthetic chunk; the lighthouserc "Temporary" line is gone. `budget:client-js` now takes lazy candidates from Turbopack's loader stubs less `ON_INPUT_CHUNK_MARKERS` (only `next/dynamic` writes `react-loadable-manifest.json`); on CI's 16.4.2 build it charges `/en` exactly the old set, and the e2e equality check passed on every URL with the new build. Tests: unit +4 parser cases (TASK-375 carry-forward), +4 lazy-candidate cases, +1 deferred-set guard (no `next/dynamic` under `src/`), `use-hydrated.test.tsx` (3), pins updated in `deferred-set`, `locale-gate`, `client-js-budget`, `product-script-budget`. No local build (the build needs a seeded Postgres): CI measured.

Carry-forwards:
- **PR 352 (TASK-279) and PR 357 (TASK-280)** both edit `ConsentBannerLoader.tsx` / `ConsentBannerIsland.tsx`. Whichever merges second rebases onto `React.lazy` (no `next/dynamic`; the deferred-set test fails on it). In 352's no-prompt mode the consent island is fetched only on a click, so its chunk then needs an on-input entry in `ON_INPUT_CHUNK_MARKERS` (conditional on the prompt), or `tests/e2e/client-js-budget.spec.ts` reports it "charged and not fetched".
- The flight payload of 16.4 also dedupes export names into rows (`I[317756,["$2","$1b"],"$28"]`, row `28:"ConsentBannerLoader"`), so the printed "client references" list shows `$28` for some names. Cosmetic (names are printed only); resolve string rows when the parser is next touched.
- CI `audit` is red on main too: zod < 4.6.6, GHSA-mrhx-c7xc-m3w5 (high). Not this task's scope; needs its own bump task.
