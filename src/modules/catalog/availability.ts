/**
 * Availability: what the data says about whether this product can be sent to this destination
 * at all (spec 005 §2 "Availability", §5.3, §6, AC-20; TASK-068).
 *
 * The third of the three questions every money-bearing page asks — *what is this product*, *what
 * does it cost to send it here*, **can it be sent at all** — and the one where a wrong answer is
 * both a conversion failure and a structured-data manual action (`plan/02` §9, §15). Four
 * properties make the answer safe:
 *
 *  1. **It is derived from data, term by term, with no branch per country.** `country.status`,
 *     `product.status`, an active `country_price` row and florist coverage in the destination —
 *     that is the whole predicate. A `demo` destination is `saleable: false` with the
 *     `catalog.availability.countryDemo` reason and no `Offer` at all (ADR-0007); flipping that
 *     country's `status` to `live` in the dataset, with an active price and a covering florist,
 *     gives `InStock` / `saleable: true` **with no code change** (`CLAUDE.md`: "country go-live
 *     is a data flip in admin, never a code change"; AC-20, T-18 assert exactly that pair).
 *  2. **005 owns no calendar.** `CutoffEvaluator` and `CapacityProvider` are *declared* here with
 *     the types spec 009 (cutoff, holidays, occasion dates) and specs 024/031 (capacity)
 *     implement, plus `staticCutoffEvaluator()` — a test-grade evaluator that answers from an
 *     authored table and computes nothing. There is no date arithmetic, no holiday evaluation, no
 *     time-zone conversion and no occasion-date rule in this file, because `plan/03` §9/§10 and
 *     spec 005 §3 put every one of them in spec 009. A `date` narrows nothing here today: a date
 *     verdict without a calendar would be a guess, and a guess about "can it arrive on Saturday"
 *     is the one class of promise this business may not make (spec 006 §14 A4).
 *  3. **Every state has a string.** The `reasonKey` is always one of the five
 *     `catalog.availability.*` keys spec 005 §7 enumerates and `messages/en.json` carries, so no
 *     availability state can render untranslated (AC-22, WCAG 3.1.1). Spec §2's shorthand
 *     "`reasonKey = "country.demo"`" is the *countryDemo* state, and its key is the one §7 names:
 *     a reason key that no message file carries would render as a raw dotted string on the page.
 *  4. **No geography but the destination.** The signature takes a product and a destination ISO
 *     code and nothing else — no buyer country, no IP, no header, no locale (EU 2018/302,
 *     ADR-0006, AC-18).
 *
 * Zero client JavaScript: this file is server-side, imported by no client component, and adds no
 * bytes to any client chunk (AC-3).
 */
import { type CountryIso2, countryConfig } from "@/config/countries";

import { getProduct, hasActivePrice } from "./read";
import { AvailabilityQuerySchema, AvailabilitySchema } from "./schemas";
import {
  type Availability,
  type CatalogAvailabilityKey,
  type IsoDate,
  type SchemaAvailability,
  catalogAvailabilityKeys,
} from "./types";

/* -------------------------------------------------------------------------- */
/* The date seams: declared here, implemented in specs 009 and 024/031.       */
/* -------------------------------------------------------------------------- */

/**
 * The order cut-off for one destination on one delivery date, as spec 009 will state it.
 *
 * A **local wall-clock time plus its IANA zone**, never an instant: "14:00 Europe/Warsaw" is the
 * florist's working day, and collapsing it to UTC here would bake a DST offset into a value that
 * outlives the DST change (`plan/03` §9). Converting the pair to an instant is spec 009's, which
 * is why this type carries the two halves and no `Date`.
 */
export interface DeliveryCutoff {
  /** `HH:mm` in the destination's own zone — the last minute an order can be placed for `date`. */
  readonly localTime: string;
  /** An IANA zone id (`Europe/Warsaw`), carried opaquely: nothing here resolves it. */
  readonly timeZone: string;
}

/**
 * The calendar seam (spec 005 §2 "Availability by date is a seam, not an implementation", §3).
 *
 * Spec 009 implements this over the destination's cut-off time and zone, its weekly delivery
 * days, its holiday list and the occasion-date rules of `plan/03` §10; specs 024/031 add capacity
 * on top. It is declared **here**, in the module that owns availability, so that the consumer
 * (spec 009's PDP date picker) and the producer agree on a type rather than on prose — and so
 * that 005 can be complete without owning a single line of date arithmetic.
 *
 * Every method is `async` and takes the destination, because the answer is per country and will
 * be per florist: the static evaluator below performs no I/O and the database-backed one will.
 */
export interface CutoffEvaluator {
  /** The first date on or after `from` that can be delivered, or `null` if none is known. */
  nextAvailableDate(input: {
    readonly countryIso: CountryIso2;
    readonly from: IsoDate;
  }): Promise<IsoDate | null>;
  /** Can this exact calendar day be delivered in this destination? */
  isDateAvailable(input: {
    readonly countryIso: CountryIso2;
    readonly date: IsoDate;
  }): Promise<boolean>;
  /** The cut-off that applies to that day, or `null` when the day is not deliverable at all. */
  cutoffFor(input: {
    readonly countryIso: CountryIso2;
    readonly date: IsoDate;
  }): Promise<DeliveryCutoff | null>;
}

/**
 * The capacity seam (specs 024/031; spec 005 §3).
 *
 * `null` means "we do not model capacity for this city and date", which is Phase 0's honest
 * answer everywhere and is deliberately *not* the same as `0` ("full"): a caller that read an
 * unmodelled city as full would hide a destination we can actually serve.
 */
export interface CapacityProvider {
  remainingCapacity(input: {
    readonly city: string;
    readonly date: IsoDate;
  }): Promise<number | null>;
}

/**
 * A test-grade `CutoffEvaluator` over an **authored** table of deliverable days (spec 005 §2).
 *
 * It computes nothing: `isDateAvailable` is set membership, `nextAvailableDate` is the first
 * authored day at or after `from` — ISO `YYYY-MM-DD` strings sort chronologically, so this is a
 * string comparison and not date arithmetic — and `cutoffFor` returns the authored cut-off
 * unchanged. No weekday is derived, no holiday is evaluated, no zone is resolved and no occasion
 * rule is applied, because all four are spec 009's (`plan/03` §9/§10). Its purpose is to let
 * specs 009/010 and this module's own tests exercise the *seam* before the calendar exists.
 */
export function staticCutoffEvaluator(schedule: {
  /** The deliverable days, authored. Order does not matter; duplicates are harmless. */
  readonly dates: readonly IsoDate[];
  /** The cut-off those days share, or `null` for a schedule that states none. */
  readonly cutoff?: DeliveryCutoff | null;
}): CutoffEvaluator {
  const days = [...new Set(schedule.dates)].sort();
  const cutoff = schedule.cutoff ?? null;

  return {
    isDateAvailable: ({ date }) => Promise.resolve(days.includes(date)),
    nextAvailableDate: ({ from }) =>
      Promise.resolve(days.find((day) => day >= from) ?? null),
    cutoffFor: ({ date }) =>
      Promise.resolve(days.includes(date) ? cutoff : null),
  };
}

/* -------------------------------------------------------------------------- */
/* Coverage: who can actually make and deliver this, in this destination.     */
/* -------------------------------------------------------------------------- */

/**
 * "Is there at least one active florist who can make this product and deliver it in this
 * destination?" — spec 005 §2's fourth availability term
 * (`partner_catalog_mapping.can_fulfil` + `partner_coverage`).
 *
 * A seam, for the same reason the calendar is one: the tables it will read are spec 002's, the
 * routing that chooses *which* florist is spec 016's, and neither exists. Declaring it here keeps
 * `availability()` a conjunction of four data terms rather than three plus an assumption, and
 * lets AC-20's "no covering florist" case be exercised today.
 *
 * The Phase 0 implementation is `destinationRegistryCoverage` below.
 */
export interface FulfilmentCoverage {
  covers(input: {
    readonly productId: string;
    readonly countryIso: CountryIso2;
  }): Promise<boolean>;
}

/**
 * Phase 0's coverage answer: **the destination registry itself** (`src/config/countries.ts`).
 *
 * `country.status = 'live'` is the founder's recorded statement that we deliver there — it is the
 * canvas's "Delivering now" state and `plan/10` §3's honesty rule already forbids a non-live
 * country from naming the cities it covers. So in Phase 0 "a florist covers this destination" and
 * "this destination is live" are the same fact, recorded in one place, and pretending otherwise
 * would mean authoring a second coverage table nobody maintains.
 *
 * Spec 016's routing replaces this object at the seam — with `partner_catalog_mapping.can_fulfil`
 * and `partner_coverage`, per product and per city — and no caller changes.
 */
const destinationRegistryCoverage: FulfilmentCoverage = {
  covers: ({ countryIso }) =>
    Promise.resolve(countryConfig(countryIso).status === "live"),
};

/* -------------------------------------------------------------------------- */
/* The verdict.                                                               */
/* -------------------------------------------------------------------------- */

/** Build one parsed verdict; the three fields always move together (`AvailabilitySchema`). */
function verdict(
  schemaAvailability: SchemaAvailability,
  reasonKey: CatalogAvailabilityKey,
  saleable: boolean,
): Availability {
  return AvailabilitySchema.parse({ schemaAvailability, reasonKey, saleable });
}

/**
 * Can this product be sent to this destination? (spec 005 §2, §5.3, AC-20)
 *
 * The four terms in the order that makes the reason most useful to a page: a destination we do
 * not serve at all outranks a retired product, which outranks a missing price, which outranks
 * missing coverage. The first failing term names the state; all four holding is `InStock`.
 *
 * `date` is accepted because the spec's signature has it and because the two seams above will
 * interpret it — and it changes nothing today, on purpose: this module owns no calendar
 * (`plan/03` §9/§10, spec 005 §3), and inventing a date verdict here would be a delivery-timing
 * claim made by the wrong spec.
 *
 * `coverage` is the injection point for spec 016's routing; the default is the destination
 * registry (above). Passing one is how AC-20's "no covering florist" state is reachable before
 * partners exist.
 *
 * Throws for a SKU the catalogue does not have: a caller holding an unknown product has a bug,
 * not an out-of-stock product (`plan/12` §2, the same rule `productIndexability()` follows).
 */
export async function availability(query: {
  readonly productId: string;
  readonly countryIso: CountryIso2;
  readonly date?: IsoDate;
  readonly coverage?: FulfilmentCoverage;
}): Promise<Availability> {
  const { coverage: injected, ...rest } = query;
  const { productId, countryIso } = AvailabilityQuerySchema.parse(rest);
  const coverage = injected ?? destinationRegistryCoverage;

  if (countryConfig(countryIso).status !== "live") {
    return verdict(
      "OutOfStock",
      catalogAvailabilityKeys.countryDemo,
      /* saleable */ false,
    );
  }

  const product = await getProduct(productId);
  if (product === null) {
    throw new Error(
      `\`${productId}\` is not a product in the catalogue: an unknown SKU is a caller defect, not an out-of-stock product (spec 005 §5.2)`,
    );
  }
  if (product.status !== "active") {
    return verdict("OutOfStock", catalogAvailabilityKeys.outOfStock, false);
  }

  if (!(await hasActivePrice(productId, countryIso))) {
    return verdict("OutOfStock", catalogAvailabilityKeys.outOfStock, false);
  }

  if (!(await coverage.covers({ productId, countryIso }))) {
    return verdict("OutOfStock", catalogAvailabilityKeys.noPartner, false);
  }

  return verdict("InStock", catalogAvailabilityKeys.inStock, true);
}
