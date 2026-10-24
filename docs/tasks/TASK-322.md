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

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
