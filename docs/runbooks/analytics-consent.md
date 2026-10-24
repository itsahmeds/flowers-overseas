# Turning Google Analytics on (and the consent plumbing around it)

Spec 004 §2, §8, AC-18, AC-21, §14 A-founder-2026-10-19d · TASK-050, TASK-279 ·
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

## 2. Setting it

```bash
# production scope only, unless a measured preview is deliberately wanted
vercel env add NEXT_PUBLIC_GA4_MEASUREMENT_ID production
# then redeploy: NEXT_PUBLIC_* is inlined at build time, so an env edit alone changes nothing
```

`NEXT_PUBLIC_*` is inlined **at build time**, so an env-store edit alone changes nothing: the
deploy must be rebuilt. Locally that means a *cold* build — `rm -rf .next && pnpm build`, because
the framework's build cache will happily reuse a prerendered document that was rendered with the
old value (measured while implementing TASK-050: a warm rebuild after unsetting the id still served
the tag). On Vercel a fresh deployment is a cold build by default; a redeploy with "use existing
build cache" is not, and is the way to ship a document that disagrees with its own CSP.

Two consequences the build handles by itself:

- the CSP gains `https://www.googletagmanager.com` in `script-src` and it plus
  `https://*.google-analytics.com` in `connect-src` (`src/lib/csp.ts`, gated on the same variable),
  so the tag is not reported as a violation the day it appears;
- the script budget grows by ~30–35 KB, which is measured by `pnpm budget:client-js` **on a build
  that has the id set** — the Phase 0 numbers in `README.md` are for a dark tag. **Setting the id
  breaches the script budget until TASK-056 decides where the third-party tag sits**: spec 004 §14
  A1 leaves 1 434 B of headroom on a locale document and the tag is ~30–35 KB, so a build with the
  id set fails `budget:client-js` (and Lighthouse's `resource-summary:script:size`) unless the
  third-party tag is excluded from the first-party budget — that decision is on TASK-056's row.

## 3. Verifying, in this order

1. `curl -sI https://<host>/en | grep -i content-security-policy` — the policy names the two GA4
   origins and still carries exactly one `'sha256-'` (the consent bootstrap).
2. Load `/en` with devtools open, **before** answering the banner: `dataLayer[0]` is the
   `consent default` entry with `ad_storage`, `ad_user_data`, `ad_personalization` and
   `analytics_storage` all `denied`; the `gtag/js` request is made; **no `_ga` cookie exists**.
3. Press **Reject all**: still no `_ga` cookie, no `consent update` granting analytics.
4. Press **Accept all**: a `consent update` with `analytics_storage: granted` is in `dataLayer`,
   `_ga` and `_ga_G…` appear, and both are in the register (`pnpm cookies:check` is green because
   they were declared before the tag existed).
5. GA4 realtime shows the session. If it does not, check the id, not the consent plumbing: a
   default-denied tag with a wrong id fails silently by design.

## 4. Turning it off again

Remove the variable and redeploy. The tag element disappears from the HTML, the CSP loses the two
origins, and the cookies expire on their own — the app has no code path that deletes a third-party
cookie, so a visitor who accepted keeps `_ga` until it lapses. Move `ropa.md` row 4 back to
*declared but inactive* with the date, and say so in the privacy policy: a processor listed but
inactive is honest, a processor active but unlisted is not.

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

- The event plan, the `consent_state` dimension and the server-side `purchase` event — spec 023.
- The durable consent record: Phase 0 writes one log line per decision (`logConsentSink`), spec 002
  adds the `consent_log` table behind the same interface (`ropa.md` row 3).
