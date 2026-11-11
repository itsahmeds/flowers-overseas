/**
 * What the chargeback evidence pack reads (spec 021 §5.2 "Evidence pack", §8 flow 2; AC-28;
 * TASK-495), from immutable records only: the order row and its snapshots as placed, the
 * `order_event` log, spec 016's `notification_delivery` (the confirmation email's send time) and
 * spec 011's `delivery_proof`. **Never** read here: the card message, "sign as", either phone,
 * the florist, internal statuses, the risk score or signals. The recipient snapshot is parsed
 * with a schema that keeps only the name and the address lines, so the other fields cannot reach
 * the renderer.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { OrderExecutor } from "@/modules/orders";
import { orderReference } from "@/modules/orders";

/** The timeline steps of §5.2 item 3, in order. */
export const EVIDENCE_STEPS = [
  "placed",
  "paid",
  "in_production",
  "out_for_delivery",
  "delivered",
  "photo_uploaded",
] as const;
export type EvidenceStep = (typeof EVIDENCE_STEPS)[number];

/** Which event marks each step (the first of its type). */
const STEP_EVENTS: Readonly<Record<EvidenceStep, string>> = {
  placed: "order.placed",
  paid: "order.captured",
  in_production: "order.in_production",
  out_for_delivery: "order.out_for_delivery",
  delivered: "order.delivered",
  photo_uploaded: "order.photo_uploaded",
};

export interface EvidenceFacts {
  readonly orderId: string;
  readonly reference: string;
  readonly mode: "demo" | "test" | "live";
  readonly totalMinor: number;
  readonly currency: string;
  /** The buyer's checkout locale (the cancellation sentence is shown in it). */
  readonly locale: string;
  readonly productName: string | null;
  readonly tierKey: string | null;
  readonly deliveryDate: string;
  /** The destination's IANA zone (city, else country). */
  readonly zone: string;
  readonly termsVersion: string | null;
  readonly buyerCountry: string | null;
  readonly recipient: {
    readonly name: string;
    readonly lines: readonly string[];
  };
  readonly timeline: readonly {
    readonly step: EvidenceStep;
    readonly at: Date;
  }[];
  readonly confirmationSentAt: Date | null;
  readonly photo: {
    readonly bucket: string;
    readonly objectKey: string;
    readonly uploadedAt: Date;
  } | null;
}

const at = z
  .union([z.date(), z.string()])
  .transform((value) => (value instanceof Date ? value : new Date(value)));

const OrderRow = z.object({
  id: z.uuid(),
  mode: z.enum(["demo", "test", "live"]),
  buyer_total_minor: z.coerce.number().int(),
  buyer_currency_code: z.string().regex(/^[A-Z]{3}$/u),
  delivery_date: z.string(),
  zone: z.string().min(1),
  terms_version: z.string().nullable(),
  locale_code: z.string().nullable(),
  purchase_id: z.uuid().nullable(),
  buyer_snapshot: z.unknown(),
  recipient_snapshot: z.unknown(),
  country_iso2: z.string(),
});

/** Only these fields of the buyer snapshot are read: the declared country. */
const BuyerCountry = z.object({ countryIso2: z.string().optional() });

/**
 * Only these fields of the recipient snapshot are read (§5.2 item 4). The schema strips every
 * other key, so the phone, the card message and "sign as" never leave this parse.
 */
const RecipientAddress = z.object({
  fullName: z.string().optional(),
  addressLines: z.array(z.string()).optional(),
  postcode: z.string().optional(),
  city: z.string().optional(),
});

const LineRow = z.object({
  name: z.string().nullable(),
  tier_key: z.string().nullable(),
});
const EventRow = z.object({ type: z.string(), at });
const SentRow = z.object({ at: at.nullable() });
const PhotoRow = z.object({
  bucket: z.string().min(1),
  object_key: z.string().min(1),
  uploaded_at: at,
});

/** The evidence facts of `orderId`, or `null` for an unknown order. */
export async function evidenceFacts(
  executor: OrderExecutor,
  orderId: string,
): Promise<EvidenceFacts | null> {
  const id = z.uuid().parse(orderId);
  const [raw] = await executor.execute(sql`
    SELECT o.id, o.mode, o.buyer_total_minor, o.buyer_currency_code,
           o.delivery_date::text AS delivery_date,
           coalesce(ci.iana_zone, c.iana_zone) AS zone, o.terms_version,
           p.locale_code, o.purchase_id, o.buyer_snapshot, o.recipient_snapshot,
           c.iso2 AS country_iso2
    FROM "order" o
    JOIN country c ON c.id = o.destination_country_id
    LEFT JOIN city ci ON ci.id = o.destination_city_id
    LEFT JOIN purchase p ON p.id = o.purchase_id
    WHERE o.id = ${id}`);
  if (raw === undefined) return null;
  const order = OrderRow.parse(raw);
  const locale = order.locale_code ?? "en";
  const [lineRaw] = await executor.execute(sql`
    SELECT coalesce(t.name, en.name) AS name, l.tier_key
    FROM order_line l
    LEFT JOIN product_translation t
      ON t.product_id = l.product_id AND t.locale_code = ${locale}
    LEFT JOIN product_translation en
      ON en.product_id = l.product_id AND en.locale_code = 'en'
    WHERE l.order_id = ${id} AND l.kind = 'product'
    ORDER BY l.created_at, l.id LIMIT 1`);
  const line = lineRaw === undefined ? null : LineRow.parse(lineRaw);
  const events = (
    await executor.execute(sql`
      SELECT type, occurred_at AS at FROM order_event
      WHERE order_id = ${id} ORDER BY seq`)
  ).map((row) => EventRow.parse(row));
  const timeline = EVIDENCE_STEPS.flatMap((step) => {
    const event = events.find((row) => row.type === STEP_EVENTS[step]);
    return event === undefined ? [] : [{ step, at: event.at }];
  });
  const [sentRaw] =
    order.purchase_id === null
      ? []
      : await executor.execute(sql`
          SELECT min(coalesce(status_at, created_at)) AS at FROM notification_delivery
          WHERE purchase_id = ${order.purchase_id} AND template_key = 'order-received'
            AND status IN ('sent', 'delivered', 'delivery_delayed')`);
  const sent = sentRaw === undefined ? null : SentRow.parse(sentRaw).at;
  const [photoRaw] = await executor.execute(sql`
    SELECT a.bucket, a.object_key, p.uploaded_at
    FROM delivery_proof p JOIN media_asset a ON a.id = p.media_asset_id
    WHERE p.order_id = ${id}
    ORDER BY p.uploaded_at DESC, p.id DESC LIMIT 1`);
  const photo = photoRaw === undefined ? null : PhotoRow.parse(photoRaw);
  const buyer = BuyerCountry.safeParse(order.buyer_snapshot);
  const recipient = RecipientAddress.safeParse(order.recipient_snapshot);
  const address = recipient.success ? recipient.data : {};
  const cityLine = [address.postcode, address.city]
    .filter((part): part is string => part !== undefined && part !== "")
    .join(" ");
  return {
    orderId: id,
    reference: orderReference(id),
    mode: order.mode,
    totalMinor: order.buyer_total_minor,
    currency: order.buyer_currency_code,
    locale,
    productName: line?.name ?? null,
    tierKey: line?.tier_key ?? null,
    deliveryDate: order.delivery_date,
    zone: order.zone,
    termsVersion: order.terms_version,
    buyerCountry: buyer.success ? (buyer.data.countryIso2 ?? null) : null,
    recipient: {
      name: address.fullName ?? "",
      lines: [
        ...(address.addressLines ?? []),
        ...(cityLine === "" ? [] : [cityLine]),
        order.country_iso2,
      ],
    },
    timeline,
    confirmationSentAt: sent,
    photo:
      photo === null
        ? null
        : {
            bucket: photo.bucket,
            objectKey: photo.object_key,
            uploadedAt: photo.uploaded_at,
          },
  };
}
