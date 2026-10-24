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
- **Spec 004 / spec 041 §14 A-founder-2026-10-19d (orchestrator, 2026-10-20):** AC-13 and AC-29 as amended are this
  task's. The cookie page's "Change cookie settings" opens the settings panel while no category is active (TASK-279
  builds the shared `data-fo-consent-reopen` behaviour; the AC-13/T-13 e2e restatement lands here with the page), and
  the controller sentence renders in the settings panel opened from the footer, not the banner (AC-29/T-31 as amended;
  the panel's slot is TASK-281's, `company.controller` waits for founder copy).

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
- **From the site test (2026-10-18, QA-1 and QA-2 on `c8d3b334`; screenshots in `.claude/state/qa-2026-10-18/`):**
  - Q1-11 (P1), still on `c8d3b334`: the footer has no legal links (terms, privacy, cookies, withdrawal and refunds, imprint). Publishing them as footer items is this task: add a footer-crawl case in en and en-gb that each published legal page is linked from the footer. The help number +1 (213) 592-5150 QA-1 flags is the founder's WhatsApp number (TASK-238, D4), not a defect.
- **From TASK-182 (PR 270, `/break 270` hole 8):** AC-17's legal half ("a legal page additionally
  needs `lawyerReviewed`") has no test: TASK-182 removed a tautological case that combined a local
  `lawyerReviewed` constant no code read. Wire `lawyerReviewed` into the legal view's indexability
  here and assert a reviewed but not lawyer-reviewed legal page is `noindex,follow`, with a mutation
  that drops the `lawyerReviewed` term watched red.
- **From `/break 270` (HOLE 11 CARRIED, ruled by the reviewer; copied 2026-10-20):** the legal `changeLog` half: add an overlay row for legal `changeLog` in `pages-check.test.ts`, with a mutation dropping that field's push watched red, when the legal view lands here. The faq `q` and item `title` rows are TASK-184's.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-24, to the orchestrator (decision taken, open to overrule):** spec 041 §7 lists the
  imprint's field labels and the cookie table's column headings among the new message keys. The
  `en` unreviewed headroom was 20 counted keys (9 of 560, against the 5 % gate) and the work order
  says headroom is tight, so the 13 keys the spec names by id (`infoPages.legal.*`,
  `infoPages.cookies.change`, `company.controller`, `consent.privacyLink`) are message keys and
  the 16 labels live in the two legal files' frontmatter (`labels.register`, `labels.facts`). They
  render only on those two pages, which are `noindex` until a lawyer signs them, and the founder
  approves them with the document (batch 2). Moving them to `messages/` later is mechanical.
  Answer: open.
- **2026-10-24, to the orchestrator (urgent, for the company-identity row of PR 351):** with
  `registered: false` still committed, the about page renders `infoPages.company.notRegistered`,
  which says "We are registering it in Estonia". That is no longer true (ADR-0021). TASK-183 does
  not flip `company.ts` (the work order's fence); the company-identity row's flip makes that
  branch fixture-only and fixes it. Answer: open.

## Progress

- 2026-10-24: worktree, row `in_progress`, draft PR 375.
- 2026-10-24: legal template, five legal files in `en`/`en-gb`, trader-identity gate, router
  leaves, consent controller projection, Polish rename, site-link flips, no name in `company.ts`
  or on about (commit `929a420f`).
- 2026-10-24: unit and e2e cases, RoPA rows 2 and 3 and the spec 041 note, every touched suite
  green, mutations run (commit `d8ddefd0`); Linux footer baselines refreshed through the
  `visual:baselines` label.

## Result

PR [#375](https://github.com/itsahmeds/flowers-overseas/pull/375). The legal document template
(`src/modules/content/legal.ts`, `legal-body.ts`, `components/LegalDocument.tsx`: white sheet on
cream, `aria-hidden` stamp, version header, draft line, contents generated from the `##`
headings, change log, chips; the cookie register table, the re-open button and its phone dock;
the imprint `<dl>`), the five legal files in `en` and `en-gb` (`content/legal/**`: terms,
privacy and cancellation as own `regime: uk` files; cookies and imprint extend `en`), the
trader-identity gate (`isTraderIdentityComplete()` in `company.ts`, called by
`infoPageExists()`), the legal leaves in `resolveLocalePath()` / `localeChildParams()` and the
shared `src/app/[locale]/info-page-route.tsx`, the legal half of the head, JSON-LD breadcrumb and
`static.xml` (`infoPageHeadView()`: a legal page's `reviewed` is `reviewed && lawyerReviewed`),
`consentView().controller` (sentence or privacy link, chosen on the server), the Polish
`informacje-prawne` segment, the five legal links published, RoPA rows 2 and 3 corrected with the
"spec 041: no new processing" note, and no person's name in `company.ts`, on the about page or in
any content or message (founder, 2026-10-23). Tests: unit `tests/unit/legal-pages.test.tsx` (51
cases) plus updates to `info-pages`, `info-page-render`, `pages-check` (four legal overlay rows),
`site-footer`, `site-links-config`, `catalog-routes`, `seo-sitemap`, `consent-view`,
`home-honesty`, `i18n-messages-schema`, `locales-config`, `i18n-check` and `i18n-language-popup`;
e2e `tests/e2e/info-pages.spec.ts` (legal T-01, T-24, the footer crawl in `en`/`en-gb`, T-13).
13 new counted `en` keys, all `reviewed: false` (`en` unreviewed share 9/560 to 22/573, 3.8 %).
No local build, Playwright or Lighthouse run: CI is the gate of record; the Linux footer
baselines came from the `visual-baselines` workflow.

### Self-review

1. **AC map** (file and the test that proves it; tests in `tests/unit/legal-pages.test.tsx`
   unless named):
   - AC-1 (legal half): `tests/e2e/info-pages.spec.ts` "T-01 / AC-1 (legal half)" (200, one h1,
     `lang`, draft line, contents, no form) and the existing 404 cases for imprint, terms and
     privacy in four locales (Polish paths renamed); router: `src/modules/catalog/routes.ts`
     legal branch, "the router's prebuilt set is exactly the legal pages that exist".
   - AC-2 (registration gate): `src/modules/content/pages.ts` `infoPageExists`,
     `src/config/company.ts` `isTraderIdentityComplete`; "T-02 / AC-2" (three cases).
   - AC-4 (rename): `src/config/locales.data.ts`; "T-04 / AC-4"; `locales-config`, `i18n-check`.
   - AC-9: `legal.ts` `draftLineOf`, stamp; "T-09 / AC-9" (four cases, incl. the one-node diff).
   - AC-10: `legal-body.ts`, `legal.ts` `toc`; "T-10 / AC-10" (regime per file, contents equal an
     independent parse of the `##` headings with anchors, version and change log).
   - AC-11 (imprint half) and AC-39 (a), (e): `LegalDocument.tsx` `Facts`; "T-11 / AC-11, AC-39".
   - AC-13: table and button in `LegalDocument.tsx`; "T-13 / AC-13" (unit) and the T-13 e2e.
   - AC-17 (legal half, `/break 270` hole 8): `legal.ts` `indexReviewed`, `infoPageHeadView`;
     "T-17 / AC-17".
   - AC-21 (legal half): `src/config/site-links.ts`; "T-21 / AC-21"; e2e footer crawl;
     `site-footer`, `site-links-config`.
   - AC-25: `docs/compliance/ropa.md`; "T-25 / AC-25" (row 2, privacy coverage, cookie section).
   - AC-29 (unit half): `consentView.ts` `consentController`, the cookie interim swap in
     `legal.ts`; "T-31 / AC-29" (five cases).
   - AC-31 (`cancellation` and `terms` half): the two files; "T-33 / AC-31".
   - AC-37 (content half) and the founder's no-name ruling: "AC-37 (content half)" (three cases),
     `info-pages` T-11, `info-page-render` about.
   - Carried `/break 270` hole 11: `scripts/pages-check.ts` legal `proseOf`;
     `tests/unit/pages-check.test.ts` rows `changeLog.0.summary`, `links.0.label`,
     `labels.register.caption`, `interim.heading`.
2. **Mutations, each run and each red** (19, by script, the file restored after each):
   gate on `registered` only (1 red); gate always open (8 red); `notInForce` line dropped (1);
   imprint given a draft line (1); contents drop the last heading (4); regime hard-coded `eu` (3);
   VAT row always drawn (1); register drops a row (1); page button loses
   `data-fo-consent-reopen` (1); `&& lawyerReviewed` dropped (1); cookies unpublished (1);
   every "Sentry" removed from the cookie notice only (1); `consentView` never links (1);
   interim sections never swapped (1); controller name empty (2); charge sentence removed from
   the cancellation file (2); Polish segment back to `regulamin` (1); `changeLog` push dropped
   from `pages:check` (1); about back to `{representativeName}` (suite fails to load). One
   mutation came back green on the first try (only the "Who handles it" Sentry line removed): the
   section still named Sentry twice, so the assertion was right and the mutation too weak; the
   recorded red one removes every Sentry from the cookie section.
3. **Awkward cases tried (legal and consent text):** a document in force with no effective date
   and an `en-gb` terms that `extends` (refused, TASK-182's parser); a registry slot in a document
   that exists before the company (refused at parse); an unknown slot, an unknown or misfiled
   data block, a duplicate anchor, interim anchors that are not sections, a register without
   labels (each refused, naming the field); registered without a mailbox (no imprint, terms or
   privacy); a company with no VAT ID (no VAT label, no empty slot); privacy present vs absent
   (the banner projection and the cookie notice both swap, and only then); the honesty gate over
   every legal prose field (no relay word: "hold", "holds", "taken" with a florist were reworded;
   no "partner", "third party", price literal, scale claim, day count beside a freshness or
   promise word); no em dash in any new line; the approved A.1 sentence "A lawyer will review
   them" tripped the home reviews scan, so the scan exempts that one exact sentence under that one
   key (`tests/unit/home-honesty.test.ts`), not the key or the word.
4. **Left deliberately (carry-forwards):**
   - **Company-identity row (PR 351):** flipping `company.ts` to Flowers Overseas LLC (no
     `vatId`, `region`, the US address format, the colophon, `Organization`, RoPA Block E, the EIN
     env). Built for it: the controller sentence, about's "Who runs it" and the imprint read
     `company.ts`, so they switch to the LLC with a data edit only; `isTraderIdentityComplete()`
     exists; the imprint draws a VAT row only when `vatId` is set. The imprint prints the address
     on one line as the colophon does; the country name via `Intl.DisplayNames` is that row's
     (AC-36). Until then the about page still says "registering it in Estonia" (Escalations).
   - **TASK-281:** render `consentView().controller` in the settings panel, and have the layout
     pass `privacyHref` (`infoPageExists("privacy", locale)`) to `ConsentBanner`: both files are
     in PR 352 (TASK-279), so this PR leaves them alone; AC-29's e2e (the panel from the footer in
     four locales) lands there.
   - **After TASK-279 merges:** tighten the T-13 e2e to "on the committed build the button opens
     the panel, not the banner"; it is written to pass on both builds today.
   - **TASK-184:** `de`/`pl` drafts of the five legal files (labels included), the runbook's
     trader-identity checklist with PR 351 clause 7's items, the component-level a11y check of
     the imprint, terms and privacy views (mount `LegalDocumentPage` with
     `legalDocumentView(id, locale, { company })`), the legal-document visual baselines and the
     `/en/legal/cookies` Lighthouse URL.
   - **Lawyer points (⚖️, none settled here):** the interim cookie notice and the privacy
     transfers wording now that the controller is in the US; the formation clause; the CRD Art.
     16(d) and CCRs reg. 28 citations; non-perishable add-ons; the liability section (unwritten);
     the complaints / ADR body; governing law (Rome I Art. 6(2) protection stated); EU and UK
     Art. 27 representatives (nothing claims one); the German imprint without a named
     representative (no name printed, no completeness claim); the registered agent's address as
     the trader's address; processor DPAs in the LLC's name and Railway's DPA; "our florist" as
     the recipients disclosure; the controller sentence's layering in the compact banner; the UK
     transfer instruments named in the `en-gb` privacy notice; concrete retention periods for the
     hosting logs.
   - **Copy (founder, batch 2):** every legal file and the 13 keys ship `reviewed: false`; the
     exact texts are in the PR description.
