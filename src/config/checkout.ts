/**
 * Checkout limits (spec 010; TASK-200).
 *
 * Spec 010 §2, §5.2 `src/config/checkout.ts`, §13 Q1, Q8, Q9.
 *
 * The numbers the checkout is built around, as data, so a limit is changed here and nowhere else:
 *
 *  - **the three steps** of the one checkout URL (`plan/04` §9), in order;
 *  - **the grapheme limits** of §2 and §13 Q9: the card message (200), "sign as" (40), the delivery
 *    note (120) and the recipient's and buyer's full name (120, §5.2 `RecipientStepSchema`). They
 *    are counted as a reader sees letters (`countGraphemes()` in `src/modules/i18n/format.ts`), so
 *    "ł", "Ж" and a family emoji each count one;
 *  - **the demo cap**: at most 200 demo orders per UTC day, which protects the database's free
 *    compute allowance from a public demo being spammed (§2, §13 Q1);
 *  - **the quote lock** (30 minutes, spec 005 §13 Q5) and **the draft lifetime** (24 hours after
 *    the last activity, every environment, §2 "Retention");
 *  - **the kinds of place** a delivery can go to, spec 002's `recipient_address.place_kind` list;
 *  - **who may enter the demo checkout from a product page** (§13 Q1, default "everyone"), as the
 *    deployment-level fact `checkoutEntryFor()` reads at build time.
 *
 * No database is read here and none may be (`pnpm check:no-db`, spec 010 §12). No flag is read
 * here either: whether a checkout is open, a demo or live is `checkoutMode()`'s alone
 * (`src/modules/checkout/mode.ts`, AC-1).
 */
import type { DeploymentEnvironment } from "../lib/env.schema.ts";

/** The three steps of `/{locale}/checkout`, in the order a buyer meets them (§2). */
export const CHECKOUT_STEPS = ["recipient", "card", "review"] as const;
export type CheckoutStep = (typeof CHECKOUT_STEPS)[number];

/**
 * Field limits, in graphemes (§2, §5.2, §13 Q9). A grapheme is what a reader counts as one
 * letter, so the limit means the same thing in Polish, Russian and emoji.
 *
 * `addressLine` bounds every free-text address field the destination's format names (street,
 * house number, c/o, address lines, city, region): spec 010 states no figure for them, so they
 * take the delivery note's 120, which no real street line reaches and which keeps a pasted essay
 * out of a florist's brief.
 */
export const CHECKOUT_LIMITS = {
  cardMessage: 200,
  signAs: 40,
  deliveryNote: 120,
  fullName: 120,
  addressLine: 120,
} as const satisfies Readonly<Record<string, number>>;
export type CheckoutLimitKey = keyof typeof CHECKOUT_LIMITS;

/** At most this many demo orders per UTC calendar day, across the whole deployment (§2, §13 Q1). */
export const DEMO_DAILY_ORDER_CAP = 200;

/**
 * How long a quote holds its price, in minutes (spec 005 §13 Q5). The quote itself is spec 005's
 * (`QUOTE_TTL_MINUTES` in `src/modules/catalog/schemas.ts`); this is the checkout's statement of
 * the same lock, and `tests/unit/checkout-config.test.ts` pins the two equal.
 */
export const QUOTE_LOCK_MINUTES = 30;

/** An unfinished checkout is deleted this many hours after its last activity (§2 "Retention"). */
export const DRAFT_LIFETIME_HOURS = 24;

/**
 * The kinds of place a bouquet can be delivered to: spec 002's
 * `recipient_address.place_kind CHECK IN (...)`, in the order step 1 offers them (§2).
 */
export const PLACE_KINDS = [
  "home",
  "work",
  "hospital",
  "funeral_home",
  "hotel",
  "cemetery",
  "church",
] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

/**
 * The message key of each place kind's label. Spelled out rather than built from the kind so the
 * key in the catalogue and the key in the code are the same literal (`pnpm i18n:check`).
 */
export const PLACE_KIND_LABEL_KEYS = {
  home: "checkout.placeKind.home",
  work: "checkout.placeKind.work",
  hospital: "checkout.placeKind.hospital",
  funeral_home: "checkout.placeKind.funeralHome",
  hotel: "checkout.placeKind.hotel",
  cemetery: "checkout.placeKind.cemetery",
  church: "checkout.placeKind.church",
} as const satisfies Readonly<Record<PlaceKind, string>>;

/**
 * The deployments whose product pages offer "Try a demo order" in the `preview` picker state
 * (§13 Q1). The founder's answer was the default, **everyone**, so every environment is listed;
 * the alternative ("staging only") is this list without `production`, a one-line data change
 * reviewed like any other (`checkoutEntryFor()` reads it at build time, §5.3, §12).
 */
export const DEMO_ENTRY_ENVIRONMENTS: readonly DeploymentEnvironment[] = [
  "development",
  "test",
  "preview",
  "staging",
  "production",
];
