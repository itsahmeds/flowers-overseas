/**
 * The sitemap wire format: what a `<url>` may contain, what a `<lastmod>` may be, and the two
 * caps (spec 007 §2 "Sitemaps", §5.2, AC-13 / T-14; `plan/02` §10; TASK-094).
 *
 * Everything in this file is pure and knows nothing about corridors, locales or the deployment.
 * It exists so the two builders beside it produce *bytes* through one serialiser — a second
 * hand-rolled `<url>` writer is how a sitemap ends up with an unescaped ampersand, a relative
 * `<loc>` or an `xhtml:link` set that differs from the `<head>` of the page it describes.
 *
 * ## Why zod on the way out
 *
 * `SitemapEntrySchema` parses what the builders hand over, not what a request carries: the caller
 * is our own code. It is here because a sitemap is a **boundary to Googlebot** and the failure is
 * silent — a relative or `http://` `<loc>` is accepted by every XML parser, rejected by Search
 * Console days later, and spec 001's `validate-sitemap` only sees what we chose to write into a
 * fixture. Parsing at the serialiser makes the same rule fail at the point it is broken, in a
 * unit test, with the offending value named.
 *
 * ## `<lastmod>`
 *
 * `plan/02` §10 and spec 007 AC-13: the **real maximum `updatedAt` across the content file, the
 * country registry entry and the message catalogue — never `now`**. `lastmodOf()` takes those
 * three sources by name and **throws** when none of them carries a date, because the tempting
 * fallback (today) is exactly the lie the rule exists to forbid: a crawler that is told every URL
 * changed today learns nothing from the field and eventually stops reading it.
 *
 * The `registry` source is `undefined` in Phase 0 and the parameter is here anyway:
 * `src/config/countries.ts` deliberately carries no timestamp (`COUNTRY_ROW_COLUMNS` omits spec
 * 002 §5.1's `created_at`/`updated_at`, because a projected guess would seed a fabricated date),
 * so the honest answer today is "this source has no date yet" rather than a substitute. When spec
 * 002's `country.updated_at` arrives it is passed here and no call site changes.
 *
 * A `<lastmod>` is a **day** (`YYYY-MM-DD`), which the W3C datetime profile the sitemap protocol
 * cites allows: the authored corridor files date to the day, the catalogue's review records are
 * midnight-UTC stamps, and comparing days is the only way a maximum over three sources is a total
 * order rather than a timezone argument.
 *
 * ## Caps
 *
 * 10 000 URLs and 10 MB per child (spec 007 §2; the protocol's own limits are 50 000 and 50 MB —
 * `plan/02` §10 sets ours lower so a child can be fetched, diffed and eyeballed). Breaching one
 * **throws**, naming the child: a truncated or silently oversized sitemap is worse than a 500,
 * because the 500 is noticed and the truncation is not. Phase 0 prints at most seven URLs per
 * child; the cap is a gate for the day spec 008's categories and spec 009's products arrive.
 */
import { z } from "zod";

/** Spec 007 §2: at most 10 000 URLs per child. */
export const SITEMAP_URL_CAP = 10_000;

/** Spec 007 §2: at most 10 MB per child, measured as the serialised UTF-8 document. */
export const SITEMAP_BYTE_CAP = 10 * 1024 * 1024;

/** `Cache-Control` for every sitemap response (spec 007 §5.4). No cookie, no `Vary`. */
export const SITEMAP_CACHE_CONTROL = "public, max-age=3600";

/** The one content type: `application/xml`, UTF-8 (the protocol's encoding requirement). */
export const SITEMAP_CONTENT_TYPE = "application/xml; charset=utf-8";

const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const XHTML_NS = "http://www.w3.org/1999/xhtml";
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

/** An absolute `https://` URL — a sitemap carries no relative and no `http://` entry. */
const AbsoluteHttpsUrlSchema = z
  .url()
  .refine((value) => value.startsWith("https://"), {
    message:
      "a sitemap <loc> must be an absolute https:// URL (plan/02 §10): a relative or http entry is accepted by every parser and rejected by Search Console",
  });

/** One `xhtml:link` alternate — the shape `alternatesFor()` already returns. */
export const SitemapAlternateSchema = z.object({
  hreflang: z.string().min(2),
  href: AbsoluteHttpsUrlSchema,
});

/** Spec 007 §5.2's `SitemapEntrySchema`: `{ loc, lastmod, alternates[] }`. */
export const SitemapEntrySchema = z.object({
  loc: AbsoluteHttpsUrlSchema,
  lastmod: z.iso.date(),
  alternates: z.array(SitemapAlternateSchema),
});

export type SitemapAlternate = z.infer<typeof SitemapAlternateSchema>;
export type SitemapEntry = z.infer<typeof SitemapEntrySchema>;

/** One `<sitemap>` of an index: a child document, with the newest date it carries. */
export const SitemapIndexEntrySchema = z.object({
  loc: AbsoluteHttpsUrlSchema,
  lastmod: z.iso.date().optional(),
});

export type SitemapIndexEntry = z.infer<typeof SitemapIndexEntrySchema>;

/** The three dated sources a `<lastmod>` is the maximum of (see the header on `registry`). */
export interface LastmodSources {
  /** The authored content file's `updatedAt` (`content/corridors/{locale}/{iso2}-{state}.md`). */
  readonly content?: string | undefined;
  /** The country registry entry's own `updatedAt` — none exists in Phase 0. */
  readonly registry?: string | undefined;
  /** The locale message catalogue's newest `reviewedAt` (`catalogueUpdatedAt()`). */
  readonly catalogue?: string | undefined;
}

const DAY = /^\d{4}-\d{2}-\d{2}/u;

/** A source value as the day it names, or `undefined`. Accepts a date or a datetime. */
function day(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const matched = DAY.exec(value.trim());
  return matched === null ? undefined : matched[0];
}

/**
 * The newest of the three sources, as `YYYY-MM-DD`.
 *
 * @throws TypeError when no source carries a date — see the header: the alternative is printing
 * today's date, which is the one value `plan/02` §10 forbids.
 */
export function lastmodOf(sources: LastmodSources): string {
  const days = [
    day(sources.content),
    day(sources.registry),
    day(sources.catalogue),
  ].filter((value): value is string => value !== undefined);
  const newest = days.sort().at(-1);
  if (newest === undefined) {
    throw new TypeError(
      "a sitemap <lastmod> needs a real date from the content file, the registry entry or the message catalogue; `now` is not one (plan/02 §10, spec 007 AC-13)",
    );
  }
  return newest;
}

/** XML text escaping: the five predefined entities, applied to every printed value. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

/** Both caps, checked on the serialised document. `child` names the failure in the message. */
function assertWithinCaps(child: string, count: number, xml: string): void {
  if (count > SITEMAP_URL_CAP) {
    throw new RangeError(
      `sitemap child \`${child}\` carries ${String(count)} URLs, above the ${String(SITEMAP_URL_CAP)} cap (spec 007 §2)`,
    );
  }
  const bytes = Buffer.byteLength(xml, "utf8");
  if (bytes > SITEMAP_BYTE_CAP) {
    throw new RangeError(
      `sitemap child \`${child}\` is ${String(bytes)} bytes, above the ${String(SITEMAP_BYTE_CAP)} cap (spec 007 §2)`,
    );
  }
}

/**
 * A `<urlset>` document: one `<url>` per entry, each with its `<lastmod>` and its full
 * `xhtml:link` set — the same set the page's `<head>` prints, because both come from one
 * `alternatesFor()` call (AC-11).
 */
export function urlSetXml(
  entries: readonly SitemapEntry[],
  child: string,
): string {
  const parsed = entries.map((entry) => SitemapEntrySchema.parse(entry));
  const lines = [
    XML_DECLARATION,
    `<urlset xmlns="${SITEMAP_NS}" xmlns:xhtml="${XHTML_NS}">`,
    ...parsed.flatMap((entry) => [
      "  <url>",
      `    <loc>${escapeXml(entry.loc)}</loc>`,
      `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`,
      ...entry.alternates.map(
        (alternate) =>
          `    <xhtml:link rel="alternate" hreflang="${escapeXml(alternate.hreflang)}" href="${escapeXml(alternate.href)}" />`,
      ),
      "  </url>",
    ]),
    "</urlset>",
    "",
  ];
  const xml = lines.join("\n");
  assertWithinCaps(child, parsed.length, xml);
  return xml;
}

/** A `<sitemapindex>` document: one `<sitemap>` per child, with the newest date it carries. */
export function sitemapIndexXml(entries: readonly SitemapIndexEntry[]): string {
  const parsed = entries.map((entry) => SitemapIndexEntrySchema.parse(entry));
  return [
    XML_DECLARATION,
    `<sitemapindex xmlns="${SITEMAP_NS}">`,
    ...parsed.flatMap((entry) => [
      "  <sitemap>",
      `    <loc>${escapeXml(entry.loc)}</loc>`,
      ...(entry.lastmod === undefined
        ? []
        : [`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`]),
      "  </sitemap>",
    ]),
    "</sitemapindex>",
    "",
  ].join("\n");
}
