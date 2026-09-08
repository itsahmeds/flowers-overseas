/**
 * next-intl request configuration (spec 003 §2 "No redirects, ever", §5.2, §5.4, AC-9; TASK-034).
 *
 * This is the whole of next-intl's request-time surface in this repository, and the only thing it
 * reads is the URL: the `[locale]` segment, published to next-intl by `setRequestLocale()` in the
 * layout. It reads **no** `Accept-Language`, **no** cookie and **no** geo header, so every
 * response for a URL is byte-identical for every client and carries no `Vary` (AC-9, ADR-0006,
 * §7 "Deliberate narrowing"). next-intl's routing middleware is imported nowhere in this
 * repository — it would redirect `/` to a detected locale and set its own cookie — and the lint
 * gate from TASK-032 (`fo/no-geo-redirect`) fails on any import of it (AC-10).
 *
 * An unknown or unroutable segment resolves to the x-default locale: it is the value the 404
 * document renders with (AC-8), never a redirect to a guessed locale. `next-intl` calls this
 * function for every server render; the payload the *browser* receives is a per-route namespace
 * subset chosen in the layout, not this catalogue (§6, AC-27) — see the comment on `messages`.
 *
 * Wired in by `createNextIntlPlugin("./src/modules/i18n/request.ts")` in `next.config.ts`.
 */
import { getRequestConfig } from "next-intl/server";

import { MESSAGE_NAMESPACES, loadMessages } from "./messages.ts";
import { documentFallbackLocale } from "./registry.ts";
import { routableLocale } from "./routing.ts";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  // `routableLocale`, not `launchLocale`: the pseudo-locales have documents when
  // `ENABLE_PSEUDO_LOCALES` is on, and they must resolve to their own generated catalogue rather
  // than silently to English (spec 003 §2, AC-29; TASK-042).
  const locale = routableLocale(requested) ?? documentFallbackLocale();

  return {
    locale: locale.code,
    // Every namespace, because this is the **server** catalogue: `getTranslations()` in a layout,
    // a page or `generateMetadata` resolves against it, so a document that renders the chooser
    // copy (`/`) or an error title must find its keys here. It is never serialised to the browser
    // — the client provider in `src/app/[locale]/layout.tsx` is handed the per-route subset from
    // `namespacesFor()` explicitly, and that is what the §6 / AC-27 payload budget measures.
    messages: loadMessages(locale.code, MESSAGE_NAMESPACES),
    // A relay has no single "local" time zone; every rendered time carries its own IANA zone
    // (spec 003 §5.2, TASK-036's `formatTimeInZone`). UTC is the neutral default for the
    // formatter that has not been told a zone, and it keeps output request-invariant.
    timeZone: "UTC",
  };
});
