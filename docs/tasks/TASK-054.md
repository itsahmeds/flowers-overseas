# TASK-054 — Locale-home part 3 — the data-gated rows and the destinations grid: "Most sent this week" trending row (florists' picks, labelled, gated on real orders), the verified-reviews section (hidden until real reviews exist, Trustpilot slot), the destinations grid with live/guide status, the "Somewhere else?" waiting-list block, and the AC-14 link crawl

Row: `TASKS.md` → TASK-054. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-054-home-gated-rows-destinations`. Spec §13's 2026-09-08 resolution note is binding and overrides §5 defaults where they differ. Design source of truth (match pixel-for-pixel): `docs/design/homepage-v1/README.md`, `docs/design/homepage-v1/tokens.css`, `docs/design/homepage-v1/homepage-desktop.dc.html`, `docs/design/homepage-v1/homepage-mobile.dc.html`, `docs/design/homepage-v1/identity.dc.html`, `content/brand/mark.svg`. This task ships the three sections the founder's design gates on data that does not exist, and the gating **is** the deliverable: each reads a static JSON/config stub behind the same provider seam spec 003 used for the locale registry (`TrendingProvider`, `ReviewsProvider`, `DestinationStatusProvider` in `src/modules/ui/`, each with a `staticProvider` now and a spec-002-backed implementation later), so spec 002/008/016 swap the provider inside the module with **zero call-site change** and a fake provider in a test proves the populated branch renders. Rules per the canvas and Phase 0 AC 6: **Trending** renders the florists' picks with the verbatim label "Ranking is by real orders in the last 7 days and switches on once we have them; until then this row shows the florists' picks and says so" — and because 004 knows nothing about products and shows no price (§3), the cards are photo-slot + name + "starting at" **without a figure**, or the row degrades to named picks only; the reviewer decides which of the two is honest and records it. Prices, `Offer` data and the "Bouquets for Poland" product row of the canvas are **out of scope** (005/008/009) and must not be approximated. **Verified reviews** renders **nothing** in Phase 0 — the component exists, its populated branch is covered by a fake provider and the gallery, the Trustpilot slot is a named empty region, and the placeholder rows drawn on the canvas (`[Buyer first name] · sent to Warszawa · [date]`) must never reach a rendered page (AC-15 would fail, and TASK-053 owns that assertion). **Destinations grid**: PL `Delivering now` with its five city names as text, the six guide countries as `Guide · waiting list`, all from `countries.ts`, none of them a link while unpublished; the "Somewhere else?" block is copy only — no email input, because a waiting-list form is a new personal-data flow and a RoPA row (010/016 own it), and shipping an inert input would be a dark pattern. **AC-14 closes here**: an e2e crawl of every `<a href>` in the header, footer and home of all four locales plus `/` finds zero non-200 targets and zero unpublished `site-links.ts` ids; `robots.txt` still `Disallow: /`; localised documents still `noindex,nofollow` and `/` still `noindex,follow`. Photography is a placeholder until the founder supplies imagery: every `.photo` box in the canvas renders the `--color-photo` token gradient with its uppercase caption and **no `<img>`** (`plan/10` §3 honesty rule); the consolidated "photo slots" list is part of TASK-053's PR body. Tests: T-16, plus fake-provider tests for all three populated branches and their gallery states. Design round 7: "Meet the florists" REMOVED by the founder (we are the florists to the buyer; partners stay behind the scenes) — do not build it. Founder ruling 2026-09-08: reviews are real-only, never seeded — enforced by the AC-15 honesty gate.

## Read

- `specs/004-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `docs/design/homepage-v1/README.md`
- `docs/design/homepage-v1/tokens.css`
- `docs/design/homepage-v1/homepage-desktop.dc.html`
- `docs/design/homepage-v1/homepage-mobile.dc.html`
- `docs/design/homepage-v1/identity.dc.html`
- `content/brand/mark.svg`
- `src/modules/ui/`
- `plan/10`

## Carry-forwards

- **From `/review 40`:** `FinderTypeahead`'s `aria-describedby="destinations"` points at the whole section (~200 words on every focus) — point it at a purpose-written `sr-only` summary when this task inherits the id; the finder's `get` form submits the localised display name (`country=Poland`), not `iso2` — decide the contract with spec 007 before building on it.
- **From `/review 53` (TASK-053):** restore the artboard's 6-up desktop occasion grid (keep 2-up mobile) — the 3-up rendering leaves six ~430 px empty placeholder squares; ship the mobile hero caption variant ("Photography to supply · Warsaw florist, morning light").

- **From `/review 58` (2026-09-11, FAIL — round 1):** `home.trending.basis` must ship the artboard's sentence ("…until then this row shows **our florists' own** picks and says so.") rather than "the florists' picks" — the current string is attested `reviewedBy: founder` but is not the founder's wording and drops §14 A5's first person; re-draft `de`/`pl` and refresh the two trending baselines.
- **From `/review 58` (2026-09-11):** `home.destinations.elsewhere.body` is implementer-authored and must be `reviewed: false` in `messages/en.meta.json` (the deviation itself is endorsed; it needs the founder's tick, not the implementer's).
- **From `/review 58`, to TASK-056:** widen or document the AC-15 `FORBIDDEN` patterns (they do not fire on `home.reviews.heading`/`.attribution`/`.verified.*`); extend `check:no-db` to `src/modules/ui/home`; record an explicit honesty exemption for `/dev/components` when the axe/honesty URL set grows to eight surfaces.

## Escalations

None blocking. Two judgements are flagged for the reviewer's ruling rather than assumed (both in the
PR body): the trending card shape, and a four-key exception in the AC-15 catalogue grep for the
verified-reviews copy (`home.reviews.eyebrow/body/trustpilotRegion/trustpilotPending`), which is paid
for by three new assertions — every excused key is a `home.reviews.*` key, every one is genuinely a
forbidden shape, and the shipped provider is a constant empty list with no `src/config/reviews.*`
that could feed it.

## Result

In review. PR [PR 58](https://github.com/itsahmeds/flowers-overseas/pull/58).

Three provider seams in `src/modules/ui/home` — `trending-provider.ts`, `reviews-provider.ts`,
`destination-status-provider.ts` — each with a `staticProvider`, a module-internal `with*Provider()`
injection hook (not exported from the barrel, spec 003's rule) and an optional `provider` prop the
gallery reaches the populated branch through.

- **Trending**: photo slot + name and **no price element at all** — a "starting at" with no figure is
  a price block with a hole in it, and spec 004 §3/§8 permits neither form. The founder's label ships
  verbatim (plus its closing full stop) and disappears when `basis()` answers `orders`. The five names
  are read from spec 005's committed catalogue through `src/config/trending.ts`, so 004 gains no
  product knowledge and nothing is invented; emptying `TRENDING_PICKS` hides the row with no code
  change if the reviewer rules the claim unsupportable.
- **Reviews**: renders nothing, and no data can change that (the provider is a constant empty list,
  not a config file). Populated branch covered by a fake provider and `/dev/components`.
- **Destinations**: `DestinationsGrid` replaced `DestinationList` at the `destinations` id; PL with
  its five cities, six guides as `Guide · waiting list`, none a link, "Somewhere else?" copy only.

AC-14 closed by `tests/e2e/links.spec.ts` (T-16). Carry-forwards closed: 6-up desktop occasion grid
with `MEDIA_SLOT_SPECS.tile` moved to `(min-width: 768px) 17vw, 50vw`, and the mobile hero caption.
`FinderTypeahead` left as it is; the open display-name-vs-`iso2` contract for spec 007 is recorded in
the PR body. Copy deviations (the "Somewhere else?" body, the destinations body) are in the PR body
and in `messages/en.meta.json`'s `reviewedBy`.

Gates: `test` 3 017/139, `test:e2e` 578, `test:a11y` 49, `test:visual` 24 (4 new darwin baselines,
`linux/` untouched), `i18n:check`/`check-layout`/`check:no-db`/`seo:validate`/cold `build` clean,
client JS 121.4 KB br on locale documents (**0 bytes added by this branch**; the +1.9 KB against the
last recorded figure arrived with TASK-055). `pnpm lighthouse` still fails informationally on the two
pre-existing §14 A1 items (uncompressed script size against a Brotli assertion, LCP on a loaded
machine); TASK-056 owns the flip.

### Round 2 (`/review 58` fixes, 2026-09-11)

- `home.trending.basis` now ships the desktop artboard's sentence verbatim ("…until then this row
  shows our florists' own picks and says so."), first person per spec 004 §14 A5, so the key's
  `reviewedBy: founder (artboards, round 2)` attestation is accurate. `de`/`pl` re-drafted with
  `pnpm i18n:draft` (machine, unreviewed); the two darwin trending baselines refreshed.
- `home.destinations.elsewhere.body` is `reviewed: false` with no `reviewedBy`/`reviewedAt`: it is
  implementer-authored and only the founder attests English copy. The rationale the meta field used
  to carry lives here — the artboard's "Tell us where you need us next" invites an action with no
  channel behind it (a waiting-list capture is a new personal-data flow owned by specs 010/016), so
  the cell states what is true instead of asking. It waits in the founder's queue.
- That queue is now pinned key-exact in `tests/unit/i18n-messages-schema.test.ts` (the only
  unreviewed `en` key) and the three share assertions that read `unreviewedShare("en") === 0`
  (`i18n-review`, `home-honesty`, the `i18n:check --summary` table) now assert the AC-24 answer
  itself: below the 5 % threshold, `isLocaleIndexable("en"/"en-gb")` still `true`, `de`/`pl` still
  `false`. Recomputed share: 1/337 = 0.3 %.
- Gates re-run at round 2: `lint`, `typecheck`, `format:check`, `i18n:check`, `tasks:check` clean;
  `test` 3 093/143; `test:visual` 24; `tests/e2e/{home,honesty}.spec.ts` 146.
