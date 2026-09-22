# TASK-139 — Linux visual baselines: the visual suite has **84 `darwin` baselines and 3 `linux`**, because until TASK-137 the `visual` job had never run on a CI runner — so 81 specs have no Linux reference at all and the job cannot pass. Establish the `linux/` set (the run-35611605977 artifact already holds the screenshots they would be made from), keep `darwin` as the local-development set, and decide and document which platform is authoritative when they disagree. Three specs (`country-shop` desktop/mobile, `listing` desktop) are additionally red on `darwin` at `origin/main` after `707aeaa` changed the shop root's imagery.

Row: `TASKS.md` → TASK-139. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-139`; keep it current by editing this file, not the row.

## Binding

**The state, counted.** `tests/visual/__screenshots__/visual/darwin` holds **84** baselines;
`.../visual/linux` holds **3**. `pseudo-rtl` holds one each. Until TASK-137 landed, the `visual`
job had never executed on a CI runner in this project's history, so the Linux set was never
built. PR 90's `visual` job is red for that reason and no other: 42 specs have no Linux baseline,
3 mismatch the stale ones.

**What to produce.** The `linux/` baseline set, so `visual` can pass on CI and start protecting
against regressions. Run 35611605977's `visual` job published a 104 MB artifact containing the
screenshots those baselines would be made from; using it is legitimate and cheaper than
regenerating, but see the review rule below.

**Three decisions to make and write down, not to leave implicit:**

1. **Which platform is authoritative when the two disagree?** CI runs Linux and is the gate of
   record for anything timing-sensitive, so the honest answer is probably Linux, with `darwin`
   kept as the local-development convenience. Whatever you choose, say it in
   `docs/runbooks/` and make the test configuration express it.
2. **What happens when a UI change lands?** Today a developer on a Mac can only regenerate
   `darwin`, so the Linux set goes stale silently and the next PR pays for it. Give the project a
   documented way to refresh Linux baselines — a `workflow_dispatch` input, a label, a committed
   script — and say how a reviewer can tell a legitimately-updated baseline from an accidental
   one.
3. **The 0.1 % threshold.** Confirm it is still right across platforms, or propose a different
   one with the measured cross-platform delta beside it. Do not widen it silently to make red
   go green; an inflated threshold is a gate that has stopped working.

**The review rule, and it is the whole risk of this task.** A baseline is a *pinned picture of
what the product looks like*. Committing one you have not looked at pins whatever was on screen,
including a bug, and every future run then defends that bug. **Look at every image you commit.**
If an image shows something that seems wrong, stop and escalate rather than pinning it — that is
a finding for the task that owns the page, not a baseline to accept.

**Three specs are additionally red on `darwin` at `origin/main`**: `country-shop` desktop and
mobile, and `listing` desktop. Cause is known — `707aeaa` (TASK-080) changed `seed/data/media.json`
so the shop root renders real photographs, regenerated the nine `listing-*` baselines, and said in
its own commit message that it deliberately left the shop route's baselines alone because they
were under an in-review PR. TASK-112's PR 88 has since regenerated the two `country-shop-*` ones.
**Check whether PR 88 has merged before you touch those three**, and do not duplicate its work.

**Do not chase these; they are not yours.** Two `e2e` cases fail on macOS only, from the
case-insensitive filesystem, and pass on CI.

**The three decisions, made and written down** (`docs/runbooks/visual-baselines.md` §1):

1. **`linux` is authoritative; `darwin` is a local convenience.** CI renders on `ubuntu-latest`
   and is the gate of record, and `linux` is the only set the `visual` job ever compares against.
   The configuration says so rather than a comment: `pnpm visual:baselines --check` fails when a
   baseline exists for `darwin` and not for `linux`, and runs in the `lint` job (cheapest, reads
   committed files only). The reverse is reported, not failed — `darwin` may lag. Consequence a
   developer needs: **a `darwin`-only mismatch is not a failing gate.**
2. **A UI change refreshes Linux through a workflow, not by hand.**
   `.github/workflows/visual-baselines.yml` renders on the same runner and the same
   `.env.example` build the browser jobs use, on `workflow_dispatch` or the **`visual:baselines`
   label**. It commits nothing; it publishes the PNGs plus a sha256 manifest and the Playwright
   report. A reviewer tells a legitimate refresh from an accident with
   `pnpm visual:baselines --verify <manifest>` — bytes not produced by a named run cannot be
   reproduced and are not trusted — plus the workflow's step summary change list, a stated reason
   per moved baseline, and the author's count of images looked at (runbook §4).
3. **The 0.1 % threshold stays** (`maxDiffPixelRatio: 0.001`). Measured, not asserted: run-to-run
   on Linux is **0.000 % across all 92 baselines** over two runs two commits apart (byte-identical
   files); `darwin` vs `linux` on the same commit is **0.23 % – 47.7 %, median ~9 %**, and 27 of
   the 91 shared pages differ in *geometry* (`country-shop-mobile` by 181 px) because the host's
   font stack changes line-breaking. No single threshold straddles that; per-platform baselines
   are what keep it tight.

## Read

- `specs/001-project-setup.md` — `## 0. Index`, then §2 "Testing harness" (AC-17 / T-18) and §14
  A14 (Actions-minutes budget)
- `docs/runbooks/visual-baselines.md` — the three decisions above, in operational form
- `playwright.config.ts` · `scripts/visual/baselines.ts` · `.github/workflows/visual-baselines.yml`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

- **From `/review 1` (2026-09-22): FAIL, on one thing the Linux set itself does not touch.** The
  93 `linux` baselines are sound and independently verified (every sha256 matches run 35700989506's
  manifest, downloaded and re-hashed by the reviewer, not read from the PR's own output; the
  `visual` job is green on the current head; only `not-found-*` shows a 404 document). What is not
  done is the defect this task was told to absorb (`TASKS.md` decision log, 2026-09-22, TASK-112
  post-merge review, finding S2). Three changes:
  1. **The two `darwin` `country-shop` baselines on `main` are still the stale ones, and this PR
     asserts the opposite.** Verified by pixels, not bytes: the committed `linux`
     `country-shop-{desktop,mobile}` carry TASK-111's third table column (`PAGE` / "What we make
     for it" on the Mother's Day row); the committed `darwin` pair has only `OCCASION | DATE`.
     `darwin/country-shop-mobile` is 390×5578 against `linux`'s 390×5759. Either regenerate the two
     `darwin` files from a build of current `main` (runbook §3; expect 390×5739 for the mobile one)
     or delete them — `--check` permits `linux`-only, and no picture is better than a wrong one.
     Do not leave them as they are.
  2. **`docs/runbooks/visual-baselines.md` §1.3 measures the cross-platform delta against that
     stale file.** "`country-shop-mobile` by 181 px" is ~161 px of missing content plus ~20 px of
     platform, so the runbook's own worked example is wrong and the "27 of the 91 pages differ in
     geometry" count is measured against a set containing a known-stale member. Re-measure or
     exclude the stale pair and say so. The 0.1 % conclusion is not in question; the evidence for
     it is.
  3. **`TASKS.md` row 157 is still `in_progress` with no PR link.** Move it to `in_review` with
     PR #95, inside the 400-character cell cap.
  Nits, not blocking: the manifest that is the reviewer's only provenance proof expires with the
  artifact in 14 days — consider committing `visual-baselines-manifest.json` beside the PNGs;
  `parseManifest()` accepts `files: null` and non-string hashes (structural check plus an `as`
  cast, not zod) and would throw rather than report; the footer's `+1 (213) 592-5150` is a US
  number on every European page and is visible in ~20 committed baselines — same class as the
  three observations already escalated, so add it there rather than pinning it silently.

- **From `/review 95` round 2 (2026-09-22): PASS at `55434e6`.** Nothing is required before merge.
  All of this was verified by the reviewer: 93 of 93 committed `linux` PNGs re-hashed against the
  downloaded artifact of run 35711495539 (0 altered, 0 uncommitted); the committed manifest is
  byte-identical to the artifact's; the two regenerated `country-shop` files were read in the
  pixels; the `darwin/dev-components-desktop` refresh is a real fix (the old file pinned unloaded
  lazy images, and the new one agrees with the CI-rendered `linux` set); Playwright's own
  comparator goes red on the round-1 stale pair; the merge onto `d1c0537` differs from the tree CI
  tested in 3 docs files only. Nits for a follow-up, not blocking:
  1. `tests/visual/notices.spec.ts` L72–73 says `loadLazyImages()` "does not change what is
     photographed … the `darwin` baseline … still matches". It does change it (ratio 0.10 against
     the old baseline). Correct the comment.
  2. This brief's `## Binding` decision 3 still quotes round 1's "0.23 % – 47.7 %", "27 of the
     91" and "181 px". Align it with runbook §1.3.
  3. For spec 001 §2's owner: at `maxDiffPixelRatio: 0.001`, the `country-shop-desktop` budget is
     about 4 803 px. Erasing the pagination control (1 437 px), the Sort form (1 401 px) or the
     Mother's Day "What we make for it" link (847 px) in place, with no reflow, stays green. The
     measured noise is zero, so this points toward tightening the threshold or adding
     element-level shots of AC-bearing controls, never toward widening it.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-09-22 — `main` is red on two gates that are nobody's task, and both fail this PR's CI.**
  Raised to the orchestrator in PR 95's body. (a) **`lint` / `format:check`**: `prettier --check`
  rejects `src/modules/catalog/listing.ts` on `origin/main` itself, from `2f8bcbf` (TASK-112, PR
  88) — and because `typecheck`, the unit suites, `build` and `container` all sit behind `lint`,
  every pull request loses them. One stray blank line. (b) **`e2e`**:
  `tests/e2e/country-occasion.spec.ts:41` asserts `/en/occasions/mothers-day` **404s**, and its
  own comment says "the occasion hub … are TASK-112/113's URLs, not this depth's" — TASK-112 has
  since published that URL, so the assertion is stale and 2 cases fail on `main`. Deciding whether
  the hub should 200 or the list should shrink is spec 008's call and TASK-110/111/112's scope,
  **not this task's**; left untouched and escalated. Nothing about either touches the baselines:
  the `visual` job was green on both runs while they were red. **Both are fixed on `main` by
  `7c49028` ("unbreak main"), pushed while this PR was in its fix round**; this branch is rebased
  onto it and its own one-line formatting repair was dropped as already upstream.

_No baseline was withheld._ Three things seen while reviewing the 93 images are **not** defects this task
may fix and **not** reasons to withhold a baseline — each is identical on the `darwin` baseline
`main` already pins, so the Linux set pins nothing new. They are recorded here and in the PR body
so the owning task decides:

- **2026-09-22 — `/dev/components`, `MediaAsset · priority`.** The example renders a broken
  `<img>` (the browser draws its alt text, "a florist's bench in morning light, stems and shears
  laid out"): the asset id behind that state has no committed derivative. Dev-only, `noindex`,
  and the gallery's own caption says the state is expected until the file exists — spec 006 /
  TASK-080's successor owns it. Byte-for-byte the same on `darwin`.
- **2026-09-22 — the `de` consent baselines are byte-identical to the `en` ones.** Not a
  rendering bug: 483 of `messages/de.json`'s 496 keys are still verbatim English, marked
  `"source": "machine", "reviewed": false` in `de.meta.json`. Only the `Intl`-formatted parts
  (dates, currency, country names, collation order) are localised, and those are correct in every
  locale shot. A translation backlog, owned by whoever lands reviewed German copy.
- **2026-09-22 — the footer and the utility strip print `+1 (213) 592-5150`, a US number, on
  every European page**, beside `Mon–Sat 8–20 CET`. It comes from `src/config/company.ts`
  (`phoneE164: "+12135925150"`), and it is pinned in roughly two dozen of the 93 baselines — every
  one that photographs a whole document (the eight `home-<locale>-<viewport>` artboards, `home`,
  `en`, `de`, `not-found-*`, `error-global-*`, `error-locale-*`, `ar-XB`), the four `footer-*`
  shots, and the four `header-*-utility` strips. **This is TASK-140 (b) and it is founder-gated** —
  `TASKS.md` row 158 says a real EU contact number is his to supply and an implementer must not
  invent one; `docs/decisions-log.md` (2026-09-08) records that the founder supplied this one. Not
  acted on here, and not a reason to withhold a baseline: the `darwin` set `main` already pins
  shows the same number, so the Linux set pins nothing new. Raised by `/review 1` on PR 95.

- **2026-09-22 — the `<input type="date">` placeholder reads `mm/dd/yyyy` on Linux and
  `dd/mm/yyyy` on macOS**, in every locale. It is the browser's own locale, not the page's, so it
  is a cross-platform baseline difference rather than a product defect — now recorded in the
  runbook's threshold section. It does mean the authoritative set would move if GitHub changed the
  runner's locale; pinning `use.locale` would invalidate all 93 `darwin` baselines and is left to
  whoever next touches `playwright.config.ts`.

## Result

PR [#95](https://github.com/itsahmeds/flowers-overseas/pull/95). **93 `linux` baselines added
(92 `visual` + 1 `pseudo-rtl`) — the same set `darwin` holds, so `visual:baselines --check` now
reports `linux: 93, darwin: 93`**, where the task opened at 84 `darwin` against 3 `linux`. Every
byte came from the `visual-baselines` workflow on `ubuntu-latest` — **run 35700989506**, and
**run 35711495539** for the two files the fix round replaced — and every committed file matches
the committed sha256 manifest (`pnpm visual:baselines --verify
tests/visual/__screenshots__/visual-baselines-manifest.json` → "93 committed linux baseline(s)
match the manifest byte for byte"). **Images actually looked at: 93 of
93** — reviewed as 152 tiles and crops (tall documents cut into readable strips at 880–900 px wide;
the 1440 × 35 371 px component gallery in 13), with every questionable region diffed against the
committed `darwin` baseline of the same page before it was accepted. **Images escalated instead of
committed: 0**; three observations that are identical on the `darwin` baseline `main` already pins
are recorded under `## Escalations` for their owning tasks rather than pinned as new findings.

Two test-harness fixes were needed before Linux could produce a full set: `/dev/components`
carries 19 `loading="lazy"` images on a 50-megapixel full-page shot, so `loadLazyImages()` flips
them to `eager` and awaits `decode()` (a lazy image loading *between* Playwright's two stability
captures is why the expectation never converged), and that one assertion gets `test.slow()` and
`timeout: 60_000` — the failure was speed, not instability, and the threshold was **not** widened.
With both in place the runner reported **53 passed** and wrote all 93 files.

Tests: 1 unit file, `tests/unit/visual-baselines.test.ts`, **16 cases** over the ledger
(`--check`/`--manifest`/`--verify`) and the manifest parser — 10 from round 1, mutation-checked
(replacing `missingOnLinux` with `[]` turns it red, 1 failed / 9 passed), plus 6 from the fix round
over `parseManifest()`'s failure shapes. No e2e or visual test was added; this task's own gate *is*
the visual suite. Gates green locally: `typecheck`, `lint`, `format:check`,
`codebase:map --check`, `i18n:check`, `check:no-db`, `specs:index --check`, `tasks:check`,
`visual:baselines --check`, and in the fix round **`pnpm test:visual` itself — 53 passed (14.1 s)**
against a local build, which is the one place this task had to take the build slot: the `darwin`
set is not rendered anywhere else, so nothing but a local run could show that
`dev-components-desktop` had gone stale. Slot acquired and released, `.next` deleted before and
after, port 3230, load average quoted above. `build`/`e2e`/`a11y`/`lighthouse` belong to CI.

**State of the world baselined against (round 2, after `/review 1`):** `origin/main` at
`c6d665b`, i.e. **PR 93 (TASK-114) merged** and **PR 94 (TASK-138) still open** — remote
photographs are still served from the old `pub-*.r2.dev` origin, not `media.flowersoverseas.com`.
If PR 94 lands before this one, remote-image timing changes and `tests/support/settle-images.ts`
is rewritten there: re-run the `visual:baselines` workflow on this branch, re-verify against the
new manifest, and look at any image whose bytes moved before committing it.

**Correction to round 1's claim, which `/review 1` was right to fail.** The earlier text here and
in the PR body said the `country-shop` pair "was not touched" because TASK-112 had regenerated it.
That was wrong: PR 88's squash had left `darwin/country-shop-{desktop,mobile}` as pre-TASK-111
pictures, and the reviewer proved it in the pixels (only `OCCASION | DATE`, no `PAGE` column). What
happened next moved the defect to the other platform. **PR 93 (TASK-114) merged on 2026-09-22 and
regenerated exactly those two `darwin` files**, which fixed the `darwin` side and left the *Linux*
pair — rendered before that merge — one page behind `main`: they carry no sort toolbar and no
pagination control, so the `visual` job would have gone red on this branch after the rebase.

What was done about it:

- **Rebased onto `origin/main`** (PR 93 included) and re-ran the refresh workflow on the rebased
  head — `workflow_dispatch`, **run 35711495539**, `--update-snapshots=all`, 53 passed in 42 s.
- **Two `linux` baselines replaced**, `country-shop-{desktop,mobile}`. Both were looked at before
  they were committed: the desktop shot now shows TASK-114's `84 bouquets · page 1 of 7` toolbar
  with the ranking-disclosure sentence and the `1 2 3 4 5 6 7 Next` control, and `OCCASION | DATE |
  PAGE` with "What we make for it" on the Mother's Day row; the mobile shot was read as a nine-tile
  strip and shows the same. **91 of the 93 files came back byte-identical** to run 35700989506's,
  and the only two that moved are the only page the intervening merge changed — which is the
  run-to-run evidence in runbook §1.3, now taken across a merge rather than across two idle
  commits.
- **One `darwin` baseline refreshed**, `dev-components-desktop`, from a local build of this head
  (build slot taken and released, `.next` deleted before and after, port 3230). It was a *this-PR*
  staleness: `loadLazyImages()` is the harness fix this branch adds, so the committed picture from
  PR 88 still had its lazy card images unloaded — the green placeholder where the render now shows
  the photograph. Looked at in four bands before it was written, then `pnpm test:visual` re-run
  with no update flag: **53 passed (14.1 s)**, load average 5.22 / 4.01 / 3.72.
- With that, **every one of the 93 `darwin` baselines is current for this commit**, which is what
  makes runbook §1.3's cross-platform row honest: both sets are pictures of the same tree and
  nothing was excluded.
- **`tests/visual/__screenshots__/visual-baselines-manifest.json` is now committed** beside the
  PNGs (`/review 1`, nit 1): the artifact that proved provenance expires in 14 days, the file does
  not. `pnpm visual:baselines --verify tests/visual/__screenshots__/visual-baselines-manifest.json`
  → "93 committed linux baseline(s) match the manifest byte for byte".
- **`parseManifest()` is zod** (`/review 1`, nit 2): a `BaselineManifest` schema with a
  `^[0-9a-f]{64}$` hash, returning `{ ok, problems }` rather than throwing, and `--verify` exits 2
  and names every problem. Six new unit cases cover `files: null`, a numeric hash, a truncated
  digest, a missing platform and a non-JSON file. `tests/unit/visual-baselines.test.ts` is now
  **16 cases**.
- **The footer's `+1 (213) 592-5150` is recorded under `## Escalations`** (`/review 1`, nit 3) as
  TASK-140 (b), founder-gated, not acted on.
