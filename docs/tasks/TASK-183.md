# TASK-183 — Spec 041 legal set: the legal template, the five legal pages and the consent line

Row: `TASKS.md` → TASK-183. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-183`; keep it current by editing this file, not the row.

## Binding

- `specs/041-trust-help-legal-pages.md` §12 task 2. Owns **AC-1 (legal half), AC-2 (the
  registration gate), AC-4 (the Polish rename), AC-9, AC-10, AC-11 (the imprint), AC-13, AC-21
  (legal half), AC-25, AC-29**; tests **T-01 (legal half), T-02 (registration half), T-04
  (rename), T-09, T-10, T-11 (unit: the imprint view under a `registered: true` fixture), T-13,
  T-21 (legal half), T-25, T-31**.
- **Scope, in the spec's words (§12 task 2):** the legal document template (version header, draft
  lines, table of contents from the `##` headings, change log), the five legal pages in
  `en`/`en-gb`, the `requiresRegistration` gate on `imprint`, `terms` and `privacy`, the imprint
  (built and tested under a `registered: true` fixture), the cookie register table and the
  re-open button (`data-fo-consent-reopen`, no new island), the cookie notice's two interim
  sections, the consent banner's `company.controller` / `consent.privacyLink` switch chosen on the
  server by `consentView()`, the Polish legal segment `regulamin` → `informacje-prawne`, the flips
  for `imprint`, `terms`, `privacy`, `cookies` and `withdrawal-and-refunds`, the RoPA row 2
  correction with the "spec 041: no new processing" note, and the processor-coverage test.
- **Appendix B is binding:** a draft that contradicts a clause fails review. Every ⚖️ point stays
  stated as open for the lawyer; the implementer never settles one. No text says or implies
  "reviewed by a lawyer", "compliant" or "GDPR certified".
- **Document states (§2 "Draft legal text"):** `terms` and `cancellation` are `inForce: false`;
  `privacy` and `cookies` are `inForce: true`, `lawyerReviewed: false`; the imprint renders no draft
  line. `en-gb` `terms`, `privacy` and `cancellation` are their own files with `regime: uk`;
  `cookies` and `imprint` may `extends: en`.
- **Before registration:** `imprint`, `terms` and `privacy` have no route (404), no sitemap entry,
  no footer item and no in-body link in any locale. No postal address renders anywhere. The
  banner and the cookie notice name `representative.name` and `phoneDisplay` only. The interim
  section's complaint line reads "the data protection authority where you live or work", with AKI
  and the ICO as examples, never AKI alone; it names Railway, Cloudflare, Sentry and Vercel and
  states row 2's possible US transfer with its safeguard (AC-29).
- **Copy:** the A.1 keys are batch 1 (approved with the spec). The legal document texts are
  **batch 2**: they go to the founder in the PR before it goes ready, and no legal file is marked
  `reviewed: true` before the founder's answer.
- `budget:client-js` passes: the banner gains one projected string and no logic.
- **Design round 2 (spec 041 §14 A1; spec 004 §14 A24; 2026-10-05).**
  - **Artboards.** The round-2 `legal-template-*` and `cookies-*` on PR 189 bind, at 1440 × 900
    and 390 × 844, with spec 004's laptop band.
  - **The document.** A white `<article>` on a cream ground. The state is repeated in an
    `aria-hidden` corner stamp: `infoPages.legal.notInForceYet` for a document not in force, and
    "In force" for cookies. "In force" is new copy, P9, `reviewed: false`, and never marked
    reviewed by an agent.
  - **Unchanged.** The version header stays the accessible statement of the state (AC-9, AC-10).
    By design, the legal sheet runs past the fold at every laptop size.
  - **Phone.** "Change cookie settings" is docked on the cookies page in spec 004 AC-48's bar
    (from TASK-195). It repeats the page's own `data-fo-consent-reopen` button, with no new
    island. The back link is AC-50's.
- **Class:** not review-only (compliance and legal text, consent, SEO). `/review` and `/break` both
  run.

## Read

- `specs/041-trust-help-legal-pages.md` — `## 0. Index`, then §2 ("The content model", "The honest
  states", Cookies, Privacy), §5.1, §5.3, §6, §8, the ACs above, §10, §12 task 2, §13 Q1, Q3, Q8,
  Appendix A.1, Appendix B.
- Artboards, desktop and mobile, **round 2 (PR 189)**: `docs/design/wireframes/legal-template-*.dc.html`
  and `cookies-*.dc.html`; each annotation block's First screen, Build and Copy rows.
- `specs/041-trust-help-legal-pages.md` §14 A1; `specs/004-design-system-layout.md` §14 A24
  clause 10, AC-48, AC-50.
- `docs/compliance/ropa.md` rows 1–5; `docs/adr/` ADR-0016 and ADR-0018.
- `docs/codebase-map.md`; `src/config/cookies.ts`, `src/config/company.ts`,
  `src/modules/ui/consent/` (`consentView.ts`), `src/app/[locale]/[segment]/[child]/page.tsx`,
  `src/config/locales.data.ts`, and TASK-182's `src/modules/content`.

## Carry-forwards

- **From `/plan-tasks` (2026-10-04):** extend TASK-182's T-12 to the imprint view (the phone,
  WhatsApp and optional support email come from `company.ts` on that surface too), and confirm the
  AC-8 scan picks up the legal pages through `listInfoPages()`.
- **From `/plan-tasks` (2026-10-04):** the component-level a11y check of the three gated views
  under `registered: true` is AC-27, owned by TASK-184. Leave the views renderable from a fixture
  so that test can mount them.
- **From spec 004 §14 A24 (2026-10-05):** **blocked until PR 189 (design round 2) merges**;
  after TASK-182, which already waits for TASK-186 and TASK-195.
- **From `/plan-tasks` (2026-10-04):** before the rename, check that nothing links to
  `/pl/regulamin/…` (no URL under it was ever published, §2).
- **From the PR 164 review (2026-10-04):** the interim notice's transfers sentence is the one in
  spec 041 §2 Cookies and Appendix B: row 2's logs may go to the US under the DPF and/or SCCs, the
  Phase 0 consent records (row 3) are kept in those logs and follow their transfer, and error
  events (row 1) stay in Sentry's EU region. Nothing says "rows 1 and 3 leave the EU for no one".
  It is ⚖️ for the lawyer and goes to the founder in batch 2; never mark it reviewed yourself.
  With the RoPA row 2 edit, also correct **RoPA row 3's Transfers cell**: it says "None" while its
  Recipients cell names row 2's platform log, so it follows row 2's transfer in Phase 0.

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
