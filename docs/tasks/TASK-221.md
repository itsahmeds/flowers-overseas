# TASK-221 — Spec 012 partners and applications: migration `NNNN_partner_terms_and_retention`, partner pages, terms, coverage, blackouts, payout mapping, the status graph and its preconditions, applications through spec 011's queries, convert and reject, the two retention handlers

Row: `TASKS.md` → TASK-221. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-221`; keep it current by editing this file, not the row.

## Binding

- `specs/012-admin-v0.md` §12 task 11. Owns **AC-15, AC-16, AC-17**; tests **T-17–T-20, T-24 and T-25 for the partner and application templates**.
- **Migration `NNNN_partner_terms_and_retention` with `.down.sql` (§5.1):** `fulfillment_partner.terms_signed_at` and `terms_version` with their paired check; `partner_application.status_reason`; retention rows `audit_log` (3 years) and `auth_email_send` (7 days) with sweep handlers. No application or session retention row: those are spec 011's (TASK-211, ruling R2).
- **`src/modules/partners` (§5.2):** `createPartner`, `updatePartner`, `recordTerms`, `saveCoverage`, `saveBlackout`, `saveMapping`, `partnerStatusPreflight`, `setPartnerStatus`, `convertApplication`, `rejectApplication`, each with its zod schema. Phones E.164 for the partner's country; payouts positive integer minor units with a currency in `currency`; every edit carries `updated_at` and a stale save changes nothing.
- **Status graph (§2.5):** only its edges; `→ active` needs signed terms, at least one coverage row, at least one fulfillable mapping with a payout and the contact for the chosen channel; a `demo` partner can only be offboarded. Partner names and contacts appear on no public page.
- **Applications only through spec 011's queries** (`listFloristApplications`, `setFloristApplicationStatus`); convert creates one linked `onboarding` partner; reject needs a reason, stored in `status_reason` in the same admin transaction; the detail page calls `logAdminRead`.
- **Design.** `docs/design/` is the source of truth: match the artboards named under Read pixel for pixel, and keep `system/components.dc.html` in step with `src/modules/ui` in the same PR.
- **Class:** not review-only (`CLAUDE.md` DoD §4): a migration, money (payouts) and partner go-live. `/review` and `/break` both run.

## Read

- `specs/012-admin-v0.md`: `## 0. Index`; §2.5; §5.1 (`NNNN_partner_terms_and_retention`); §5.2 (the partners row, the matrix); §5.3; §8 item 3; §9 AC-15–AC-17; §12 task 11.
- `specs/011-for-florists-vendor-inbox.md` §5.2 (the admin queries); `docs/tasks/TASK-018.md`, `TASK-213.md`.
- Artboards: `docs/design/wireframes/admin-partners-{desktop,mobile}.dc.html`, `admin-partner-detail-{desktop,mobile}.dc.html`, `admin-applications-{desktop,mobile}.dc.html` (not drawn yet; `/design` draws it before this task is dispatched).

## Carry-forwards

One dated bullet per `/review`, newest last.

_None recorded._

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
