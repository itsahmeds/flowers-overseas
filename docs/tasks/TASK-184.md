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
  what CI cannot judge, and say so in `
- 2026-10-31: run 40193614044 on d0ed55e9 was red in e2e only: `links.spec` read the footer legal row by `aria-label="Legal"`, which de/pl name in their own language; `product-page.spec` still pinned no guarantee link in de/pl. Both fixed in the specs (efb4e213), rebased on main c0d6b6f2c (map regenerated), unit i18n and product-page tests green, unreviewed share en 4.56 % and en-gb 4.74 % (no record-approval script). ci:full re-fired.

## Result`.
- **Class:** not review-only (i18n tooling that decides indexability, the crawl). `/review` and
  `/break` both run.

## Read

- `specs/041-trust-help-legal-pages.md` — `## 0. Index`, then §2 "Locales" and "Rendering, budget
  and gates", §6, §7, the ACs above, §10, §11, §12 task 3 and the registration-flip paragraph.
- All six artboard pairs in `docs/design/wireframes/`, **round 2 (PR 189)**: `how-it-works`,
  `guarantee-and-delivery`, `help-and-contact`, `about`, `legal-template`, `cookies`; their
  States rows (untranslated, JS off) and Laptop band rows.
- `specs/041-trust-help-legal-pages.md` §14 A1; `specs/004-design-system-layout.md` §14 A24.
- `docs/codebase-map.md`; `scripts/i18n-draft.ts`, `tests/fixtures/seo/`, the spec 004 AC-14
  footer crawl, `lighthouserc.json`.

## Carry-forwards

- **From spec 004 §14 A24 (2026-10-05):**
  - **Blocked until PR 189 (design round 2) merges.**
  - The visual baselines (T-28) are taken against the round-2 artboards at desktop and mobile,
    with the phone dock and back link in the mobile shots.
  - The `de`/`pl` drafts include the round-2 keys (P6, P7, P9) as machine drafts with no em
    dash, `reviewed: false`.
- **From `/plan-tasks` (2026-10-04):** §11's scheduled `seo-auditor` check ("no legal page is
  indexable while its `lawyerReviewed` is false") is not code: the orchestrator adds it to the
  auditor's work order. Not in this PR.
- **From `/break 270` (HOLE 10 CARRIED, ruled by the reviewer; copied 2026-10-20):** `CLAIM_PATTERNS` branches (`reviews?`, `stars?`, `trustpilot`, `proof of delivery`, `delivery photos?`, `doorstep` and the others) each lack a hit row. In the honesty sweep, add one hit row per alternation branch in `pages-check.test.ts`, with the corridor-check and seed-check files, mutating each branch.
- **From `/break 270` (HOLE 11 CARRIED; copied 2026-10-20):** add overlay rows for faq `q` and item `title` in `pages-check.test.ts`, with a mutation dropping each field's push watched red (the legal `changeLog` half is TASK-183's).
- **From `/break 270` (HOLE 12 CARRIED; copied 2026-10-20):** add an `http:` siteUrl case to `info-page-head.test.tsx` asserting `alternates.languages` is undefined (local or preview builds only; production is `https`).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-25: started in worktree `/Users/ahmed/dev/fo-wt-184` on `task/TASK-184-de-pl-drafts-closeout`; TASK-182 and TASK-183 are merged. Next: the untranslated line and the hreflang filter, then the de/pl content drafts.
- 2026-10-25: built and pushed. Drafts (20 files), the untranslated line, the hreflang filter, the pseudo fallback, T-22/T-23/T-27/T-28/T-29/T-30 tests, the runbook, the seo fixtures and holes 10/11/12 are in PR #432. Mutations M1 to M4 and the hole mutations were watched red. Local build in the slot: the 1280 and 390 screenshots of the de/pl drafts match the artboards. The trust and help phone docks are not built (TASK-182 E6), so those first-screen shots have no dock.
- 2026-10-25: CI on 8226b3b4 failed in e2e (footer, links) and a11y (footer nav count) because de/pl footers now draw the trust and legal rows. Fixed in c7f31db/edc888e, with the de/pl `footer.link.deliveryAndPayment` drafted. Rebased on origin/main. Left: (1) re-run the `visual:baselines` label on the new head, then commit the linux PNGs and the manifest. Commit only the info-*, ar-XB, ar-XB-help, de.png, footer-de-* and home-de/pl-* files. Restore runner noise (home-en*, listing-*, occasion-hub-*, product-*-gallery-placeholder) to HEAD, with their hashes taken from HEAD's manifest, and check with `pnpm visual:baselines --verify`. (2) Toggle `ci:full` and get it green on the head. (3) Fill in the PR body; the draft is in the agent scratchpad pr-body.md. (4) Write `## Result` and set the row to `in_review`. The darwin PNGs from the local run are set aside, not committed.
- 2026-10-25: all four items done (baselines from run 40192451160 committed, PR body with Self-review, Result, row in_review). Left: confirm `ci` green on the head. Run 40193614044 on d0ed55e9 was in progress at shutdown; this docs-only commit needs one `ci:full` toggle. If red: on an LCP fail outside the diff, rerun once; otherwise fix.

## Result

PR [#432](https://github.com/itsahmeds/flowers-overseas/pull/432). It ships the de and pl machine drafts of all ten pages: 20 files, all `reviewed: false`, Polish legal in Państwo. Every unreviewed de/pl page shows the untranslated line, is noindex and stays out of the sitemaps and every hreflang cluster (`infoPageHreflangPaths`). Pseudo-locales read the English file. The glossary entries are in place, and the runbook `info-and-legal-pages.md` carries the trader-identity flip checklist and the five ⚖️ items. `/break 270` holes 10, 11 and 12 are closed.

Tests added:
- unit: drafts suite 72, runbook, 32 pages-check rows, hole 12, noindex sitemap pin;
- contract: seo fixtures;
- e2e: T-22 crawl, drafts block, footer/links/schema now four-locale;
- a11y: T-27, footer navs 4;
- visual: 10 info baselines plus `/ar-XB/help`, plus the de/pl/ar-XB home and footer baselines the new rows changed;
- Lighthouse: three URLs.

The unreviewed share is en 4.6 % and en-gb 4.7 %, so no record-approval script. The local build and Playwright ran in the build slot for darwin baselines and the 1280/390 design check; load average 5.4 at start.

Carry-forwards:
- English-only claim patterns;
- the de/pl product page promise is English text;
- the Estonia text in `infoPages.company.notRegistered`;
- the TASK-182 E6 docks;
- the em dash and "around the clock" message values (the orchestrator's new task).
