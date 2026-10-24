# TASK-322 — Spec 044 public blog pages

Row: `TASKS.md` → TASK-322. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-322`; keep it current by editing this file, not the row.

## Binding

Spec 044 §12 slice A task 2. Founder approval 2026-10-21: "044 defaults" (every §13 default) and "blog ok" (Appendix A's ten labels); advisor fixes 1 to 5 of `docs/advice/2026-10-21-044-blog.md` applied. The spec is PR 312 and the design PR 319 (`docs/design-044-blog`); dispatch only after both are merged.
- **ACs owned:** AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-20, AC-22; tests T-08 to T-14, T-20, T-23 and T-22's public half (`blog-index` and `blog-post` at 1440 and 390, without cover; the cover variants are TASK-324's).
- Depends on TASK-321 (provider, view data, seed fixtures), TASK-295 (existence manifest, `existsNow`, sitemaps) and TASK-296 (the database AND manifest predicate across links).
- **Design:** `docs/design/wireframes/blog-index-desktop.dc.html`, `blog-index-mobile.dc.html`, `blog-post-desktop.dc.html`, `blog-post-mobile.dc.html`; pixel match, every §5.3 state.
- **Review class: review-only** (CLAUDE.md DoD 4: presentation and SEO markup). The reviewer confirms the class against the diff; a reviewer's call for a breaker binds.
- Public templates are server components with zero client islands; logical properties only; one `<h1>`; `Intl` through `format.ts`; no relative dates; no commerce on a post.
- **Copy (AC-20):** the ten Appendix A keys, English values copied verbatim, `en-gb` identical, `de` and `pl` drafted as every other key and never `reviewed: true`. Copy headroom is zero (`en-gb` 4.98 % against 5 %): the founder's "blog ok" is the approval, but the recording is the founder's own run. Stop and report the ten keys; never set `reviewed: true`. Reuse `infoPages.status.notYetOpen` as is.
- One end-of-post link to the first country tag's corridor guide, rendered only where that corridor page exists (AC-22).
- The byline is plain text in slice A: no author link or author page (slice B).

## Read

- `specs/044-blog.md`: `## 0. Index`, then §2.7, §2.8, §5.3, §5.4, §6, §7, §9 AC-8 to AC-14, AC-20 and AC-22, §10, Appendix A
- `docs/design/README.md` rows 35 and 36 and the four blog artboards above
- `docs/codebase-map.md`; `src/app/[locale]/[segment]/page.tsx`, `src/config/site-links.ts`, `src/modules/seo`, `src/modules/geo/` (corridor pages for the existence predicate)

## Carry-forwards

One dated bullet per `/review`, newest last.


- **From `/plan-tasks` (orchestrator, 2026-10-21):** `seoTitle` and `seoDescription` are head-only. The index's two come verbatim from Appendix A (`blog.index.seoTitle`, `blog.index.seoDescription`) and a post's from its revision; they feed `<title>` and the meta description (and `og:*`) only and are never rendered in the body. The visible excerpt, not the SEO description, is `BlogPosting.description` (AC-11) and follows §2.7: shown under the `<h1>` on the post and under the title on the index, 120 to 300 characters as saved.
- **From `/plan-tasks` (orchestrator, 2026-10-21):** spec 042's and TASK-242's no em dash, spaced hyphen or spaced en dash rule covers every `<title>`, meta description and JSON-LD name. Check that the gate scans the blog heads; if a post's `seoTitle` can carry one and nothing refuses it, say so in `## Result` for a follow-up row. Do not widen this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-24, AC-20 copy approval (to the founder via the orchestrator): open.** The ten Appendix A keys ship `reviewed: false` as the brief says. They lift `en`'s unreviewed share to 35 of 583 counted keys (6.0 %, `en-gb` 6.2 %), over spec 003's 5 %, so `isLocaleIndexable("en")` is false and four unit files are red until the founder records the approval: `catalog-indexability`, `seo-indexability`, `sitemap-route`, `i18n-check`. The founder's own run: `python3 .claude/state/record-approval-322.py` (prints the ten texts, asks APPROVE, records them, takes them out of the pinned review queue, regenerates the sitemap fixtures, commits on its own), then push. `--check` runs every check and writes nothing; it passes on bc38a86c5. After it, 25 of 583 (4.3 %).
- **2026-10-24, the browser halves (to the orchestrator): open.** T-08 (e2e build and publish), T-12's built-HTML scan, T-13 (footer crawl over four locales), T-14 (bundle diff, Lighthouse, axe), T-22's public visual baselines and T-23's e2e need a build in which the blog exists. CI's `preview` build (the one `e2e`, `visual`, `a11y` and `lighthouse` serve) has no database by design, and `BLOG_SOURCE` stays unset until spec 012b's cutover (TASK-294), so no browser job can see a post. Either a seeded Postgres and `BLOG_SOURCE=database` in `preview` and the four browser jobs (a CI change outside this task's files), or the browser halves move to the task that brings the cutover. The unit halves of every one of these ACs are written and mutation-checked (PR description, `## Self-review`).
- **2026-10-24, dependency on TASK-295 and TASK-296 (both `todo`): recorded, not blocking.** The blog gates existence on its own reading of the running build's prerender manifest (`src/modules/content/blog/manifest.ts`, database AND manifest, AC-8). TASK-295's `existsNow` should absorb it when it lands.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24: the first agent's two commits (pages, source, sitemap child, footer row, ten keys; page, SEO and integration suites) rebased onto PR 394's head 8868e2918; footer order pins and the review queue fixed; TASK-323 to 325 rows back to their own status (this PR closes TASK-322 only). Mutations M1 to M5 red as recorded in the PR. Next: the founder's approval run, then the browser halves once the orchestrator answers the second escalation.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

**Partial (2026-10-24).** PR 396 (stacked on PR 394). The public blog index and post pages, server components with no island; `BLOG_SOURCE` (`database` or none) with database AND manifest existence; `BlogPosting` and breadcrumb JSON-LD from the rendered view; the two `SeoPageType`s with one robots verdict for head and `editorial.xml`; the `blogIndex` site-link kind as the last Company row; the ten Appendix A keys `reviewed: false`; the end-of-post corridor link only where that corridor exists. Tests: unit `blog-pages.test.tsx` (30), `blog-seo.test.ts` (9) and edits to nine existing unit files; integration `blog-pages.test.ts` (seed idempotence, insert-only refusal, reads per role, reassignment, tag URLs). Not done: the browser halves and the founder's approval (both in `## Escalations`). Carry-forward for a follow-up row: nothing refuses an em dash, spaced hyphen or spaced en dash in a post's own `seoTitle` (TASK-321's rule set has no such rule); the index's two head keys are in `HEAD_MESSAGE_KEYS` and are scanned.
