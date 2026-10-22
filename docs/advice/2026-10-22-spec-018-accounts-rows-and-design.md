## Changes to task rows (for `/plan-tasks`, after the founder approves)

**TASK-344** (account): moves from "after launch" to the launch slice. Scope gains the C.3 core extension, the `buyer` surface (`__Secure-fo-buyer.*`, `Path=/`, `/api/auth/buyer`, `src/lib/auth/buyer.ts`), open sign-up with the global cap, first-sign-in link or create, the return path, `/{locale}/account` as the sign-in page, every credit note on the detail, the header link (if Q23), "Sign out on all devices". ACs: AC-10 (account), AC-23 (owner half), AC-24 (amended), AC-25 (amended), AC-26, AC-28 (account half), AC-34 (account half, amended), AC-36 (amended), AC-47 to AC-52, AC-62 (T-47 to T-52, T-62). Add dependency TASK-212 (same `src/lib/auth/` files) and the new account artboards. Recommended split: the core extension as its own small backend row first, so a regression in the admin and florist suites is isolated (about 1 day), then the account (about 3 days).

**TASK-345** (privacy): moves to the launch slice. Adds AC-29 and AC-30 as amended, AC-59, AC-60 (T-59, T-60); the export and erasure cover details, saved recipients and reminders; the inactive-account sweep step. Add dependencies on the two new rows below.

**TASK-346** (gates, pass B): moves to the launch slice. Adds AC-32 and AC-33 as amended (new pages, new spy flows), the cookie register rows `__Secure-fo-buyer.*` replacing `fo_session`, RoPA rows for accounts, saved recipients and reminders, and a check that `docs/compliance/lia-saved-recipients.md` exists before `account.recipients` is on. Add dependencies on the two new rows.

**New row A: account details, preferences and saved recipients.** Migration `NNNN_buyer_account` and its down file, `saveDetails`, `signOutEverywhere` (UI; the core call is TASK-344's), `saveRecipient`, `removeRecipient`, `buyerCheckoutProfile`, the sweep step for saved recipients, the DSAR runbook recipient SQL, the LIA draft for the founder. AC-53 to AC-55, AC-61 (T-53 to T-55, T-61). About 2.5 days. Depends on TASK-344.

**New row B: occasion reminders.** `createReminder`, `removeReminder`, `setReminderConsent`, `reminders.daily`, T18, the unsubscribe route and page, the `Mailer` headers field, the `unsubscribe` signed-link purpose. AC-56 to AC-58 (T-56 to T-58). About 2 days. Depends on row A and TASK-337. Not a launch gate (Q22).

**Checkout touchpoints (R1 to R4)** need a spec 010 amendment first; they belong with the basket amendment's checkout tasks, not in this spec's rows.

**TASK-337** (in the launch slice, todo): AC-27 is narrowed. Its schema half checks only that `recipient` has no saving column. The checks "no `saved_recipient` retention row" and "no `recipients` route" are withdrawn, because row A adds both. A one-line note in its brief; the row text stays.

**TASK-333** (spec 016 B1): gains the Q25 line only if the founder approves Q25.

## Design artboards needed (`/design 018`, desktop 1440 and mobile 390, before `/plan-tasks`)

- `account-sign-in-*`: `/{locale}/account` signed out; states sent, expired, signed out.
- `account-confirm-*`: the "Continue" page (reuse the florist board's pattern).
- `account-orders-*`: list with navigation; empty list.
- `account-order-detail-*`: refund lines, recipient recap, invoice and credit-note downloads, "Cancel for free" with its dialog, the save-recipient action (offered, saved, limit, not offered).
- `account-details-*`: form, errors, "Sign out on all devices".
- `account-recipients-*`: list, empty, remove dialog.
- `account-reminders-*`: consent box, list, add form, off dialog, the unsubscribe page (done, not valid).
- `account-privacy-*` and `privacy-request-*`: already owed by §5.3.
- `confirmation-*` (amended): the nudge above the quiet cancel line, and its sent state.
- `header-*` (amended, with the basket amendment): the "Account" link beside the basket.
- `email-account-sign-in` (T14) and `email-occasion-reminder` (T18).
- Owed by spec 010's amendment, listed so they are drawn in the same pass: checkout step 2 signed out (the sign-in link) and signed in (locked email, "Not you? Sign out"); step 1 with the saved-recipient choice and the save box.

## Self-check

**Building.** Every new route, table, action and job has an AC and a test case with its layer, and AC-47 to AC-62 continue 018's numbering, with AC-44 and AC-45 still skipped. I checked the core as built, not only the specs: `CookiePrefixSchema` refuses `__Host-`, `PathSchema` refuses `/`, `name` is `admin | florist`, pages carry no locale, `mailTags` is `["admin_sign_in"]`. The spec's old `__Host-fo-account` design could not have been built. C.3 lists the additive core changes, and AC-47 runs the admin and florist suites unmodified. The account task waits for TASK-212 because both edit `src/lib/auth/`. Migration and rollback are named (C.11). Status changes stay with `cancelOrder` and `orderService.transition` (AC-28, AC-62). Money is not touched beyond display. Risk: this amendment adds about 6 agent-days to the launch slice. The two new rows and the core split keep each PR reviewable.

**Google ranking.** Nothing new is indexable. The one change that matters is the fix in C.5. The old 303 sent crawlers to a robots-blocked URL, and a site-wide header link would have made a URL-only index entry likely. Now `/{locale}/account` serves 200 with `noindex` (AC-51). Public ISR pages stay byte-identical with or without the buyer cookie, so CWV and caching do not move (AC-36, AC-51). The header change moves spec 004's baselines once, together with the basket change. The Cloudflare bypass must gain `/*/account` without the trailing slash.

**Law and compliance.** Guest checkout stays the default, and there is no wall (C.8). Reminders use their own explicit consent, separate from marketing and transactional mail, with RFC 8058 one-click withdrawal and proof in `consent_log` (AC-56 to AC-58). Saved recipients reverse a founder ruling, so they are a question (Q21) and sit behind a flag and a signed LIA. They are minimised: health-related and funeral addresses are excluded, at most 20, 730 days. A recipient can erase them, and the 90-day order sweep is untouched (AC-27, AC-54, AC-55). Erasure and export cover every new table, invoices are kept by law, inactive accounts are closed, and nothing is redirected by preference (ADR-0006). ⚖️ The LIA balance and the Art. 14 route for saved recipients are flagged for the lawyer.

**The customer.** A buyer never needs an account. One click on the confirmation creates one, with no typing. Signing in is one email, with no password, in their language, and it returns them to where they were. After the confirmation cookie expires, the account is how a buyer cancels for free. The copy is positive and has no relay, refund or failure wording outside the cancel dialog (AC-9, AC-38). A cookie-less visitor sees the same public pages as everyone else.
