# TASK-284 — Popular choices on the phone as one sideways row

Row: `TASKS.md` → TASK-284. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 004 §14 A-founder-2026-10-19c: "item 5 redraws `home-mobile` only, and AC-49 already binds a scroller wherever one
renders" (founder "all A", 2026-10-19; README "Answered" row 5, option A: "One row that scrolls sideways").

- Below `md`, the home's Popular choices (`TrendingRow`) is one row that scrolls sideways: no blank half row.
- **AC-49 re-verified on the home:** computed `overflow-x` auto or scroll; the last card reachable by touch and keyboard;
  `tabindex="0"` and an accessible name if no focusable child (cards are links, so none needed); `scrollWidth` equals
  the viewport; axe has no `scrollable-region-focusable`. A visual baseline at 390 × 844.
- Keep motion 6 on the cards (TASK-277) and the priority card's no-motion rule; nothing on the LCP element moves.
- **Review class: review-only** (layout).
- **Copy headroom is zero** (`en-gb` unreviewed share 4.98% of spec 003 A17's 5%). Add no counted message key: reuse a reviewed key with the identical wording, or stop and report the key and its proposed text. Never set `reviewed: true`.
- **Spec 043 (site clarity)** is being drafted now on branch `docs/spec-043-site-clarity`. It may later change the header, the listing chips and the cards. Build to today's approved clauses; do not anticipate 043, and do not edit its draft.

## Read

- `docs/design/wireframes/home-mobile.dc.html` (after TASK-278)
- `specs/004-design-system-layout.md` AC-49
- `src/modules/ui/home/TrendingRow.tsx`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** after TASK-278 and TASK-277 (PR 285 edits `TrendingRow`).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-20: tests first (unit layout + tab-stop + 19 px name, `sizes` 44vw − 17.6px, e2e 360/390 geometry with swipe and Tab, a11y axe at 390), then `TrendingRow` as the drawn `.scroll5` row and the `trending` slot's `sizes`. Next: cheap gates, PR, CI, Linux baselines.
- 2026-10-20: PR 300; cheap gates green; Linux baselines from run 39465832283 (21 images looked at, each explained by the shorter row), committed with the manifest. Next: ready, `ci:full`, CI on head.
- 2026-10-20: CI e2e red at 360 only: the consent banner lay over the row's centre, so the wheel scrolled the banner (CI failure screenshot). The swipe now pans at a point `elementFromPoint` says is the row. The cases ran green locally inside the build slot (load 2.4). Next: CI on the new head.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR https://github.com/itsahmeds/flowers-overseas/pull/300. Below `md`, `TrendingRow` is the drawn `.scroll5` row: 44 % cards, 14 px gap, the 20 px gutter bleed and padding, `overflow-x: auto` with mandatory snap, scrollbar hidden. An 8 px block padding is taken back by an equal negative margin, so a card's 4 px hover lift and its focus ring are not clipped. Names are 19 px. The list is named by the section heading and takes `tabindex="0"` only when no card links. From `md` it is unchanged. The `trending` slot's `sizes` phone term is now `calc(44vw - 17.6px)` (154 px at 390). No message key was added. Motion 6 is unchanged, and no card is the LCP image.

Tests:
- unit: `home-round2` (2 cases: layout and 19 px names; tab stop when unlinked), `ui-media` and `ui-home-gated` (sizes). Watched red under 5 mutations: tabindex never, tabindex always, `overflow-x-auto` removed, `snap-start` removed, name size reverted.
- e2e: `home-round2`, 3 cases. At 360 and 390 it checks computed `overflow-x`, one card tall, card width = sizes, the first card on the gutter, the last card reached by sideways wheel and by Tab, and page `scrollWidth` = viewport. At 1440 it checks five across.
- a11y: `home` at 390. axe on the section finds no violation, and `scrollable-region-focusable` is among the passes.
- visual: 21 Linux baselines from run 39465832283.

One expensive gate ran locally: the three new e2e cases, inside the build slot at load 2.4, to check the 360 swipe fix before another CI round. Everything else is CI's.

```
gates:cheap · e9c36b5e48215eedd5bbcd0b69efdd0cb55befc3 · tree clean · base origin/main · 2026-10-20T17:07:31.955Z
typecheck             exit 0 · 2.3 s
lint                  exit 0 · 21.2 s
format:check          exit 0 · 12.5 s
i18n:check            exit 0 · 0.9 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 46.7 s · changed 116 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts /src/modules/content/corpus.generated.ts
RESULT: PASS
```

Observation for a later task, not in scope: the artboard draws an "Example arrangement" note under each Popular card; the shipped row had none before this change and still has none.
