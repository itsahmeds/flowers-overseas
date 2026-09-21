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
- **2026-09-21 — the public origin is a `pub-*.r2.dev` host (founder, `open`).** Cloudflare
  rate-limits `r2.dev` and does not recommend it for production traffic, and it puts a
  third-party origin into CSP `img-src` against ADR-0016's preference for the shortest allowlist.
  Built against the configured value as instructed and reduced to **one** configuration point
  (`src/lib/media-origin.ts`, checked against `R2_PUBLIC_BASE_URL` by the upload script), so
  moving to `media.flowersoverseas.com` is one line here plus the Cloudflare custom-domain
  setup — **a founder action**.
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
