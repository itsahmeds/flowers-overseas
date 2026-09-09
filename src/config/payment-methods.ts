/**
 * Payment-method registry (spec 004 §2 "Everything data-gated is config", §8 "Reviews and trust",
 * §5.3 "Footer"; TASK-049).
 *
 * The founder-approved colophon prints a payment line: `BLIK · Klarna · PayPal · Visa ·
 * Mastercard · Apple Pay` and "Card payments processed by Stripe"
 * (`docs/design/homepage-v1/homepage-desktop.dc.html`). **Not one of those methods can take a
 * euro today**: there is no Stripe account, no Mollie account, no checkout and no order, and the
 * marks are third-party trademarks whose use is licensed per processor agreement (§2, §8). A
 * demo that prints six method names is a live-method claim the founder could read back to a
 * florist, which is the class of statement `plan/07` §7 and Phase 0 AC 6 exist to forbid.
 *
 * So this file is the honest half of that design: every method the canvas draws, as data, with
 * `available: false`, and **`SiteFooter` renders the names of the available ones — which is
 * nothing in Phase 0**. Spec 013 (Stripe) and spec 014 (Mollie) flip `available` per method as
 * each one is actually configured, and the colophon grows by a data flip with no template edit —
 * the same mechanism `site-links.ts` gives the link columns.
 *
 * `displayName` is **data, not copy**: "BLIK", "Klarna" and "Visa" are proper nouns and brand
 * marks, never translated (the same rule `company.tradingName` follows), so there is no
 * `footer.payment.method.*` message key to leave unused in the catalogue while the methods are
 * dark. The surrounding words *are* copy (`footer.payment.*`).
 *
 * No logo, ever, from here: a mark is an image asset under a trademark licence, and this registry
 * carries no image path precisely so a later task cannot ship one by filling a field in. When the
 * processor agreements are signed, the task that adds the marks adds the field with the licence
 * reference in the same PR.
 *
 * No database is read here and none may be (`pnpm check:no-db`, spec 004 AC-2).
 */
import { z } from "zod";

/**
 * How a method is settled, which is what decides the sentence next to it: `card` methods are the
 * ones "processed by Stripe" carries; a wallet tokenises a card; `bank-redirect` (BLIK, iDEAL)
 * and `bnpl` (Klarna) never touch a card number at all.
 */
export const paymentMethodKinds = [
  "card",
  "wallet",
  "bank-redirect",
  "bnpl",
] as const;
export type PaymentMethodKind = (typeof paymentMethodKinds)[number];

/** The processors of ADR-0008: Stripe primary, Mollie fallback. */
export const paymentProcessors = ["stripe", "mollie"] as const;
export type PaymentProcessor = (typeof paymentProcessors)[number];

/** The spec that makes a method available, as its three-digit id (`013`, `014`). */
const OwningSpecSchema = z
  .string()
  .regex(/^0\d{2}$/, "must be a three-digit spec id such as `013`");

export const PaymentMethodSchema = z
  .object({
    /** Stable id: what a test names and what spec 013's provider adapter maps. */
    id: z
      .string()
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "must be a lowercase, hyphen-separated method id",
      ),
    /** The brand's own name. A proper noun: data, never a message key (see the header). */
    displayName: z.string().min(1),
    kind: z.enum(paymentMethodKinds),
    /**
     * ISO-3166-1 alpha-2 markets the method matters in, so spec 013 can order the checkout list
     * by the buyer's market rather than by this file's order. Empty means "everywhere".
     */
    markets: z.array(z.string().regex(/^[A-Z]{2}$/)).default([]),
    /**
     * Can we take a payment with it **today**? `false` for every row in Phase 0, and the only
     * thing `SiteFooter` reads (through `availablePaymentMethods()`).
     */
    available: z.boolean(),
    /** Who would settle it. Required once a method is available: see the refinement. */
    processor: z.enum(paymentProcessors).optional(),
    owningSpec: OwningSpecSchema,
  })
  .strict()
  .superRefine((method, ctx) => {
    if (method.available && method.processor === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["processor"],
        message: `payment method \`${method.id}\` is available with no processor: a method we display as accepted must name who settles it, or the colophon is claiming a capability nobody has (spec 004 §8)`,
      });
    }
  });

export type ParsedPaymentMethod = z.infer<typeof PaymentMethodSchema>;

export type PaymentMethod = Omit<ParsedPaymentMethod, "id"> & {
  id: PaymentMethodId;
};

export const PaymentMethodRegistrySchema = z
  .array(PaymentMethodSchema)
  .min(1)
  .superRefine((methods, ctx) => {
    const seen = new Set<string>();
    methods.forEach((method, index) => {
      if (seen.has(method.id)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `duplicate payment method id \`${method.id}\``,
        });
      }
      seen.add(method.id);
    });
  });

/**
 * The canvas's six, in the canvas's order. `markets` is `plan/02`'s launch corridor: BLIK is a
 * Polish scheme, the rest are pan-European.
 */
const paymentMethods = [
  {
    id: "blik",
    displayName: "BLIK",
    kind: "bank-redirect",
    markets: ["PL"],
    available: false,
    owningSpec: "014",
  },
  {
    id: "klarna",
    displayName: "Klarna",
    kind: "bnpl",
    markets: [],
    available: false,
    owningSpec: "013",
  },
  {
    id: "paypal",
    displayName: "PayPal",
    kind: "wallet",
    markets: [],
    available: false,
    owningSpec: "014",
  },
  {
    id: "visa",
    displayName: "Visa",
    kind: "card",
    markets: [],
    available: false,
    owningSpec: "013",
  },
  {
    id: "mastercard",
    displayName: "Mastercard",
    kind: "card",
    markets: [],
    available: false,
    owningSpec: "013",
  },
  {
    id: "apple-pay",
    displayName: "Apple Pay",
    kind: "wallet",
    markets: [],
    available: false,
    owningSpec: "013",
  },
] as const;

/** Parsed at module load: a malformed registry throws on first import, never at request time. */
export const PAYMENT_METHODS = PaymentMethodRegistrySchema.parse(
  paymentMethods,
) as readonly PaymentMethod[];

/** The closed set of method ids, as a literal union. */
export type PaymentMethodId = (typeof paymentMethods)[number]["id"];

/**
 * **The** consumer path for `available` (spec 004 §5.1's one-predicate contract, as
 * `isPublished()` is for a link): the methods we can actually process, in registry order. Empty
 * in Phase 0, which is why the footer's payment column prints two sentences and no name.
 */
export function availablePaymentMethods(
  methods: readonly PaymentMethod[] = PAYMENT_METHODS,
): readonly PaymentMethod[] {
  return methods.filter((method) => method.available);
}
