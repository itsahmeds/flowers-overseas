# TASK-344 — Spec 018 customer account (task 4, after launch): the account surface on spec 012's core (`__Host-fo-account.*`, `/{locale}/account`), T14, orders list and detail with refund lines and the recipient recap until the sweep, "Cancel for free" from the detail, the owner-session invoice download, the footer link and confirmation nudge, the cookie register

Row: `TASKS.md` → TASK-344. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-344`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks`; re-scoped 2026-10-22 (b) to the launch slice by spec 018 §14 A-founder-2026-10-22 and `docs/advice/2026-10-22-spec-018-accounts-rows-and-design.md`. Size L (about 3 days). Merges after: TASK-351, TASK-212, TASK-337, TASK-340, TASK-342, TASK-217, PR 336 (design).
- Spec 018 §12 task 4 as amended: C.1 (launch timing), C.3 (the `buyer` surface: `__Secure-fo-buyer.session-token`, `.csrf-token`, `.callback-url`, each `Path=/`, `/api/auth/buyer`, `src/lib/auth/buyer.ts`, `requireBuyerContext()`), C.4 (open sign-up, enumeration-safe, the global cap `BUYER_LINK_HOURLY_CAP` 300 with the alert at 100, first sign-in links or creates the customer, the return path), C.5 (`/{locale}/account` is the sign-in page and the order list, never a redirect), C.6 (the confirmation nudge), C.7.1 (orders, every credit note, "Cancel for free" through spec 013's `cancelOrder`), C.13 (`account`, `account/sign-in/confirm`, `account/orders/[reference]`), the header "Account" link (Q23) while `account` is on.
- The core extension (C.3 "Core extension") is TASK-351's and merges first; this task configures the surface on it. "Sign out on all devices" as a page control, details, recipients and the checkout seam are TASK-352's; reminders TASK-353's.
- Public ISR pages byte-identical with and without the buyer cookie, no `Set-Cookie`, no `Vary: Cookie` (AC-36 as amended, AC-51).
- **ACs owned:** AC-10 (account), AC-23 (owner half), AC-24 (amended), AC-25 (amended), AC-26, AC-28 (account half), AC-34 (account half, amended), AC-36 (amended), AC-47 (buyer surface half), AC-48, AC-49, AC-50, AC-51 (replaces AC-13's account half), AC-52, AC-62 (T-10 account half, T-23 owner half, T-24 to T-27 as amended, T-28 account half, T-35, T-47 surface half, T-48 to T-52, T-62).
- **Built from the merged artboards** of PR 336 (`account-sign-in-*`, `account-orders-*`, `account-order-detail-*`, `confirmation-*`, `chrome-*`, `email-account-*`); the confirm page reuses the florist board's pattern. If a board is missing, stop and escalate.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** the six address cases of AC-48 with byte-identical 303s, the response written before the mailer call; 300 buyer sends in the trailing hour; a replayed session cookie after sign-out; admin and florist cookies on account routes and a buyer cookie under `/admin` and `/vendor`; another customer's order by reference (404 under RLS); the 61st minute of a link; GET twice then POST; a return path `https://evil`, `//evil`, `/\evil`, `%2F%2Fevil`, `/en/admin`; a redacted customer never linked; detail before and after the 91-day sweep. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy. Guest checkout stays the default; nothing pushes toward an account.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/018: §14 A-founder-2026-10-22 (C.1 to C.6, C.7.1, C.10, C.13 to C.17, AC-47 to AC-52, AC-62) and `docs/advice/2026-10-22-spec-018-accounts-rows-and-design.md`; §5.2 account, §5.3, §9 AC-10, AC-13, AC-23 to AC-26, AC-28, AC-34, AC-36, §10 matching T
- specs/012 sign-in core; specs/011 §12 link design
- `docs/compliance/cookie-register.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (b) (2026-10-22):** the advisor memo `docs/advice/2026-10-22-spec-018-accounts-rows-and-design.md` and spec 018 §14 A-founder-2026-10-22 supersede this brief's Binding where they differ: launch slice; the surface is `buyer` (`__Secure-fo-buyer.*`, `Path=/`, `/api/auth/buyer`, `src/lib/auth/buyer.ts`, `requireBuyerContext`), not `__Host-fo-account`; open sign-up with the global cap (C.4); `/{locale}/account` is the sign-in page and never redirects (C.5); every credit note on the detail; the header "Account" link while `account` is on; "Sign out on all devices" UI is TASK-352's. ACs per the row (AC-47 surface half, AC-48 to AC-52, AC-62 added). The core extension is TASK-351's and merges first. Artboards: PR 336 `account-*`.

- **From the builder (2026-11-08, PR 503, launch core shipped; the rest carried here):**
  1. **AC-52 confirmation nudge** ("Save to my account", `sendAccountLink()`, `accountNudgeSent`): not built. Needs the three `confirmation.postPurchase.accountNudge*` keys and a server action under `(checkout)` that mints T14 with the return path `/{locale}/account/orders/{reference}` for the draft cookie's order email.
  2. **Header "Account" link and footer "Your account" (AC-34 header half, AC-51 link and byte-identity half, §13 Q23):** not built. `site-links.ts` still has `sign-in`/`my-orders` unpublished; the board's "[slot] Account" label has no key; `account.open` is read per request but public ISR pages are cached, so the flag needs a `dirties` kind (or a code flip) before the link can follow it; spec 004's header baselines move once.
  3. **Cookie register (C.16):** `fo_session` is still the declared row; the `__Secure-fo-buyer.*` rows need new `consent.cookies.*.purpose` copy in a counted namespace (the banner panel). TASK-346 owns "the buyer cookie rows replace fo_session"; left to it.
  4. **Integration suites owed in the test pass (founder 2026-11-08: "the test pass comes later"):** T-48's mail counts with the capturing mailer and the 300-send cap on a real `auth_email_send`; T-49 (link existing guest customer, create one, never link a redacted one, `last_signed_in_at`, no second customer); T-25/T-51 RLS (another customer's reference 404, cookie-less and signed-in `GET /{locale}/account` headers in four locales); T-23 owner half (invoice 404 to another customer's session); T-28 account half (cancel from each state of P; `in_production` refused). Unit coverage today: `tests/unit/buyer-surface.test.ts` (22).
  5. **AC-47 cross-surface cases** (buyer cookie under `/admin` and `/vendor`, admin/florist cookies on account routes) rest on TASK-351's surface-bound tokens and its integration case `:463`; no account-route integration test yet.
  6. **Unicode local parts** (`zoë@example.test`) answer the same `sent` page and receive no link (spec 012's form schema refuses them; widening it is a core change). Plus addressing works.
  7. **Pre-existing i18n:check failures on main, not this diff:** `nav.send` unused, and five `checkout.*`/`payments.*` keys read from `src/modules/ui/checkout/payment/*` outside their scope paths.
  8. **The account lists `live` orders in production and `live` + `test` elsewhere** (AC-25 "demo and test orders are absent in production"); say so if preview should list `live` only.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-08 A344: migration `0036_buyer_sign_in` (`customer.last_signed_in_at`); `src/lib/auth/buyer.ts` (surface, open sign-up, cap, `afterSignIn`, `requireBuyerContext`, route work); `/api/auth/buyer/*` routes; T14 template.
- 2026-11-08 A344: `/{locale}/account` (sign-in form or order list), confirm page, order detail with recipient recap, documents, "Cancel for free"; owner-session invoice download; account headers; copy (44 en keys, de/pl drafts), review scope, header slots; `tests/unit/buyer-surface.test.ts`. PR 503 ready. Carry-forwards above.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

[PR 503](https://github.com/itsahmeds/flowers-overseas/pull/503): the launch core of the buyer account. The `buyer` surface on spec 012's core (`src/lib/auth/buyer.ts`, `/api/auth/buyer/{request,confirm,sign-out}`, Auth.js endpoints 404), open sign-up with the global cap (`src/config/auth.ts`: 300, alert from 100), one identical `303` for every address shape AC-48 names, the return path (`/{locale}/account` and below, `/{locale}/checkout`), first sign-in linking or creating the customer and stamping `last_signed_in_at` (migration `0036`), T14 (`src/modules/notifications/emails/account-sign-in.ts`); `/{locale}/account` as the sign-in page and the order list (grouped by purchase, refund lines, signed Track link, Invoice), the confirm page, `/{locale}/account/orders/{reference}` (timeline, recipient recap until the sweep, documents, "Cancel for free" through `cancelOrderAsBuyer`), the owner-session invoice download, `noindex`/`no-store`/`no-referrer` headers, everything 404 while `account.open` is off. Tests: unit 22 (`tests/unit/buyer-surface.test.ts`); integration suites are carry-forward 4. No build, browser or CI run (work order 2026-11-08). New `en` keys: 44, listed in `.claude/state/record-approval-344.py`.
