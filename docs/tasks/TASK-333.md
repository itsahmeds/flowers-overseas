
- 2026-11-04 (builder E333): built B1 to B6 and B8 (`emails/buyer.ts`, `buyer-facts.ts`, `buyer-register.ts`, `first-name.ts`), the buyer layout parts, attachments on the one `Mailer`, 54 keys (en; de/pl echoes), review-scope entries, RoPA row 13; unit, contract and integration (local PG16, stopped and deleted) green; 19 mutations red. Rebased on d764bf3cc (TASK-342, TASK-365: the attachment schema merged with spec 030a's). Record script `.claude/state/record-approval-333.py --check` passes. PR 472 ready. No process running.

# TASK-333 — Spec 016 buyer templates (task 3, part b): B1 order received (hero, recap, "Your order terms" foot block, terms PDF), B2 being made, B3 on its way, B4 delivered with the photo first, B5 cancelled, B6 refund, B8 credit note, `firstNameOf`, the buyer label map, the shared refund-line formatter, the `RELAY_PATTERNS` scan over buyer keys and renders

Row: `TASKS.md` → TASK-333. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-333`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-332, design: B1 and B4 redraw (spec 016 §14 A-founder-2026-10-14b).
- Spec 016 §12 task 3, buyer half; §5.2 B rows, `firstNameOf`, label map, refund line, banned phrases; §7; §8 consumer law; §14 A-founder-2026-10-14 and 14b. AC-21 (buyer), AC-24, AC-25, AC-38, AC-40, AC-41, AC-42.
- B1 exact hero "Thank you, {firstName}." / "Your flowers arrive in {city} on {date}."; the legal items, `checkout.legal.cancellation` and `cancelHow` only after "Your order terms"; subject and preheader free of cancel, refund, 14-day, terms. B4: photo first, the two exact lines, links only tracking plus footer contacts, subject "Delivered in {city}. Here is your photo.". B5 exact sentences per actor. B6 not sent for row 32 on a `cancelled` order.
- The refund-line formatter is shared with spec 018's tracking page (TASK-339): whichever lands first puts it in `src/modules/orders/`, the other imports it.
- Copy headroom (spec 003 A17): keys under `email` may be added `reviewed: false`; report every new key's text in `## Result` for the founder's copy batch.
- **Design gate:** do not build B1 and B4 from the description; wait for the redrawn `email-buyer-*` boards (B2, B3, B5, B6, B8 may start on the merged boards).
- **ACs owned:** AC-21 (B1 to B6, B8), AC-24, AC-25, AC-38, AC-40, AC-41, AC-42 (T-21 for those templates, T-24, T-25, T-38, T-40, T-41, T-42).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** special characters: Zoë, "Dr. Anna Nowak", "  Anna  Kowalska ", "J Smith", Kraków, "Zażółć gęślą jaźń"; money: a zero-minor-unit refund is impossible, so test 1 minor unit, PLN and GBP partial and full refunds through `Intl` in `pl` and `en-gb`; a relay phrase planted in a temporary key (en, de, pl) turns the scan red; "our florist" passes; a `refunded_full` order never reads "cancelled"; subject lines with a marker name (none). Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/016: §5.2, §7, §8, §9 AC-21, AC-24, AC-25, AC-38, AC-40 to AC-42, §10 matching T, §14
- docs/design/wireframes/email-buyer-*.dc.html (and the redraw)
- `src/config/honesty.ts`; spec 041 §14 (relay definition); `docs/advice/2026-10-14-post-purchase-psychology.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (b) (2026-10-22):** spec 010 §13 Q25: B1 lists every delivery of the purchase, one invoice per order attached (spec 016 needs a §14 pointer amendment; the `email-buyer-*` three-delivery state is spec 016's). Spec 018 §13 Q25 (approved): B1's foot block gains "You can see and manage this order in your account." linking `/{locale}/account/orders/{reference}`. Spec 020a request 3: B5 reads "You cancelled this order" for an admin cancel with `buyer_cancel`.

- **From the implementer's self-review (2026-11-04), handed on:**
  - **Spec 016 owner: the fixtures' weekday is wrong.** 17 October 2026 is a Saturday (18 October a Sunday); AC-24, AC-41, AC-45 and the `email-buyer-*` boards say "Friday 17 October" / "Saturday 18 October". The renders print `Intl`'s weekday; the tests assert "Saturday 17 October" and "Sunday 18 October". Fix the AC text and the boards.
  - **Founder and lawyer (slots, no text invented):** the terms PDFs (`TERMS_PDFS` in `src/config/notifications.ts`, empty: B1 is refused with `TERMS_PDF_MISSING` and retried until a PDF for the order's `terms_version` exists; 16-7's go-live check for a missing PDF is not built); their file names; the complaint path and dispute body (`B1_COMPLAINT_PATH_KEY`, null: no line printed, so AC-24's "every §2.1 item" is short of that one item until then); the trader identity is the footer's `company.operatedBy`, printed after the `company.ts` flip. `checkout.legal.cancellation` is added verbatim from spec 010/016, `reviewed: false`, and is **not** in the record script (lawyer-gated).
  - **TASK-334:** B1's invoice PDFs (`BuyerFactSources.invoicePdfs`, none yet, so B1 reads "Our terms are attached.") and AC-24's `notification_delivery_invoice` row; B8's PDF (`documentPdf`: until it is handed in, B8 throws `EMAIL_FACTS_MISSING` and retries). A credit note's stored gross may be negative; B8 prints its size.
  - **Copy batch (founder):** the builder-proposed texts and the readings that differ from the boards: B2's body is the spec's "Our florist is making your order. It arrives on {date}." (the board drew another sentence); the timing lines say "your original payment method" (the board said "the card you paid with"; a BLIK or iDEAL payment is not a card); B5 by the buyer keeps "Choose other flowers" (spec: "how to order again"; the board dropped it) but not the help note; B5 shows "Status: Cancelled" (AC-40; not drawn); B6's dates use the shared formatter ("9 October", as the tracking page), not the board's "9 October 2026"; the eyebrow of B2, B3, B5 and B6 is A-22's delivery line `emails.buyer.deliveryLine`. de and pl are English echoes, unreviewed.
  - **Spec 009 owner (freshness scan):** spec 010's sentence "Flowers are fresh, so the 14-day cancellation right does not apply after that." tripped the A11 scan (two words between "fresh" and "14-day"). `STATUTORY_RIGHT` in `src/config/freshness-claim.ts` removes only "14-day cancellation right / right to cancel / right of withdrawal" before the scan, as the module's header says that copy is meant to pass; must-pass and must-fail cases pinned. Confirm or replace with a decided-string record.
  - **TASK-343 / whoever holds the build slot:** no screenshot, Playwright or pixel baseline was taken (founder, 2026-11-04). T-21's per-locale snapshots are the 44 pinned markup files `tests/unit/__snapshots__/emails/buyer-*.html`; `/tests/unit/__snapshots__/emails/` is now in `.prettierignore` (the formatter had been rewriting the byte-pinned florist snapshots, main's `format:check` red).
  - **Not built here:** B3's delivery window (no field stores one; TASK-332's carry-forward), O-7's "left with" variant, the B9 review email (spec 022a). Spec 020a request 3's B5 half is built (the loader reads `cancelledByOf`, so an admin cancel with `buyer_cancel` reads "You cancelled this order."); TASK-362 keeps the confirmation half.
  - **Main (not this diff):** the branch's unit reds are main's at d764bf3cc: `catalog-product-view*`, `deferred-set`, `home-honesty`, `i18n-check` and `i18n:check` (`nav.*` unused), `i18n-draft`, `i18n-messages-schema` (`floristInbox.withdrawn.*`, `emails.floristPayoutStatement.*` not queued), `url-pii`, `zod-boundaries` (no line of this diff).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04 (builder E333): worktree `/Users/ahmed/dev/fo-wt-333` on `task/TASK-333-buyer-emails` from main ddc61cc05 (B1/B4 redraw merged, PR 470); row `in_progress`; draft PR opened. Next: attachments seam, buyer layout parts, B1 to B6 and B8, keys, tests.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#472](https://github.com/itsahmeds/flowers-overseas/pull/472). The buyer emails B1 to B6 and B8 as escaped-HTML templates on TASK-332's layout (`src/modules/notifications/emails/buyer.ts`, facts loaders `buyer-facts.ts`, registration `buyer-register.ts`, wired in `src/jobs/handlers.ts` with `buyerRefundLines` and the private-bucket photo reader), `firstNameOf` (`first-name.ts`), the buyer label map (`buyerStatusLabelKey`, spec 018's `tracking.headline.*`), the shared refund line (`refundLineValues` + `tracking.refundLine`), new layout parts (hero and lede, amount box, delivery panel, terms block with attachment rows, full-width photo, caption, text link; existing snapshots byte-identical), attachments on the one `Mailer` (merged with TASK-365's schema: PDF or JPEG, base64 or an `https` path, inline `content_id`, at most 10), `src/config/notifications.ts` (terms PDF and complaint-path slots), RoPA row 13. 54 English keys (53 `emails.buyer.*` for the copy batch, `.claude/state/record-approval-333.py --check` passes, 5 builder-proposed; plus `checkout.legal.cancellation`, lawyer-gated) with de/pl echoes. Tests: unit `email-buyer.test.ts` (102, 44 pinned markup snapshots), contract `resend-mailer` (+2), integration `email-buyer.test.ts` (4, new) and `notifications-pipeline` (+1), pins in `i18n-review-scope`, `i18n-messages-schema`, `checkout-config`, `freshness-claim` (+1). 19 mutations, each red. No build, server, Playwright, Lighthouse or screenshot (founder, 2026-11-04). Handed on: see Carry-forwards.
