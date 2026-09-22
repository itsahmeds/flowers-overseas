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

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None blocking._ Three things seen while reviewing the 93 images are **not** defects this task
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
byte came from the `visual-baselines` workflow on `ubuntu-latest`, **run 35700989506**, and every
committed file matches that run's sha256 manifest (`pnpm visual:baselines --verify` → "93
committed linux baseline(s) match the manifest byte for byte"). **Images actually looked at: 93 of
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

Tests: 1 unit file, `tests/unit/visual-baselines.test.ts`, 10 cases over the ledger
(`--check`/`--manifest`/`--verify`); mutation-checked — replacing `missingOnLinux` with `[]` turns
it red (1 failed / 9 passed). No e2e or visual test was added; this task's own gate *is* the visual
suite, which CI runs. Gates green locally: `typecheck`, `lint`, `codebase:map --check`,
`i18n:check`, `check:no-db`, `specs:index --check`, `tasks:check`, `visual:baselines --check`.
`build`/`e2e`/`visual`/`a11y` belong to CI and no build slot was taken.

**State of the world baselined against:** `origin/main` at `b6a3377`, i.e. **PR 88 merged**
(country-shop and listing were regenerated by TASK-112, so the three specs the brief flagged as red
on `darwin` are no longer red and were not touched) and **PR 94 not merged** — remote photographs
are still served from the old `pub-*.r2.dev` origin, not `media.flowersoverseas.com`. If PR 94
lands before this one, remote-image timing changes and `tests/support/settle-images.ts` is
rewritten there: re-run the `visual:baselines` label on this branch, re-verify against the new
manifest, and look at any image whose bytes moved before committing it.
