# TASK-166 — Soften the florist claim in the seed copy: "Every order is made by hand and delivered in person by our florist in the recipient's city." becomes the future tense "Every order will be made by hand and delivered in person by our florist in the recipient's city." in every product, category and occasion description, FO-BQ-001's and FO-BQ-003's search descriptions soften the same way, and the seed snapshot is regenerated

Row: `TASKS.md` → TASK-166. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-166`; keep it current by editing this file, not the row.

## Binding

- **The change (founder, 2026-10-03).** We have no florist yet, and every description ends "Every
  order is made by hand and delivered in person by our florist in the recipient's city." The
  founder chose the future tense, one word longer, so no intro falls under the 60-word floor: **"Every order
  will be made by hand and delivered in person by our florist in the recipient's city."**
- **Where (E1, answered by the orchestrator, 2026-10-03).** The sentence is the
  `catalog.floristSentence` key in `messages/{en,de,pl}.json` (`en-gb` falls back to `en`). Set
  it to the founder's sentence in all three files (`de` and `pl` hold the English text today, as
  machine drafts, and keep it). The `en` key is founder-approved: in `messages/en.meta.json`,
  `reviewed: true`, `reviewedBy: "founder (chat, 2026-10-03: future-tense florist sentence)"`;
  `de`/`pl` meta stay as they are (unreviewed). Then run `pnpm i18n:draft --sync-copy`
  (`seed/README.md:219`, `seed/copy.ts:333`) to re-flow every description's closing sentence in
  `seed/data/copy/**`. Regenerate the snapshot last, after E4's edits and drafts
  (`pnpm seed:diff --write`).
- **E2 (answered).** The future tense adds one word, so the 60-word floor holds; the 90-word
  ceiling must hold too. If `copy/wordCount` fails anywhere, stop and report.
- **E4 (answered by the orchestrator under the founder's future-tense decision, 2026-10-03):
  the same claim in other words.** Edit these two `en` `seoDescription` values exactly, nothing
  else in the rows (`en-gb` has no `seoDescription` override for either, so `en` only):
  - FO-BQ-001: "Eighteen orange roses with eucalyptus, hand-tied by our florist in the
    recipient's city. …" becomes "Eighteen orange roses with eucalyptus, to be hand-tied by our
    florist in the recipient's city. …" (only "hand-tied" → "to be hand-tied"; the rest of the
    value is unchanged).
  - FO-BQ-003: "Made and delivered by our florist in the recipient's city." becomes "Will be made
    and delivered by our florist in the recipient's city." (the rest of the value unchanged).
  - Then `pnpm i18n:draft --locale de` and `pnpm i18n:draft --locale pl`, which refill the
    machine-draft rows from `copy/en/` with the new `sourceHash` (`seed/README.md:211`). Check the
    resulting diff touches only the closing sentences and these two rows' `seoDescription` and
    `sourceHash`; if it touches anything else, stop and report.
  - Leave Sant Jordi's "where we have a florist in the city" alone; it is conditional, so it is
    already true. Leave the related claims listed under E4 below (FO-FN-003, FO-GS-004, FO-BQ-008,
    FO-BQ-036) alone: they are not in this task.
- **Class: full (breaker + reviewer).** The copy feeds the product JSON-LD `description`
  (`src/modules/catalog/product.ts`, `listing.ts`), which is an SEO gate (`CLAUDE.md` DoD §4).
- **E3.** The edit guard needs this task's row on `main`. The orchestrator lands it first.
- **Fixtures.** The three fixtures in `tests/fixtures/seed/_cases/copy/` (`bad-word-count`,
  `bad-duplicate-description`, `bad-delivery-timing`) carry the old sentence. Update each one only
  if its test fails for the sentence rather than for the fault it is built to show, and say which
  in `## Result`.
- **Gates.** `pnpm seed:check`, `pnpm catalogue:check`, `pnpm i18n:check`, and the snapshot
  check, then `pnpm gates:cheap`.

## Read

- `specs/006-seed-catalogue-import-imagery-pipeline.md`: `## 0. Index`, then §2.2 (copy rules).
- `docs/codebase-map.md`: the `seed/` rows.
- `seed/data/copy/en/products.json` (the row shape and its review fields), `seed/schema/` for the
  copy schema, and `seed/check.ts` for the rules that read copy.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-03, E1, to the orchestrator and founder: the sentence is not authored in the rows.**
  `pnpm seed:check` (rule `copy/floristSentence`, `seed/copy.ts:333`) requires every description
  to end with its locale's `catalog.floristSentence` from `messages/{en,de,pl}.json` (`en-gb` falls
  back to `en`). The designed way to reword it is one edit there plus
  `pnpm i18n:draft --sync-copy` (`seed/README.md:219-222`, `seed/copy.ts:14-21`). This task's
  fence forbids `messages/`. Probe in a scratch copy of HEAD: 421 replacements (0 old left), then
  `seed:check` exits 1 with 421 `copy/floristSentence` problems. **Question:** may TASK-166 change
  `catalog.floristSentence` in `messages/en.json`, `de.json` and `pl.json` (with the review fields
  in their `.meta.json`) and run `pnpm i18n:draft --sync-copy`, instead of a hand replacement?
  **Answered (orchestrator, 2026-10-03): yes** — see `## Binding`, Where.
- **2026-10-03, E2, to the founder: 23 `en` intros fall under the 60-word floor.** The new
  sentence is 10 words shorter (17 words to 7). Rule `copy/wordCount` (60-90 words, `plan/10`
  §2.2) then fails on 6 categories (sympathy 56, thank_you 57, apology 58, orchids 59,
  sunflowers 54, gerberas 58) and 17 occasions (anniversary 58, romance 59, get_well 59,
  thank_you 58, just_because 56, valentines 57, womens_day 54, fathers_day 55,
  grandparents_day 50, easter 58, new_year 53, sant_jordi 59, fete_des_grands_meres 52,
  muguet 58, konfirmation 55, student 57, omatag 53). All 84 products stay in the band.
  "Nothing else changes" forbids padding them. **Question:** does the founder write 1-10 more
  words for each of these 23 intros, or approve a longer replacement sentence? **Answered (founder, 2026-10-03):** the future-tense
  sentence (one word longer), so no intro moves under the floor; see `## Binding`.
- **2026-10-03, E3, to the orchestrator: the edit guard is closed here.** The TASK-166 row is only
  on this branch (`c0d02799`), not in the main checkout's `TASKS.md`, so the guard counts the task
  as none and refuses shell writes under `seed/` in this worktree. The row must reach `main`
  (for example with PR 134) before any copy edit can be made. **Answered (orchestrator, 2026-10-03):** the row lands on
  `main` in its own PR before the implementer resumes.
- **2026-10-03, E4, listed as asked and left unchanged: the same claim in other words** (**answered**, 2026-10-03: FO-BQ-001 and FO-BQ-003 soften, the rest stay; see `## Binding`).
  - `seed/data/copy/{en,de,pl}/products.json` FO-BQ-003 `seoDescription`: "Made and delivered by
    our florist in the recipient's city."
  - `seed/data/copy/{en,de,pl}/products.json` FO-BQ-001 `seoDescription`: "Eighteen orange roses
    with eucalyptus, hand-tied by our florist in the recipient's city."
  - `seed/data/copy/en/occasions.json` sant_jordi `descriptionMd` and `seoDescription`: "where we
    have a florist in the city".
  - Related claims of a local florist (not of delivery): FO-FN-003 "our florist will call the
    funeral home to check dimensions"; FO-GS-004 "come from our florist's own shop"; FO-BQ-008
    and FO-BQ-036 "cut locally".
  - The source itself: `messages/{en,de,pl}.json` `catalog.floristSentence`.

- **2026-10-03, E5, to the orchestrator: CI on `1a77d2df` has two reds, both caused by this diff.**
  (a) `test-integration` `tests/integration/sitemap.test.ts` "carries a real <lastmod> … never the
  clock" asserts `lastmod <= today (UTC)`. The en `reviewedAt` is now 2026-10-03, and CI ran at
  22:18 UTC on 2026-10-02, so `/en/send-flowers-to` reads as being in the future. It clears itself
  after 00:00 UTC on 2026-10-03: toggle `ci:full` then. The other fix, `reviewedAt` 2026-10-02,
  would misdate the founder's approval. (b) `visual` `occasion-hub-mobile` (tests/visual/hubs.spec.ts:67)
  is 2567px -> 2591px tall: the extra word wraps one occasion intro onto one more line. The linux
  baseline needs a refresh (`visual:baselines` label, then inspect and commit, per
  `docs/runbooks/visual-baselines.md`). That is outside this task's fence ("other tests").
  **Question:** may TASK-166 commit the refreshed `occasion-hub-mobile` linux baseline?
  **Answered (orchestrator, 2026-10-03):** (a) keep `reviewedAt` 2026-10-03, which matches every
  other record of the founder's 2026-10-03 approvals; change neither the date nor the test; the
  orchestrator re-fires CI after 00:00 UTC. (b) yes: refresh and commit the linux baseline for
  `occasion-hub-mobile` only, through the `visual:baselines` label flow, after checking that the
  only change is the intro wrapping one more line.

- **2026-10-03, E6, to the orchestrator: the baseline run moved 15 linux PNGs, not one.** Run
  37073763032 (`visual:baselines`, head `ef4e7803`). Measured old vs new pixel by pixel; the crops
  were opened and looked at:
  - `occasion-hub-mobile`: 2567 -> 2591 px. Rows 328-365 are the intro rewrapping ("…will be made
    by hand and / delivered…city." onto one more line). Below it, with a 24 px shift, the only
    differences are 6 809 pixels of max channel delta 1 (gradient dithering on the placeholder
    cards from the shift; not visible). Matches the expected change.
  - `category-hub-desktop` (0.149 %), `occasion-hub-desktop` (0.176 %) and `category-hub-mobile`
    (0.162 %, rows 321-334; missed in this first count, found by `/review 136` round 1): the same
    sentence rewraps inside the intro, same height. This diff, but under the `visual` gate (green
    on CI).
  - 11 others (corrected from "12"; the list always held 11 names: `ar-XB`, `en`, `dev-components-desktop`, `error-locale-{desktop,mobile}`,
    `footer-en-{desktop,mobile}`, `home-{en,en-gb}-{desktop,mobile}`): one ~374 px band where the
    footer "Occasions" link now renders in the active-link colour. **Not this diff**: TASK-113
    (#98, `src/config/site-links.ts`) changed it after the linux set was last cut (#95), and no
    refresh followed. Under the gate.
  Per the stop condition ("any other baseline changes"), nothing was committed. **Question:**
  commit `occasion-hub-mobile` alone (the PNG plus its manifest entry: the runbook's `--verify`
  needs the manifest to move with the PNG), or all 15 with the manifest (this PR, or a separate
  refresh)?
  **Answered (orchestrator, 2026-10-03):** commit the baselines this diff causes from run
  37073763032, with their manifest entries; leave the footer-colour baselines (TASK-113, #98) for a
  separate refresh. That came to four after `/review 136` round 1 (`occasion-hub-mobile`,
  `category-hub-desktop`, `occasion-hub-desktop`, `category-hub-mobile`) and 11 footer ones.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-03: probed the replacement in a scratch copy of HEAD; two `seed:check` rules refuse it
  (E1, E2) and the guard is closed (E3). No copy, snapshot or test file changed. Next: answers to
  E1-E3. If E1 is approved, the change is `catalog.floristSentence` in `messages/` plus
  `pnpm i18n:draft --sync-copy`, then `pnpm seed:diff --write`; the three fixtures in
  `tests/fixtures/seed/_cases/copy/` (`bad-word-count`, `bad-duplicate-description`,
  `bad-delivery-timing`) carry the old sentence and must follow it.

- 2026-10-03: E1-E3 answered. Changed `catalog.floristSentence` (en/de/pl) and the en meta review
  fields, ran `--sync-copy`, the two E4 edits, `--locale de`/`pl`, `seed:diff --write`. Two things
  the brief did not foresee, both mechanical (see `## Result`): every row's `sourceHash` moves, and
  the en/en-gb sitemap fixtures' `lastmod` moves. Gates green on `8082a3a1`. Next: review + break.

- 2026-10-03: ready and labelled `ci:full`; CI on `1a77d2df` has 23 jobs green and 2 red (E5). Next:
  re-fire after 00:00 UTC for (a); the orchestrator rules on (b).
- 2026-10-03: E5 answered. Ran the `visual:baselines` flow; 15 PNGs moved, so I stopped (E6) and
  committed no baseline. Next: the orchestrator's ruling on E6.
- 2026-10-03: E6 answered; committed the three baselines, `--verify` green, row `in_review`, CI
  re-fired.
- 2026-10-03: `/review 136` round 1 FAIL (breaker HOLDS): committed `category-hub-mobile` from the
  same run (sha256 `8d47f7c44af5…`), `--verify` green; brief and PR body now say four baselines.

## Result

**Shipped in PR #136** (`fix(copy): soften the florist claim in the seed copy (TASK-166)`).
`catalog.floristSentence` is the founder's future-tense sentence in `messages/{en,de,pl}.json`;
`en.meta.json` records `reviewed: true`, `reviewedBy: "founder (chat, 2026-10-03: future-tense
florist sentence)"`, `reviewedAt: 2026-10-03` and the new `sourceHash`; de/pl meta keep
`machine`/`reviewed: false`, and only their `sourceHash` follows the en value (`i18n:draft`
writes it; `i18n:check` fails a stale one). 421 descriptions re-flowed (139 rows x en/de/pl + 4
en-gb); FO-BQ-001 and FO-BQ-003 `seoDescription` edited exactly as E4 says (en, then drafted to
de/pl). A script compared every copy row with HEAD: 421 rows, 0 differences beyond the closing
sentence, the two `seoDescription`s and `sourceHash`. No new tests (data-only change).

**Beyond the brief (mechanical, flagged for the reviewer):**
1. *Every* row's `sourceHash` moved, not only FO-BQ-001/003's: the hash covers `descriptionMd`
   (`seed/copy.ts` `copySourceHash`), so a new closing sentence changes it on all 139 en rows.
   `--sync-copy` re-flows the text but leaves the en and en-gb hashes stale, which
   `tests/unit/seed-copy.test.ts` refuses ("records a reviewer and a date on every authored
   row", "`en-gb` ships only as differing overrides"). I refreshed the 139 en + 4 en-gb hashes to
   `copySourceHash` (data only). The tool gap in `seed/copy-draft.ts` `syncCopyLocale` is outside
   this fence; suggested follow-up task. de/pl got the new hashes from `--locale de`/`pl`.
2. `tests/fixtures/seo/sitemap/{sitemap,en-*,en-gb-*}.xml`: 22 `lastmod` lines 2026-09-22 ->
   2026-10-03, because `catalogueUpdatedAt()` (`src/modules/i18n/review.ts`) takes the newest
   en `reviewedAt`. Regenerated with `UPDATE_SEO_FIXTURES=1` (the test's own writer); nothing
   else moved.

**Fixtures.** `bad-duplicate-description` updated: it failed on `copy/floristSentence` instead
of `copy/duplicate-description`. `bad-word-count` kept with the old sentence: its test still
fails for its own fault (`copy/wordCount`), so the Binding says leave it; it is the only file the
old-sentence grep finds. `bad-delivery-timing` does not carry the sentence.

**Gates on `8082a3a1`:** `seed:check` 0 (ten families clean), `catalogue:check` 0 (pre-existing
stale-FX note), `i18n:check` 0, `seed:project --check` 0; unit `seed-copy`, `seed-diff`,
`seed-check`, `home-honesty`, `i18n-check`, `i18n-draft`, `sitemap-fixtures` green;
`gates:cheap` PASS (7/7). No build slot used.

**Visual baselines:** four linux PNGs from `visual-baselines` run 37073763032, committed with
their manifest entries: `occasion-hub-mobile` (2567 -> 2591 px, the intro wraps one more line),
`category-hub-desktop`, `occasion-hub-desktop` and `category-hub-mobile` (the same sentence
rewraps, same height; the last one added after `/review 136` round 1). I opened and compared the
4 images, plus crops of the 11 below. `pnpm visual:baselines --verify` passes
("93 committed linux baseline(s) match the manifest byte for byte"). **Left for a separate
refresh:** the 11 footer-colour baselines (`ar-XB`, `en`, `dev-components-desktop`,
`error-locale-{desktop,mobile}`, `footer-en-{desktop,mobile}`, `home-{en,en-gb}-{desktop,mobile}`),
which TASK-113 (#98) moved and which pass the gate.

**Suggested follow-up (not changed here):** `syncCopyLocale` in `seed/copy-draft.ts` should
refresh the en and en-gb `sourceHash` when it re-flows the closing sentence, so a future rewording
is one edit plus one command, without a manual re-hash.

**Broken on purpose:** the en key alone reverted (descriptions left new) -> `seed:check` exit 1,
143 `copy/floristSentence` problems (139 en + 4 en-gb); restored -> clean.
