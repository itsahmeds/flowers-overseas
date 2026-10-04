# TASK-119 — Language popup and no chooser page: `/` answers one unconditional 308 to `/en`, the `(chooser)` route is deleted, and the popup ("Choose your preferred language", four native names, English the default, the hint only highlights, closable by a large button, `Esc` or a tap outside, remembered by `fo_locale`, mobile sheet ≤35 % clear of the hero CTA and sentence card, before the consent sheet) replaces the slide-in strip

Row: `TASKS.md` → TASK-119. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-119`; keep it current by editing this file, not the row.

## Binding

- **Spec 003 §14 A16 and §14 A14 together are the whole task.** A14's Shape bullet "as amended by A16" is the binding popup text. Read both verbatim. This is **one feature**: the 308, the chooser's deletion and the popup ship in one PR on branch `task/TASK-119-locale-suggestion-popup`.
- **ACs owned:** AC-7, AC-12, AC-25, AC-27 (the `/` clause), AC-28 and AC-30, all as A16 clause 6 restates them. AC-9 is re-asserted (A14).
- **Tests owned:** T-05, T-07, T-12, T-25, T-27, T-28 and T-30, as A16 clause 6 restates them.
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
  - `hints.ts` stays the only file that reads a country header, and `/api/geo` stays `no-store`, logging no IP and no country.
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
  - **Hint:** `navigator.languages`, then the edge country header through `/api/geo`. It **only highlights** an option. It never navigates, never sets the cookie and never reorders the list.
  - **Closing:** a close button of at least 44 × 44 CSS px, `Esc`, or a tap outside. Closing sets `fo_locale` to the page's locale without navigating. Choosing an option sets `fo_locale` to that locale and follows its link. The popup never shows again after either.
  - **Desktop:** a centred card over a dimmed page.
  - **Mobile:** a bottom sheet ≤ 35 % of the viewport height that never overlaps `HomeHero`'s CTA or the `SentencePicker` card.
  - **Layout:** zero CLS.
  - **Order:** it opens before the consent sheet and never stacks on it.
  - **Dialog:** a modal native `<dialog>` with `aria-labelledby`. Focus moves in on open and is restored on close. Neither mark relies on colour alone.
  - **The strip goes:** `LocaleSuggestionBanner*`, its copy, and the `fo_locale_suggestion_dismissed` `sessionStorage` key.
  - **Budget:** lazy-imported, +≤ 3 KB Brotli, measured against the committed baseline.
- **A16's two Readings** (clause 2) are built as written unless the founder overrules them:
  - Reading 1: on a non-English page, the page's own locale is marked current and English keeps the default mark.
  - Reading 2: the popup opens on any localised page.
- The **country → locale table** in `src/config/` (A14: `DE`/`AT`/`CH` → `de`, `PL` → `pl`, `GB`/`IE` → `en-gb`, else `en`) is zod-parsed and unit-tested. The hint function returns one launch code or none. Its return type has no URL field and no navigation field.
- **SEO (A16 clause 3):**
  - `/` is in no sitemap;
  - `alternatesFor()` output is byte-identical before and after;
  - no locale home or 404 renders `href="/"`;
  - `tests/fixtures/seo/lighthouse-urls.json` and `lighthouserc.json` drop `/`.
- **Copy (A16 clause 4):** the heading is the founder's text. The default mark's label and the close button's accessible name are new English strings. Send them to the founder as one exact-text batch, and ship them `reviewed: false` until attested. Native names are never translated.
- **Compliance (A16 clause 5):**
  - `docs/compliance/ropa.md` has A14's row (purpose: language suggestion; basis: legitimate interest; data: the IP-derived country code only, in memory, never stored or logged; retention: none). Add it if it is missing.
  - `docs/compliance/cookie-register.md` drops `fo_locale_suggestion_dismissed`. Its `fo_locale` row says the cookie is set on choosing or closing the popup.
- **Design first.** `/design` on A16 delivers the artboards before the component:
  - the popup in `docs/design/system/components.dc.html`: the desktop card; the mobile sheet over the home hero at 360 × 640 and 390 × 844; the default, hint-highlighted and RTL states;
  - the updated `docs/design/flows/consent-and-locale.dc.html`;
  - `docs/design/wireframes/locale-chooser-{desktop,mobile}.dc.html` and their `canvas.json` entries, retired.

  Build to them pixel for pixel. If the artboards are not on `main`, stop and escalate; do not build from this description.
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
  - `/api/geo` and the country table in `src/config/`, if they are not there yet;
  - `src/modules/i18n/messages.ts`, `registry.ts`, `request.ts` and `routing.ts`;
  - `src/modules/seo/indexability.ts`;
  - `src/app/layout.tsx`, `src/app/not-found.tsx`, `src/app/global-error.tsx`, `src/app/[locale]/error.tsx` and `src/app/(dev)/` (comments only);
  - `src/modules/ui/layout/noticeShell.ts`, `NoticeDocument.tsx` and `src/modules/ui/primitives/a11y.tsx`;
  - `messages/*.json` and `messages/*.meta.json`.
- **Delete:** `src/app/(chooser)/`.
- **Scripts:** `scripts/client-js-budget.ts`, `scripts/seo/generate-sitemap-fixtures.ts`, `scripts/check-no-db-imports.ts`.
- **Docs:**
  - `docs/compliance/cookie-register.md` and `docs/compliance/ropa.md`;
  - `docs/architecture.md` §2;
  - `README.md`, where it names the chooser;
  - `docs/codebase-map.md`, regenerated with `pnpm codebase:map` and never hand-edited.

## Tests

The binding list is A16 clause 6. Each case names its layer and must go red when its subject is removed. The breaker runs the mutations that clause lists.

- **Unit:**
  - a new test for the root rule deep-equals `redirects()` to the single rule `{ source: "/", destination: "/en", permanent: true }`, with no `has` and no `missing`. Asserting that one value is what makes an added condition fail;
  - the hint function's languages × country table: one launch code or none, and no navigation field;
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
  - the hint highlights Deutsch and nothing navigates: the URL stays `/en` and no main-frame `framenavigated` fires;
  - close by the button, by `Esc` and by a tap outside: each sets `fo_locale=en`, and after a reload the popup does not open;
  - choosing Deutsch goes to `/de` with `fo_locale=de`;
  - a valid cookie means the popup never renders;
  - the consent sheet is never visible while the popup is open;
  - the mobile sheet is ≤ 35 % of the viewport height and does not intersect the hero CTA or the sentence card at 360 × 640 and 390 × 844;
  - CLS is 0;
  - the close button is ≥ 44 × 44 CSS px;
  - the cookie attributes, and a forged `fo_locale=zz` that opens the popup and is rewritten on the next act.
- **a11y, T-25:** `tests/a11y/shell.spec.ts` drops `/` and adds `/en` with the popup open at 360 × 640 and 1280 × 800, with zero serious/critical violations.
- **Visual, T-30:** `tests/visual/shell.spec.ts` and `notices.spec.ts` drop `/` and delete its baselines and manifest entries. They add the popup open on `/en` at desktop and mobile widths, and on `/ar-XB`. Baselines come from the CI `visual-baselines` workflow for `linux/`.
- **Performance, T-27:** `/` leaves the Lighthouse URL set and `pnpm budget:client-js`. The popup's delta, measured and reported in `## Result`, is ≤ 3 KB Brotli.

## Read

- `specs/003-i18n-foundation.md`: `## 0. Index`; §14 A16 and A14 in full; A8, A9 and A12; §13 Q4; AC-7, AC-9, AC-12, AC-25, AC-27, AC-28 and AC-30 with their T rows.
- `docs/adr/ADR-0006-no-ip-redirects.md`.
- `docs/codebase-map.md`, for the entries under `src/modules/i18n/` and `src/modules/seo/indexability.ts`, the `next.config.ts` rule builders in `src/lib/` (`listing-rewrites.ts` is the pattern), the consent island (spec 004, TASK-051), `HomeHero.tsx` and `SentencePicker.tsx`.
- `docs/design/system/components.dc.html`, `docs/design/flows/consent-and-locale.dc.html` and `docs/design/README.md` (the authoring rules).

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-04, to the founder, open and non-blocking:** A16 clause 2's two Readings. Reading 1: on a non-English page the page's own locale is marked current and English keeps the default mark. Reading 2: the popup opens on any localised page. Build as written. A one-word overrule changes the spec first, then this task.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
