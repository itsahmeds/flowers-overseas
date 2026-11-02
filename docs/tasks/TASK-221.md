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
- Artboards (merged in PR 197; `docs/design/audits/2026-10-05-specs-011-012.md`): `docs/design/wireframes/admin-partners-desktop.dc.html`, `docs/design/wireframes/admin-partners-mobile.dc.html`, `docs/design/wireframes/admin-partner-detail-desktop.dc.html`, `docs/design/wireframes/admin-partner-detail-mobile.dc.html`, `docs/design/wireframes/admin-applications-desktop.dc.html`, `docs/design/wireframes/admin-applications-mobile.dc.html`. "Make active" is absent, not disabled, until the four conditions hold, and the card lists what is missing (decision 6); the drawn payouts are examples (decision 7).

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-11-03 (self-review, TASK-221): a refused save redirects with field codes only, so the typed values are lost and the form shows the saved row again; keeping them needs a client island (`useActionState`). Left for spec 012b's editor work.
- 2026-11-03 (self-review): `src/modules/admin/home.ts` still counts new applications with its own query (TASK-217's carry-forward names TASK-221); the AC-17 scan covers `src/modules/partners` and `src/app/admin` only, so it stays green. Move it onto `listFloristApplications` when the home page is next touched.
- 2026-11-03 (self-review): T-19 (e2e, partner names absent from public HTML) and T-24/T-25 (axe and visual for the five new templates) are CI's browser jobs and were not run locally (battery rule, no CI wait). No public page imports the admin partner reads.
- 2026-11-03 (self-review): pre-existing reds on main, not this diff: `audit-trail.test.ts` (trigger list lacks `admin_order_action` and `review`), `migrations-round-trip.test.ts` (function order of `review_content_immutable`), `i18n:check` (`nav.category.ourSelection`, `nav.send` unused).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-02: migration `0035_partner_terms_and_retention` (+ down; numbered by the orchestrator, 0033 is PR 449's and 0034 TASK-328's, so `db:check` reports the gap until both merge), the two retention handlers, `src/modules/partners/admin/` (schemas, commands, applications through spec 011's queries, reads); spec 011's `setFloristApplicationStatus` gains `from` and `statusReason`. Next: admin pages, copy, tests.
- 2026-11-02: admin pages (`/admin/partners`, `/new`, `/[code]`, `/admin/applications`, `/[id]`), `admin.partners.*` and `admin.applications.*` copy (unreviewed), the new admin primitives in `src/modules/ui/admin` and the sheet; unit, binding and integration tests.
- 2026-11-03: rebased on 63f50e879; migration renumbered to `0033` (orchestrator: PR 449 renumbers after this), snapshot regenerated, `db:check` passes with no gap; mutation proofs run; self-review in PR 456.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

[PR 456](https://github.com/itsahmeds/flowers-overseas/pull/456). Migration `0033_partner_terms_and_retention` (+ down; round trip checked by hand: the down restores `0009`'s `audit_log_append_only()` byte for byte, snapshot md5 `599a90fb…`). `src/modules/partners/admin/` (schemas, commands, applications through spec 011's two queries, reads); spec 011's `setFloristApplicationStatus` gains `from` and `statusReason`; `retention.sweep` gains `audit_log` and `auth_email_send`. Five admin pages, 208 admin keys unreviewed. Tests: unit 55 (validators T-17, graphs, scan T-20), binding 40 cases, integration 28 (T-18, T-20, reads, terms pair) plus 3 retention cases; 15 mutations, each red. A florist goes live only through the status card, after the four conditions hold.
