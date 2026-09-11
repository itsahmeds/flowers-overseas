/**
 * Signed price quotes (spec 005 §5.2 `pricing/quote.ts`, §8, §13 Q5, AC-17; TASK-068).
 *
 * The last link in "price shown = price charged": spec 009 renders a projection, this file signs
 * exactly that number, and spec 013 charges a figure it can verify came from a page we served —
 * without a table, a session or a lookup. Five properties, each of which is a rule rather than a
 * preference:
 *
 *  1. **Stateless.** The digest is an HMAC over the quote's own fields, so a quote verifies
 *     itself. Nothing is written, no order table is touched and no state is created (ADR-0009,
 *     spec 005 §3) — which also means a quote cannot be "used up", so `verifyQuote()` answers the
 *     same way for the same content and clock every time.
 *  2. **No personal data, by construction.** Product ids, tier keys, integer amounts, a currency,
 *     a rate and an expiry: that is the whole field set, `QuoteSchema` is `.strict()`, and AC-17's
 *     key-set equality test asserts it from the outside. A quote travels through a hidden form
 *     field and a payment intent's metadata, so a recipient name added "just for convenience"
 *     would be personal data in a place we do not control (`plan/07` §2.2, `CLAUDE.md`). The
 *     digest itself is never logged either (AC-24).
 *  3. **Thirty minutes** (§13 Q5). Long enough to finish a checkout, short enough that the 250 bp
 *     FX buffer still covers what a rate can do inside the window (`plan/06` §2.2).
 *  4. **`expired` is a first-class answer, and the caller re-derives.** On `expired` — the clock
 *     is past `expiresAt`, the rate behind it is now too old, the priced row has been superseded,
 *     or the row's amount has moved — spec 010/013 re-derive the price and show the new figure
 *     for **explicit re-confirmation**. A silently higher charge is not reachable through this
 *     API, because there is no code path from a stale quote to a payment intent.
 *  5. **Constant-time comparison.** `crypto.timingSafeEqual` over the raw digest bytes, guarded by
 *     a length check, so verification leaks no information about how much of a forged digest was
 *     right.
 *
 * `QUOTE_SIGNING_SECRET` **lands in spec 010's env schema, not here** (the task row and §13 Q5):
 * Phase 0 charges nothing and has no checkout, so this file carries a clearly-named development
 * secret and adds no `.env.example` key. `signingSecret()` is the one line spec 010 replaces.
 *
 * There is no `Date.now()` in this file: `now` is a parameter of both functions, so the expiry
 * window is testable to the millisecond and a cached page cannot depend on when a process started.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { CurrencyCode } from "@/config/currencies";

import {
  QUOTE_TTL_MINUTES,
  QuoteSchema,
  TierKeySchema,
  ProductSkuSchema,
} from "../schemas";
import type {
  IsoDate,
  PriceProjection,
  Quote,
  QuoteLine,
  QuoteVerdict,
} from "../types";

import { convert, isRateStale } from "./fx";
import { resolveByPriceVersion } from "./resolve";
import { roundToStyle } from "./round";

/**
 * The Phase 0 signing secret (spec 005 §13 Q5; TASK-068).
 *
 * **Not a secret at all, and named so it cannot be mistaken for one.** Phase 0 has no checkout,
 * no payment and no money movement (specs 010/013), so a quote signed here authorises nothing;
 * what the HMAC buys today is that the *shape* of the guarantee — sign the amount, verify it in
 * constant time, refuse the stale ones — is built and tested before there is money behind it.
 * Spec 010 adds `QUOTE_SIGNING_SECRET` to `src/lib/env.schema.ts` and `.env.example` and changes
 * `signingSecret()` below to read it; nothing else in this file moves.
 */
const PHASE_0_DEVELOPMENT_QUOTE_SECRET =
  "phase-0-development-quote-secret-not-a-production-key";

/** The one place the signing key is chosen; spec 010 replaces the body, not the callers. */
function signingSecret(): string {
  return PHASE_0_DEVELOPMENT_QUOTE_SECRET;
}

/** Milliseconds in a minute — the quote TTL is stated in minutes (§13 Q5). */
const MS_PER_MINUTE = 60_000;

/** The domain separator in the signed payload: a digest from one version never verifies another. */
const QUOTE_PAYLOAD_VERSION = "fo.quote.v1";

/** The separator joining the priced rows behind the lines; no `priceVersion` contains it. */
const PRICE_VERSION_SEPARATOR = "|";

/**
 * One line to quote: which product and tier, and **the projection the buyer was shown**
 * (spec 005 §5.2).
 *
 * The projection is passed rather than re-derived, and that is the whole point: what gets signed
 * is the number that was on the page, so the identity "price shown = price charged" is carried by
 * the same object that carried "price shown = price published as an `Offer`" (AC-11). A quote
 * built from a second read could differ from the page by a rate tick and nobody would see it.
 */
export interface QuoteLineInput {
  readonly productId: string;
  readonly tierKey: string;
  readonly projection: PriceProjection;
}

/** The canonical bytes a quote's id and digest are taken over — field order fixed, once, here. */
function canonicalPayload(quote: Omit<Quote, "quoteId" | "digest">): string {
  return JSON.stringify([
    QUOTE_PAYLOAD_VERSION,
    quote.currency,
    quote.totalMinor,
    quote.fxAsOf,
    quote.ratePpm,
    quote.priceVersion,
    quote.expiresAt,
    quote.lines.map((line) => [line.productId, line.tierKey, line.amountMinor]),
  ]);
}

/** A deterministic, non-secret id of the quoted content: no counter, no random source, no PII. */
function quoteIdFor(payload: string): string {
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

/** The HMAC over the canonical payload **and** the id, so neither can be swapped for another's. */
function digestFor(payload: string, quoteId: string): string {
  return createHmac("sha256", signingSecret())
    .update(`${payload}${PRICE_VERSION_SEPARATOR}${quoteId}`)
    .digest("hex");
}

/**
 * Constant-time digest comparison (AC-17).
 *
 * Length is checked first because `timingSafeEqual` throws on unequal buffers, and a length
 * difference is not a secret: `QuoteDigestSchema` has already refused anything that is not 64 hex
 * characters, so by here both are the same length in every real call.
 */
function digestsMatch(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Sign the prices a buyer was shown (spec 005 §5.2, §13 Q5).
 *
 * Every line must come from the same page: the same display currency, the same destination and
 * the same FX provenance. A quote mixing two currencies or two rates could not state one total,
 * and a total is what gets charged — so a mixed set throws rather than being reconciled here.
 *
 * `now` is the instant of issue; `expiresAt` is 30 minutes later.
 */
export function quote(lines: readonly QuoteLineInput[], now: Date): Quote {
  if (lines.length === 0) {
    throw new Error(
      "a quote with no lines has no price to sign (spec 005 §5.2)",
    );
  }

  const first = lines[0];
  if (first === undefined) throw new Error("unreachable");
  const currency: CurrencyCode = first.projection.displayPrice.currency;
  const fxAsOf: IsoDate | null = first.projection.fxAsOf ?? null;
  const ratePpm: number | null = first.projection.ratePpm ?? null;

  const quoteLines: QuoteLine[] = lines.map((line) => {
    const { projection } = line;
    if (projection.displayPrice.currency !== currency) {
      throw new Error(
        `a quote states one total, so every line is in one currency: found ${projection.displayPrice.currency} beside ${currency} (spec 005 §5.2)`,
      );
    }
    if (
      (projection.fxAsOf ?? null) !== fxAsOf ||
      (projection.ratePpm ?? null) !== ratePpm
    ) {
      throw new Error(
        `every line of a quote carries the same FX provenance: one page, one rate, one date (spec 005 §5.4)`,
      );
    }
    if (projection.destinationCountry !== first.projection.destinationCountry) {
      throw new Error(
        `a quote is for one destination: found ${projection.destinationCountry} beside ${first.projection.destinationCountry} (EU 2018/302 — the destination is the only geography a price has)`,
      );
    }
    return {
      productId: ProductSkuSchema.parse(line.productId),
      tierKey: TierKeySchema.parse(line.tierKey),
      amountMinor: projection.displayPrice.amountMinor,
    };
  });

  const unsigned = {
    lines: quoteLines,
    totalMinor: quoteLines.reduce((sum, line) => sum + line.amountMinor, 0),
    currency,
    fxAsOf,
    ratePpm,
    priceVersion: lines
      .map((line) => line.projection.priceVersion)
      .join(PRICE_VERSION_SEPARATOR),
    expiresAt: new Date(
      now.getTime() + QUOTE_TTL_MINUTES * MS_PER_MINUTE,
    ).toISOString(),
  } satisfies Omit<Quote, "quoteId" | "digest">;

  const payload = canonicalPayload(unsigned);
  const quoteId = quoteIdFor(payload);
  return QuoteSchema.parse({
    ...unsigned,
    quoteId,
    digest: digestFor(payload, quoteId),
  });
}

/**
 * Is this quote still the price? — `ok`, `expired` or `tampered` (spec 005 §5.2, AC-17).
 *
 * In order, because the order is the meaning:
 *
 *  1. **`tampered`** — the content does not parse as a quote, or the id or the digest does not
 *     match the content. Nothing further is checked: an altered quote is not a stale quote, and
 *     re-deriving a price for it would be answering a forgery politely.
 *  2. **`expired`** — the clock is at or past `expiresAt`.
 *  3. **`expired`** — the rate the amounts were converted at is now older than
 *     `MAX_FX_AGE_HOURS`. A quote may not outlive its rate; the projection refuses to *make* a
 *     price from a stale rate (AC-15) and this refuses to *hold* one.
 *  4. **`expired`** — a `priceVersion` no longer resolves, or the row it names now carries a
 *     different amount. Both are "the price moved under this quote", and the caller's remedy is
 *     the same: re-derive and show the new figure for explicit re-confirmation. Never `ok` for an
 *     unresolvable version (AC-17), and never `ok` on the strength of the version alone — an
 *     in-place amount edit leaves the version unchanged (`/review 47`), so the **signed amount**
 *     is what is compared.
 *  5. otherwise **`ok`**.
 */
export async function verifyQuote(
  candidate: unknown,
  now: Date,
): Promise<QuoteVerdict> {
  const parsed = QuoteSchema.safeParse(candidate);
  if (!parsed.success) return "tampered";
  const value = parsed.data;

  const payload = canonicalPayload(value);
  if (quoteIdFor(payload) !== value.quoteId) return "tampered";
  if (!digestsMatch(digestFor(payload, value.quoteId), value.digest)) {
    return "tampered";
  }

  if (now.getTime() >= Date.parse(value.expiresAt)) return "expired";
  if (value.fxAsOf !== null && isRateStale(value.fxAsOf, now)) return "expired";

  const versions = value.priceVersion.split(PRICE_VERSION_SEPARATOR);
  for (const [index, line] of value.lines.entries()) {
    const version = versions[index];
    if (version === undefined) return "expired";
    const price = await resolveByPriceVersion(version);
    if (price === null) return "expired";
    const current = displayAmountOf(price.amountMinor, price.currency, value);
    if (current === null || current !== line.amountMinor) return "expired";
  }
  return "ok";
}

/**
 * Today's destination-currency amount, in the quote's own display currency and at the quote's own
 * rate — the figure the signed line must still equal.
 *
 * Re-converting with the **quote's** rate rather than today's is what makes the comparison about
 * the *price* rather than about the market: a rate that has moved is handled by the staleness
 * check above, and a quote inside its window is charged at the rate it was issued with (§5.4).
 * `null` means the quote claims a conversion it cannot describe — no rate for a foreign currency
 * — and the caller treats that as "re-derive".
 */
function displayAmountOf(
  amountMinor: number,
  currency: CurrencyCode,
  value: Quote,
): number | null {
  if (currency === value.currency) return amountMinor;
  if (value.ratePpm === null || value.fxAsOf === null) return null;
  return roundToStyle(
    convert({ amountMinor, currency }, value.currency, {
      base: currency,
      quote: value.currency,
      ratePpm: value.ratePpm,
      asOf: value.fxAsOf,
      source: "quote",
    }),
  ).amountMinor;
}
