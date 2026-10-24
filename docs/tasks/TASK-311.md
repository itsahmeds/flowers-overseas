# TASK-311 — Spec 042 route line (042-6)

Row: `TASKS.md` → TASK-311. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 042 §5.3.6 and §13 Q8 (every default: the corridor page only, the unlabelled "you" dot, the abstract arc, hidden below `md`).
- **AC owned:** AC-19; test T-19. The document is byte-identical with `CF-IPCountry`, `X-Forwarded-For` and `Accept-Language` varied (ADR-0006: no IP personalisation).
- `docs/design/` artboards from PR 297 (spec 042): `system/motion-interactions.dc.html` motion 18, `corridor-country-desktop`, `corridor-country-mobile` (not shown). Match them pixel for pixel.
- Spec 042's shared ACs (AC-1 to AC-6) are TASK-313's; this PR still records its own idea's row of the §5.3.0 byte table in `## Result` (AC-1) and runs AC-3 to AC-6 for its idea. The first idea PR to land creates `tests/unit/interactions-budget.test.ts` and `interactions-css.test.ts`; later ones extend them.
- One build-time boolean per idea in `src/config/interactions.ts` (§12): no runtime flag, no database read on the render path.
- No counted message key is added (AC-5: the `en-gb` unreviewed share is unchanged by the diff).
- **Review class: review-only** under the Light rule (CLAUDE.md DoD 4): SEO markup on an indexable first screen, no money or legal text; the reviewer may call the breaker, and that call binds.

## Read

- `specs/042-premium-interactions.md`: `## 0. Index`, then §5.2, §5.3 for the idea, §9 and §10 for the ACs below, §13
- `docs/codebase-map.md`
- the corridor page head in `src/modules/ui`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** PR 297 escalation 2: the route line is placed at `md` and up, but the gap beside the H1 shrinks to about 85 px at 768; the designer drew it scaled to the gap. Build that; moving the threshold to `lg` would be an AC-19 change and goes back to the orchestrator.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-24, finisher, to the orchestrator: **spec 042 AC-19 contradicts spec 004 AC-45 on the
  guide's first screen.** AC-19 requires exactly one `aria-hidden` route SVG inside the first
  screen of `/en-gb/send-flowers-to/poland` (180 x 120 at 1440, as the artboard draws it). AC-45
  (spec 004 §14, TASK-189's T-50 in `tests/e2e/corridor-first-screen.spec.ts`) forbids any
  `aria-hidden` element at least 48 x 48 px in the guide's first viewport. CI run 40089950907:
  T-50 fails on `/en-gb/send-flowers-to/poland` and `/en/send-flowers-to/germany` at 1440 and
  1280 with `aria-hidden svg`. Neither spec names the other. Options: (a) amend AC-45 to exempt
  spec 042's route line (`[data-fo-route-line]`, decorative, CSS-drawn, out of flow) and its T-50
  probe with it; (b) drop idea 6 from the guide. Not decided here. Answer: `open`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-21 (implementer): worktree `../fo-wt-311` on `task/TASK-311-route-line` from `a1f72bef`; row `in_progress`; draft PR next, then tests (unit markup, shipped CSS, e2e T-19) and the SVG.
- 2026-10-21 (implementer): PR 316 draft. `CorridorRouteLine` + `src/config/interactions.ts` + the `globals.css` section shipped with unit suites `corridor-route-line.test.tsx`, `interactions-css.test.ts`, `interactions-budget.test.ts` (CSS +239 B Brotli, HTML +588 B), e2e `corridor-route-line.spec.ts`, a `first-screen` visual part. Unit mutations red. Next: one local build in the slot to read the geometry, then `visual:baselines`, ready, `ci:full`.
- 2026-10-21 (implementer): local build inside the slot (geometry, e2e mutations), Linux baselines from run 39654760460 committed (3 images), PR ready with `ci:full`, row `in_review`. The orchestrator's MACHINE HEAT order (load 74) replaced `pnpm gates:cheap` with the six gates one by one and the touched unit files at `--maxWorkers=2`.
- 2026-10-24, finisher: rebased on `origin/main`, where TASK-189 (PR 374) replaced the 7fr/4fr hero and its photo slot with `CorridorFirstScreen` (the artboard's 12-column band). The route line moved into that grid (`relative`, last child) and `globals.css` now centres it in the gap between the end of column 6 and the dates (`min(470px, 5 columns)`, `justify-self: end`), as the artboard places it; unit, e2e and visual suites read the first screen. Visual part is now the SVG alone at 1440 (`corridor-country-desktop-route-line`), so the dated cards stay out of a baseline; `laptop-guide` re-rendered (run 40088164103). `gates:cheap`: all green but `url-pii` timing out at load 21; alone 15/15. Shares `src/config/interactions.ts` and the two `interactions-*` suites with PR 339 (TASK-308): rebase after whichever merges first.
- 2026-10-24, finisher: CI run 40089950907 (head `65d57185`): e2e red on two things. (1) At 1280 the SVG filled the whole 128 px gap and touched the H1's column box (AC-19): fixed, the SVG now takes the gap less 15 px each side (1440 unchanged at 180 x 120). (2) T-50 (AC-45) flags the SVG as an `aria-hidden` ornament: a spec conflict, escalated; row `blocked`.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 316. Spec 042 idea 6: `CorridorRouteLine` (one `aria-hidden` SVG, no props), its `globals.css` section and `src/config/interactions.ts` (`routeLine: true`). AC-19 met; this idea's rows of AC-1, AC-3 to AC-6 run.

**AC-1 byte row, idea 6:** JS 0 B (server modules only) · CSS +239 B Brotli (cap 300; Tailwind's compile with and without the section, whitespace-minified, quality 11) · HTML +588 B uncompressed on `/en-gb/send-flowers-to/poland` (cap 1,024; SVG plus `relative` and `data-fo-corridor-hero`).

**Tests:** unit `corridor-route-line.test.tsx` 10, `interactions-css.test.ts` 8 (new, spec 042's shipped-CSS suite), `interactions-budget.test.ts` 4 (new, spec 042's byte table); e2e `corridor-route-line.spec.ts` 11 desktop + 2 mobile (13 passed locally against a build); visual `corridor.spec.ts` `first-screen` part at 1440 and 390, `laptop-guide.png` refreshed. Mutations watched red: unit (aria-hidden removed, a `<text>` added, `mirror-in-rtl` removed, a locale-dependent SVG, `infinite`, raw 450 ms, shown below md, undrawn at rest, draw outside `no-preference`); e2e on the built CSS (`infinite` on the mask, `display: block` at 390).

**Local build (why):** the gap geometry (centring, 74 px, width up to 180 px at 768 to 1440) and the draw could not be judged without a browser; one `pnpm build` + `next start` + this spec only, inside the build slot, load 9 to 30 at the time.

**Visual baselines:** run 39654760460 also re-rendered `laptop-country-shop`, `laptop-country-category` and `ar-XB-language-popup` with no visible change; not this task's pages, left as committed (their manifest entries unchanged; `--verify` and `--check` pass).

**Note for review:** the live hero is the 7fr/4fr grid with the lead photo slot, not the artboard's 12-column hero with dates, so the gap is about 113 px at 1440 (the artboard drew 210); per the carry-forward the SVG takes the gap's width (113 x 75 at 1440, 72 x 48 at 768).

```
gates (MACHINE HEAT order: run one by one, not via gates:cheap) · code of fe72bfc4 (later commits are docs only) · base origin/main · 2026-10-21
typecheck             exit 0
lint                  exit 0
format:check          exit 0
i18n:check            exit 0
check:no-db           exit 0
codebase:map --check  exit 0 (codebase map ok: docs/codebase-map.md is current)
tests                 exit 0 · vitest --maxWorkers=2, 18 files, 987 passed (the diff's own suites, corridor, motion-css, tokens, colour and physical-CSS lint, no-db, codebase-map, design-docs, config registries, url-pii, zod-boundaries, lint-coverage)
```
