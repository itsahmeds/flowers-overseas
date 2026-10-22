/**
 * What the florist inbox prints, as data (spec 011 §5.2 "Read models", §2 "The florist inbox v0";
 * TASK-210 for the presentational half, TASK-214 for the read models that fill it).
 *
 * `FloristAssignmentListItemSchema` and `FloristOrderViewSchema` list **every field the screens
 * print and nothing else**. The order view is a discriminated union on `stage`, so a renderer
 * cannot print what the type does not carry:
 *
 *  - there is **no buyer field at all**: no customer name, email, phone, billing address,
 *    payment, buyer total or buyer currency (§8 "Minimisation, structurally");
 *  - the recipient's `fullName`, `phoneE164`, `addressLines`, `deliveryNote` and `cardMessage`
 *    exist only from acceptance to the photo (`accepted`, `outForDelivery`, `delivered`), never
 *    on an offer, an expired offer, a withdrawn order or once the photo is in (§2 "The order page").
 *
 * Dates and instants are data (ISO strings) with the destination's IANA zone beside them: the
 * components format them with `formatDate` and `formatTimeInZone` in that zone (§7), never in the
 * server's. Money is integer minor units with a currency; the components print it with
 * `formatMoney`. Labels are message keys or catalogue data, never copy.
 *
 * No database is read here (`pnpm check:no-db`): TASK-214's `listFloristAssignments()` and
 * `floristOrderView()` produce these shapes from Postgres under the partner context, and
 * `exampleFloristOrderView()` produces them from the catalogue for the walkthrough.
 */
import { z } from "zod";

/** The florist surfaces' languages (`partner_member.locale_code`, §7). */
export const FLORIST_LOCALES = ["en", "pl", "de"] as const;
export type FloristLocale = (typeof FLORIST_LOCALES)[number];

const MoneySchema = z
  .object({
    amountMinor: z.number().int().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/u),
  })
  .strict();

const IsoDateSchema = z.iso.date();
const InstantSchema = z.iso.datetime({ offset: true });

/** The product line a florist reads: the catalogue's name and the tier's label key and count. */
const ProductLineSchema = z
  .object({
    sku: z.string().min(1),
    /** The catalogue's product name; it travels across locales untranslated (`plan/10` §2.2). */
    name: z.string().min(1),
    tier: z
      .object({
        /** A `catalog.tier.*` message key. */
        labelKey: z.string().regex(/^catalog\.tier\./u),
        /** The stem count the label's plural reads, or `null` for a sized arrangement. */
        stems: z.number().int().positive().nullable(),
      })
      .strict(),
    /** Each add-on's `catalog.addon.*.name` message key, in catalogue order. */
    addonNameKeys: z.array(z.string().regex(/^catalog\.addon\./u)),
  })
  .strict();

/** Where and when: the delivery date in the destination's zone, the town and postcode. */
const DeliverySchema = z
  .object({
    date: IsoDateSchema,
    /** The destination's IANA zone, which is also the florist's (§7). */
    timeZone: z.string().min(1),
    countryIso2: z.string().regex(/^[A-Z]{2}$/u),
    town: z.string().min(1),
    postcode: z.string().min(1),
  })
  .strict();

/** The recipient, present only from acceptance to the photo. */
export const FloristRecipientSchema = z
  .object({
    fullName: z.string().min(1),
    /** Stored E.164, printed as stored with a `tel:` link (§7). */
    phoneE164: z.string().regex(/^\+[1-9]\d{6,14}$/u),
    /** `formatAddressBlock()`'s lines for the destination, without the name and phone. */
    addressLines: z.array(z.string().min(1)).min(1),
    deliveryNote: z.string().min(1).optional(),
    cardMessage: z.string().min(1),
  })
  .strict();
export type FloristRecipient = z.infer<typeof FloristRecipientSchema>;

const BaseFields = {
  assignmentId: z.uuid(),
  product: ProductLineSchema,
  delivery: DeliverySchema,
  /** What the florist receives: the agreed payout, never the buyer's price. */
  payout: MoneySchema,
};

/** The stages of §5.3's order page whose data differs. */
export const FLORIST_ORDER_STAGES = [
  "offer",
  "expired",
  "accepted",
  "outForDelivery",
  "delivered",
  "photoReceived",
  "withdrawn",
] as const;
export type FloristOrderStage = (typeof FLORIST_ORDER_STAGES)[number];

export const FloristOrderViewSchema = z.discriminatedUnion("stage", [
  z
    .object({
      stage: z.literal("offer"),
      ...BaseFields,
      /** The time to answer by, an instant printed in `delivery.timeZone`. */
      answerBy: InstantSchema,
    })
    .strict(),
  z.object({ stage: z.literal("expired"), ...BaseFields }).strict(),
  z
    .object({
      stage: z.literal("accepted"),
      ...BaseFields,
      recipient: FloristRecipientSchema,
    })
    .strict(),
  z
    .object({
      stage: z.literal("outForDelivery"),
      ...BaseFields,
      recipient: FloristRecipientSchema,
    })
    .strict(),
  z
    .object({
      stage: z.literal("delivered"),
      ...BaseFields,
      recipient: FloristRecipientSchema,
    })
    .strict(),
  z
    .object({
      stage: z.literal("photoReceived"),
      ...BaseFields,
      /** A signed URL valid for at most five minutes (§2 "The delivery photo"); never logged. */
      photoUrl: z.url().optional(),
    })
    .strict(),
  // Spec 016 §5.3: no recipient field, no payout, no action.
  z
    .object({
      stage: z.literal("withdrawn"),
      assignmentId: z.uuid(),
      product: ProductLineSchema,
      delivery: DeliverySchema,
    })
    .strict(),
]);
export type FloristOrderView = z.infer<typeof FloristOrderViewSchema>;

/** The list's three groups (§2 "The list"). */
export const FLORIST_LIST_GROUPS = [
  "waiting",
  "inProgress",
  "delivered",
] as const;
export type FloristListGroup = (typeof FLORIST_LIST_GROUPS)[number];

/** Which group an order stage is listed under. */
export function listGroupOf(stage: FloristOrderStage): FloristListGroup {
  switch (stage) {
    case "offer":
    case "expired":
      return "waiting";
    case "accepted":
    case "outForDelivery":
    case "withdrawn":
      return "inProgress";
    case "delivered":
    case "photoReceived":
      return "delivered";
  }
}

/**
 * One row of the list: the product, its add-ons, the date, the town, what the florist receives
 * and, for an open offer, the time to answer by (§2 "The list"). No recipient field at any stage.
 */
export const FloristAssignmentListItemSchema = z
  .object({
    assignmentId: z.uuid(),
    stage: z.enum(FLORIST_ORDER_STAGES),
    product: ProductLineSchema,
    delivery: DeliverySchema,
    /** Absent for a withdrawn order (spec 016 §5.3). */
    payout: MoneySchema.optional(),
    /** Present exactly for an open offer. */
    answerBy: InstantSchema.optional(),
  })
  .strict()
  .refine(
    (item) => (item.stage === "offer") === (item.answerBy !== undefined),
    {
      message: "an open offer, and only an open offer, has an answer-by time",
      path: ["answerBy"],
    },
  )
  .refine(
    (item) => (item.stage === "withdrawn") === (item.payout === undefined),
    {
      message:
        "every stage but a withdrawn order shows what the florist receives",
      path: ["payout"],
    },
  );
export type FloristAssignmentListItem = z.infer<
  typeof FloristAssignmentListItemSchema
>;

/** The list row of an order view: the same fields, the recipient dropped by construction. */
export function listItemOf(view: FloristOrderView): FloristAssignmentListItem {
  return FloristAssignmentListItemSchema.parse({
    assignmentId: view.assignmentId,
    stage: view.stage,
    product: view.product,
    delivery: view.delivery,
    ...(view.stage === "withdrawn" ? {} : { payout: view.payout }),
    ...(view.stage === "offer" ? { answerBy: view.answerBy } : {}),
  });
}
