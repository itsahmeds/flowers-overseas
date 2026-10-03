/**
 * `GET /api/send/{locale}` — the home sentence picker's action (spec 004 §14 **A21 clause 4**,
 * AC-10, AC-11; TASK-177).
 *
 * Thin by design (`plan/01` §5): which destinations are open and the landing order live in
 * `sentenceTarget()` (`src/modules/ui/home/sentence-model.ts`), unit-tested without a server.
 * This file owns only what `src/modules/ui` may not do — ask the catalogue whether a page exists
 * (`corridorShopEntry()`, `listingExists()`) — and the response shape:
 *
 * - **303** to a path this application builds. The query is zod-parsed (`SentenceQuerySchema`);
 *   only `country` and `occasion` are read, and neither is ever echoed into the `Location`.
 * - `Cache-Control: no-store` and `X-Robots-Tag: noindex`, on top of spec 001's `/api/` robots
 *   disallow.
 * - An unknown locale is 404: there is no page to land on in a language we do not route.
 *
 * Driven by the user's own choice only; no IP, `Accept-Language` or `Referer` is read (ADR-0006).
 */
import type { CountryIso2 } from "@/config/countries";
import { isPublished, listingLinkId } from "@/config/site-links";
import { isLocaleCode } from "@/config/locales";
import { corridorShopEntry, listingExists, slugFor } from "@/modules/catalog";
import { corridorSlug } from "@/modules/geo";
import { listingPath, routableLocale } from "@/modules/i18n";
import { SentenceQuerySchema, sentenceTarget } from "@/modules/ui";

/** Never cached, never prerendered: the answer depends on the query. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
} as const;

/** The country page for one occasion: a seasonal occasion's page, else the occasion category. */
async function occasionPage(
  locale: string,
  iso2: CountryIso2,
  catalogueKey: string,
): Promise<string | undefined> {
  if (!isLocaleCode(locale)) return undefined;
  const country = corridorSlug(iso2, locale);
  for (const pageType of ["countryOccasion", "countryCategory"] as const) {
    if (!isPublished(listingLinkId(pageType))) continue;
    const exists = await listingExists({
      pageType,
      locale,
      countryIso: iso2,
      entityKey: catalogueKey,
    });
    if (!exists) continue;
    const slug = slugFor(
      pageType === "countryOccasion" ? "occasion" : "category",
      catalogueKey,
      locale,
    );
    if (slug !== undefined)
      return listingPath(locale, { pageType, country, slug });
  }
  return undefined;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
): Promise<Response> {
  const { locale: requested } = await params;
  const locale = routableLocale(requested);
  if (locale === undefined) {
    return new Response(null, { status: 404, headers: HEADERS });
  }
  // Zod at the boundary: only `country` and `occasion` survive the parse (unknown keys are
  // stripped, a malformed value is absent), so nothing else a client sent is ever read.
  const query = SentenceQuerySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const target = await sentenceTarget(locale.code, query, {
    shopRoot: async (iso2) =>
      (await corridorShopEntry(locale.code, iso2)).shopEntryHref,
    occasionPage: (iso2, key) => occasionPage(locale.code, iso2, key),
  });
  return new Response(null, {
    status: 303,
    headers: { ...HEADERS, Location: target },
  });
}
