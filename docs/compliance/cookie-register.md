# Cookie and client-storage register

Every cookie, `localStorage` and `sessionStorage` key the application itself sets, with its
classification, lifetime and the user action that creates it. Maintained by the spec that adds an
entry; a spec that adds client storage without a row here is incomplete (`plan/07` §6, ePrivacy
Art. 5(3) / GDPR).

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

## Application storage

| Key | Kind | Classification | Consent | Set by | Lifetime | Attributes / scope | Value domain | Purpose | Spec |
|---|---|---|---|---|---|---|---|---|---|
| `fo_locale` | Cookie, first-party | Strictly necessary / functional (a user preference the visitor asked us to remember) | **Not required** (ePrivacy Art. 5(3) exemption; `plan/07` §6 lists it as essential) | The **browser**, only on an explicit user action: choosing a locale in the switcher, or pressing "Switch" or "Stay" in the language-suggestion banner. Never by the server, never on a cached page, never on first view. | 365 days (`Max-Age=31536000`, `plan/03` §1) | `Path=/`, `SameSite=Lax`, `Secure` outside development, **not** `HttpOnly` (the browser writes and reads it) | Closed set of exactly the four launch locale codes: `en`, `en-gb`, `de`, `pl`. Parsed by `LocaleCookieSchema`; anything else — a forged `fo_locale=zz`, a truncated percent-escape — is ignored and rewritten | Remember the language the visitor chose, so the suggestion banner does not ask again. It **never** changes what a URL returns: the locale comes from the path and from nothing else, so no response varies by cookie and no redirect is ever made from it (ADR-0006, spec 003 AC-9, AC-12) | 003 (TASK-041) |
| `fo_locale_suggestion_dismissed` | `sessionStorage` (not a cookie) | Strictly necessary / functional | **Not required** | The browser, when the visitor dismisses the suggestion banner with `Esc` or the close control | Per tab; cleared when the tab closes | Origin-scoped, per tab; never sent on a request | `"1"` or absent | Suppress the banner for the rest of the tab session when the visitor dismissed it *without* choosing a locale. Deliberately not a cookie: "not now" is a weaker signal than "this is my language", it must not travel on requests, and a tab-scoped key expires by itself. A storage-blocked or partitioned context throws on write; the failure is swallowed and the worst outcome is a banner that reappears in a new tab | 003 (TASK-041) |

## Not set (recorded so the absence is deliberate)

| Would-be key | Why there is none |
|---|---|
| Analytics / GA4 | No analytics in Phase 0. Spec 023 adds it **behind consent**, with its own rows here and in `ropa.md`. |
| Currency preference | `plan/02` §4 keeps currency in a cookie rather than in the URL, but no currency UI exists until spec 004/005; the row is added by the spec that sets it. |
| A/B test bucket | No experiments until spec 024. |
| Session / auth | No accounts in Phase 0 (spec 019). |
| Consent record | Added by spec 004's consent banner, with the record itself in `ropa.md`. |
| A locale cookie set by `next-intl/middleware` | The library's middleware would set its own cookie **and redirect** `/` to a detected locale. It is not used, and importing it is a lint error (`fo/no-geo-redirect`, spec 003 AC-10). |

## Where this is enforced

- `src/modules/i18n/hints.ts` — the only writer of `fo_locale`, the attribute list above, and
  `LocaleCookieSchema` as the value gate.
- `src/modules/i18n/ui/LocaleSuggestionBannerIsland.tsx` — the only writer of the dismissal key.
- `tests/e2e/banner.spec.ts` and `tests/unit/locale-cookie.test.ts` — zero `Set-Cookie` on `/` and
  `/{locale}`, the attributes as written above, and the forged-value rewrite (spec 003 AC-12).
- The cookie policy page that spec 004 ships reads this table; it is not a second list.
