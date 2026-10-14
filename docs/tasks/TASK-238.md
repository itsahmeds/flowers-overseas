# TASK-238 — "Help & WhatsApp" opens WhatsApp, and the support line drops "24/7"

Row: `TASKS.md` → TASK-238. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

Founder rulings D4, 2026-10-14 ("R ok, D1–D5, …" and "help number is same as whatsapp";
`docs/decisions-log.md`). On its own this is the review-only class (a link target and one copy
value, nothing that feeds `<title>`, a meta description or structured data). It ships in the
**TASK-233 feature PR** (one agent with TASK-233 and TASK-237, branch `task/TASK-233-…`), because
it edits the same header strip, phone Menu and footer; that PR keeps the breaker.

- **Spec 041 §14 A-founder-2026-10-14d, clauses 1 to 4.**
  1. `company.support.hours` in `en` and `en-gb` is exactly **"Message us on WhatsApp. We reply
     the same day."** everywhere it renders (the footer, the header's help line, the phone docks).
     No message value in any locale contains "24/7". The `en` and `en-gb` values ship
     `reviewed: false` until the founder's own `record-approval` run (spec 003 §14 A17 clause 5);
     `de` and `pl` are drafts with spec 003 §14 A15 clause 2's meta (`pnpm i18n:draft`). This also
     removes the footer's em dash ("24/7 — we reply").
  2. `company.ts` keeps `phoneE164` `+12135925150` and `phoneDisplay` unchanged.
  3. Every control labelled by `company.support.label` and every WhatsApp link has `href` exactly
     `https://wa.me/12135925150`, built from `phoneE164` with the `+` removed, no query string,
     never `tel:`. Today `SiteHeader.tsx` (L228 the strip, L342 the Menu) and `footerView.ts`
     (L198) build `tel:` links.
  4. Unchanged: AC-12's single-source rule (every surface reads `company.ts` and the same keys),
     the `supportEmail` rules, "Mon–Sat 8–20" absent.
- **Owned:** spec 041 **AC-34** for the header strip, the phone Menu and docks and the footer (the
  help page's half is TASK-182's, which builds that page), and **AC-12's amended last sentence**
  (the hours value; no "24/7" in any message file). The rest of AC-12 stays TASK-182's. **T-36**
  for those surfaces: `/en`, a product page and `/pl` at 390 and 1440 (`/en-gb/help` joins in
  TASK-182).
- **Gates:** `pnpm gates:cheap` with the block pasted; CI green on the head with `ci:full`;
  `/review` (and `/break`, with the feature PR). Mutations watched red, from T-36: the help line's
  `href` back to `tel:+12135925150`; `?text=` added; "24/7" restored to one value in one locale.

## Read

- `specs/041-trust-help-legal-pages.md`: `## 0. Index`, then §14 A1 clauses 2 and 4,
  A-founder-2026-10-14d, AC-12, T-12
- `docs/codebase-map.md`
- `src/config/company.ts`, `src/modules/ui/layout/SiteHeader.tsx`,
  `src/modules/ui/layout/footerView.ts`, `messages/*.json` (`company.support.*`)

## Carry-forwards

- **From the site test (2026-10-14):** QA summary "Words and look": the help number sits beside
  "24/7, we reply within a few hours", and the footer reads "24/7 — we reply".

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Pending._
