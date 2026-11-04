/**
 * The search engine's boundary schemas (spec 045 §5.2 "schemas"; TASK-401).
 *
 * `SearchRequestSchema` is what the engine accepts; `SearchResultViewSchema` is what it hands the
 * results page. **No schema here that reaches the browser has a field for a band, a margin, a
 * payout or a florist** (§2.5 "Never shown"): the view is strict, so a stray field is a parse
 * error rather than a leak. `SearchParamsSchema` (the URL's parameters) is the results route's,
 * TASK-402's.
 */
import { z } from "zod";

import { type LocaleCode, isLocaleCode, launchLocales } from "@/config/locales";
import { SEARCH_CONFIG } from "@/config/search";
import { CountryLessCardViewSchema, ProductCardViewSchema } from "@/modules/ui";

/** A destination code as the registry spells it (two capitals), or the URL's lowercase form, upper-cased. */
const Iso2Schema = z
  .string()
  .regex(/^[A-Za-z]{2}$/u)
  .transform((value) => value.toUpperCase());

export const SearchRequestSchema = z.strictObject({
  locale: z
    .string()
    .refine(
      (code): code is LocaleCode =>
        isLocaleCode(code) && launchLocales.includes(code),
      { error: "not a launch locale" },
    ),
  /** The words as typed (NFC and truncation are applied again here; the route applies them first). */
  query: z.string(),
  /** The `to` parameter, already checked by the route; the words still beat it (§2.4). */
  to: Iso2Schema.optional(),
  page: z.number().int().min(1).max(SEARCH_CONFIG.maxPages).default(1),
  /**
   * The `date` parameter (ISO `YYYY-MM-DD`), already checked by the route; honoured only when the
   * destination the search ends up with takes that date (§2.4 "Deliverability"; TASK-402).
   */
  date: z.iso.date().optional(),
});
export type SearchRequest = z.input<typeof SearchRequestSchema>;

/**
 * The page states the engine decides (§2.7). The date states ride on `dateApplied` and
 * `hiddenByDate`, the demo state on the destination's registry status, and the rate-limited state
 * is the route's (TASK-403); `noDestination` carries its country-less cards in `countryLess`.
 */
export const searchStates = [
  "empty",
  "tooShort",
  "results",
  "noResults",
  "noDestination",
  "outOfRange",
] as const;
export type SearchState = (typeof searchStates)[number];

export const PageLinkSchema = z.strictObject({
  kind: z.enum(["shop", "corridor", "occasion", "category"]),
  label: z.string().min(1).optional(),
  href: z.string().startsWith("/"),
});
export type PageLink = z.infer<typeof PageLinkSchema>;

export const SearchResultViewSchema = z.strictObject({
  /** The words as searched (NFC, truncated): rendered escaped, inside `<bdi>`, never in a link. */
  query: z.string(),
  destination: z.string().length(2).nullable(),
  dateApplied: z.string().nullable(),
  hiddenByDate: z.number().int().nonnegative(),
  pages: z.array(PageLinkSchema).readonly(),
  /** The results on this page, in §2.5's order. */
  cards: z.array(ProductCardViewSchema).readonly(),
  /** "Our selection" (the empty, too-short and no-results states, §2.7). */
  selection: z.array(ProductCardViewSchema).readonly(),
  count: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageCount: z.number().int().nonnegative(),
  didYouMean: z.string().nullable(),
  state: z.enum(searchStates),
  /**
   * The `noDestination` state's own content (§2.7, §14 A-orchestrator-2026-10-24 item 1;
   * TASK-402): the query's state over `coreRange(locale)`, its matches and its "Our selection",
   * each a country-less card, which has no field a price could arrive in. `null` in every other
   * state.
   */
  countryLess: z
    .strictObject({
      state: z.enum(["empty", "tooShort", "results", "noResults"]),
      cards: z.array(CountryLessCardViewSchema).readonly(),
      selection: z.array(CountryLessCardViewSchema).readonly(),
    })
    .nullable(),
});
export type SearchResultView = z.infer<typeof SearchResultViewSchema>;
