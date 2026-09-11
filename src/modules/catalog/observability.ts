/**
 * The module's log lines and its three business signals (spec 005 §8 "Logs and PII", §11, AC-24;
 * TASK-069).
 *
 * Spec 005 §8 states the whole of what this module may say about itself: *"005 logs at most
 * `{ sku, tier_key, country_iso, currency, fx_as_of, duration_ms, request_id }` — no buyer, no
 * recipient, no address, no basket contents, no quote digest."* That is not a convention here, it
 * is the type: `CatalogLogFields` cannot name another key, and `pick()` drops one anyway before
 * the line is written, so a field added by a future caller has to pass a type error *and* a
 * runtime filter *and* `tests/unit/catalog-logging.test.ts`'s capturing logger.
 *
 * Why a module-local wrapper rather than `logger.debug()` at each call site: the guarantee AC-24
 * asks for is about the **set of keys the module can emit**, and that is only checkable if there
 * is one door. Two call sites with an inline object are two places a reviewer has to notice a
 * `recipient_city` in.
 *
 * ## The three signals (§11)
 *
 * Each of them silently produces a **wrong price** if nobody looks, which is why each is a `warn`
 * *and* a Sentry message rather than a metric nobody has a dashboard for (`plan/08` §7 — there is
 * no dashboard in Phase 0):
 *
 *  - `catalog.fx_stale` — the newest rate is older than `MAX_FX_AGE_HOURS`, so every non-native
 *    display currency has stopped converting and every page is quoting in the destination's own
 *    currency (spec 005 §13 Q2, AC-15);
 *  - `catalog.price_missing` — a page asked for a (product, country, tier) with no active row: a
 *    price hole on a live destination;
 *  - `catalog.price_ambiguous` — more than one active row, which spec 002's partial unique index
 *    makes impossible, so it indicates a migration or a seed defect.
 *
 * The Sentry side goes through `captureWarning()` in `src/lib/sentry.ts` — the same scrubber every
 * other event passes through, and a no-op when no DSN is configured (the Phase 0 default). No SDK
 * call is made from this module.
 *
 * `request_id` is not read from anywhere here: it arrives on the process logger's bindings when a
 * caller logs through `logger.child({ request_id })` (`src/proxy.ts`, spec 001 §5.2). A module
 * that reached for the request context would need one, and a read that has no request — a build,
 * a job, a test — would then have to invent it.
 */
import { logger } from "@/lib/logger";
import { captureWarning } from "@/lib/sentry";

/**
 * Spec 005 §8's list, in full. **Nothing may be added to it without amending §8**: the set is the
 * privacy claim, and `tests/unit/catalog-logging.test.ts` asserts the emitted keys are a subset.
 *
 * Note what is absent and was in an earlier draft of §11: `sku_count`. §8's list governs (spec 005
 * §14 A5), so a batch read reports the *first* sku it resolved and no count.
 */
export const CATALOG_LOG_FIELDS = [
  "sku",
  "tier_key",
  "country_iso",
  "currency",
  "fx_as_of",
  "duration_ms",
  "request_id",
] as const;

export type CatalogLogField = (typeof CATALOG_LOG_FIELDS)[number];

/** The only shape a catalogue log line can carry. Every field optional; none of them personal. */
export type CatalogLogFields = {
  readonly [Field in CatalogLogField]?: string | number;
};

/** The three `warn` + Sentry signals of spec 005 §11, as their message strings. */
export const CATALOG_SIGNALS = {
  fxStale: "catalog.fx_stale",
  priceMissing: "catalog.price_missing",
  priceAmbiguous: "catalog.price_ambiguous",
} as const;

export type CatalogSignal =
  (typeof CATALOG_SIGNALS)[keyof typeof CATALOG_SIGNALS];

/** Above this, a read is slow enough to say so — spec 005 §11's "one `warn` above 50 ms". */
export const SLOW_READ_MS = 50;

/** The message of the per-read line. One string, so a log query is a string match. */
export const CATALOG_READ_MESSAGE = "catalog.read";

/**
 * Keep only the fields §8 allows, and only those that were actually set.
 *
 * The type already refuses an unknown key from a literal; this refuses one from a spread, which is
 * how the interesting leak would arrive (`{ ...query }` where `query` grew a `recipient` field).
 */
function pick(fields: CatalogLogFields): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const field of CATALOG_LOG_FIELDS) {
    const value = fields[field];
    if (value !== undefined) out[field] = value;
  }
  return out;
}

/**
 * A read boundary: start the clock, and report when the work is done (spec 005 §11).
 *
 * `Date.now()` rather than `performance.now()` because the result must be an integer number of
 * milliseconds — a fractional `duration_ms` is the kind of float that has no business in this
 * codebase — and because the clock lives *here* rather than in `pricing/*`, where AC-12's source
 * scan forbids one (a price must not depend on when it was rendered).
 */
export function startCatalogRead(): (fields?: CatalogLogFields) => void {
  const startedAt = Date.now();
  return (fields: CatalogLogFields = {}): void => {
    const duration = Date.now() - startedAt;
    const line = pick({ ...fields, duration_ms: duration });
    if (duration > SLOW_READ_MS) {
      logger.warn(line, CATALOG_READ_MESSAGE);
      return;
    }
    logger.debug(line, CATALOG_READ_MESSAGE);
  };
}

/**
 * One of the three §11 signals: a `warn` line and a Sentry message, same fields, same limits.
 *
 * There is no `error` variant on purpose. Two of the three are already accompanied by a thrown
 * error at the call site (a missing or ambiguous price refuses to produce a price at all), and the
 * third is a *correct* degradation — the page still renders, in the destination's own currency.
 */
export function catalogSignal(
  signal: CatalogSignal,
  fields: CatalogLogFields = {},
): void {
  const line = pick(fields);
  logger.warn(line, signal);
  captureWarning(signal, line);
}
