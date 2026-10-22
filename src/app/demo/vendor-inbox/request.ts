/**
 * @purpose The florist request's context and language, read once per render
 * @spec 011
 *
 * `currentFloristContext()` is `getFloristContext()` deduplicated per request with React's
 * `cache`, so the layout and the page read the member's memberships once (spec 011 AC-20: still
 * from the database on every request). `currentFloristLanguage()` is the member's
 * `partner_member.locale_code` when signed in, else the proxy's validated `?hl=`, else `en`
 * (§7: never `Accept-Language`, never an IP).
 */
import { headers } from "next/headers";
import { cache } from "react";

import type { FloristLanguage } from "@/config/florists";
import { type FloristContext, getFloristContext } from "@/lib/auth/florist";
import { FLORIST_LANGUAGE_HEADER } from "@/lib/florist-headers";
import { floristLanguageOf } from "@/modules/partners/auth/copy";

export const currentFloristContext = cache((): Promise<FloristContext | null> =>
  getFloristContext(),
);

export const currentFloristLanguage = cache(
  async (): Promise<FloristLanguage> => {
    const context = await currentFloristContext();
    if (context !== null) return context.locale;
    return floristLanguageOf((await headers()).get(FLORIST_LANGUAGE_HEADER));
  },
);
