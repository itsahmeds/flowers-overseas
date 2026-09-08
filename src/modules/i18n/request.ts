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
 * An unknown or non-launch segment resolves to the x-default locale: it is the value the 404
 * document renders with (AC-8), never a redirect to a guessed locale. `next-intl` calls this
 * function for every server render; `messages` is the `localeDocument` subset, not the whole
 * catalogue (§6, AC-27).
 *
 * Wired in by `createNextIntlPlugin("./src/modules/i18n/request.ts")` in `next.config.ts`.
 */
import { getRequestConfig } from "next-intl/server";

import { loadMessages, namespacesFor } from "./messages.ts";
import { documentFallbackLocale } from "./registry.ts";
import { launchLocale } from "./routing.ts";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = launchLocale(requested) ?? documentFallbackLocale();

  return {
    locale: locale.code,
    messages: loadMessages(locale.code, namespacesFor("localeDocument")),
    // A relay has no single "local" time zone; every rendered time carries its own IANA zone
    // (spec 003 §5.2, TASK-036's `formatTimeInZone`). UTC is the neutral default for the
    // formatter that has not been told a zone, and it keeps output request-invariant.
    timeZone: "UTC",
  };
});
