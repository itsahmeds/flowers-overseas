# TASK-119 — Language popup and no chooser page: `/` answers one unconditional 308 to `/en`, the `(chooser)` route is deleted, and the popup ("Choose your preferred language", four native names, English the default, the hint only highlights, closable by a large button, `Esc` or a tap outside, remembered by `fo_locale`, a mobile top sheet ≤ 260 px over a scrollable page and a centred card on desktop, before the consent sheet) replaces the slide-in strip

Row: `TASKS.md` → TASK-119. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-119`; keep it current by editing this file, not the row.

## Binding

- **The country hint is decided: browser language only.** The founder answered A16 clause 2's open item on 2026-10-05, in chat: "browser language only". A16 now states that variant alone. Dispatch no longer waits on the founder; it waits only on the design (below).
- **Spec 003 §14 A16 and §14 A14 together are the whole task.** A14's Shape bullet "as amended by A16" is the binding popup text. Read both verbatim. This is **one feature**: the 308, the chooser's deletion and the popup ship in one PR on branch `task/TASK-119-locale-suggestion-popup`.
- **ACs owned:**
  - spec 003: AC-7, AC-12, AC-25, AC-27 (the `/` clause), AC-28 and AC-30, all as A16 clause 6 restates them. AC-9 is re-asserted (A14);
  - spec 004 §14 A23: **AC-38** for L1, L3, L4, L5 and L6, and **AC-39** (the popup's look).
- **Tests owned:** spec 003 T-05, T-07, T-12, T-25, T-27, T-28 and T-30, as A16 clause 6 restates them; spec 004 T-40 (the L ids) and T-41.
- **Unchanged:** AC-6, AC-8, AC-11 and AC-14. Do not edit their tests except to remove a `/` case.
- **The redirect (A16 clause 1).**
  - `GET /` and `HEAD /` answer **308** with `Location: /en`.
  - It is one rule in `next.config.ts` `redirects()`, produced by one function in `src/lib/`.
  - The rule has `source: "/"` and `permanent: true`. Its destination comes from the registry's x-default through `localePath()`, never a literal.
  - It has **no `has` and no `missing`**. It is not in `src/proxy.ts` and not a Cloudflare rule.
  - `fo_locale` is not read at `/` and never becomes a redirect condition (A16's recommendation, accepted with the ruling).
- **ADR-0006 is unchanged.**
  - The only redirect is the same for every request. It depends on no IP, country header, cookie, `Accept-Language` or user agent.
  - There is no bot branch, and no `Vary` on `Cookie` or `Accept-Language`.
  - Every locale stays a crawlable URL, and the URL stays authoritative.
  - The popup reads no IP and no country header, and calls no `/api/geo`. `hints.ts` reads no country header for the popup. If `/api/geo` or a country → locale table for the popup exists on `main`, remove it (A16 clause 2).
- **The chooser is deleted** (A16 clause 1 lists every item):
  - `src/app/(chooser)/`;
  - the `chooser.*` keys and meta entries;
  - the `"chooser"` route kind in `src/modules/i18n/messages.ts`;
  - the `localeChooser` page type in `src/modules/seo/indexability.ts`, with its T-10 cases;
  - every comment that cites the chooser;
  - the `docs/architecture.md` §2 rows for `(chooser)`.
- **The popup**, per A14's amended Shape:
  - **When:** it opens after hydration on any localised page while there is no valid `fo_locale`, whatever the hint says.
  - **Content:** the heading "Choose your preferred language" in the page's language, and the four `nativeName`s with `lang`, in registry order, each a real `<a>` to the same path. English carries a default mark.
  - **Hint:** `navigator.languages` and nothing else. It **only highlights** an option. It never navigates, never sets the cookie and never reorders the list. The popup makes no request to `/api/geo`.
  - **Closing:** a close button of at least 44 × 44 CSS px, `Esc`, or a tap outside. Closing sets `fo_locale` to the page's locale without navigating. Choosing an option sets `fo_locale` to that locale and follows its link. The popup never shows again after either.
  - **Desktop:** a centred card over a dimmed page.
  - **Mobile:** a **top sheet**, never a bottom sheet. Its top edge is at y 0 and it is ≤ 260 CSS px tall (spec 004 §14 A23 AC-39). Anything taller scrolls inside the sheet. At 390 × 844 it does not overlap the `SentencePicker` card.
  - **Scroll:** the page under it is not scroll-locked (no `overflow: hidden` on `html` or `body`). Content below the sheet stays reachable by scrolling.
  - **Once:** one tap on the close button, one `Esc` or one tap outside dismisses it, and it never opens again.
  - **Layout:** zero CLS.
  - **Order:** it opens before the consent sheet and never stacks on it.
  - **Dialog:** a modal native `<dialog>` with `aria-labelledby`. Focus moves in on open and is restored on close. Neither mark relies on colour alone.
  - **The strip goes:** `LocaleSuggestionBanner*`, its copy, and the `fo_locale_suggestion_dismissed` `sessionStorage` key.
  - **Budget:** lazy-imported, +≤ 3 KB Brotli, measured against the committed baseline.
- **A16's two Readings** (clause 2) are built as written unless the founder overrules them:
  - Reading 1: on a non-English page, the page's own locale is marked current and English keeps the default mark.
  - Reading 2: the popup opens on any localised page.
- **No country table.** There is no country → locale table and no `/api/geo` for the popup, and the hint function takes no country input. It returns one launch code or none, and its return type has no URL field and no navigation field.
- **SEO (A16 clause 3):**
  - `/` is in no sitemap;
  - `alternatesFor()` output is byte-identical before and after;
  - no locale home or 404 renders `href="/"`;
  - `tests/fixtures/seo/lighthouse-urls.json` and `lighthouserc.json` drop `/`.
- **Copy (A16 clause 4; spec 004 §14 A23 clause 6).** Native names are never translated. The founder approved these English strings verbatim on 2026-10-04 ("go, approve copy…"):
  - L1, the heading: "Choose your preferred language";
  - L3, the current mark: "Current";
  - L4, the browser-match mark: "Matches your browser" (desktop) and "Your browser" (390);
  - L5, the close button's accessible name: "Close";
  - L6, the foot: "You can change it any time at the top of every page."

  Still pending founder approval: the English option's **default mark** (its visible label, and its accessible label if that differs). Send it with any other new English string as one exact-text batch. L2 (the German and Polish sub-lines) is **not** approved and waits for native review. Ship every key `reviewed: false`; the founder attests with their own `record-approval.py` run, and no agent sets `reviewed: true`.
- **Compliance (A16 clause 5):**
  - The popup processes no personal data, so `docs/compliance/ropa.md` gains nothing. If a RoPA row for A14's IP-derived country exists, remove it in this PR.
  - `docs/compliance/cookie-register.md` drops `fo_locale_suggestion_dismissed`. Its `fo_locale` row says the cookie is set on choosing or closing the popup.
- **Design first.** `/design` on A16 delivers the artboards before the component:
  - the popup in `docs/design/system/components.dc.html`: the desktop card; the mobile top sheet over the home hero at 360 × 640 and 390 × 844; the default, hint-highlighted and RTL states. `docs/design/wireframes/locale-popup-{mobile,desktop}.dc.html` on `docs/design-sweep-2026-10-04` already draw the 390 top sheet and the desktop card (audit R10). The 360 × 640 artboard is still to be drawn;
  - the updated `docs/design/flows/consent-and-locale.dc.html`;
  - `docs/design/wireframes/locale-chooser-{desktop,mobile}.dc.html` and their `canvas.json` entries, retired.

  Build to them pixel for pixel. If the artboards are not on `main`, stop and escalate; do not build from this description. The look is also bound by spec 004 §14 A23 AC-39: a centred native `<dialog>` card at 1440 × 900, a top sheet at 390 × 844 (top edge at y 0, ≤ 260 px tall), never on screen with the consent sheet, four real `<a>`s with `lang` and `hreflang`.
- **PR class:** not review-only, because it touches a redirect, sitemaps, indexability and a cookie. It needs `/review` **and** `/break`.
- **Not this task:** the orchestrator adds the pointers in other specs' §14 (A16 clause 7) and the plan edits. This task changes the tests those specs own wherever they assert `/`.
- **Rulings:**
  - the founder, 2026-09-16: "this should be a popup";
  - the founder, 2026-10-04: A16, quoted in full in the decisions log.

## Files

These are expected, not exhaustive: `grep -rn chooser` at dispatch is the authority. Every file below names the chooser, the strip or `/` today.

- **Change:**
  - `next.config.ts` (`redirects`), plus one new rule builder in `src/lib/`;
  - `src/modules/i18n/hints.ts`;
  - `src/modules/i18n/ui/` (the new popup component and loader; `LocaleSuggestionBanner.tsx`, `LocaleSuggestionBannerIsland.tsx`, `LocaleSuggestionBannerLoader.tsx`, `suggestionCopy.ts` and `suggestionTypes.ts` are removed or replaced);
  - `src/app/[locale]/layout.tsx` (the wiring and the consent order);
  - `src/modules/ui/consent/ConsentBanner.tsx` (it waits for the popup);
  - `/api/geo` and any country → locale table for the popup: removed if they exist, never built;
  - `src/modules/i18n/messages.ts`, `registry.ts`, `request.ts` and `routing.ts`;
  - `src/modules/seo/indexability.ts`;
  - `src/app/layout.tsx`, `src/app/not-found.tsx`, `src/app/global-error.tsx`, `src/app/[locale]/error.tsx` and `src/app/(dev)/` (comments only);
  - `src/modules/ui/layout/noticeShell.ts`, `NoticeDocument.tsx` and `src/modules/ui/primitives/a11y.tsx`;
  - `messages/*.json` and `messages/*.meta.json`.
- **Delete:** `src/app/(chooser)/`.
- **Scripts:** `scripts/client-js-budget.ts`, `scripts/seo/generate-sitemap-fixtures.ts`, `scripts/check-no-db-imports.ts`.
- **Docs:**
  - `docs/compliance/cookie-register.md`, and `docs/compliance/ropa.md` only to remove an A14 country row if one exists;
  - `docs/architecture.md` §2;
  - `README.md`, where it names the chooser;
  - `docs/codebase-map.md`, regenerated with `pnpm codebase:map` and never hand-edited.

## Tests

The binding list is A16 clause 6. Each case names its layer and must go red when its subject is removed. The breaker runs the mutations that clause lists.

- **Unit:**
  - a new test for the root rule deep-equals `redirects()` to the single rule `{ source: "/", destination: "/en", permanent: true }`, with no `has` and no `missing`. Asserting that one value is what makes an added condition fail;
  - the hint function's table over languages only (the signature has no country input): one launch code or none, and no navigation field;
  - spec 004 T-40 for L1 and L3–L6: each `en` value equals its approved literal, `reviewed: false`;
  - updates to `tests/unit/seo-indexability.test.ts` (no `localeChooser`), `i18n-messages.test.ts`, `i18n-messages-schema.test.ts`, `client-js-budget.test.ts`, `lighthouse-budgets.test.ts`, `app-shell.test.tsx`, `module-boundaries.test.ts`, `architecture-doc.test.ts`, `no-db-imports.test.ts`, `ui-notice-shell.test.ts` and `sitemap-fixtures.test.ts`.
- **Integration:**
  - `tests/integration/sitemap.test.ts`: no built sitemap lists the bare origin;
  - T-05: the popup's list shows five options with the five-locale fake registry.
- **e2e, T-07:** `GET /` and `HEAD /` in five variants (plain, `fo_locale=de`, `Accept-Language: de-DE,de;q=0.9`, `cf-ipcountry: PL`, a Googlebot UA). Each variant asserts:
  - status **308** exactly, not 3xx;
  - a `Location` that resolves to `/en`;
  - zero `Set-Cookie`;
  - a `Vary` that is absent or names neither `Cookie` nor `Accept-Language`.

  The case also asserts no `(chooser)` route, no `chooser` key, and no `href="/"` on the locale homes or the 404. Rework `tests/e2e/shell.spec.ts`, `seo-indexability.spec.ts`, `security-headers.spec.ts`, `links.spec.ts`, `notices.spec.ts`, `client-js-budget.spec.ts`, `chrome-honesty.spec.ts` and `shop-reachability.spec.ts` wherever they assert `/`.
- **e2e, T-28 and T-12:** the popup matrix (a)–(h) replaces `tests/e2e/banner.spec.ts`. `consent-banner.spec.ts` asserts the order. The matrix covers:
  - open: heading, four native names, default mark;
  - the hint highlights Deutsch and nothing navigates: the URL stays `/en` and no main-frame `framenavigated` fires. With `cf-ipcountry: PL` and `["en-US"]`, Polski carries no mark and no request goes to `/api/geo`;
  - close by the button, by `Esc` and by a tap outside: each sets `fo_locale=en`, and after a reload the popup does not open;
  - choosing Deutsch goes to `/de` with `fo_locale=de`;
  - a valid cookie means the popup never renders;
  - the consent sheet is never visible while the popup is open;
  - at 360 × 640 and 390 × 844 the popup is a top sheet: its top edge is at y 0 and it is ≤ 260 px tall. At 390 × 844 it does not intersect the sentence card. With it open, a scroll over the page increases `window.scrollY` while the sheet stays at y 0. At 1280 × 800 it is a centred card, within 2 px on each axis;
  - CLS is 0 at every size;
  - the close button is ≥ 44 × 44 CSS px;
  - the cookie attributes, and a forged `fo_locale=zz` that opens the popup and is rewritten on the next act.
- **e2e, spec 004 T-41:** AC-39's boxes at 1440 × 900 and 390 × 844, never co-visible with the consent sheet, four `<a lang hreflang>`, L1 and L3–L6 text. It may live in the T-28 file. Red with the 390 sheet anchored at the bottom.
- **a11y, T-25:** `tests/a11y/shell.spec.ts` drops `/` and adds `/en` with the popup open at 360 × 640 and 1280 × 800, with zero serious/critical violations.
- **Visual, T-30:** `tests/visual/shell.spec.ts` and `notices.spec.ts` drop `/` and delete its baselines and manifest entries. They add the popup open on `/en` at desktop and mobile widths, and on `/ar-XB`. Baselines come from the CI `visual-baselines` workflow for `linux/`.
- **Performance, T-27:** `/` leaves the Lighthouse URL set and `pnpm budget:client-js`. The popup's delta, measured and reported in `## Result`, is ≤ 3 KB Brotli.

## Read

- `specs/003-i18n-foundation.md`: `## 0. Index`; §14 A16 and A14 in full; A8, A9 and A12; §13 Q4; AC-7, AC-9, AC-12, AC-25, AC-27, AC-28 and AC-30 with their T rows.
- `specs/004-design-system-layout.md`: §14 A23 clause 1 (the popup row), clause 6 (L1–L6), AC-38 and AC-39 with T-40 and T-41.
- `docs/adr/ADR-0006-no-ip-redirects.md`.
- `docs/codebase-map.md`, for the entries under `src/modules/i18n/` and `src/modules/seo/indexability.ts`, the `next.config.ts` rule builders in `src/lib/` (`listing-rewrites.ts` is the pattern), the consent island (spec 004, TASK-051), `HomeHero.tsx` and `SentencePicker.tsx`.
- `docs/design/system/components.dc.html`, `docs/design/flows/consent-and-locale.dc.html` and `docs/design/README.md` (the authoring rules).

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From the design sweep (2026-10-04, PR 185; spec 004 §14 A23), rewritten 2026-10-05 against
  spec 003 §14 A16 (merged in PR 186):**
  - The Binding above is A16's, and A16 is the spec: no chooser page, `/` answers one 308 to
    `/en`, the closable popup is the only chooser, a centred card on desktop and a top sheet on
    mobile, and the highlight uses the browser language only (A16 clause 2, resolved 2026-10-05).
  - Spec 004 §14 A23 adds two things this task owns: AC-38 for L1 and L3–L6 (T-40) and AC-39
    (T-41). Both are in the Binding above. The look is bound by A23 clause 1 to
    `wireframes/locale-popup-{desktop,mobile}.dc.html`.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-05, to the founder, answered:** the IP/country hint (A16 clause 2). Answer, in chat: "browser language only". Drop: no `/api/geo`, no country table, no RoPA row. A16 now states that variant alone, and dispatch is no longer blocked on it.
- **2026-10-05, to the founder, open and non-blocking:** the mobile shape. The spec says top sheet, because no bottom sheet can meet the size limits (A16 Status; audit R10 drew both). A one-word overrule changes the spec first.
- **2026-10-05, to the founder, answered:** the English option's visible "Default" mark (A16 clause 4). Answer, in chat (relayed by the orchestrator): "3 yes", approving `languagePopup.default` = "Default" verbatim. It still ships `reviewed: false`; only the founder's own `record-approval` run sets `reviewed`.
- **2026-10-05, to the orchestrator and the founder, answered (founder's `record-approval-119.py`, commit `ec3e4ffb`; `en` back to 21/535, 3.9 %):** `en`'s unreviewed share. The seven `languagePopup.*` keys ship `reviewed: false` as the Binding requires, and the deleted `chooser.*`/`banner.*` keys were reviewed, so `en` goes from 22/537 (4.1 %) to 28/536 (5.2 %), above the 5 % gate of spec 003 §2 / AC-24. `isLocaleIndexable("en")` turns `false`, `alternatesFor()` returns `[]` (A7) and the sitemaps empty, which breaks A16 clause 3's "byte-identical" and goes red in `tests/unit/i18n-review.test.ts` ("the founder's warning light") and the suites derived from it. Not routed around: no key is reused or merged to dodge the count. The fix the process already defines is the founder's own `record-approval` run for the six founder-approved strings (L1 `heading`, L3 `current`, L4 `browserMatch` and `browserMatchShort`, L5 `close`, L6 `foot`; and `default` now too), which brings `en` back to 21/536 (3.9 %). A script in the shape of `.claude/state/record-approval-193.py`, pointed at `/Users/ahmed/dev/fo-wt-119b`, is the orchestrator's to write. Locally, a simulated attestation (never committed) leaves every one of those suites green. The same run moves the sitemap fixtures' `<lastmod>` (it follows the newest `reviewedAt`), so the attestation commit needs `UPDATE_SEO_FIXTURES=1 pnpm test tests/unit/sitemap-fixtures.test.ts` beside it.
- **2026-10-04, to the founder, open and non-blocking:** A16 clause 2's two Readings. Reading 1: on a non-English page the page's own locale is marked current and English keeps the default mark. Reading 2: the popup opens on any localised page. Build as written. A one-word overrule changes the spec first, then this task.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-05: work moved to branch `task/TASK-119-language-popup` (worktree `fo-wt-119b`, from `origin/main` 22a2d110), replacing `task/TASK-119-locale-suggestion-popup` / PR 86; this overrides the Binding's branch line. Draft PR 205.
- 2026-10-05: step 1 pushed (`fde7b267`): `src/lib/root-redirect.ts` and `redirects()`, the `(chooser)` deletion (route group, keys, route kind, page type), the popup (server half, loader with the consent gate, island), the consent island's wait, unit tests (root redirect deep-equal on the real `next.config.ts`, T-40 literals, markup, hint table, T-05). Next: scripts and fixtures that list `/`, the remaining unit suites, e2e/a11y/visual, docs. Blocked for merge on the 5 % escalation below.
- 2026-10-05: step 2: `/` out of the client-JS budget (the zero-app-JS check withdrawn), the Lighthouse set, the bundle baseline and `noindex.json`; the strip's `sessionStorage` key out of `src/config/cookies.ts`, the catalogues and the cookie register; chooser comments and the dead `NOTICE_LOCALE_*` classes gone; `docs/architecture.md` §2 and README. Next: e2e (root redirect, popup matrix), a11y, visual, then the budget measurement in the build slot.
- 2026-10-05: step 3: browser suites (`root-redirect.spec.ts`, `language-popup.spec.ts`, the consent order, the `/` cases of eleven e2e files, a11y with the popup open, visual popup baselines at 390/1440 and `/ar-XB`, the bare-origin integration case); every browser suite now starts as a returning visitor (`tests/support/locale-choice.ts`). Rebased on `origin/main` 9bc90368 (conflict in `next.config.ts` kept both sides: TASK-058's `cacheHandler` and the `redirects()` rule; `docs/codebase-map.md` regenerated). PR 205 ready with `ci:full` and `visual:baselines`. No local build: load average 23, and CI's `build` job prints `budget:client-js`, so the delta is read from CI on the head SHA.
- 2026-10-05: step 4, after the founder's `ec3e4ffb`: `en` 21/535 (3.9 %); the two pins assert the attestation; sitemap fixtures regenerated; popup options link to the same page in each locale (`LanguageAlternates`, unit + e2e); rebased on `origin/main` (baseline manifest taken from main minus the five retired entries; the brief's lost sections restored).
- 2026-10-05: `/break 205` round 1 holes: (1) `tests/unit/no-suggestion-dismissal.test.ts` scans `src/` for the key and any `sessionStorage` write; (2) `tests/unit/locale-gate.test.ts` drives the popup's writer and the consent sheet's new reader (`src/modules/ui/consent/localeGateReader.ts`) against one document; (3) the gate is now pending from the first byte (the layout renders `localeGateDocumentAttributes()` on `<html>`, asserted in `app-shell`), and e2e (f) samples every frame and waits past the 4 s fail-open timer. Each unit case was red under its mutation; the e2e hold-drop mutation is checked in CI, not locally (the build slot was held by another owner).

## Result

**What shipped (PR 205).**
- **The redirect.** `/` answers one unconditional 308 to `/en`: one `redirects()` rule from `src/lib/root-redirect.ts`, with no `has` and no `missing`.
- **The chooser is deleted:** the route group, `chooser.*`, the route kind, `localeChooser`, the comments and the architecture §2 rows.
- **The popup replaces the strip.** It is a modal native `<dialog>`: a top sheet below `md` and a 620 px centred card from `md`. The hint reads `navigator.languages` only. The close button, `Esc` and a tap outside all set `fo_locale`. The consent sheet waits for it through a gate on `<html>`.
- **Cookie register.** `fo_locale_suggestion_dismissed` is gone from the register, the catalogues and `cookies.ts`.
- **Measured sets.** `/` is out of the client-JS budget, the Lighthouse set and `noindex.json`.

**Tests by layer.**
- **Unit:** `root-redirect` (6, deep-equal on the real `next.config.ts`; red with a `has` cookie condition, checked), `i18n-language-popup` (27), the `popupHint` table and `decideLanguagePopup` matrix in `i18n-hints`, and T-05 in `app-shell`. Fourteen other suites were updated.
- **Integration:** `sitemap.test.ts` gains the bare-origin case.
- **e2e:** `root-redirect.spec.ts` (GET and HEAD × 5 variants, query pass-through, no `href="/"`), `language-popup.spec.ts` (AC-28 (a)–(h), T-12, T-41), the consent order, and the `/` cases of eleven files.
- **a11y:** `/en` with the popup open at 360 and 1280.
- **Visual:** the popup at 390 and 1440 and on `/ar-XB`. The `/` and strip baselines are deleted.

**Numbers.**
- `pnpm gates:cheap` on `088858f7`: typecheck, lint, format:check, i18n:check, check:no-db and codebase:map all exit 0. Tests exit 1, all from the 5 % cascade plus timeouts at load 23. With the attestation simulated, the unit suite fails only the two tests that pin `reviewed: false`.
- **Budget**, local build in the slot at `3b2eaa96` (load average 8.8 at the start, 58 at the end; byte counts do not depend on load): `/en` is 122.4 KB br, **+1.0 KB** against the committed baseline. That includes main's changes since the baseline, so the popup's delta is ≤ 1.0 KB, inside 3 KB.
- **CI on `e0d85bb2`.** Green: lint, typecheck, contract, i18n-check, seo-validate, a11y, seed and audit. Red: unit, integration, e2e and visual. Unit and integration are the cascade. e2e is the cascade (English "Beta" and the 320 px header) plus four test errors, fixed in `3b2eaa96`. Visual is the cascade's header and footer change plus the three new baselines.

**Handed on.**
1. Done: the founder attested the seven `languagePopup.*` keys (`ec3e4ffb`); the two pins now assert the attestation, and the sitemap fixtures are regenerated (`<lastmod>` only).
2. The `visual:baselines` run for the three new linux PNGs, on the head after the attestation (English carries no "Beta" there).
3. Popup links now go to the same page in each locale (orchestrator, 2026-10-05): every route renders `LanguageAlternates` with its hreflang path map, and the island reads it from the DOM. Product pages have no alternates builder and keep the locale home.
4. `ConsentBannerView.tsx` comments still mention the strip (outside the fence).
