# Turning Google Analytics on (and the consent plumbing around it)

Spec 004 §2, §8, AC-18, AC-21, §14 A-founder-2026-10-19d · TASK-050, TASK-279 · spec 023 §8, §11, §12 · TASK-491 ·
`docs/compliance/ropa.md` rows 3–4 · `docs/compliance/cookie-register.md`

**No banner while nothing needs consent (spec 004 §14 A-founder-2026-10-19d; TASK-279).** One reader,
`consentSources(process.env)` in `src/modules/analytics`, decides whether anything on the site needs
consent: `analytics` is active when the GA4 id is set (or a register row in that category is `set`),
`marketing` when a marketing row is `set`. While nothing is active — today — no consent banner
mounts and its chunk is not requested on load; the footer's "Cookie settings" opens the settings
panel. The moment a source is active the banner asks on first view again, with no file under
`src/app/` or `src/modules/` changed: the flip is this runbook's §2, or a register row turning `set`
in the PR that ships its writer. CI proves both states: the browser suites run the committed build,
and the `consent-active` job builds a second site with `G-FIXTURE00` and runs the banner-shown cases
against it, with every request to Google aborted.

The analytics tag is **wired and dark**. Every localised document already carries the Consent Mode
v2 default-denied block; nothing loads `googletagmanager.com` and nothing sets an analytics cookie,
because `NEXT_PUBLIC_GA4_MEASUREMENT_ID` is unset in every environment. Turning measurement on is
therefore one env-store edit and **no code change** — which is the reason this page exists, because
an env-store edit is also the easiest way to acquire an undeclared processor.

## 0. The rule

> **Setting `NEXT_PUBLIC_GA4_MEASUREMENT_ID` is a RoPA-affecting act.**

The moment the variable carries a `G-…` id and a deploy is built with it, Google is an **active
processor** of visitor data (`ropa.md` row 4), the two GA4 cookies become reachable (`_ga`,
`_ga_*`), and the privacy policy's processor list must already be true. It is not a toggle for a
test: a preview built with the id set sends real pings.

## 1. Before the variable is set

**Before the first category is switched on** (spec 004 §14 A-founder-2026-10-19d clause 3; procedural,
none of these is a code gate). Every step is done, and named in the flip's PR, before the id is set
or a register row turns `set`:

- (a) **The compact banner is on `main`**: clause 4's one-line form (TASK-281), whose first layer
  does not cover the home's H1, the sentence letter or the phone's action bar (AC-17 (b), (c)). The
  sheet that ships today predates it and is not to be shown to visitors.
- (b) **`CONSENT_POLICY_VERSION` is bumped** (`src/lib/consent.ts`) in the PR that updates the cookie
  notice for that category, so a decision saved while nothing was active is asked again (§4a).
- (c) **The records are true first**: RoPA row 4, the DPA, the privacy notice and the cookie notice,
  as steps 1 to 5 below list them.
- (d) **A15's budget decision** is taken: the tag breaks the script budget by design, and the
  `consent-active` build carries no Lighthouse run for that reason.
- (e) **The founder's lawyer has ruled, in writing filed under `docs/compliance/`**, on two points:
  whether the GA4 tag may load before a decision under Consent Mode v2 default-denied and send
  cookieless pings ("advanced" mode, as §2 L94, AC-21 and `plan/04` §11 specify today) or must wait
  for a grant ("basic" mode); and whether clause 4's layering (the controller sentence in the panel,
  a link to the cookie notice in the first layer) is enough. A "basic" ruling is a new spec
  amendment to AC-18, AC-21 and §2 L94 before the id is set.

Carried, not gating: the lawyer also reviews the "no banner while only essential cookies" position
and the production site's real cookies against the register (an edge cookie Cloudflare sets is
essential but not in the register today); the result goes into `docs/tasks/TASK-279.md` and
`docs/compliance/`.

Then, for GA4 specifically:

1. **Create the GA4 property** in the EU-based account, set **data retention to 14 months**, switch
   Google-signals and ads personalisation **off**, and keep IP anonymisation on (it is default in
   GA4 and `ads_data_redaction` is set by our bootstrap regardless).
2. **Accept the Google Ads Data Processing Terms** for the account and file the confirmation in
   `docs/compliance/`. An unsigned DPA with an active processor is the finding, not the tag.
3. **Update `ropa.md` row 4** from *declared but inactive* to active, with the property id's
   *account* (never a value that identifies a visitor), the date, and the retention actually set.
4. **Update the privacy policy and the cookie policy** so that Google, the two cookies and their
   lifetimes are named *before* a visitor can be measured. The cookie rows already exist in
   `src/config/cookies.ts`; nothing needs adding there.
5. **Check the consent copy** covers what the analytics category now does (TASK-051's
   `consent.cookies.ga.purpose` and `consent.cookies.gaContainer.purpose`).

## 2. Setting it (Railway; spec 023 §12, the founder's steps)

**Wait for TASK-492 first.** Spec 023 moves the site to Consent Mode **basic**: no request to Google
before an analytics grant. The server side (TASK-491) is merged dark; the client side (the
deferred loader that replaces the document-level tag) is TASK-492. Until TASK-492 is on `main`,
setting the id would load the tag before a decision, which spec 023 forbids. No agent does any of
these steps, and the API secret never passes through an agent, a chat, an issue, a PR or a commit.

1. In the existing GA4 account, create (or reuse) the property **"Flowers Overseas"** and a second
   property **"Flowers Overseas staging"**. Reporting time zone Europe/London, currency GBP.
2. Each property: one web data stream for its host. **Enhanced measurement off entirely** (our code
   sends page views; scroll, outbound click, file download, form and search events could carry
   token URLs).
3. Data collection: Google signals off; granular location and device data collection **off for all
   regions**; ads personalisation off for all regions; user-provided data collection off.
4. Data retention: event data 14 months, user data 14 months, "reset on new activity" off.
5. Data sharing settings: all off.
6. Accept the Google Ads Data Processing Terms in the account settings, under the controller
   entity `src/config/company.ts` names, and file the PDF in `docs/compliance/`.
7. Custom definitions: event-scoped dimensions `locale`, `page_type`, `destination_country`,
   `country_status`, `display_currency`, `shipping_tier`, `payment_type` (if not built in),
   `checkout_channel`, `metric_name`, `metric_rating`; item-scoped dimension
   `item_destination_country`; event-scoped custom metric `metric_value`. Confirm `purchase` is a
   key event.
8. No internal-traffic rule by IP address (ADR-0006). Keep your own visits out by rejecting
   analytics on your own devices.
9. Measurement Protocol secret: in each property, Admin, Data streams, the stream, Measurement
   Protocol API secrets, Create. Paste it straight into Railway as `GA4_API_SECRET` for that
   environment (staging's on staging, production's on production), and set
   `NEXT_PUBLIC_GA4_MEASUREMENT_ID` beside it. `validateEnv` refuses the secret without the id and
   refuses any `NEXT_PUBLIC_GA4_API_SECRET`. Redeploy with a **cold** build: `NEXT_PUBLIC_*` is
   inlined at build time, so an env edit alone changes nothing, and a warm build cache can reuse a
   document rendered with the old value.
10. Staging check: optionally set `GA4_MP_VALIDATE=true` on staging (refused in production); turn
    `analytics.mp_send` on in staging's admin (Flags); accept analytics on staging, browse a PL
    product, place a Stripe test order. In GA4 staging **DebugView** see `page_view`, `view_item`,
    `add_to_cart`, `begin_checkout`, `add_shipping_info`, `add_payment_info` and the server
    `purchase`; refund it in admin and see `refund`. In the browser, `_ga` expires 12 months after
    it was set. Remove `GA4_MP_VALIDATE` afterwards.
11. Production: complete §1 and spec 023 §8 (RoPA row 4 active, DPA filed, privacy and cookie
    notice approved and published, the `CONSENT_POLICY_VERSION` bump merged, the compact banner on
    `main`), then step 9 for production, then turn `analytics.mp_send` on in production's admin.

The CSP gains Google's GA4 origins only in a build with the id set (TASK-492, spec 023 AC-31).

## 3. Verifying, in this order

1. `curl -sI https://<host>/en | grep -i content-security-policy`: the policy names the GA4 origins
   and still carries exactly one `'sha256-'` (the consent bootstrap).
2. Load `/en` with devtools open, **before** answering the banner: `dataLayer[0]` is the
   `consent default` entry with every signal `denied`; **no request to any Google origin** and no
   `_ga` cookie.
3. Press **Reject all**: still no Google request, no `_ga`.
4. Press **Accept all**: `gtag/js` is requested after the page has loaded, `_ga` and `_ga_G…`
   appear, and both are in the register (`pnpm cookies:check` is green).
5. DebugView shows the session (staging builds send `debug_mode`).
6. Server side: every `analytics.ga4` delivery leaves one `analytics_dispatch` row. The day's
   reconciliation, so a drop in "sent" can be told apart from a drop in consent:

   ```sql
   SELECT d.kind, d.outcome, d.skip_reason, count(*)
   FROM analytics_dispatch d JOIN "order" o ON o.id = d.order_id
   WHERE o.mode = 'live' AND d.finished_at >= date_trunc('day', now())
   GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
   ```

   `not_configured` means the id or secret is missing; `disabled` means `analytics.mp_send` is off;
   `no_consent` and `no_client_id` are buyers who refused analytics.

### Alert: analytics.value_mismatch {#analytics-value-mismatch}

An order's lines (less their discount shares) do not add up to the order's total, or the purchase's
captured payment does not equal the sum of its orders' totals. Nothing was sent to GA4 for that
order. This is a money defect upstream of analytics: open the order in admin, compare its lines,
its total and the payment, and treat it as a pricing incident. Resolve the alert by hand once
explained; do not resend.

### Alert: analytics.rejected {#analytics-rejected}

Google answered 4xx to a Measurement Protocol body. Google asks that a refused body is not resent,
so the delivery is recorded `skipped` `rejected` with the status. Usually the secret was revoked or
belongs to another stream (check step 9), or the body schema drifted: set `GA4_MP_VALIDATE=true` on
staging and read the `analytics.validation` log line's `validation_codes`.

## 4. Turning it off again

- **Server side at once:** turn `analytics.mp_send` off in admin. Each later delivery is recorded
  `skipped` `disabled`; nothing is lost silently.
- **Client:** remove `NEXT_PUBLIC_GA4_MEASUREMENT_ID` (and `GA4_API_SECRET`) in Railway and redeploy
  cold. The banner disappears again by spec 004's data rule and the CSP loses the GA4 origins. A
  visitor who accepted keeps `_ga` until it lapses.
- **Schema:** `0042_analytics_ga4.down.sql` (measurement records only).

Move `ropa.md` row 4 back to *declared but inactive* with the date, and say so in the privacy
policy: a processor listed but inactive is honest, a processor active but unlisted is not.

### Notice drafts (founder and lawyer to approve)

Not published anywhere; spec 041's privacy and cookie pages carry the approved text.

- **Privacy notice, analytics section (draft):** "If you accept analytics cookies, we use Google
  Analytics, provided by Google Ireland Ltd as our processor, to understand which pages and
  countries our customers use. When you place an order after accepting analytics, our server also
  sends Google the order's value, the items, the delivery country and a random code, never your
  name, email, address or card message. Google keeps this data for 14 months. Data may be
  transferred to the United States under the EU-US Data Privacy Framework and Google's standard
  contractual clauses. You can withdraw at any time under Cookie settings in the footer; we then
  stop at once and delete the Google Analytics cookies."
- **Cookie notice (draft):** "`_ga`: Google Analytics, tells visits apart, 12 months. `_ga_<id>`:
  Google Analytics, keeps the session state, 12 months. Set only after you accept analytics."

## 4a. The sheet a visitor actually sees (TASK-051)

`src/modules/ui/consent/`, mounted once per **localised** document by `src/app/[locale]/layout.tsx`
and deliberately absent from `/` (the chooser has no locale and stays at zero application
JavaScript). Everything it renders is resolved on the server and passed as props, so the islands
carry no message catalogue and no zod.

| What | Where |
|---|---|
| Copy | `consent.*` in `messages/*.json`; every cookie's purpose is the register's `purposeKey` |
| Categories and lifetimes | projected from `src/config/cookies.ts` by `consentView()` — a row added there appears in the panel with no component edit |
| Decision cookie | `fo_consent`, first-party, `Path=/`, `SameSite=Lax`, `Secure` off `localhost`, JSON `{v,a,m,ts,cid}`, **12 months** if anything was accepted, **6 months** for a refusal |
| Record | `POST /api/consent`, sent with `credentials: "omit"` and `referrerPolicy: "no-referrer"` — no cookie, no page URL |
| Consent Mode | one `gtag('consent','update',…)` per decision: `analytics_storage` from the analytics answer, the three ad signals from the marketing one |
| Whether it asks | `consentSources()` (§0 above): with no active source the loader renders nothing and binds one delegated listener for `data-fo-consent-reopen`; its first activation imports the island, which opens the settings panel with focus inside it |
| Withdrawal | the footer's `data-fo-consent-reopen` control (and the cookie notice's, spec 041), on every page; with a source active, a delegated listener in the island re-opens the sheet with the recorded answer pre-filled; with none, it opens the panel |

Operational notes:

- **`Esc` records nothing.** It closes the settings panel if one is open and the sheet otherwise,
  and the sheet returns on the next page view. Dismissal is not consent. A panel opened from
  "Cookie settings" with nothing active closes on one press and focus returns to that control. One
  press acts on one layer: while the language popup holds its gate the sheet ignores the key, and
  the press that closed the popup does not also close the sheet (AC-17 (d)).
- **A forged, corrupt or stale `fo_consent` is deleted and the sheet asks again** (with nothing
  active: deleted when the island loads on activation, and the panel shows nothing ticked). Bumping
  `CONSENT_POLICY_VERSION` in `src/lib/consent.ts` has the same effect for every visitor at once:
  that is the lever to pull when the categories or the disclosure text change.
- **Nothing is pre-ticked and no control is disabled.** The essential group is stated in prose with
  its reason and has no checkbox at all, because a locked control that looks like a control is a
  dark pattern (§8, AC-20).
- **Two overlays share the bottom of the viewport.** The consent sheet paints above the language
  suggestion (`--layer-overlay` over `--layer-banner`), which is the specified order; while a
  decision is pending it therefore covers the suggestion banner. Any test that drives the
  suggestion banner or screenshots the colophon seeds a recorded decision first — see
  `tests/e2e/banner.spec.ts` — and TASK-055 owns the final coordination of the two (AC-13).
- **Budget.** The sheet costs **2 363 B Brotli** on a locale document, in one `next/dynamic` chunk
  fetched after hydration (the settings panel is a second, nested chunk of **967 B** fetched only
  when it is opened). That put `/en` and `/de` at 132 044 B against the 131 072 B of spec 004
  §14 A1 — 972 B over, with the whole overage predating the sheet in the framework floor.
  **TASK-085 resolved it** (§14 A1's addendum, Q13 option (b)): `NextIntlClientProvider` and the
  client message payload are gone from every document (−10 705 B), the suggestion banner takes its
  strings as props like this sheet always did, and the 500 boundaries no longer import a
  catalogue (−4 751 B on every document). A locale document now measures **122 360 B Brotli**,
  8 712 B inside the budget, and the sheet's own cost is unchanged.
  Re-measure with `pnpm build && pnpm budget:client-js`; `pnpm lighthouse` cannot substitute for
  it locally, because `next start` serves chunks unencoded and Lighthouse then reads identity
  bytes (169 223 B on `/en`) that no Brotli budget can be compared to.

## 5. What is *not* here

- The client event plan and the deferred loader: spec 023, TASK-492. The server-side `purchase`
  and `refund` are spec 023, TASK-491 (`src/modules/analytics`).
- The durable consent record: Phase 0 writes one log line per decision (`logConsentSink`), spec 002
  adds the `consent_log` table behind the same interface (`ropa.md` row 3).
