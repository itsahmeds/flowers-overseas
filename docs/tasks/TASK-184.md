# TASK-184 — Spec 041 German and Polish drafts, and the close-out gates

Row: `TASKS.md` → TASK-184. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-184`; keep it current by editing this file, not the row.

## Binding

- `specs/041-trust-help-legal-pages.md` §12 task 3. Owns **AC-22, AC-23, AC-27, AC-28**; tests
  **T-22, T-23, T-27, T-28, T-29, T-30**.
- **Scope, in the spec's words (§12 task 3):** `de`/`pl` drafts of all ten pages, the untranslated
  line, glossary entries (`content/i18n/glossary.{locale}.md`: "guarantee", "withdrawal",
  "imprint", "our florist"), the footer crawl in four locales, axe, the Lighthouse URLs, visual
  baselines, `seo:validate` fixtures, the runbook, the codebase map and the README.
- **Drafts:** every `de`/`pl` file is `source: machine`, `reviewed: false`, renders
  `infoPages.status.untranslated`, is `noindex,follow`, and sits outside every sitemap and
  hreflang cluster. Florist sentences are in the present tense in every locale (spec 004 §14 A22
  clause 1). The German imprint is the facts plus German labels and exists only after the
  `registered` flip. Legal drafts in `de`/`pl` also need the lawyer before they can be indexed or
  put in force (§7).
- **Gates (spec 041's one gates task):** axe zero serious or critical on the seven `en` pages that
  exist before registration, with no exception list; the component-level a11y check of the
  imprint, terms and privacy views under `registered: true`; Lighthouse on `/en/how-it-works`,
  `/en/help`, `/en/legal/cookies` within spec 004's budgets; visual baselines for the trust, help
  and legal-document templates at desktop and mobile on darwin and linux at 0.1 %, with the help
  page under the `/ar-XB` pseudo-locale (§7 RTL); the crawl from every locale home and every info
  page in four locales (zero non-200, zero unpublished targets, depth ≤ 3, §6's in-body link set).
- **Runbook** `docs/runbooks/info-and-legal-pages.md`, indexed: edit, approve, version a legal
  document, publish a lawyer-reviewed version, and the `registered` flip checklist with the
  page-level axe run on the three gated pages in `en` plus `/de/impressum` and the imprint's
  visual baseline (AC-28). The go-live copy batch lists the sentences that say we are not open
  yet (§12, as amended 2026-10-04).
- The new baselines go through the `visual:baselines` label flow. Take the build slot only for
  what CI cannot judge, and say so in `## Result`.
- **Class:** not review-only (i18n tooling that decides indexability, the crawl). `/review` and
  `/break` both run.

## Read

- `specs/041-trust-help-legal-pages.md` — `## 0. Index`, then §2 "Locales" and "Rendering, budget
  and gates", §6, §7, the ACs above, §10, §11, §12 task 3 and the registration-flip paragraph.
- All six artboard pairs in `docs/design/wireframes/` (`how-it-works`, `guarantee-and-delivery`,
  `help-and-contact`, `about`, `legal-template`, `cookies`), States rows (untranslated, JS off).
- `docs/codebase-map.md`; `scripts/i18n-draft.ts`, `tests/fixtures/seo/`, the spec 004 AC-14
  footer crawl, `lighthouserc.json`.

## Carry-forwards

- **From `/plan-tasks` (2026-10-04):** §11's scheduled `seo-auditor` check ("no legal page is
  indexable while its `lawyerReviewed` is false") is not code: the orchestrator adds it to the
  auditor's work order. Not in this PR.

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
