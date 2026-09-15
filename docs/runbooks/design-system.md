# Runbook — the design system: tokens, components, baselines and budgets

| Field | Value |
|---|---|
| Severity | not an incident: this is the routine procedure for every pixel on the site |
| Detect | a red `lint` on a raw colour or a physical property; a red contrast test; a red `visual` job; a red `lighthouse` or `budget:client-js`; "where do I put this component?" |
| Owner | founder (design decisions, on the canvas), implementer (everything below) |
| Last tested | 2026-09-15 (spec 004, TASK-056) |

Spec 004 is the contract behind every step; `docs/design/` is the **design source of truth**
(CLAUDE.md, spec 004 §14 A3) and `src/modules/ui` is its implementation. Nothing here needs a
database (`pnpm check:no-db` covers the whole module).

## 0. The five-second model

- **Drawings first.** `docs/design/homepage-v1/*.dc.html` are the approved artboards, drawn at
  **390 px** and **1440 px**. A page is built to match them pixel for pixel; where a spec sentence
  and an artboard disagree, the spec wins and the difference is recorded in the PR body (see
  `docs/design/README.md`).
- **Tokens, not values.** Every colour, space, radius, type step and z-layer is a token in the one
  `@theme` block of `src/app/globals.css`. `fo/no-raw-color` fails a hex, `rgb()`, `hsl()` or an
  arbitrary-value colour utility in a component; Stylelint and `fo/no-physical-css` fail `ml-`,
  `left-`, `padding-left` and friends everywhere.
- **Components live in `src/modules/ui`** and are reached through its barrel. `app/` stays thin:
  if a decision can be made inside the module (which ratio a slot reserves, whether a destination
  is a link, where `Continue` goes), it is made there.
- **Every state is visible at `/dev/components`**, which exists only where `ENABLE_DEV_UI=true`
  and which the env schema refuses in production.
- **Four gates hold it together**: `pnpm lint`, the contrast test, the visual baselines and the two
  budgets (`pnpm budget:client-js`, `pnpm lighthouse`). All four are required checks.

## 1. Add or change a token

1. Edit the `@theme` block in `src/app/globals.css`. Semantic names only (`--color-ink-muted`,
   not `--color-grey-600`): a palette swap must be one block and zero component edits.
2. Add every new foreground/background pair to `src/modules/ui/tokens/contrast.ts` with the
   threshold it must meet — 4.5:1 body text, 3:1 large text, 3:1 a UI boundary or focus ring.
   `tests/unit/contrast.test.ts` computes the ratio **from the token values themselves**, so a
   token edited to a failing value fails the test with the pair named, and a pair that is rendered
   but absent from the manifest fails it too.
3. Add the ramp to `/dev/components` if it is a new family, so the gallery keeps showing everything.
4. `pnpm test` (contrast, tokens), then §4 — a token change moves pixels, so baselines move.

## 2. Add a component

1. Draw it, or find it, in `docs/design/`. No component is built from a description alone.
2. Put it under `src/modules/ui/<area>/` (`primitives/`, `layout/`, `home/`, `consent/`, `icons/`,
   `media/`) and export it from the module barrel. Server Component unless it needs state; a client
   island takes **strings as props** and imports neither the translator nor a config registry
   (spec 004 §14 A1 addendum — that is what keeps a locale document inside the script budget).
3. No literal user-facing string (`fo/no-literal-strings`): the copy is a message key, and the
   catalogue gate proves it resolves (`docs/runbooks/i18n-translations.md`).
4. Give it a `data-fo-*` attribute. Every suite selects on those, never on copy — and
   `pnpm budget:client-js` uses the same attribute to prove `/` ships no application markup.
5. Render **every state** in `/dev/components`: default, hover/focus, disabled, invalid, empty,
   populated. The gallery is the only surface where axe and the visual suite see the states no
   Phase-0 page reaches.
6. `<bdi>` around any value whose direction is the data's and not the document's (a name, a town, a
   currency amount in a sentence), and `@utility mirror-in-rtl` on a **direction-carrying** icon —
   an arrow, a chevron. Never on the wordmark, the mark or a check: `MIRRORED_IN_RTL` is the list,
   and `/ar-XB` is where it is asserted.

## 3. Read the bundle table

`pnpm build && pnpm budget:client-js` prints spec 004 §11's table: per route, the Brotli
first-load JS, the `next/dynamic` chunks the route actually fetches, the delta against
`tests/fixtures/seo/bundle-baseline.json`, and the font transfer.

- **128 KB Brotli** per public route (`plan/01` §7 as restated by spec 004 §13 Q13 and corrected by
  §14 A1). About 97% of it is Next's own runtime; the application's share is a few KB, so the
  headroom is not yours to spend.
- **5 KB** is the most any route may grow against the committed baseline. When the growth is
  intended, re-run with `--update-baseline`, commit the diff and **name the import in the PR**.
- **`/` ships zero application JavaScript** and no `next/dynamic` chunk. The check reads chunk
  *contents* for `data-fo-*` markup, because a module name in a loader stub proves nothing.
- **No `zod` and no `@sentry/`** in any public route's client bundle, and no `home.*`/`finder.*`/
  `catalog.*`/`media.*` catalogue copy in any fetched chunk.
- **≤45 KB of fonts** per page, from `src/modules/ui/fonts/subset.json`. Changing the repertoire or
  a face is `pnpm fonts:build` (network, by hand, never in CI) plus a committed diff.

If a number moved and you do not know why, read the per-chunk breakdown the same command prints
below the table: it names every chunk, its encoding sizes, and the Client Components the document
mounts.

## 4. Update a visual baseline

1. Build and serve what you are about to photograph: `pnpm build && pnpm start`.
2. `pnpm test:visual --update-snapshots`, then **run it again without the flag**. A baseline that
   only passes the run that wrote it is a baseline of a mid-load frame.
3. Commit the `darwin/` PNGs. `linux/` baselines are written by the CI `visual` job, which uploads
   `tests/visual/__screenshots__/` in its failure artifact: push, let the job write the missing
   files, download them, commit them. CI never passes `--update-snapshots`, so a missing or changed
   baseline still fails the job.
4. In the PR, say **why** each baseline moved. "Re-baselined" is not a reason; "the dates band grew
   9 px because the token changed" is.
5. Every full-page baseline waits for `networkidle`, `document.fonts.ready` and two animation
   frames before the shutter (`settle()`), and seeds a consent refusal plus an empty
   `navigator.languages`, so the PNG records the template rather than the runner's language
   configuration or how fast a chunk arrived.

## 5. Read a red Lighthouse job

`pnpm lighthouse` is required on `/`, `/en`, `/en-gb`, `/de`, `/pl`. Reproduce it locally in three
shells — `pnpm build && pnpm start`, `pnpm lighthouse:origin`, then
`LHCI_BASE_URL=http://127.0.0.1:3001 pnpm lighthouse` — because the budget is **Brotli transfer**
and `next start` alone serves gzip (~24 KB more on a locale document, which is more than the
headroom).

- **`resource-summary:script:size`** — read §3 first; it is the same bytes, plus response headers.
  `transferSize` counts headers, so run against the proxy and not against `next start` directly:
  the proxy serves a subresource with only the headers that are not inert on it, because repeating
  the 774 B of document-only headers on every chunk over HTTP/1.1 charges a locale document
  13 180 B that no HTTP/2 edge sends.
- **Warm the origin first.** A cold `next start` reported LCP 2 679 ms on its first request against
  ~1 480 ms on the next two. The CI job curls every URL once before measuring; do the same locally
  before believing a number.
- **`largest-contentful-paint`** — check *which element* it is (`largest-contentful-paint-element`
  in the report). The islands paint after hydration, so if an overlay's text block ever becomes the
  largest element in the viewport the number jumps by ~1.3 s without the page getting slower.
  `tests/e2e/lcp.spec.ts` guards that and names the candidate that won.
- **`categories:best-practices`** — a single console error costs 1 of 28 weighted points, i.e. the
  0.95 threshold. A 404 for `/favicon.ico` was one of them; `public/icon.svg` and the root layout's
  `metadata.icons` are the fix.
- **`categories:seo` is deliberately not asserted** while every page is `noindex` (ADR-0007), so
  nobody can make a number green by indexing early. Spec 007 turns it on.

## 6. What is not in the system yet

Form controls (spec 010/013), the price block (005/008/009), dark mode (token-ready only, §13 Q3)
and the compact `EN · EUR` currency menu (spec 008). Do not invent them here: add them with the
spec that needs them, artboards first.
