# Runbook: info and legal pages (edit, approve, version, publish, and the trader-identity flip)

| Field | Value |
|---|---|
| Severity | not an incident: the routine procedure for the ten pages of spec 041 |
| Detect | a red `pages-check` job; a footer item missing in one locale; a draft line that should be gone |
| Owner | founder (English copy, approvals, the flip), native reviewers (`de`, `pl`), the lawyer (`plan/13` B4) |
| Last tested | 2026-10-25 (spec 041, TASK-184) |

Spec 041 is the contract behind every step below. Nothing here needs a database, a deploy hook or
a template edit: every page is a committed file under `content/`, and every switch is data.

## 0. The five-second model

- **Ten pages, two families.** Trust pages live in `content/pages/{locale}/{pageId}.md` (how it
  works, guarantee, help, about, delivery). Legal documents live in
  `content/legal/{locale}/{docId}.md` (imprint, terms, privacy, cookies, cancellation). The URL of
  each, per locale, is `src/config/info-pages.ts` plus the segments in `src/config/locales.data.ts`.
- **A page exists where its file exists** (`infoPageExists()`, spec 041 AC-2). Delete the file and
  the URL, the footer item, the sitemap row and every in-body link to it go, with no other edit.
  Imprint, terms and privacy also wait for the complete trader identity
  (`isTraderIdentityComplete()`: `registered` and a `supportEmail`), section 6.
- **Indexing is by rule, never by hand.** A trust page is `index,follow` only when its file is
  `reviewed: true`, its locale passes the 5 % gate and the deployment is the indexing one. A legal
  page also needs `lawyerReviewed: true`. Everything else is `noindex,follow` and out of every
  sitemap and hreflang cluster (spec 041 AC-17, AC-18, AC-20).
- **Two gates before a merge.** `pnpm pages:check` (the honesty rules, one line per problem) and
  `pnpm pages:index` (regenerates `src/modules/content/corpus.generated.ts`, the typed index the
  pages render from; a stale index means the site serves the old text).

## 1. Edit a page

1. Edit the `.md` file. The frontmatter is checked by `InfoPageContentSchema` (trust) or
   `LegalDocumentSchema` (legal); a legal body is the document, and its `##` headings are the
   contents. Keep `{#anchor}` on a legal heading when you reword it: links and the cookie notice's
   `interim.sections` point at anchors.
2. Bump `updatedAt` (it is the sitemap's `<lastmod>`).
3. Run `pnpm pages:check` and `pnpm pages:index`, then commit both the file and the regenerated
   index. `pages:check` names the file, the field and the rule of every problem: a banned word,
   relay language ("partner", a florist accepting an order), a price literal, a number of days of
   freshness, a claim on a trust page without its `honestyAllow` sentence.
4. An edited `en` file goes back to `reviewed: false` until the founder approves the new text.
   Changing an `en` file leaves the `de` and `pl` drafts behind: redraft them in the same PR, still
   `source: machine`, `reviewed: false`.

## 2. Approve a page (the founder)

Only the founder marks English copy reviewed; only a native reviewer marks a translation reviewed;
an agent never does either (spec 003 §14 A17, `glossary.en.md`).

1. Read the exact text on the preview.
2. In the file set `reviewed: true`, `reviewedBy` (who, and the batch or message that approved it)
   and `reviewedAt` (the date). `pages:check` refuses `reviewed: true` without both.
3. Run section 1's two commands and commit. The page lifts to `index,follow` by rule in the
   indexing deployment, joins `static.xml` with its alternates, and nothing else changes.

A `de` or `pl` file additionally drops its "not yet checked" line (`infoPages.status.untranslated`)
the moment it is `reviewed: true`, and joins the hreflang cluster once its locale also passes the
5 % gate (spec 041 §6). A legal document in `de` or `pl` also needs the lawyer to sign the German
or Polish wording before `lawyerReviewed` may be set on it.

## 3. Version a legal document

Every change to a legal text, however small, is a new version.

1. Bump `version` (semver: `0.1.0` → `0.1.1` for wording, `0.2.0` for a change of substance;
   `1.0.0` is the first version in force with orders).
2. Add a `changeLog` line: `{ version, date, summary }`, one plain sentence.
3. Bump `updatedAt`, run section 1's commands, commit.

The `terms` document's `version` is the value checkout snapshots into `order.terms_version`
(spec 002 §5.1) once orders open, so an order is always governed by the version it was placed under.

## 4. Publish a lawyer-reviewed version

When the lawyer returns a reviewed text (`plan/13` B4):

1. Replace the body with the reviewed text, keeping the `{#anchor}`s the other pages link to.
2. Bump `version`, add the `changeLog` line ("Reviewed by our lawyer."), set
   `lawyerReviewed: true` and `lawyerReviewedAt`.
3. For terms and cancellation, and only once orders open: `inForce: true` and `effectiveFrom`.
   The schema refuses `inForce: true` without `effectiveFrom`.
4. Run section 1's commands, commit. The unreviewed line goes, the page lifts to `index,follow` by
   rule if its copy is also `reviewed`, and nothing else changes (spec 041 AC-9).

## 5. The `de` and `pl` drafts

All ten pages have a `de` and a `pl` file (TASK-184): machine drafts, `source: machine`,
`reviewed: false`, each rendering the untranslated line under its `<h1>`, each `noindex,follow`
and outside every sitemap and hreflang cluster. German uses `Sie`; Polish uses `Ty` on the trust
pages and `Państwo` in the five legal documents (`glossary.pl.md` §1). The help page's funeral
answer stays English in both drafts until a person writes it (spec 003 §14 A15 clause 4). The four
terms the pages turn on (guarantee, withdrawal, imprint, our florist) are in each locale's
glossary. A native reviewer works through them with section 2; the lawyer adds the legal wording.

## 6. The trader-identity flip checklist

The imprint, the terms and the privacy notice exist only once `isTraderIdentityComplete()` is true:
the company is `registered` in `src/config/company.ts` with its registry facts **and** a
`supportEmail` (spec 041 §14 A-founder-2026-10-23 clause 1). The registry facts (Flowers Overseas
LLC, Wyoming Secretary of State, 2026-002113883, the registered address) are entered by the
company-identity task of that amendment; adding the support mailbox is then the flip. One PR, in
this order:

1. **The data edit.** If `registered` is still `false`, enter the registry facts and set it to
   `true` first; then add `supportEmail`. `CompanySchema` refuses an incomplete identity, naming
   the missing field. If the mailbox is Google Workspace, add Google as a processor to
   `docs/compliance/ropa.md` and to both privacy files in the same PR.
2. **What changes by itself, to check on the preview:** imprint, terms and privacy answer 200 in
   every locale with a file (`/en/imprint`, `/en-gb/imprint`, `/de/impressum`, `/pl/dane-firmy`,
   and the legal leaves); their footer items appear; the help page's personal-data line links the
   privacy notice; the consent banner's controller sentence becomes `consent.privacyLink`; the
   cookie notice's two interim sections become one link to the privacy notice (spec 041 AC-29).
3. **The page-level axe run** on the three gated pages in `en` plus `/de/impressum`: in
   `tests/a11y/info-pages.spec.ts`, replace the three `/dev/components/trader-identity/*` audits
   with `/en/imprint`, `/en/legal/terms`, `/en/legal/privacy` and `/de/impressum`, label the PR
   `ci:full`, and read the `a11y` job: zero serious or critical, no exception list.
4. **The imprint's visual baseline:** add `{ name: "info-imprint", url: "/en/imprint" }` to
   `TEMPLATES` in `tests/visual/info-pages.spec.ts`, run the `visual:baselines` label flow
   (`docs/runbooks/visual-baselines.md` §2), compare the PNGs with
   `docs/design/wireframes/legal-template-*` and commit them.
5. **The five legal risks the founder carries until the lawyer rules** (spec 041 §14
   A-founder-2026-10-23 clause 7, AC-40). None of them may be described anywhere on the site as
   resolved, and no page may say "compliant", "GDPR compliant", "Angaben gemäß" or "reviewed by a
   lawyer". Confirm each is with the lawyer before the flip merges:
   - ⚖️ **(a) The German imprint without a named person.** DDG §5(1) no. 1 asks a legal person's
     imprint to name its authorised representative, and the founder's ruling omits that name, so
     the imprint is incomplete for German buyers (a fine up to EUR 50,000 under DDG §33, or a
     competitor's warning letter under the UWG). The lawyer decides whether a professional managing
     agent can be named instead. Until then the imprint makes no completeness claim. This risk
     starts the day the support email is added.
   - ⚖️ **(b) The Art. 27 GDPR representatives** in the EU and the UK, "not appointed" in the RoPA.
     The lawyer decides whether they must exist now or before the first order. Until an entry
     exists in `company.ts` no page claims either.
   - ⚖️ **(c) The registered agent's address as our address.** CRD Art. 6(1)(c) and the UK CCRs
     Schedule 2(c) ask for the geographical address where the trader is established; the lawyer
     confirms the agent's address meets that. The founder checks with the registered agent that
     it accepts mail for the company (CAN-SPAM, for spec 017's marketing email).
   - ⚖️ **(d) The DPAs in the controller's name.** The processor terms accepted before the LLC
     existed (Vercel, Railway, Cloudflare, Sentry, Neon): do they bind the LLC, or must they be
     re-accepted in its name? The RoPA's "DPAs still to be filed" table records it.
   - ⚖️ **(e) The transfers wording** in the cookie and privacy notices, now that the controller
     itself is in the United States. The lawyer rewrites those sentences in the B4 review.
6. Run section 1's commands and the unit suite, merge, and read the production footer in all four
   locales.

## 7. The go-live copy batch

When the first country becomes operational, `infoPages.status.notYetOpen` disappears from every
trust page by itself (`anyDeliveryDatesOpen()`, spec 041 AC-6). The sentences below say in their
own words that we are not open yet. They do not change by themselves: the founder approves their
replacements as **one batch** with the go-live (spec 041 §12), and the `de` and `pl` drafts follow
in the same PR.

| File | Sentence |
|---|---|
| `content/pages/en/how-it-works.md` | "Every country yet." / "We have written guides for seven countries in Europe. We will open them one at a time." |
| `content/pages/en/about.md` | "We are not taking orders yet. We have written guides for seven countries in Europe and will open them one at a time, starting with Poland." |
| `content/pages/en/delivery.md` | "How delivery will work"; "Until a country opens, it has a guide and no dates."; "We are not taking payments yet. When we open, you will pay us …" |
| `content/pages/en/help.md` | "Can I order now?" / "Not yet. We will open one country at a time. Until then you can look around, but nothing can be paid for." |
| `content/legal/en/privacy.md` | "We are not taking orders yet, so today this website processes very little."; the section "What we will process when orders open" and "This part describes the future: none of it happens yet." |
| `content/legal/en/terms.md`, `cancellation.md` | `inForce: false` and the "First draft, not in force" change-log line: these change with section 4, not with the copy batch |

## 8. Gates that cover these pages

| Gate | What it holds | Where |
|---|---|---|
| `pages:check` (CI job `pages-check`) | the honesty rules over every content file | `scripts/pages-check.ts`, `tests/unit/pages-check.test.ts` |
| unit | existence, the view models, indexability, the untranslated line, the drafts | `tests/unit/info-pages*.test.ts*`, `tests/unit/legal-pages.test.tsx` |
| contract | the schema and hreflang fixtures `seo:validate` reads | `tests/contract/info-pages-seo-fixtures.test.ts` |
| e2e | the pages, the footer, the drafts, the crawl (T-22) | `tests/e2e/info-pages.spec.ts`, `tests/e2e/info-pages-crawl.spec.ts` |
| a11y | axe on the seven `en` pages, two drafts, `/ar-XB/help`, and the gated views | `tests/a11y/info-pages.spec.ts` |
| visual | the trust, help and legal templates, the RTL help page | `tests/visual/info-pages.spec.ts`, `tests/visual/pseudo-rtl.spec.ts` |
| Lighthouse | `/en/how-it-works`, `/en/help`, `/en/legal/cookies` | `tests/fixtures/seo/lighthouse-urls.json` |
