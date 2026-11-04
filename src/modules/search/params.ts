/**
 * `SearchParamsSchema`: the results page's URL parameters at the boundary (spec 045 §5.2
 * "schemas", §2.8, AC-4; TASK-402).
 *
 * The route hands it Next's `searchParams` (a value is a string, an array of strings for a
 * repeated key, or absent) and the two facts about destinations it needs, read from data:
 *
 *  - `q`: NFC, control and format characters removed (`\u0000`, the zero-width space), trimmed,
 *    truncated at `maxQueryChars` (80) code points, never between the halves of a surrogate pair;
 *  - `to`: the lowercase ISO code of a destination **with a shop** (`PL` folds to `pl`), else no
 *    destination at all (`xx`, a country with no shop, two values);
 *  - `date`: an ISO calendar date, kept only when the destination in `to` takes delivery dates
 *    (`deliveryDatesOpen`); the engine checks the bookable window and the destination the words
 *    name (§2.4);
 *  - `page`: an integer 1 to `maxPages` (10), or `"notFound"`: the route answers spec 008's 404
 *    for `0`, `11`, `1.5`, `abc` before the engine sees it (the engine's own schema throws);
 *  - every other key (`utm_source`, `gclid`) is dropped, so the result equals the same URL without
 *    it.
 *
 * Nothing here reads a header, a cookie or an IP (ADR-0006), and nothing names a country: the
 * shop set and the date rule arrive as data.
 */
import { z } from "zod";

import { SEARCH_CONFIG, type SearchConfig } from "@/config/search";

/** What the route knows about destinations when it parses (from the registry and the catalogue). */
export interface SearchParamsContext {
  /** Lowercase codes of the destinations whose shop root exists in the request locale. */
  readonly shops: ReadonlySet<string>;
  /** Does this destination (lowercase code) take delivery dates today? */
  readonly takesDates: (iso2: string) => boolean;
  readonly config?: SearchConfig;
}

/** The parameters after the boundary. */
export interface SearchParams {
  readonly q: string;
  readonly to: string | undefined;
  readonly date: string | undefined;
  readonly page: number | "notFound";
}

/** One value of a parameter: the first of a repeated key, `undefined` when absent. */
const First = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => (Array.isArray(value) ? value[0] : value));

/**
 * Control (`Cc`) and format (`Cf`) characters: `\u0000`, `​`, the bidi controls. A buyer never
 * means one, and a bidi control could reorder how the query reads back (the page renders it in
 * `<bdi>` anyway).
 */
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;

/** §5.2's `q` rule: NFC, invisible characters gone, trimmed, at most `max` code points. */
export function cleanSearchQuery(raw: string, max: number): string {
  const visible = raw.normalize("NFC").replace(INVISIBLE, "").trim();
  const points = [...visible];
  return (points.length > max ? points.slice(0, max).join("") : visible).trim();
}

const PAGE = /^[1-9][0-9]*$/u;
const DATE = z.iso.date();

/**
 * The schema for one request. A factory, because which destinations have a shop and which take
 * dates is data the route reads first; the shape is the same for every request.
 */
export function searchParamsSchema(context: SearchParamsContext) {
  const config = context.config ?? SEARCH_CONFIG;
  return z
    .object({ q: First, to: First, date: First, page: First })
    .transform((raw): SearchParams => {
      const lower = raw.to?.trim().toLowerCase();
      const to =
        lower !== undefined &&
        /^[a-z]{2}$/u.test(lower) &&
        context.shops.has(lower)
          ? lower
          : undefined;
      const date =
        to !== undefined &&
        raw.date !== undefined &&
        DATE.safeParse(raw.date).success &&
        context.takesDates(to)
          ? raw.date
          : undefined;
      let page: SearchParams["page"] = 1;
      if (raw.page !== undefined) {
        const value = PAGE.test(raw.page) ? Number(raw.page) : Number.NaN;
        page =
          Number.isInteger(value) && value >= 1 && value <= config.maxPages
            ? value
            : "notFound";
      }
      return {
        q: cleanSearchQuery(raw.q ?? "", config.maxQueryChars),
        to,
        date,
        page,
      };
    });
}
