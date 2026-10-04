# TASK-182 — Spec 041 trust pages: the content module, the honesty gate and the five trust pages

Row: `TASKS.md` → TASK-182. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-182`; keep it current by editing this file, not the row.

## Binding

- `specs/041-trust-help-legal-pages.md` §12 task 1. Owns **AC-1 (trust half), AC-2 (the existence
  predicate), AC-3, AC-4 (the six segment keys), AC-5, AC-6, AC-7, AC-8, AC-11 (the about page and
  `company.ts`), AC-12, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21 (trust half),
  AC-24, AC-26**; tests **T-01 (trust half), T-02 (existence half), T-03, T-04 (segments), T-05,
  T-06, T-07, T-08, T-11 (unit: about and the three `company.ts` parse fixtures; e2e: no postal
  address on any built page), T-12, T-14, T-15, T-16, T-17, T-18, T-19, T-20, T-21 (trust half),
  T-24, T-26**.
- **Scope, in the spec's words (§12 task 1):** `src/modules/content` (schemas, provider, generated
  index, `infoPageExists`, `infoPageView`), `src/config/info-pages.ts`, `src/config/honesty.ts`
  (patterns **moved** out of `scripts/corridor-check.ts`, not copied; `corridor:check`'s cases
  unchanged), `pnpm pages:check` + the `pages-check` CI job (`needs: typecheck`) with the §11
  build-time summary table, `pnpm pages:index`, the six `PATH_SEGMENT_KEYS` for every locale, the
  five trust pages through the existing `[locale]/[segment]/page.tsx` and `resolveLocalePath()`,
  **all ten** `SeoPageType`s registered `byRule` (AC-17's table covers the legal types too),
  `BreadcrumbList` / `FAQPage` / `Organization`, `static.xml` membership, the `infoPage` link kind
  and the flips for `how-it-works`, `guarantee`, `help-and-contact` and `delivery-times` (retargeted,
  relabelled `footer.link.deliveryAndPayment`, `requiresDeliveryDates` dropped), the home's two
  guarantee/help links, `company.ts`'s `representative` and optional `supportEmail` with their
  refinements, and the `en`/`en-gb` content and keys of Appendix A.
- **No database** (`pnpm check:no-db`), no `fs` in the bundle (the generated typed index, the
  corridor precedent), no cookie read, no `Set-Cookie`, no `Vary`, **zero new client islands**.
  `src/modules/content` is registered in the layout manifest (§13 Q7, the recorded `plan/01` §5
  deviation).
- **Honest states from data:** the not-open line under every `<h1>` while
  `anyDeliveryDatesOpen()` is false; destination states from `corridorState()`, never from
  `countries.ts`'s `status`; payment methods only where `payment-methods.ts` marks them
  `available` (none in Phase 0); no address, registry, VAT or legal-form field before
  `registered`; no email, `mailto:` or empty slot while `supportEmail` is absent.
- **Copy (Appendix A, batch 1).** Copy it verbatim, including the §13 conforming edits of
  2026-10-04 (present tense for our florists, spec 004 §14 A22 clause 1; help Q11 "prints it on
  our card"). Every `en` key is `reviewed: true` only with a `reviewedBy` naming the founder's
  batch approval (AC-7); an agent never marks copy reviewed. Content files carry their own
  `reviewed` flag and never count toward the 5 % gate (§7). Field labels (Name, Phone, Country,
  Status, Guide, …) go to the founder in the PR (A.1 last line).
- **AC-16.** No number of days of freshness anywhere; the three guarantee keys carry no "7-day" in
  any locale (TASK-176 retired `nav.utility.guarantee`; TASK-177 `home.proof.guarantee.title`;
  TASK-172 `trust.guarantee.name`). T-16's mutation case must go red when "7-day" or `{days}` is
  restored.
- **Spec 009 §14 A11, bullet 1:** the PDP's promise text and the guarantee page's promise sentence
  are the same words, and the PDP links to the guarantee page where `infoPageExists("guarantee",
  locale)` is true. This task owns `infoPageExists`, so it wires that link (§6 "the product page's
  guarantee link") and pins the two texts equal in a test.
- **Design round 2 (spec 041 §14 A1; spec 004 §14 A24; 2026-10-05).**
  - **Artboards.** The round-2 artboards on PR 189 bind, at 1440 × 900 and 390 × 844, with spec
    004's laptop band at 1280 × 800 and 1512 × 945: `how-it-works-*`, `guarantee-and-delivery-*`,
    `help-and-contact-*` and `about-*`. Each annotation's "Build" row binds the structure. The
    2026-10-04 v2 drawings no longer bind.
  - **Help.** The H1 and the not-open line sit above both columns. The contact block is first in
    the DOM, on columns 8–12. The first four Q&As sit beside it and the other eight follow in two
    CSS columns. The 01–12 numbers are `aria-hidden`. AC-15 is unchanged.
  - **About.** The DOM order becomes H1 · status · intro · who runs it · why · today · the
    company. The repeated name is `aria-hidden`.
  - **Guarantee, delivery, how it works.** DOM order is unchanged, and the seal and the route
    rings are `aria-hidden`.
  - **Phone.** The WhatsApp dock on help, guarantee and delivery, and the Send flowers dock on how
    it works, are spec 004 AC-48's bar from TASK-195. The back link is AC-50's.
  - **Copy, founder copy pending, all `reviewed: false`.**
    - The four not-open replacement sentences of spec 041 §14 A1 clause 3 (P8). The originals are
      not shipped, and each file holding a replacement is `reviewed: false`.
    - `company.support.hours` "Message us any time, 24/7. We reply within a few hours." (P6, no
      em dash). AC-12 and T-12 assert this text.
    - The dock label "WhatsApp {phone}" (P7).

    Never mark any of them reviewed.
- **Class:** not review-only (an SEO gate, i18n tooling that decides indexability, compliance
  copy). `/review` and `/break` both run.

## Read

- `specs/041-trust-help-legal-pages.md` — `## 0. Index`, then §2, §5, §6, §7, §8, the ACs above,
  §10, §12 task 1, §13 (Q1, Q2, Q4, Q7 and the two notes at the end), Appendix A.
- Artboards, desktop and mobile, **round 2 (PR 189)**: `docs/design/wireframes/how-it-works-*.dc.html`,
  `guarantee-and-delivery-*.dc.html`, `help-and-contact-*.dc.html`, `about-*.dc.html`; each
  annotation block's First screen, Laptop band, Build and Copy rows.
- `specs/041-trust-help-legal-pages.md` §14 A1; `specs/004-design-system-layout.md` §14 A24
  clauses 4 and 10, AC-48, AC-50; `docs/design/audits/2026-10-05-round-2.md`.
- `specs/009-product-page-date-picker.md` §14 A11; `specs/004-design-system-layout.md` §14 A22.
- `docs/codebase-map.md`; `src/config/site-links.ts`, `src/config/company.ts`,
  `src/config/locales.data.ts`, `src/config/voice.ts`, `scripts/corridor-check.ts`,
  `src/modules/seo/indexability.ts`, `src/app/[locale]/[segment]/page.tsx`,
  `src/modules/ui/home/HowItWorks.tsx`, `src/modules/ui/home/HomeFaq.tsx`.

## Carry-forwards

- **From `/plan-tasks` (2026-10-04):** dispatch only after TASK-172 and TASK-177 (PR 174) have
  merged: AC-16 asserts the strings they change, and PR 174 rewrites `HowItWorks.tsx`,
  `HomeFaq.tsx` and the three message files. Build the home links on the v2 components.
- **From `/plan-tasks` (2026-10-04):** `company.support.hours` already reads "Message us any time,
  24/7 — we reply within a few hours." in `en`, `de` and `pl` (TASK-176); AC-12 only asserts it.
  **Superseded 2026-10-05 (spec 041 §14 A1 clause 4):** this task changes it to "Message us any
  time, 24/7. We reply within a few hours." with no em dash, `reviewed: false`, and AC-12
  asserts that.
- **From spec 004 §14 A24 (2026-10-05):** **blocked until PR 189 (design round 2) merges**, and
  dispatched after TASK-186 (the frame) and TASK-195 (the phone chrome, the dock, the back link)
  as well as the dependencies above.
- **From `/plan-tasks` (2026-10-04):** the founder approved Appendix A with the spec ("approve 041")
  before the conforming edits. The 14 Appendix A strings those edits change (spec 041 §13, the
  orchestrator's table) carry that approval once the founder has
  seen the list (the orchestrator's `/plan-tasks` report, 2026-10-04). Before marking them
  reviewed, check the decisions log or the PR thread for that acknowledgement; if there is none,
  escalate. Do not mark them reviewed yourself.
- **From `/plan-tasks` (2026-10-04):** T-08 and the AC-8 scan iterate over `listInfoPages()`, so
  TASK-183's legal pages and TASK-184's `de`/`pl` drafts fall under them with no edit. T-12's
  imprint surface arrives with TASK-183, which extends T-12.

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
