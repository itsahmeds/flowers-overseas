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

/**
 * One link of a result group (§14 A-founder-2026-11-08a item 1): its words and a page that answers
 * 200. Never a query string (AC-3).
 */
export const PageLinkSchema = z.strictObject({
  label: z.string().min(1),
  href: z
    .string()
    .startsWith("/")
    .refine((href) => !href.includes("?"), { error: "no query string" }),
});
export type PageLink = z.infer<typeof PageLinkSchema>;

/** The four link groups, in their order on the page; each at most `pagesBlockMax` links. */
export const searchGroupKinds = [
  "destinations",
  "occasions",
  "categories",
  "help",
] as const;
export type SearchGroupKind = (typeof searchGroupKinds)[number];

const GroupSchema = z.array(PageLinkSchema).max(SEARCH_CONFIG.pagesBlockMax);
export const SearchGroupsSchema = z.strictObject({
  destinations: GroupSchema.readonly(),
  occasions: GroupSchema.readonly(),
  categories: GroupSchema.readonly(),
  help: GroupSchema.readonly(),
});
export type SearchGroups = z.infer<typeof SearchGroupsSchema>;

/** No groups: the empty, too-short and rate-limited states. */
export const NO_GROUPS: SearchGroups = {
  destinations: [],
  occasions: [],
  categories: [],
  help: [],
};

/**
 * The suggestions island's request (§14 A-founder-2026-11-08a item 3): a strict JSON body, so the
 * words never travel in a URL. `to` is the header form's hidden destination, when it has one.
 */
export const SuggestRequestSchema = z.strictObject({
  locale: z
    .string()
    .refine(
      (code): code is LocaleCode =>
        isLocaleCode(code) && launchLocales.includes(code),
      { error: "not a launch locale" },
    ),
  q: z.string().max(SEARCH_CONFIG.maxQueryChars * 4),
  to: z
    .string()
    .regex(/^[a-z]{2}$/u)
    .optional(),
});
export type SuggestRequest = z.infer<typeof SuggestRequestSchema>;

export const suggestKinds = [
  "product",
  "occasion",
  "category",
  "destination",
  "page",
] as const;
export type SuggestKind = (typeof suggestKinds)[number];

/** One suggestion: a kind word, the name, the page it names. No field for a price. */
export const SuggestItemSchema = z.strictObject({
  kind: z.enum(suggestKinds),
  label: z.string().min(1),
  href: z
    .string()
    .startsWith("/")
    .refine((href) => !href.includes("?"), { error: "no query string" }),
});
export type SuggestItem = z.infer<typeof SuggestItemSchema>;
export const SuggestResponseSchema = z
  .array(SuggestItemSchema)
  .max(SEARCH_CONFIG.suggestMax);

export const SearchResultViewSchema = z.strictObject({
  /** The words as searched (NFC, truncated): rendered escaped, inside `<bdi>`, never in a link. */
  query: z.string(),
  destination: z.string().length(2).nullable(),
  dateApplied: z.string().nullable(),
  hiddenByDate: z.number().int().nonnegative(),
  /**
   * The words minus the destination words they named (the chip's remove form, §14
   * A-founder-2026-11-08a item 1): "roses {a country}" is "roses"; the words themselves otherwise.
   */
  queryWithoutDestination: z.string(),
  /** The four link groups (§14 A-founder-2026-11-08a item 1); empty where nothing was searched. */
  groups: SearchGroupsSchema,
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
