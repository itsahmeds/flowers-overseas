/**
 * `ConsentBanner`, server half (spec 004 §5.3, §7, §8, AC-17, AC-19, AC-20; TASK-051).
 *
 * A synchronous Server Component with no JavaScript of its own. Its whole job is to resolve the
 * copy and project the cookie register into the plain data the island renders, so that the browser
 * receives **text and numbers, never the catalogue and never the register** (§13 Q13 option (b),
 * §14 A1). `SiteFooter` narrows next-intl's key union the same way and for the same reason: the
 * register's `purposeKey` is a string at the type level because it comes from a zod-parsed config,
 * and a key that does not resolve fails `pnpm i18n:check`.
 *
 * Rendered once by `src/app/[locale]/layout.tsx`, which is what makes "once per locale document"
 * true, and — because `/` has no locale layout — what keeps the chooser free of it: the chooser has
 * no locale to render copy in, must stay at zero application JavaScript (spec 003 AC-7) and sets
 * no cookie of any kind (AC-12). A consent sheet there would break all three.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { ConsentBannerLoader } from "./ConsentBannerLoader";
import { type ConsentTranslate, consentView } from "./consentView";

/**
 * No props: the locale is the request's, published by `setRequestLocale()` in the layout, and the
 * register is global. A `locale` prop would be a second source of truth for something the
 * translator already knows — `SiteFooter` takes one only because it builds locale-prefixed hrefs.
 */
export function ConsentBanner(): ReactElement {
  const translate = useTranslations();
  // The one cast, and the same one `SiteFooter` makes: config-supplied keys
  // (`consent.cookies.ga.purpose`) are strings, the translator's parameter is the catalogue's key
  // union, and `pnpm i18n:check` reads the same register to prove every one of them resolves.
  const narrowed: ConsentTranslate = (key, values) =>
    translate(key as Parameters<typeof translate>[0], values);
  return <ConsentBannerLoader view={consentView(narrowed)} />;
}
