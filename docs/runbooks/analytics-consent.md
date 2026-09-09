# Turning Google Analytics on (and the consent plumbing around it)

Spec 004 §2, §8, AC-18, AC-21 · TASK-050 · `docs/compliance/ropa.md` rows 3–4 ·
`docs/compliance/cookie-register.md`

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

## 5. What is *not* here

- The event plan, the `consent_state` dimension and the server-side `purchase` event — spec 023.
- The banner and settings UI, and the `gtag('consent','update')` call itself — TASK-051.
- The durable consent record: Phase 0 writes one log line per decision (`logConsentSink`), spec 002
  adds the `consent_log` table behind the same interface (`ropa.md` row 3).
