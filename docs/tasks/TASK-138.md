# TASK-138 — R2 media delivery **without the database** — the narrow path to zero placeholders. `media:variants` already derives the ladder locally and `seed/data/media-variants.json` already records all 118 rows, so Phase 0 needs no `media_variant` table, no jobs queue and no `media:upload` worker: an `r2Loader` behind the existing `setMediaLoader()` seam in `src/modules/ui/media/loader.ts`, a plain upload of the derived files to `flowersoverseas-media`, deletion of `public/media/` and `staticVariantLoader`, and the CSP `img-src` change. Removes `COMMITTED_MEDIA_BYTE_CAP` as a constraint so all 84 products can be photographed.

Row: `TASKS.md` → TASK-138. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-138`; keep it current by editing this file, not the row.

## Binding

**Why this task exists.** TASK-082 stopped and escalated: its three deliverables each rest on a
task that is still `todo` — `src/lib/storage.ts` (TASK-017, the file does not exist), migration
`0004`'s `media_variant` table (TASK-017), and the pg-boss jobs registry (TASK-024; `src/jobs/`
holds a `.gitkeep` and `pg-boss` is not a dependency). Delivering those means absorbing two
database tasks the founder deliberately deferred.

**The ruling that makes this task possible, recorded as a spec 006 §14 amendment:** *Phase 0 R2
delivery requires neither the database nor the jobs queue.* The variant ladder is already derived
locally by `pnpm media:variants` and already recorded in `seed/data/media-variants.json` — 118
rows, committed, checked by `seed:check`. That manifest is the source of truth in Phase 0. A
`media_variant` table and a `media.derive_variants` worker are Phase 1 groundwork that buy a
visitor nothing today.

**What to build, and it is deliberately small:**

1. An `r2Loader` installed through the existing `setMediaLoader()` seam in
   `src/modules/ui/media/loader.ts`. Read that file before anything else — it was written for
   exactly this swap, it is typed against `next/image`'s `ImageLoaderProps` with a type-only
   import, and `Media` reads it through `getMediaLoader()` at render time so module evaluation
   order cannot defeat the swap. **No call site changes.** Do not reshape the seam.
2. A plain upload of the already-derived files to the `flowersoverseas-media` bucket, idempotent
   by checksum. A script, not a worker. No queue, no database.
3. Deletion of `public/media/` and `staticVariantLoader`, and the CSP `img-src` change.
4. `COMMITTED_MEDIA_BYTE_CAP` stops governing shipped imagery. Say in `- **2026-09-21 (round 2) — Lighthouse's LCP budget fails on all four locale homepages, and this
  is the first time it has been measured (founder / orchestrator, `open`).** CI run
  `35630208213`: `largest-contentful-paint` ≤ 2 000 ms asserted, medians of three runs found at
  **2 248 ms (`/en`), 2 238 ms (`/pl`)** and the same order on `/de` and `/en-gb` (individual
  values 2 238–2 559). It had never run on this branch before: in run `35621421001` the
  `lighthouse`, `build` and `container` jobs were all **skipped** because `test-unit` failed, so
  the brief's earlier "not measured here: Lighthouse" is now measured — by the gate of record —
  and it is red. Every other job is green.

  **Why this is not absorbed here.** The likely cause is the thing escalation 2 above already
  names: the LCP element on each homepage is the hero photograph, and it now comes from a
  third-party `pub-*.r2.dev` origin, so a DNS lookup, a TCP handshake and a TLS handshake sit on
  the LCP critical path that were not there when the bytes were served from our own origin. The
  two candidate mitigations are a `<link rel="preconnect">` to the media origin in the root
  layout — a change to a page-shell file this task's brief does not list, whose effect is a guess
  until CI measures it — and **the custom domain (`media.flowersoverseas.com`), which is the
  founder action already open in escalation 2** and which would remove the third-party origin
  rather than paper over it. Choosing between them, and deciding whether the R2 flip may land
  while the budget is red, is not an implementer's call: lowering the budget is forbidden
  (CLAUDE.md), and CWV is priority 1. Reported with the numbers; not improvised.

## Result` what now
   guards against unbounded media, because "nothing" is not an acceptable answer — per-asset
   caps and the manifest check must still hold.

**Verified for you, so do not re-litigate it.** A signed read-only `ListObjectsV2` against both
buckets returned 200 with `KeyCount 0`; a control bucket returned `404 NoSuchBucket`, so those
200s are real. The endpoint host ends `.eu.r2.cloudflarestorage.com` — the EU jurisdiction
ADR-0015 requires.

**Two defects you inherit; record them, do not silently absorb them.**

- **Bucket names deviate from binding text.** Spec 002 §13 Q7 binds `fo-media` /
  `fo-media-preview` / `fo-backups`; all three 404. What exists is `flowersoverseas-media` and
  `flowersoverseas-backups`, with **no preview bucket at all**. Names are configuration so
  nothing breaks, but §13 Q7 must be amended or the buckets renamed — and the missing preview
  bucket matters if preview environments are ever to serve images.
- **`R2_PUBLIC_BASE_URL` is a `pub-*.r2.dev` host.** Cloudflare rate-limits `r2.dev` and does not
  recommend it for production traffic, and it puts a third-party origin into CSP `img-src`
  against ADR-0016's intent. **A custom domain is a founder action.** Build against the
  configured value, make the origin a single configuration point, and state the risk plainly in
  `## Result` rather than shipping `r2.dev` as though it were the answer.

**Credential handling.** Use `.env.local` through the project's own env loader. Never print, log,
commit or paste a secret value anywhere — not into a file, a fixture, a commit message or a PR
body. `.env.example` carries key names only. If a key is missing, stop and name it.

**The honesty rule still governs.** `placeholderLoader` throws rather than inventing a URL, and
that is deliberate: a loader that returned a data URI or a stock image would put a photograph we
do not have onto the page. The 72 products without imagery keep their captioned placeholder until
their images exist. This task changes where images are served from; it does not invent any.

## Read

- `src/modules/ui/media/loader.ts` — the seam, and the three properties the swap had to preserve
- `src/modules/ui/media/resolve.ts` — the honesty gate, untouched by this task
- `src/lib/media-headers.ts`, `src/lib/csp.ts`, `seed/budgets.ts`, `seed/data/media-variants.json`
- spec 006 §2.5, §2.6, §6, §13 Q4/Q12; spec 002 §13 Q7; ADR-0014, ADR-0015, ADR-0016

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review 94` (2026-09-21):** the uploader's cap and watermark refusals have no
  behavioural test — both made unreachable with 4 357 unit tests still green; add two
  `loadUploadSet()` cases against a temp tree.
- **From `/review 94` (2026-09-21):** the no-tree branches of `media-watermark.test.ts` (source
  grep) and `media-budgets.test.tsx` (`variants.length > 0`) must not stand in for AC-16 / AC-14
  coverage.
- **From `/review 94` (2026-09-21):** a manifest `bytes` value can disagree with its object with
  no gate noticing (verified); add a public-origin `HEAD` verification or state the limit plainly
  instead of "no row can disagree with its file".
- **From `/review 94` (2026-09-21):** `listing-mobile-card-image` still flakes 2 runs in 9 (origin
  max 5.34 s vs the helper's 5 s bound); `## Result` must not present the flake as resolved.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-09-21 — bucket names deviate from spec 002 §13 Q7 (spec-writer / founder, `open`).**
  §13 Q7 binds `fo-media` / `fo-media-preview` / `fo-backups`; all three 404. What exists is
  `flowersoverseas-media` and `flowersoverseas-backups`, with **no preview bucket at all**. Names
  are configuration and nothing is broken today, but §13 Q7 must be amended or the buckets
  renamed — and the missing preview bucket matters the day preview environments need their own
  image store (today they would read and write production's).
- **2026-09-21 — the public origin is a `pub-*.r2.dev` host (founder, answered 2026-09-22:
  `media.flowersoverseas.com` connected, see round 3).** Cloudflare
  rate-limits `r2.dev` and does not recommend it for production traffic, and it puts a
  third-party origin into CSP `img-src` against ADR-0016's preference for the shortest allowlist.
  Built against the configured value as instructed and reduced to **one** configuration point
  (`src/lib/media-origin.ts`, checked against `R2_PUBLIC_BASE_URL` by the upload script), so
  moving to `media.flowersoverseas.com` is one line here plus the Cloudflare custom-domain
  setup — **a founder action**.
- **2026-09-22 — Lighthouse LCP is 29-48 ms over budget on the four locale documents, after both
  available fixes (orchestrator/founder, `open`).** `/en` 2 048 ms, `/en-gb` 2 039, `/de` 2 039,
  `/pl` 2 029 against `lighthouserc.json`'s 2 000 ms, measured by CI on run `35701725761` with the
  `preconnect` hint in place and the origin on `media.flowersoverseas.com`. Both fixes worked —
  roughly 200 ms came off — and neither was enough. **This PR's merge is gated on it and nothing
  in this repository is left to try**: lowering the budget, dropping a URL from
  `lighthouse-urls.json`, `continue-on-error` and moving the LCP candidate are all refused
  (`/review 90`), and each would be a spec amendment rather than a workflow edit. What is left is
  outside the repository, and is recorded in round 3 below: the objects answer
  `cf-cache-status: DYNAMIC`, i.e. Cloudflare is not caching them at its edge, so every image is
  still fetched from R2 itself. A cache rule on `media.flowersoverseas.com` is a founder action.
  **Recommended, not taken.**
  **Update, round 4 (2026-09-22, still `open`):** the edge now caches — every `home-hero` AVIF
  answers `HIT` — and CI on `d40e4cd` (run `35766301997`) measured the four documents **worse**,
  not better: 2 118-2 144 ms asserted, medians 2 136-2 738 ms. Edge caching did not close the gap.

- **2026-09-21 — the origin is a committed constant, not an env read (decided here, recorded for
  review).** Both consumers are build-time: every indexable page is prerendered, so image URLs
  are written into HTML by `next build`, and the CSP is baked into the same artefact. That build
  is the container build, which CI **fails on purpose if any `R2_*` variable is in its
  environment** (`.github/workflows/ci.yml`, spec 001 §14 A17). An env-read origin would
  therefore be unavailable exactly where the URLs are produced, and an origin resolved
  differently at build and at ISR-revalidation time would serve URLs the page's own baked policy
  blocks. So the public host is a constant beside `VERCEL_LIVE_ORIGIN` and
  `GOOGLE_TAG_MANAGER_ORIGIN` — public, not secret (`.env.example` says so), and visible in a
  diff. If a reviewer prefers a `NEXT_PUBLIC_MEDIA_BASE_URL` build key instead, that is a
  Dockerfile `ARG`, a CI build arg and a Railway variable, and `tests/unit/container.test.ts`
  pins the set.

## Result

**PR:** [#94](https://github.com/itsahmeds/flowers-overseas/pull/94) · **branch** `task/TASK-138-r2-media-delivery`.

All 118 derived variants are objects in `flowersoverseas-media` and every photograph on the site
is served from the bucket. The flip is `r2VariantLoader` and `r2Loader` installed through the
existing seam in `src/modules/ui/media/loader.ts` — **zero call-site changes**, as AC-2 promised
— both building `${MEDIA_ORIGIN}/{objectKey}` from the manifest's own key, never a key invented
in the loader. `public/media/` is deleted from the repository (118 files, 3 012 746 B),
`staticVariantLoader` is gone, `pnpm media:variants` now writes to the git-ignored `.local/media/`,
and `img-src` names the media origin in every environment.

**Was it exercised for real, or only faked?** Both, and the real run is the one that counts.
`pnpm media:upload` put 10 objects, then 108 more (2 676 056 B transferred), and a third run
transferred **0 B** — idempotence by stored checksum, observed. A public `GET` of
`…/media/home-hero/384.avif` returns `200`, `image/avif`, `Cache-Control: public,
max-age=31536000, immutable`. `pnpm build` with no database and no `R2_*` variable in the
environment (`.env.local` replaced by `.env.example` minus the two `DATABASE_URL` keys) prerenders
the R2 URLs into the HTML, and a real browser against `pnpm start` on :3219 loaded the
photographs from the bucket on `/en`, `/de`, `/pl` and `/dev/components`. Not faked anywhere in
the delivery path; the only fake is the injected `fetch` in the upload unit tests, which is what
makes the decision layer testable without a network.

**What now guards against unbounded media, with `COMMITTED_MEDIA_BYTE_CAP` gone.** Four things,
and none of them needs the bytes to be in the repository:

1. **The per-slot caps still fire, in CI, on every variant.** `pnpm seed:check` family 9 now reads
   `bytes` from `seed/data/media-variants.json` instead of `stat()`ing committed files. The
   manifest is committed, reviewed in a diff, and is the row both the loader and the uploader
   read, so a 900 KB hero still fails a gate before anything is served (spec 006 §6). `hero`
   90 000 B, `occasionTile` 18 000 B and the rest are unchanged in `seed/budgets.ts`.
2. **Nothing can be served that has no row.** The loader addresses objects only by the manifest's
   `objectKey`, and `pnpm media:variants --check` ties rows to files by byte count and SHA-256
   wherever the derived tree exists (always, before an upload), plus manifest-internal checks —
   pinned pipeline, canonical keys, declared boxes — everywhere, including a runner holding no
   image. **What that does not cover**, and round 2 measured it: once the bytes are in the bucket,
   a row's `bytes` can be edited afterwards and no automatic gate notices, because no automatic
   gate has the file. `pnpm media:upload --verify` is the audit that closes it — see **Round 2**.
3. **The upload refuses, and each refusal now has a test that can fail.** `scripts/media-upload.ts`
   will not send a byte unless `checkVariants()` is clean, every file is inside its slot's cap, no
   file carries the demo watermark (the AC-16 invariant moved here from the committed tree, where
   it can no longer run) and `R2_PUBLIC_BASE_URL` equals `MEDIA_ORIGIN`. Round 2 of `/review 94`
   showed that two of those four were unfalsifiable — see **Round 2** below.
4. **Page weight is still measured where a buyer pays it.** `tests/e2e/media-budgets.spec.ts`
   counts every image response by content type, whatever origin serves it, against 204 800 B per
   page and 90 000 B for the hero — written origin-agnostically in TASK-080 for exactly this day,
   and passing against real R2 responses.

The bucket total is now **reported, not capped** (118 variants, 3 012 746 B, printed by
`seed:check`'s §11 report and by every upload). Inventing a new total would have been an invented
number; the per-variant caps are the spec's.

**Tests.** Unit: 2 new files (`tests/unit/media-origin.test.ts` 5 cases,
`tests/unit/media-upload.test.ts` 15 cases) and 11 updated; whole unit project **4 357 passed, 5
skipped, 0 failed**. Contract 21 passed. E2E: 1 new file
(`tests/e2e/media-delivery.spec.ts` — the page points at the bucket, the object exists with the
immutable year, the document's own policy allows the origin its images come from) and 3 updated;
318 passed across the affected suites on desktop + mobile. Visual 44 passed, a11y 83 passed.
Integration's database suites fail on this machine for reasons that predate this branch (migration
state), and `tests/e2e/seo-canonical.spec.ts` fails only because the local harness runs on :3219
while the build's `NEXT_PUBLIC_SITE_URL` is :3000.

**Two things a reviewer should look at closely.** (a) `tests/support/settle-images.ts`: moving the
images to a remote origin made two visual specs genuinely flaky. **The first version of this
paragraph claimed that was fixed; it was not** — `/review 94` round 2 measured
`listing-mobile-card-image` still failing 2 runs in 9. What the helper does now, and why it is a
different fix rather than a bigger number, is in **Round 2** below. (b) `tests/visual/__screenshots__/visual/darwin/country-shop-*.png`
were **already stale on main**: they were recorded by TASK-109 and TASK-080 landed imagery
afterwards, so they still show placeholders for products that have had photographs since. The
pixels this branch produces there are the pixels main produces; the baselines are refreshed and
disclosed rather than left red. Only 3 of the 84 `linux/` baselines exist at all — that is
TASK-137's territory, not this one's.

**Not measured here:** Lighthouse. The machine's 15-minute load average was 14–16 on 8 cores while
this ran, so a local LCP number would measure the machine (CLAUDE.md's own rule). CI is the gate of
record, and the risk it should be read against is the `r2.dev` host in the escalation above.

**CI (run 35621421001, `ci:full`).** Two jobs failed. `test-unit` was mine — one skipped unit
test, which CI refuses outright — and is fixed in `666e6de`: the whole-set watermark check no
longer skips when the derived tree is absent, it asserts the gate that runs there instead
(verified by moving `.local/media/` away: 46 tests, 0 skipped). `preview` is **TASK-137's
documented failure**, in its own words: the Vercel preview's `/api/health` answers 500 from the
cold fallback's empty env store (ADR-0018), identical on PRs 84, 85 and 87. Since `e2e`, `visual`,
`a11y` and Lighthouse are each `needs: preview`, no browser gate can execute on any PR until
TASK-137 lands — which is exactly why those suites were run locally here and their counts are
above. The fix push fired no new run: the workflow triggers on `ready_for_review` and `labeled`
only, and re-labelling would spend the spine's minutes on a run whose `preview` job fails again
regardless.

**Handed on:** spec 002 §13 Q7's bucket names and the missing preview bucket; the custom domain;
and, for whoever revisits it, the `NEXT_PUBLIC_MEDIA_BASE_URL` alternative to the committed origin
constant.

---

### Round 2 (2026-09-21) — what `/review 94`'s FAIL asked for, and what it actually found

**1. The uploader's two refusals were unfalsifiable. They are not now.** The reviewer replaced
`const cap = SLOT_BYTE_CAPS[slot]` with `Number.MAX_SAFE_INTEGER || …` and put the watermark
branch behind `items.length < 0` — both refusals dead, both source strings intact — and all 4 357
unit tests stayed green. With the committed tree gone, that script is AC-16's only file-level
enforcement and AC-15's last per-file one.

`tests/unit/media-upload.test.ts` gains four cases against `loadUploadSet()` on a fixture tree
(`tests/unit/support/derived-tree.ts`, a temporary repository root built from the repository's own
`seed/data/media.json`, so the slot and therefore the cap are the shipped ones): a clean tree
loads, an over-cap file is refused naming the cap, a watermarked file is refused, and a row whose
bytes disagree with its file is refused. The over-cap fixture is 384×384 deterministic RGB noise —
genuinely 55 190 B against the 18 000 B `occasionTile` cap, not a faked byte count.

**Proved by mutation, both with and without a derived tree** (the second is the CI condition;
`.local/media/` moved away):

| Mutation | Result |
|---|---|
| `const cap = Number.MAX_SAFE_INTEGER \|\| SLOT_BYTE_CAPS[slot]` | `refuses a file above its slot's cap` **fails** |
| `if (items.length < 0 && (await isWatermarked(bytes)))` | `refuses a file carrying the demo watermark` **fails**, and so does the watermark file's own case |

Both mutations reverted; `git diff scripts/media-upload.ts` shows only the `--verify` addition.

**2. The two stand-ins that could not fail are gone.**
`tests/unit/media-watermark.test.ts`'s no-tree branch was `expect(uploader).toContain("isWatermarked")`
— a grep over source that passed against the neutered build. It now builds a marked fixture and a
clean twin and asserts the uploader refuses one and accepts the other, on **every** machine; the
loop over this machine's real derived tree stays as the stronger statement where it can be made,
but the claim no longer rests on it. `tests/unit/media-budgets.test.tsx`'s
`expect(variants.length).toBeGreaterThan(0)` is replaced by a `checkVariants()` call over a fixture
tree whose row claims different bytes than its file, asserting the problem is reported — mutation-
proved by guarding `data.byteLength !== row.bytes` behind `problems.length < 0`, which turns it red.
In the CI condition the four media unit files run **70 tests, 0 skipped**.

**3. The manifest's byte column: implemented, not weakened.** The reviewer's finding is exact —
lowering `fo-bq-001-hero/384.avif` from 9 911 to 900 leaves `seed:check` and `media:variants
--check` both clean on a runner with no tree. `pnpm media:upload --verify` closes it from the
bucket end: a public `HEAD` per manifest row comparing the published `content-length` and
`content-type` to the row, with **no access key, no secret and no derived tree**. Real runs, not
faked: 118 rows verified against the live bucket in 18 s; then the reviewer's own mutation
(9 911 → 900) reproduced, and `--verify` exits 1 with
`media/fo-bq-001-hero/384.avif: 9911 B published but 900 B in seed/data/media-variants.json`.
Six unit cases cover the decision layer through the injected fetcher, including that it sends no
`authorization` header at all.

It is an operator command and **not** a CI job — 118 requests against a rate-limited `pub-*.r2.dev`
origin on every pull request is a worse trade than the drift it catches — so the honest statement,
now in `docs/runbooks/imagery.md` §6 and in the README, is: *the byte column is verified on demand,
not continuously; run `--verify` after an upload and whenever anything but `pnpm media:variants`
has touched it.* The stronger sentence this brief used to carry is corrected above.

**4. The visual flake — the measurement found a bigger fault than the bound.** Raising the 5 000 ms
bound and making its expiry loud instead of silent turned the flake into a failure on **every** run,
which is how the real cause surfaced: on `/dev/components` at 1440 px, **19 of the page's 20 images
had never started loading at all**. They are `loading="lazy"`, the page is ~32 000 px tall, and the
helper's whole-page scroll ran as one synchronous task, so intersection was only ever evaluated at
the final position. Measured directly: those 19 have `complete === false` **and `currentSrc === ""`**
— the browser saying it was never asked. The old helper was very nearly a no-op; what made the
baselines pass was `toHaveScreenshot`'s own scroll-and-retry racing the origin inside its 5 s expect
timeout. **Waiting longer would never have fixed it.**

So `settleImages` now settles **the element about to be photographed**: it scrolls it into view,
sets its images `eager` so the request is a fact rather than an intersection heuristic, waits for
each to reach a terminal state, decodes, and throws naming the URLs if any is still in flight.
`tests/visual/listing.spec.ts` settles each of its six parts immediately before that part's
screenshot. Page mode is kept for `country-shop.spec.ts` with the scroll unchanged — it waits only
for images that have **started** — because making it load more images would be a pixel change to
committed baselines dressed as a test fix.

Both properties the review insisted on, proved rather than asserted:

- **A genuinely missing image still fails red.** With every media request fulfilled as 404, the
  helper returns in 38 ms (`complete: true, naturalWidth: 0` — terminal), the screenshot is taken,
  and the *comparison* is what goes red. Unchanged and correct.
- **A slow image no longer gets screenshotted.** With the origin delayed past the budget, the
  helper throws `settleImages: 1 image(s) were still loading after 2000 ms in
  [data-fo-listing-state="cardImage"]`, naming the URL, instead of producing a pixel diff nobody
  can read.

Result on this machine: `listing.spec.ts` **6 of 6** green (3.8 s per run, against 21.4 s and a
hard failure before), and the full visual suite **9 of 9 green** at 21–23 s per run, load averages
1.27–6.88. The reviewer's sample was 7 of 9. The 20 s ceiling stays, justified against the measured
distribution — round 2's 30-key burst (p50 0.74 s, max 5.34 s) and three cache-busted 118-object
bursts re-measured here at load 5.66 (p50 1.25 / 1.56 / 2.51 s, max 2.67 / 3.10 / 3.72 s, every
response a 200) — but it is now a ceiling that is never approached rather than a bound inside the
distribution.

**Nits taken:** the stale "6 MB cap" sentence in `tests/e2e/media-budgets.spec.ts`, the two stale
`seed:check` phrases in `README.md`, and a paragraph in `src/lib/media-origin.ts` saying plainly
that nothing at runtime compares `R2_PUBLIC_BASE_URL` to the constant — and why that is harmless
today and what the fix is the day it is not. The third nit (template paragraphs in this brief) does
not reproduce: neither "in the spec's own words" nor a `## Read` stub is present at this commit.

**Not addressed, as instructed:** the `preview` job's Vercel 500 (TASK-137), the two parallelism
flakes in `corridor.spec.ts:52` and `destinations-hub.spec.ts:113`, and the two founder-gated
escalations above.

**CI (run `35630208213`, `ci:full`, head `cd2474b`).** Re-fired by toggling the label, as a push
fires nothing. **`test-unit` is green** — blocker 3 closed — along with `lint`, `typecheck`,
`build`, `container`, `test-integration`, `test-contract`, `seed-check`, `db-check`,
`catalogue-check`, `corridor-check`, `i18n-check`, `seo-validate`, `env-build-failure`,
`dev-os-check`, `audit` and `commitlint`: **17 jobs green**. Two failed. `preview` is TASK-137's
documented Vercel 500 (`/api/health` with the bypass header returns 500), which skips `e2e`,
`visual` and `a11y` as before. **`lighthouse` failed, for the first time ever on this branch** —
see the new escalation above; it was skipped in the previous run because `test-unit` had failed,
so this is new information, not a regression from this commit.

**Gates run locally for this round:** `typecheck`, `lint`, `format:check`, `check:no-db`,
`seed:check`, `codebase:map --check` — all clean; unit **4 366 passed / 5 skipped** (the 5 are
`audit-secrets.test.ts`, which needs gitleaks; CI installs it) and **70 passed / 0 skipped** across
the four media files in the CI condition; visual 45 × 9 runs green. `pnpm build` was taken under
`build-slot.sh` because the visual measurement cannot be made without it.

---

### Round 3 (2026-09-22) — the Lighthouse LCP blocker: two fixes, 200 ms, still 39 ms short

**Rebased twice.** `origin/main` moved under this branch during the round: the first rebase landed
on `68163e6` (PRs #90, #84, #87, #89) and `TASK-144` plus `TASK-112` (#88) arrived while CI ran, so
the branch is now on `6c19880`. Two conflicts, both in generated or regenerated files:
`docs/codebase-map.md` (resolved to main's, then regenerated with `pnpm codebase:map`) and the two
`country-shop-*.png` darwin baselines, resolved to **main's**, because #89 re-recorded them after
this branch had and main's are the ones that match the post-rebase render.

**1. The hint, and why it is a response header rather than a `<link>`.** The deliverable was
"`<link rel="preconnect">` in the root layout's `<head>`, before the hero preload". Both
in-document forms were implemented and then **measured on a rendered page**, and neither can be
emitted before that preload:

| Form | What the document actually contains |
|---|---|
| `<link rel="preconnect">` rendered in `<head>` | serialised **after** the image preload — React hoistables flush behind `highImagePreloads`. Reproduced against this repository's React 19.2 with `renderToReadableStream`. |
| `preconnect()` from `react-dom` in the locale layout | **no `<link>` at all.** Nor does `prefetchDNS()`. A `preload()` call added on the next line of the same render *does* appear, so the `C`/`D` hints are dropped crossing the RSC boundary while `L` survives. Measured on `/en` against `next dev`, Next 16.3.4. |

A preconnect that arrives after the preload has already opened the connection buys nothing, so the
first form would have been markup that looked right and did nothing — this project's signature
failure mode, arrived at from the other direction. The hint is therefore
`Link: <origin>; rel=preconnect` on the response, emitted from the same `headers()` block as the
CSP, from the same `MEDIA_ORIGIN` constant (`src/lib/media-headers.ts`, `next.config.ts`). It is
the earliest a hint can act — before the first byte of HTML is parsed — and
`scripts/seo/brotli-origin.ts` forwards every header on an HTML document, so it is present in
exactly the origin CI measures. Next already ships its font preloads the same way, which is the
existing proof the mechanism reaches the browser.

**No `crossorigin`, against the brief's instruction, and this is the one deviation in the round.**
A connection is reused only by a request whose credentials mode matches the mode it was opened in.
`crossorigin` opens an **anonymous** connection; the `<img>`/`<source>` elements `Photo` renders
carry no `crossorigin` attribute and neither does `preloadArgsFor()`'s descriptor, so both are
credentialed non-CORS fetches and would ignore an anonymous socket. The familiar "always add
`crossorigin`" rule is about **fonts**, which are always CORS fetches; for a plain image the
instruction inverts. `tests/unit/media-headers.test.ts` states the rule as an assertion so the two
halves cannot drift apart silently.

**2. The custom domain, which arrived mid-round and was the other half.** The founder connected
`media.flowersoverseas.com` to `flowersoverseas-media`, so `src/lib/media-origin.ts` now reads that
host. It was **one line**, which is the whole point of what round 2 built: the loader, `img-src`
and now the preconnect hint all read the one constant, and nothing else needed touching. Verified
before committing: `HTTP/2 200`, `content-type: image/avif`, `cache-control: public,
max-age=31536000, immutable`, and `content-length: 9911` on `media/fo-bq-001-hero/384.avif` —
the same 9 911 the manifest row claims.

**3. What CI measured (run `35701725761`, `ci:full`, head `cb5496c`).** LCP, mobile, simulated
throttling, three runs per URL, against the Brotli origin:

| URL | LCP before (round 2, `pub-*.r2.dev`, no hint) | LCP now | Budget |
|---|---|---|---|
| `/en` | 2 248 ms | **2 048 ms** | 2 000 ms |
| `/en-gb` | ~2 24x ms | **2 039 ms** | 2 000 ms |
| `/de` | ~2 24x ms | **2 039 ms** | 2 000 ms |
| `/pl` | 2 238 ms | **2 029 ms** | 2 000 ms |

Performance category **0.99** on all four (budget 0.95), CLS **0**, script transfer 128 211 B
against 131 072 B. Every other measured URL is comfortably inside: `/` 1 466, the hubs 1 307-1 322,
the corridor and shop pages 1 469-1 654.

**So: both fixes worked, roughly 200 ms came off, and all four are still 29-48 ms over. The
blocker is not closed, and this PR's merge is gated on it.** Reported as instructed rather than
chased: no budget was lowered, no URL removed from `lighthouse-urls.json`, no
`continue-on-error` added, and the LCP candidate was not moved — `/review 90` settled that
demoting a gate is a spec amendment, not a workflow edit.

**The one thing left, and it is outside this repository.** Every object on the new domain answers
`cf-cache-status: DYNAMIC` — Cloudflare is *not* caching them at its edge, so each image is still
fetched from R2 on every request rather than from the PoP nearest the visitor. A cache rule on
`media.flowersoverseas.com` (R2 custom domains do not cache by default) is a founder action in the
Cloudflare dashboard. **Recommended, not taken**, and named in the escalation above. The dashboard
also still showed the domain as `Initializing` when it was connected, so a first-request TLS
warm-up may be in these numbers.

**Also recommended, not taken:** disable the bucket's `pub-*.r2.dev` public development URL. It
still serves the same objects from a rate-limited origin nobody watches, and nothing in this
repository points at it any more (`docs/runbooks/imagery.md` §6).

**The founder's `.env.local` needs one edit.** `R2_PUBLIC_BASE_URL` still holds the old
`pub-*.r2.dev` value, and `pnpm media:upload` refuses to run — by design — while it disagrees with
`MEDIA_ORIGIN`, naming both values. Set it to `https://media.flowersoverseas.com`. No secret is
printed, committed or changed by any of this; `.env.example` carries the documented shape and a
placeholder, not the host.

**The two confirmations asked for.** The hero preload's `imageSrcSet` still points at the media
origin — `https://media.flowersoverseas.com/media/home-hero/{384,640,828,1080,1200}.avif`, read off
a rendered `/en`. CSP `img-src` is structurally unchanged — `img-src 'self' data: blob:
${MEDIA_ORIGIN};` in all five environments, asserted for each in
`tests/unit/media-origin.test.ts` and now in `tests/unit/media-headers.test.ts` too. Its *value*
moved with the origin constant, which is the domain change, not a policy change.

**The rest of the run, including what is red and not mine.**

- **`preview` is green for the first time on this branch** (PR #90 landed), so the browser gates
  ran on CI rather than only locally. **`a11y` green.** **`e2e` 1 040 passed, 2 failed** — both
  `tests/e2e/country-occasion.spec.ts:41`, which asserts `/en/occasions/mothers-day` 404s, while
  #88 (TASK-112) merged the occasion hubs that make it exist. Two merged PRs contradicting each
  other on `main`; the new `media-delivery` case for the preconnect header is among the 1 040.
- **`visual` is red**, as expected and not mine: 81 of 84 baselines are `darwin`-only and TASK-139
  owns the Linux set.
- **`test-unit` was red on the first re-fire** for `tests/unit/seed-media-manifest.test.ts`, which
  was `main`'s drift from TASK-144 (144 new prompt records, 31 manifest rows) and was fixed on
  `main` in `5d9c153` while this ran. Rebasing took it.
- **`lint` was red on the second re-fire** for `src/modules/catalog/listing.ts` — one stray blank
  line that arrived unformatted on `main` in `2f8bcbf` (TASK-112, #88). It is not this task's file,
  but `lint` is what `build`, `test-unit` and `lighthouse` all `need`, so **no pull request in this
  repository could reach a Lighthouse number while it stood**. Removed in its own commit
  (`chore(format)`, one deletion, `prettier --write` output and nothing else) and disclosed here
  and in the PR rather than folded into a feature commit.

**Gates run locally for this round:** `typecheck`, `lint`, `check:no-db`, `codebase:map --check`,
`format:check` — all clean; unit **195 passed** across the eight files that pin the origin, the
CSP, the env contract and the media components, plus `seed-media-manifest` 17 passed after the
rebase. The build slot was not taken: nothing in this round needed a local build, and CI is the
gate of record for every number above.

**Tests added this round:** 6 unit cases in `tests/unit/media-headers.test.ts` (the hint is the
constant; it carries no `crossorigin`; it is the origin `img-src` allows in all five environments;
the rule's shape; fresh objects per call; it is wired into the config) and 1 e2e case in
`tests/e2e/media-delivery.spec.ts` (the served document carries the hint, without `crossorigin`,
for the origin its images come from).

### Round 4 (2026-09-22) — the edge cache is on; LCP did not come down

**Asked:** produce the LCP number on CI now that Cloudflare caches the media origin, not tune for
it. **Answer: still over on all four locale documents, by more than before.** Nothing on the page
was changed; this round is a rebase, one comment fix and a measurement.

**Rebased onto `origin/main` `12dacd4`** (13 commits: TASK-114 #93, TASK-139 #95 and their docs).
Two conflicts, both in `next.config.ts`, resolved by keeping both sides: main's
`listingCacheHeaderRules()` import and rule (TASK-114) stay; this branch's removal of
`mediaCacheHeaderRules()` stays; this branch's `mediaHeaderRules()` — the credentialed
`Link: <MEDIA_ORIGIN>; rel=preconnect`, no `crossorigin` — sits before the listing rule. The two
rules set different keys (`Link` on every path, `Cache-Control` on the shop roots), so neither
overrides the other. `docs/codebase-map.md` conflicted once and was regenerated, not merged. Our
`chore(format)` commit dropped as already upstream (main's `7c49028`). One follow-up commit
(`d40e4cd`) points two main-side comments in `listing-cache-headers` at `mediaHeaderRules()`,
since the function they named no longer exists. **No baseline changed:** `visual` ran main's new
Linux set against R2-served images and passed 53/53, so nothing was re-snapped.

**Which image is the LCP, read off a rendered page.** CI's own `preview-build` artifact for
`d40e4cd`, served by `next start` locally (build slot held, own PID stopped): `/en`, `/pl`,
`/en-gb` and `/de` each preload the same object set —
`https://media.flowersoverseas.com/media/home-hero/{384,640,828,1080,1200}.avif`, `imageSizes="100vw"`,
and each response carries `Link: <https://media.flowersoverseas.com>; rel=preconnect`. At
Lighthouse's 412 px x 1.75 DPR (721 device px) the browser selects **`828.avif`** (31 593 B,
matching its manifest row).

**Cache evidence** (GET, three times each, 18:22 UTC, from colo `KHI` — the probing machine's PoP,
not the GitHub runner's):

| Object | #1 | #2 | #3 | `cache-control` |
|---|---|---|---|---|
| `home-hero/828.avif` (the LCP) | HIT, no `age` | HIT, age 37 295 | HIT, age 37 296 | `public, max-age=31536000, immutable` |
| `home-hero/384.avif` | HIT, no `age` | HIT, age 38 239 | HIT, age 38 240 | same |
| `home-hero/640.avif` | HIT, no `age` | HIT, age 38 265 | HIT, age 38 265 | same |
| `home-hero/1080.avif` | HIT, no `age` | HIT, age 38 112 | HIT, age 38 112 | same |
| `home-hero/1200.avif` | HIT, no `age` | HIT, age 38 277 | HIT, age 38 277 | same |

No `DYNAMIC`, `BYPASS` or `EXPIRED`. An `age` of ~37 000 s puts these entries in the PoP's cache
from about 08:00 UTC, i.e. just after round 3's run. The first request of each triple is a `HIT`
without an `age` header, reproducibly — recorded as seen, not explained. Whether the runner's PoP
was warm cannot be read from here (see the artefact note below).

**CI, run `35766301997`, head `d40e4cd`, fired by toggling `ci:full`.** Every job green except
`lighthouse`: commitlint, lint, typecheck, test-unit, test-integration, test-contract, audit,
i18n-check, dev-os-check, db-check, corridor-check, seo-validate, seed-check, catalogue-check,
env-build-failure, build, container, preview, **e2e 1 078 passed**, **visual 53 passed**,
**a11y 96 passed** — all success. `lighthouse` **failure**, on LCP only:

| URL | run 1 | run 2 | run 3 | median | asserted (fastest) | round 3 asserted | budget |
|---|---|---|---|---|---|---|---|
| `/en` | 2 738 | 3 005 | 2 118 | **2 738** | 2 118 | 2 036 | 2 000 |
| `/en-gb` | 2 133 | 2 136 | 2 147 | **2 136** | 2 133 | 2 039 | 2 000 |
| `/de` | 2 136 | 2 227 | 2 145 | **2 145** | 2 136 | 2 039 | 2 000 |
| `/pl` | 2 144 | 2 145 | 2 157 | **2 145** | 2 144 | 2 030 | 2 000 |

Runs are in LHCI's order. `lighthouserc.json`'s assertion is evaluated against the fastest run
(LHCI's default `optimistic` aggregation), which is why "asserted" and "median" differ. The other
eleven URLs pass; their representative-run LCP: `/` 1 380, `/en/send-flowers-to` 1 478,
`/en-gb/send-flowers-to` 1 313, both `/send-flowers-to/poland` 1 462, `/en/poland/flowers` 1 458,
`/en-gb/poland/flowers` 1 623, both `/poland/flowers/roses` 1 458-1 461, both
`/occasions/mothers-day` 1 475-1 478. Script transfer 128 211 B on every locale document (as in
round 3), CLS 0, performance 0.99 except `/en`'s representative run at 0.94.

**Is run 1 the slow one?** No. Three of the four documents are flat to within 25 ms (`/de` run 2 is
+90 ms), which is not the shape a cold-PoP `MISS` on the first run would leave. `/en` is the
outlier with runs 1 **and** 2 slow (2 738, 3 005) and run 3 at 2 118 — two slow runs, so not a
single first-fetch miss either. The flat three sit ~100 ms **above** round 3's numbers with the
edge now caching, so edge caching did not buy the 30-50 ms that was missing. One likely reason,
stated as an inference rather than a measurement: under `throttlingMethod: simulate` Lighthouse
charges the second origin's DNS/TCP/TLS at its modelled 150 ms RTT whatever the real edge does,
and a cache `HIT` only changes the observed server-latency input to that model.

**Per-run evidence the job cannot currently give, and why.** `Upload the Lighthouse reports`
uploads `.lighthouseci/` with `actions/upload-artifact@v4`, whose `include-hidden-files`
defaults to `false`; the directory is dot-named, so the step logs "No files were found with the
provided path: .lighthouseci/" on this run and on round 3's. The LHR JSON — which names the LCP
request, its timing and its response headers from the runner — has therefore never been uploaded.
The per-run values above come from the assertion log's `all values:` lines. Setting
`include-hidden-files: true` on that step would expose them; not done here (outside this task's
scope and not a gate change either way).

**Stopped here, as instructed.** No budget lowered, no URL removed from
`tests/fixtures/seo/lighthouse-urls.json`, no `continue-on-error`, nothing on the page tuned.
The merge stays gated on LCP.

**Gates run locally this round, exit codes read directly:** `typecheck` 0, `lint` 0,
`format:check` 0, `i18n:check` 0, `check:no-db` 0, `codebase:map --check` 0; unit 12 files /
244 tests passed (every file that reads `next.config.ts`, plus `media-origin`,
`seed-media-manifest`, `media-upload`, `ui-media`). The build slot was taken only to serve CI's
own build and read the preload off the page; no local build and no local Lighthouse.
`.env.local` untouched; `media:upload` not run.
