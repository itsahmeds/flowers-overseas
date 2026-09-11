# TASK-049 — `SiteFooter` — the dense colophon: four link columns (Sending · Destinations · Occasions · Delivery times · The guarantee | Company · How it works · For florists · Help and contact · Imprint) from `site-links.ts`, the company identity line from `company.ts`, the payment colophon (market methods + "card payments processed by Stripe"), the legal row (Terms · Privacy · Cookies · Withdrawal and refunds), the language list, `TrustMarks` empty state and the "Cookie settings" control

Row: `TASKS.md` → TASK-049. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-049-site-footer-colophon`. Spec §13's 2026-09-08 resolution note is binding and overrides §5 defaults where they differ. Design source of truth (match pixel-for-pixel): `docs/design/homepage-v1/README.md`, `docs/design/homepage-v1/tokens.css`, `docs/design/homepage-v1/homepage-desktop.dc.html`, `docs/design/homepage-v1/homepage-mobile.dc.html`, `docs/design/homepage-v1/identity.dc.html`, `content/brand/mark.svg`. Footer anatomy is the canvas's Ft4 dense colophon, not §5.3's minimal list. Every link comes from `site-links.ts` and **unpublished targets are not rendered at all** — never a dead link, never a disabled-looking one (AC-14, verified by TASK-054), so in Phase 0 the columns render their headings and only the entries 004 itself publishes; record in the PR body which of the canvas's link labels are present as text vs absent, because that list is what 007/008/011 flip. Company block renders the trading name and contact channel and **no** registry code, VAT id or address while `company.registered` is false (AC-9) — the canvas's `[COMPANY LEGAL NAME], [REGISTERED ADDRESS], [REGISTRATION NO]` placeholders must not ship as literal brackets; render the sentence without the missing clauses. **Payment colophon is a compliance trap:** the canvas lists BLIK · Klarna · PayPal · Visa · Mastercard · Apple Pay and "Card payments processed by Stripe". No payment method is live and the marks are third-party trademarks (§2, §8), so Phase 0 renders **no logo image**; ship the methods as a `payment-methods` entry in `site-links.ts`-style config with `available: false` and render only the Stripe processing sentence plus the localised "payment methods shown at checkout" line — the founder must not be able to read a live-method claim off the demo. Escalate if the design intent is read as requiring the method names in Phase 0; the honest form is the reviewer's call recorded in the PR. `TrustMarks` empty state renders nothing visible and reserves no box (no hole in the footer); "Cookie settings" ships here as the control and is **wired** to re-open the banner by TASK-051 (AC-9's re-open clause is verified after that task — note it in the PR body). Language list reuses spec 003's `LocaleSwitcher` links; no country flags (`plan/03` §2). Tests: T-11, and the five footer states in `/dev/components`. Design round 6: footer gains an occasion-reminder signup (UI + `POST /api/reminders` stub, double opt-in copy, provider seam, no email sent in 004); utility strip gains the help line — phone and WhatsApp +1 (213) 592-5150, Mon–Sat 8–20 CET — from `company.ts`. **Linux visual baselines — orchestrator ruling (`/review 30`, 2026-09-09):** `linux/` baselines (`en`, `de`, `ar-XB`, `footer-*`) are refreshed once from a single `ci:full` visual-job artifact after TASK-048, TASK-049 and TASK-052 have merged — owned by TASK-053's PR (orchestrator adds the label). No task produces them alone.

## Read

- `specs/004-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `docs/design/homepage-v1/README.md`
- `docs/design/homepage-v1/tokens.css`
- `docs/design/homepage-v1/homepage-desktop.dc.html`
- `docs/design/homepage-v1/homepage-mobile.dc.html`
- `docs/design/homepage-v1/identity.dc.html`
- `content/brand/mark.svg`
- `plan/03`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#30](https://github.com/itsahmeds/flowers-overseas/pull/30); `/review` pass recorded in `TASKS.md`.
