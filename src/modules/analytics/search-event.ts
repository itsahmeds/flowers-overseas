/**
 * The GA4 `search` event (spec 045 §8, AC-23; TASK-403), the one analytics payload site search
 * produces, and the adapter call that sends a page's payload.
 *
 * **What it carries, and what it never carries.** `locale`, `destination_country` (lowercase, only
 * when the search has a destination), `results_bucket` (`0`, `1-12` or `13+`) and `query_tokens`
 * (1 to 8). Never `search_term`: the words can hold a name, an address or a phone number, so
 * `SearchEventSchema` is strict and has no field they could arrive in, and the builder takes only a
 * token count and a result count. GA4's enhanced-measurement site search stays off (spec 023 §12
 * step 2), and the bootstrap sends a search address's `page_location` without its query string
 * (`searchLocationPattern`, `src/lib/search-routes.ts`).
 *
 * **How it reaches GA4.** The results page renders the payload as one hidden element's
 * `data-fo-analytics` attribute (spec 023 §5.2: "the server renders the page payload as a
 * `data-fo-analytics` JSON attribute"), the same bytes for every visitor. `sendPageAnalytics` is the
 * adapter spec 023's deferred chunk calls with the attribute's value: it calls `gtag` only when the
 * visitor granted analytics, and sends the parsed, re-validated event, so a tampered attribute
 * cannot smuggle a field through. Until that chunk lands nothing calls it (TASK-403's brief).
 */
import { z } from "zod";

/** The event's name in GA4's recommended-events list. */
export const SEARCH_EVENT_NAME = "search";

/** The three result buckets (§8): a count, never the list. */
export const RESULTS_BUCKETS = ["0", "1-12", "13+"] as const;
export type ResultsBucket = (typeof RESULTS_BUCKETS)[number];

/** The page size the buckets are drawn at (spec 008's 12 cards). */
const FIRST_PAGE = 12;

/** The most tokens a query keeps (§2.8). */
const MAX_TOKENS = 8;

export const SearchEventParamsSchema = z.strictObject({
  locale: z.string().min(2).max(10),
  destination_country: z
    .string()
    .regex(/^[a-z]{2}$/u)
    .optional(),
  results_bucket: z.enum(RESULTS_BUCKETS),
  query_tokens: z.number().int().min(1).max(MAX_TOKENS),
});

export const SearchEventSchema = z.strictObject({
  event: z.literal(SEARCH_EVENT_NAME),
  params: SearchEventParamsSchema,
});
export type SearchEvent = z.infer<typeof SearchEventSchema>;

/** `0`, `1-12` or `13+`. */
export function resultsBucket(count: number): ResultsBucket {
  if (count <= 0) return "0";
  return count <= FIRST_PAGE ? "1-12" : "13+";
}

export interface SearchEventInput {
  readonly locale: string;
  /** The destination searched (any case), or `null` for a country-less search. */
  readonly destination: string | null;
  /** The number of results (all pages). */
  readonly count: number;
  /** The query's token count after normalisation and stop words. */
  readonly tokens: number;
}

/**
 * The `search` event for one results page, or `null` when there is nothing to report (no words).
 * Takes counts only: the words never enter this function.
 */
export function searchEvent(input: SearchEventInput): SearchEvent | null {
  if (input.tokens < 1) return null;
  return SearchEventSchema.parse({
    event: SEARCH_EVENT_NAME,
    params: {
      locale: input.locale,
      ...(input.destination === null
        ? {}
        : { destination_country: input.destination.toLowerCase() }),
      results_bucket: resultsBucket(input.count),
      query_tokens: Math.min(input.tokens, MAX_TOKENS),
    },
  });
}

/** `gtag` as the bootstrap publishes it. */
export type Gtag = (...args: unknown[]) => void;

/**
 * Send a page's `data-fo-analytics` payload: only with analytics granted, only an event that
 * passes `SearchEventSchema` again. Returns whether anything was sent.
 */
export function sendPageAnalytics(
  attribute: string | null,
  consent: { readonly analytics: boolean },
  gtag: Gtag | undefined,
): boolean {
  if (!consent.analytics || gtag === undefined || attribute === null) {
    return false;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(attribute);
  } catch {
    return false;
  }
  const parsed = SearchEventSchema.safeParse(raw);
  if (!parsed.success) return false;
  gtag("event", parsed.data.event, parsed.data.params);
  return true;
}
