# Runbook — visual baselines

The visual suite photographs a page and compares it with a committed PNG. That PNG is a **pinned
picture of what the product looks like**, so the whole value of the gate rests on someone having
looked at it. This runbook says which platform's pictures decide pass or fail, how to refresh them
from a Mac, and how a reviewer tells a legitimate refresh from an accident.

Owner: whoever changes a template. Spec 001 §2 "Testing harness", AC-17 / T-18. Opened by TASK-139.

---

## 1. Three standing decisions

### 1.1 `linux` is authoritative; `darwin` is a local convenience

`playwright.config.ts` keeps one baseline per platform under
`tests/visual/__screenshots__/{project}/{platform}/`. Text is rasterised by the host's font stack,
so a macOS PNG and a Linux PNG of the same page differ far beyond any sane threshold — per-platform
baselines are what let the threshold stay tight (§1.3).

**CI renders on `ubuntu-latest`, so `linux` is the only set that decides a pull request**, and it
is the gate of record (CLAUDE.md, "Definition of done" 3). `darwin` exists so `pnpm test:visual`
is useful on the founder's Mac; nothing in CI ever reads it.

The configuration says so rather than leaving it to a comment:

- `pnpm visual:baselines --check` fails if a baseline exists for `darwin` and not for `linux`. It
  runs in the `lint` job of `ci.yml` — the cheapest job in the file, reading committed files only —
  so a `darwin`-only baseline is caught on the pull request that adds it instead of on the next
  person's `ci:full` run.
- The reverse is allowed and reported, not failed: `linux` may legitimately hold a baseline
  `darwin` lacks, because `darwin` is advisory and may lag.

A practical consequence: **a `darwin`-only mismatch is not a failing gate.** If `pnpm test:visual`
is red on your Mac and the `visual` job is green, the product is fine and your local set is stale —
refresh it (§3) or leave it; it blocks nothing.

### 1.2 A UI change refreshes the Linux set through a workflow, not by hand

`.github/workflows/visual-baselines.yml` renders the baselines on the same runner, from the same
`.env.example` build, that `ci.yml`'s browser jobs use. It runs on

- `workflow_dispatch` (input `update`: `all` — the default — `changed` or `missing`), or
- the **`visual:baselines` label** on a pull request. Remove and re-add the label to run it again;
  a push does not.

It **does not commit anything**. It publishes two artifacts: `visual-baselines-linux` (the PNGs
plus `visual-baselines-manifest.json`) and `visual-baselines-report` (the Playwright report and
diffs). The commit is a human step, on purpose — see §2.

### 1.3 The threshold stays at 0.1 % (`maxDiffPixelRatio: 0.001`)

Measured on 2026-09-22, PR 95, at `5646005` — after PR 93 (TASK-114) merged, so **both platforms'
93 baselines are pictures of the same commit**. Method: decode the PNGs and count pixels that
differ in any RGB channel; where two pictures of the same page have different heights, compare the
region they share.

| comparison | pages | differing pixels |
|---|---|---|
| Linux run 35700517643 vs Linux run 35700989506, two commits apart | 92 | **0.000 %** on every one — all 92 files are byte-identical |
| Linux run 35700989506 vs Linux run 35711495539, **across PR 93's merge** | 93 | **91 byte-identical**; the only two that moved are `country-shop-{desktop,mobile}`, which is the one page TASK-114 changed |
| `darwin` vs `linux`, same page, same commit | 93 | **0.24 % – 60.9 %**, median **9.2 %** |

Run-to-run noise on one platform is *zero*, not merely small: `animations: "disabled"`,
`caret: "hide"` and `settle()` (network idle, `document.fonts.ready`, two animation frames) make
the render deterministic, and three independent runners produced byte-identical files for every
baseline the commit between them did not touch. The third run is the sharper evidence, because it
shows the gate is **sensitive** as well as deterministic: 91 of 93 files came back byte-for-byte
identical across a merge, and the two that moved were exactly the two that merge could move.

The cross-platform delta is two to three orders of magnitude larger — and it is not only
anti-aliasing. The host's font stack changes line-breaking, so **28 of the 93 pages have a
different *geometry* on the two platforms**: the largest gap is **60 px**, on the four mobile home
artboards (`home-{en,en-gb,de,pl}-mobile`, 7 496–7 500 px on `darwin` against 7 556–7 560 on
`linux`); eleven of the 28 differ by a single pixel; `country-shop-mobile` differs by **20 px**.
The browser's own locale decides the `<input type="date">` placeholder on top of that
(`mm/dd/yyyy` on the runner, `dd/mm/yyyy` on the founder's Mac). No single threshold can straddle
that, which is why baselines are per platform.

**Nothing was excluded from those numbers, and that is why the commit is quoted.** An earlier
edition of this table measured 91 pages and gave `country-shop-mobile` as the worked example "by
181 px". Its `darwin` file was a pre-TASK-111 picture that PR 88's squash had left behind, so
about 161 px of that 181 was *missing content* and only ~20 px was the font stack — the example
was measuring a stale baseline, not the platform (`/review 1` on PR 95, 2026-09-22). Re-measured
with both sets rendered from `5646005`, the residue is the 20 px quoted above. **If you re-measure
this table, name the commit both sets came from first**: a set with a stale member measures the
staleness.

So 0.1 % is not merely defensible, it is generous: it is ~920 pixels on a 1280×720 shot and ~5 000
on a long full-page one, against measured noise of zero. **Do not widen it.** A visual failure on
CI is a real pixel change; read the diff in the artifact and find out which one.

---

## 2. Refresh the Linux baselines (the normal path, from any machine)

1. Push the branch with the template change on it and open the pull request (draft is fine).
2. Add the **`visual:baselines`** label. The `visual-baselines` workflow builds, serves and renders.
3. When it finishes, read its step summary: it lists the commit, the run id, how many baselines it
   rendered, and `git status --porcelain` for the snapshot directory — i.e. exactly which files
   changed against the branch.
4. Download the artifact:

   ```sh
   gh run download <run-id> -n visual-baselines-linux -D /tmp/baselines
   ```

5. **Look at every image you are about to commit.** Not the count, the images. A baseline nobody
   opened pins whatever was on screen, bugs included, and every later run then defends that bug.
   For a changed baseline, open the `-diff.png` in `visual-baselines-report` as well and say in the
   PR *why* those pixels moved. "Re-baselined" is not a reason; "the dates band grew 9 px because
   `--space-4` changed" is.
   If an image shows something that looks wrong, **stop**. That is a finding for the task that owns
   the page, not a baseline to accept.
6. Copy them in, **copy the manifest in with them**, and prove they are the runner's bytes:

   ```sh
   cp -R /tmp/baselines/tests/visual/__screenshots__/visual/linux/.     tests/visual/__screenshots__/visual/linux/
   cp -R /tmp/baselines/tests/visual/__screenshots__/pseudo-rtl/linux/. tests/visual/__screenshots__/pseudo-rtl/linux/
   cp /tmp/baselines/visual-baselines-manifest.json tests/visual/__screenshots__/visual-baselines-manifest.json
   pnpm visual:baselines --verify tests/visual/__screenshots__/visual-baselines-manifest.json
   pnpm visual:baselines --check
   ```

   `tests/visual/__screenshots__/visual-baselines-manifest.json` is **committed next to the PNGs
   on purpose**: an artifact expires after 14 days, and with it the only proof that a baseline came
   off a runner. The committed manifest keeps §4's first question answerable a year from now, and
   it has to move whenever a PNG moves — a baseline edited by hand fails `--verify` against it.

7. Commit the PNGs and the manifest in their own commit, with the run id in the message, and say
   in the PR body how many images you looked at.

## 3. Refresh the local (`darwin`) set

```sh
pnpm build && pnpm start          # serve what you are about to photograph
pnpm test:visual --update-snapshots
pnpm test:visual                  # again, without the flag
```

The second run matters: a baseline that only passes the run that wrote it is a photograph of a
mid-load frame. The `darwin` PNGs may be committed alongside the Linux ones, but they are never
a substitute for them — `--check` will say so.

## 4. How a reviewer judges a baseline commit

Four questions, in order. Any "no" is a change request.

1. **Do the bytes come from a runner?**
   `pnpm visual:baselines --verify tests/visual/__screenshots__/visual-baselines-manifest.json`
   must report every committed `linux` PNG as matched. That manifest is committed, so this question
   is answerable after the artifact has expired; check it against the run named in the commit
   message, and re-run the same command against the freshly downloaded manifest if you want to
   confirm the committed one was not edited too. A PNG made anywhere else cannot be reproduced and
   must not be trusted.
2. **Is the change list the expected one?** The workflow's step summary lists every file that
   moved. A one-line CSS change that moves 40 baselines is a question, not a formality.
3. **Does the PR say why each baseline moved**, in terms of the change — not "updated snapshots"?
4. **Does the author say they looked?** The count of images reviewed belongs in the PR body and in
   the task brief's `## Result`. It is the only part of this gate a machine cannot check.

## 5. When the `visual` job is red

- **`A snapshot doesn't exist at …/linux/x.png`** — a baseline was added for `darwin` only. `lint`
  should have caught it (§1.1); refresh via §2.
- **`Screenshot comparison failed`** — real pixels moved. Download `playwright-report-visual` from
  the failed job; `test-results/**/-diff.png` shows where. Decide whether the change is intended
  (refresh, §2) or a regression (fix the page — do **not** refresh).
- **Red on `darwin` only, green on CI** — §1.1: nothing is broken; your local set is stale.
- **`Timeout 5000ms exceeded` … `generating new stable screenshot expectation`** — the runner
  could not take two identical screenshots inside the expect timeout, so no baseline was written.
  It is a *speed* symptom, not an instability one, on a long document: `/dev/components` is
  1440 × 35 371 px, 50 megapixels, and each capture costs seconds on a shared runner (runs
  35698369912 and 35700517643 both failed on it while the same test settles in 5.0 s on the
  founder's Mac). The fix is a longer wait on that one assertion — `test.slow()` and an explicit
  `timeout:` on `toHaveScreenshot` — never a wider `maxDiffPixelRatio`. Lazy images on a long
  full-page shot make it worse, because a `loading="lazy"` image can load *between* the two
  captures: `tests/visual/notices.spec.ts`'s `loadLazyImages()` flips them to `eager` and awaits
  `decode()` first.
- **A page with no photographs** is not necessarily a failure. Spec 008 §14 A11: where no SKU on a
  page has an approved asset, the cards render placeholders and AC-24's "exactly one LCP
  nomination" has no subject; zero is correct. `/en/poland/occasions/mothers-day` is the standing
  example, and its baseline legitimately shows placeholder cards.
