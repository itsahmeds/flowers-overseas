# TASK-210 — Spec 011 public pages, no database: the for-florists landing, walkthrough, apply (form off) and sent pages in `en`/`en-gb` with `de`/`pl` drafts, the `florists` family in spec 041's registry and `pages:check`, the presentational inbox components with `exampleFloristOrderView`, schema, sitemap, the `/demo/` and `/vendor/` disallows, the site-link flip, two Lighthouse URLs

Row: `TASKS.md` → TASK-210. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-210`; keep it current by editing this file, not the row.

## Binding

- `specs/011-for-florists-vendor-inbox.md` §12 task 1. Owns **AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-35**; tests **T-01–T-10, T-35**.
- **Scope (§2, §12 task 1):** the four pages of §2's table through the existing one-route-per-depth files and `resolveLocalePath()`; the `florists` family in spec 041's registry (`src/config/info-pages.ts`) with `content/pages/{locale}/for-florists.md` and `how-orders-work.md` read through `infoPageView()` and gated by `pnpm pages:check` (the trust family's rules, at least 350 words of walkthrough prose, `honestyAllow[]`); the presentational inbox components in `src/modules/partners/ui/inbox/` with `exampleFloristOrderView(locale)` (the exports TASK-214's pages import, AC-3's import identity); the apply page in its form-off state and the form markup for `on` (AC-10); `src/config/florists.ts` (`FloristsConfigSchema`, `applicationForm: "off"`, `payoutExample`, `basePath`, `signInPolicy`); the `SeoPageType`s (`forFlorists` and `howOrdersWork` by rule, `floristApply` and `floristApplySent` always `noindex,follow`); `WebPage` + `FAQPage` and `BreadcrumbList`; `static.xml` membership; `Disallow: /demo/` and `Disallow: /vendor/` (asserted under AC-22 by TASK-212); the `for-florists` site link `published: true`; Lighthouse URLs `/en/for-florists` and `/pl/dla-kwiaciarni`.
- **No database** (`pnpm check:no-db`), zero new client JavaScript on the four pages, no cookie read, no `Set-Cookie`, no `Vary`; ISR 3600 with the §5.4 tags.
- **Honesty:** the payout example's retail amount is resolved through the catalogue's price API, never copied; the payout is the authored integer of §13 Q7; no VAT, fee or "what we keep" line. Absent, not placeholder: counts, testimonials, logos, any `<img>`. None of the nine banned words in any value (§13 Q11 keeps the ban on "partner"); florists in the present tense.
- **`de`/`pl` (§7, §13 Q10):** drafts, `reviewed: false`, the untranslated line, `noindex`, out of hreflang and sitemaps; the `de` and `pl` leaf slugs are proposals the native review confirms before first indexing.
- **Design.** `docs/design/` is the source of truth: match the artboards named under Read pixel for pixel, and keep `system/components.dc.html` in step with `src/modules/ui` in the same PR.
- **No em dash in copy** (founder, 2026-10-05: "approve the wording just no em dash"; ruling R9 of the decisions log 2026-10-05, "Specs 010, 011 and 012: cross-spec ownership"). Where a spec string carries one, ship it with a full stop or a comma in its place, assert the message key and the substituted text, and list each changed string in the PR for the founder.
- **Review flags.** An `en` key is `reviewed: true` only with a `reviewedBy` naming the founder's batch approval of the spec's Appendix A; an agent never marks copy reviewed. Until that approval is recorded in the decisions log or the PR thread, the keys ship `reviewed: false`. `de` and `pl` are drafted by `pnpm i18n:draft` (spec 003 §14 A15) and stay `reviewed: false`.
- **Class:** not review-only (`CLAUDE.md` DoD §4): SEO gates (indexability, sitemaps, schema, robots), i18n tooling that decides indexability, and a consumer price. `/review` and `/break` both run.

## Read

- `specs/011-for-florists-vendor-inbox.md`: `## 0. Index`; §2 ("Four public pages", the application form's fields); §5.2 (`florists.ts`, the example fixture); §5.3; §5.4; §6; §7; §8 (accessibility, price display); §9 AC-1–AC-10, AC-35; §10; §12 task 1; §13 Q7, Q10, Q11; Appendix A; Appendix B.
- `specs/041-trust-help-legal-pages.md` §2 (the content model, the trust family's rules) and `docs/tasks/TASK-182.md`.
- Artboards (merged; `docs/design/audits/2026-10-05-specs-011-012.md`): `docs/design/wireframes/for-florists-desktop.dc.html` and `docs/design/wireframes/for-florists-mobile.dc.html` (round 2, PR 189; see the escalation below), `docs/design/wireframes/for-florists-walkthrough-desktop.dc.html`, `docs/design/wireframes/for-florists-walkthrough-mobile.dc.html`, `docs/design/wireframes/for-florists-apply-desktop.dc.html`, `docs/design/wireframes/for-florists-apply-mobile.dc.html`, and `docs/design/wireframes/florist-inbox-desktop.dc.html`, `docs/design/wireframes/florist-inbox-mobile.dc.html` for the presentational components (PR 197); the Forms and Florist inbox groups of `docs/design/system/components.dc.html`; `docs/design/flows/florist-journey.dc.html`.
- `docs/codebase-map.md`; `src/config/site-links.ts`, `src/config/locales.data.ts`, `src/config/voice.ts`, `src/config/company.ts`, `src/modules/seo/indexability.ts`, `src/modules/seo/robots.ts`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-05):** dispatch after TASK-182 (the content module and `info-pages.ts`) merges. Appendix B items 2–7 merged in PR 197 (`docs/design/audits/2026-10-05-specs-011-012.md`). Two of that audit's escalations bind here: (1) the landing was not redrawn for spec 011, and the round-2 `for-florists-*` (PR 189) draws a docket, "Apply to join" and draft copy where Appendix A says "Apply to work with us", so the landing needs one redraw pass, or the founder approves the round-2 version and Appendix A follows it, before this task is dispatched; (2) the walkthrough is drawn with two short sections (declining folded into step 2, as Appendix A writes it), not §2's three. The phone frame's `zoom` is an implementation note on the artboard.
- **From the orchestrator (2026-10-05):** a sticky bar appears only after the hero has scrolled out of view, never over the first screen (the same rule as TASK-197's product bar).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-05, the payout figure (§13 Q7):** the founder answered "all defaults", and Q7's default is to confirm the product and 149 zł only if they would really pay it. To the founder through the PR, with the product and the figure. The PR does not merge until they confirm, because a florist reads the figure as an offer. `open`.
- **2026-10-05, the Appendix A copy batch:** spec 011 §12 founder prerequisite 1 (approve Appendix A and the artboards). `open`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
