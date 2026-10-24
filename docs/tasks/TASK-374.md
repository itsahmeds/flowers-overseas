# TASK-374 — Seed copy: drop the withdrawn freshness claim ("carnations often last two weeks in water", "alstroemeria often lasts two weeks") from the English descriptions of FO-BQ-038 (Old Town) and FO-AR-014 (Linen Basket), `sourceHash` and the seed snapshot regenerated, `reviewed: false` kept

Row: `TASKS.md` → TASK-374. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-374`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size S. Merges after: —.
- Spec 009 §14 A11 and the decisions log of 2026-10-04 ("No N-day freshness promise anywhere"; the founder: "flowers arrive fresh, can't promise staying fresh"). Two English rows in `seed/data/copy/en/products.json` still say how long the flowers last: FO-BQ-038 "carnations often last two weeks in water" and FO-AR-014 "alstroemeria often lasts two weeks". Remove the duration clause only; keep the rest of each sentence true and grammatical.
- The `de` and `pl` rows of the same keys still echo English in `main`; give them the same corrected text. If TASK-185 (PR 328) has merged its drafts first, remove the claim from the drafted sentences instead. Regenerate `seed/snapshot/product_translation.json` and the `sourceHash` values with the repository's own scripts.
- "Long-lasting" in the same rows and SEO descriptions names no duration; leave it unless the founder says otherwise, and say so in the PR.
- Product copy renders on indexable PDPs, so it counts toward the reviewed share (spec 003 §14 A17): the rows stay `reviewed: false`; list the two new sentences in the PR for the founder's approval batch.
- **Class:** self-review (no checker agents; founder 2026-10-22). By DoD §4 this row would be review-only (copy in seed data); you still put `## Self-review` in the PR before `gh pr ready`.
- **Checks you run yourself:** a scan of every copy locale and the snapshot for `two weeks`, `week`, `days in` (zero hits in product text); `pnpm i18n:check`, `catalogue:check`, the seed parity check; no em dash.

## Read

- `specs/009-product-page-date-picker.md` §14 A11; `specs/006-seed-catalogue-import-imagery-pipeline.md` (copy rows, `sourceHash`)
- `seed/data/copy/{en,de,pl}/products.json`, `seed/snapshot/product_translation.json`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-10-24 (self-review, TASK-374): **old stem counts in the seed copy.** After TASK-240 every
  offered stem count is odd and never 13 (11/15/21, 5/9/15, 5/7/9), but the English product
  descriptions and SEO descriptions still say "Eighteen stems as standard, with twelve and
  twenty-four sizes", "Nine stems ... five and thirteen", "Twenty-five ... fifteen and
  thirty-five" and so on, in every product with a stem tier (the `de`/`pl` rows echo or translate
  them). Outside this task's clause (freshness only) and a rewrite of about forty rows in four
  locales: it needs its own task row, and the rows go to the founder's copy batch.
- 2026-10-24 (self-review, TASK-374): **plant flowering spans.** Plant and plant-hub copy still
  names how long a plant flowers or lives: FO-PT-008 (azalea) "flowers for two or three weeks
  indoors in a cool spot" (description and SEO description), FO-PT-001 (white orchid) "flowers for
  weeks rather than days" and SEO "Flowers for weeks", the `orchids` category ("They flower for
  weeks"; SEO "Flowering for weeks") and the `plant` category ("last months or years instead of
  days"; SEO "Living plants that last months"). None is a cut-flower freshness claim and none
  matches A11's scan (no freshness word beside the span), so this task leaves them; whether the
  "no number of days" rule reaches a living plant's flowering is the founder's call.
- 2026-10-24 (self-review, TASK-374): **coordination with TASK-185 (PR 328).** PR 328's `de`/`pl`
  drafts of FO-BQ-038 and FO-AR-014 already carry no number of days, but they store the old
  English `sourceHash` (`a9c05e65…`, `49074756…`). Whichever PR merges second sets those two rows'
  `sourceHash` to the new English hashes (`faf89d95…`, `c981ca19…`), drops the drafts' leftover
  "lange schön zu bleiben" / "długo cieszą oko" clause from FO-AR-014 to match the new English,
  and re-runs `pnpm seed:diff --write`.
- 2026-10-24 (self-review, TASK-374): "long-lasting" stays in FO-BQ-038 and FO-AR-014 (description
  and SEO description) as the brief says: it names no duration. The archived prototypes under
  `docs/design/directions/` still embed the old descriptions; they are not rendered and were not
  touched.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24: row `in_progress`; scan test added red (seed copy, snapshot and message readers);
  the two English clauses removed, `en` rows rehashed, `de`/`pl` re-drafted with `i18n:draft`,
  snapshot re-written with `seed:diff --write`; tests green; three mutations red; gates:cheap PASS.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

FO-BQ-038 (Old Town) now reads "A long-lasting, unfussy bouquet for a birthday, a name day or a
Sunday visit." and FO-AR-014 (Linen Basket) "Sent for a new baby, a get-well or a birthday."; the
duration clauses are gone, the rest of each description is unchanged (67 words each, inside the
60 to 90 band), both rows stay `reviewed: false` for the founder's copy batch. `en` `sourceHash`
recomputed with `copySourceHash` (`faf89d95…`, `c981ca19…`), the `de`/`pl` machine rows of the two
keys re-drafted by `pnpm i18n:draft --locale de|pl` (2 drafted, 82 up to date each), and
`seed/snapshot/product_translation.json` re-written by `pnpm seed:diff --write` (six rows). Unit:
`tests/unit/freshness-claim.test.ts` gains five cases (31 in the file) that run spec 009 A11's
freshness scan over every seed copy row (four locales, three entities), every seed snapshot value
and every message catalogue under `messages/` (including `admin/en.json`), with a reader
positive control and a case that puts each withdrawn sentence (en, de, pl) back into the real
copy and expects exactly one hit. Mutations seen red: the carnation clause back in
`en/products.json`, the alstroemeria clause back in the snapshot, a Polish two-week claim in
`messages/pl.json`. No local build, browser or Lighthouse run.
