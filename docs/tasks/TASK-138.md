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
4. `COMMITTED_MEDIA_BYTE_CAP` stops governing shipped imagery. Say in `## Result` what now
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

_None yet._

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
   image.
3. **The upload refuses.** `scripts/media-upload.ts` will not send a byte unless `checkVariants()`
   is clean, every file is inside its slot's cap, no file carries the demo watermark (the AC-16
   invariant moved here from the committed tree, where it can no longer run) and
   `R2_PUBLIC_BASE_URL` equals `MEDIA_ORIGIN`.
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
images to a remote origin made two visual specs genuinely flaky — a baseline passed on one run and
failed on the next with the photograph missing — so the visual specs now scroll the page and wait
for `decode()`, bounded at 5 s. (b) `tests/visual/__screenshots__/visual/darwin/country-shop-*.png`
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
