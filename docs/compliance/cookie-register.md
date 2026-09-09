# Cookie and client-storage register

Every cookie, `localStorage` and `sessionStorage` key the application itself sets **or intends to
set**, with its classification, lifetime and the user action that creates it. A spec that adds
client storage without a row here is incomplete (`plan/07` §6, ePrivacy Art. 5(3) / GDPR).

**Source of truth: `src/config/cookies.ts`** (spec 004 §5.1, TASK-050). That file is the machine
register the consent settings panel, spec 007's cookie-policy page and AC-22's session check read,
and the table under "The register" below is **generated from it** by `pnpm cookies:check --write`
— `tests/unit/cookies-config.test.ts` fails when the committed block differs, and fails again when
a registered name is missing from the prose. Two hand-kept lists of the same lifetimes would
drift, and a drifting lifetime is a compliance defect rather than a documentation nit: a visitor
would be shown one number and given another. So a new cookie is added **in code**, and the prose
below is where its reasoning is written.

Two rules the register exists to make checkable:

1. **Nothing non-essential is set before consent**, and nothing at all is set by the *server* on a
   cacheable page — a `Set-Cookie` on a static document would fork the CDN cache and would mean a
   visitor received storage without acting (spec 003 AC-12: `GET /` and `GET /{locale}` return
   zero `Set-Cookie` headers).
2. **Strictly necessary / functional storage carries no consent gate but is still declared.**
   The exemption in ePrivacy Art. 5(3) is from consent, not from disclosure.

Third-party storage set by the *platform* rather than by the application (Vercel Deployment
Protection SSO on protected previews; the `vercel.live` preview-feedback script) is out of scope
here and recorded in `ropa.md` row 2 — it exists only on previews, never on a production response.

## The register

Generated — do not edit between the markers.

<!-- generated: cookie register from src/config/cookies.ts — `pnpm cookies:check --write` -->

| Key | Kind | Category | Consent | Party | Written by | Status | Lifetime | Purpose key | Attributes | Spec |
|---|---|---|---|---|---|---|---|---|---|---|
| `fo_locale` | cookie | essential | not required (Art. 5(3) exemption) | first | browser | set today | 365 days (31536000 s) | `consent.cookies.locale.purpose` | `Path=/; SameSite=Lax; Secure outside development` | 003 |
| `fo_locale_suggestion_dismissed` | sessionStorage | essential | not required (Art. 5(3) exemption) | first | browser | set today | session (cleared with the tab) | `consent.cookies.localeSuggestionDismissed.purpose` | — | 003 |
| `fo_consent` | cookie | essential | not required (Art. 5(3) exemption) | first | browser | set today | 365 days (31536000 s) on accept / 183 days (15811200 s) on reject | `consent.cookies.consent.purpose` | `Path=/; SameSite=Lax; Secure outside development` | 004 |
| `fo_session` | cookie | essential | not required (Art. 5(3) exemption) | first | server | declared, not set | session (cleared with the tab) | `consent.cookies.session.purpose` | `Path=/; SameSite=Lax; HttpOnly; Secure` | 019 |
| `fo_csrf` | cookie | essential | not required (Art. 5(3) exemption) | first | server | declared, not set | session (cleared with the tab) | `consent.cookies.csrf.purpose` | `Path=/; SameSite=Lax; Secure` | 010 |
| `fo_currency` | cookie | essential | not required (Art. 5(3) exemption) | first | browser | declared, not set | 365 days (31536000 s) | `consent.cookies.currency.purpose` | `Path=/; SameSite=Lax; Secure outside development` | 008 |
| `fo_basket` | cookie | essential | not required (Art. 5(3) exemption) | first | browser | declared, not set | 30 days (2592000 s) | `consent.cookies.basket.purpose` | `Path=/; SameSite=Lax; Secure outside development` | 010 |
| `__stripe_mid` | cookie | essential | not required (Art. 5(3) exemption) | third | third-party-script | declared, not set | 395 days (34128000 s) | `consent.cookies.stripeMid.purpose` | `Path=/; SameSite=Strict; Secure` | 013 |
| `__stripe_sid` | cookie | essential | not required (Art. 5(3) exemption) | third | third-party-script | declared, not set | 1800 s (1800 s) | `consent.cookies.stripeSid.purpose` | `Path=/; SameSite=Strict; Secure` | 013 |
| `_ga` | cookie | analytics | **required** | third | third-party-script | declared, not set | 730 days (63072000 s) | `consent.cookies.ga.purpose` | `Path=/; SameSite=Lax; Secure` | 004 |
| `_ga_*` | cookie | analytics | **required** | third | third-party-script | declared, not set | 730 days (63072000 s) | `consent.cookies.gaContainer.purpose` | `Path=/; SameSite=Lax; Secure` | 004 |

<!-- /generated: cookie register -->

## Application storage — the narrative


| Key | Kind | Classification | Consent | Set by | Lifetime | Attributes / scope | Value domain | Purpose | Spec |
|---|---|---|---|---|---|---|---|---|---|
| `fo_locale` | Cookie, first-party | Strictly necessary / functional (a user preference the visitor asked us to remember) | **Not required** (ePrivacy Art. 5(3) exemption; `plan/07` §6 lists it as essential) | The **browser**, only on an explicit user action: choosing a locale in the switcher, or pressing "Switch" or "Stay" in the language-suggestion banner. Never by the server, never on a cached page, never on first view. | 365 days (`Max-Age=31536000`, `plan/03` §1) | `Path=/`, `SameSite=Lax`, `Secure` outside development, **not** `HttpOnly` (the browser writes and reads it) | Closed set of exactly the four launch locale codes: `en`, `en-gb`, `de`, `pl`. Parsed by `LocaleCookieSchema`; anything else — a forged `fo_locale=zz`, a truncated percent-escape — is ignored and rewritten | Remember the language the visitor chose, so the suggestion banner does not ask again. It **never** changes what a URL returns: the locale comes from the path and from nothing else, so no response varies by cookie and no redirect is ever made from it (ADR-0006, spec 003 AC-9, AC-12) | 003 (TASK-041) |
| `fo_locale_suggestion_dismissed` | `sessionStorage` (not a cookie) | Strictly necessary / functional | **Not required** | The browser, when the visitor dismisses the suggestion banner with `Esc` or the close control | Per tab; cleared when the tab closes | Origin-scoped, per tab; never sent on a request | `"1"` or absent | Suppress the banner for the rest of the tab session when the visitor dismissed it *without* choosing a locale. Deliberately not a cookie: "not now" is a weaker signal than "this is my language", it must not travel on requests, and a tab-scoped key expires by itself. A storage-blocked or partitioned context throws on write; the failure is swallowed and the worst outcome is a banner that reappears in a new tab | 003 (TASK-041) |
| `fo_consent` | Cookie, first-party | Strictly necessary / functional (the record of a consent decision is itself exempt: without it we would have to ask again on every page) | **Not required** for the cookie; it *is* the record of the answer to the question | The **browser**, only on an explicit press of Accept all, Reject all or Save in the consent banner (TASK-051). Never by the server, never on a cached page, never on `Esc` — a dismissal is not consent and writes nothing | 365 days (`Max-Age=31536000`) on accept, 183 days (`Max-Age=15811200`) on reject: a refusal is revisited sooner than an acceptance (`plan/07` §5) | `Path=/`, `SameSite=Lax`, `Secure` outside development, **not** `HttpOnly` (the island writes and reads it) | JSON `{v, a, m, ts, cid}` — policy version, analytics bool, marketing bool, ISO timestamp and an unlinkable random `cid`. A forged or unparsable value is treated as **no consent** and rewritten | Remember the decision so the banner does not ask again, prove that consent was given (GDPR Art. 7(1)), and carry the `cid` that ties the browser's copy to the server-side consent record in `ropa.md` row 3 | 004 (TASK-050 schema and sink, TASK-051 the writer) |

## Declared but not set (recorded so the absence is deliberate)

Every row below is in the machine register with `status: "declared"`, so the settings panel and the
cookie policy can disclose it before the code that writes it exists — a visitor cannot consent to a
list nobody showed. None of them is set by any response or any script the site loads today.

| Would-be key | Why there is none yet |
|---|---|
| `_ga`, `_ga_*` | Google Analytics 4 is wired but dark: the loader ships in spec 004 gated on `NEXT_PUBLIC_GA4_MEASUREMENT_ID`, which is unset in CI, locally and on previews, so no `googletagmanager.com` request is made and no analytics cookie exists. When the founder sets the id, the tag loads under Consent Mode v2 **default denied**, sends cookieless pings, and writes these two cookies only after an accept. Setting that variable is a RoPA-affecting act (`ropa.md` row 4). |
| `fo_currency` | `plan/02` §4 keeps currency in a cookie rather than in the URL; the currency *menu* and the write are spec 008's. Spec 004 renders the locale's default currency as server-rendered text and writes nothing. |
| `fo_basket` | No basket until spec 010. |
| `fo_session`, `fo_csrf` | No accounts (spec 019) and no form POST from a browser session (spec 010) yet; both would be server-set, which is why the register's schema refuses to mark a server-written row as `set` while every response is cacheable. |
| `__stripe_mid`, `__stripe_sid` | No payment element is loaded before spec 013. Stripe's fraud-prevention cookies are strictly necessary for the payment the visitor asked for, so they are declared as essential rather than consent-gated — and they still cannot appear before a checkout page exists. |
| A/B test bucket | No experiments until spec 024. |
| A locale cookie set by `next-intl/middleware` | The library's middleware would set its own cookie **and redirect** `/` to a detected locale. It is not used, and importing it is a lint error (`fo/no-geo-redirect`, spec 003 AC-10). |

## Where this is enforced

- `src/modules/i18n/hints.ts` — the only writer of `fo_locale`, the attribute list above, and
  `LocaleCookieSchema` as the value gate.
- `src/modules/i18n/ui/LocaleSuggestionBannerIsland.tsx` — the only writer of the dismissal key.
- `tests/e2e/banner.spec.ts` and `tests/unit/locale-cookie.test.ts` — zero `Set-Cookie` on `/` and
  `/{locale}`, the attributes as written above, and the forged-value rewrite (spec 003 AC-12).
- `src/config/cookies.ts` — the machine register itself, zod-parsed at module load, and the
  `fo_consent` lifetimes (`CONSENT_ACCEPT_MAX_AGE_SECONDS` / `CONSENT_REJECT_MAX_AGE_SECONDS`) the
  banner island reads instead of restating them.
- `scripts/cookie-register.ts` (`pnpm cookies:check`) — renders the generated block above from that
  file; `tests/unit/cookies-config.test.ts` fails on a stale block, on a row whose category and
  consent flag disagree, on a duplicate name, and on a registered name missing from this prose.
- `tests/e2e/consent.spec.ts` — collects every cookie a real browsing session accumulates and fails
  on one that `isRegisteredCookie()` does not know (AC-22); the post-accept half runs with the
  banner in TASK-051.
- The cookie policy page that spec 007 ships reads this table; it is not a second list.
