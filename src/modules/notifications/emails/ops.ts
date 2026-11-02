/**
 * The founder's emails: A1 `alert-no-partner` and W `whatsapp-copy` (spec 016 §5.2 template
 * table, "W", §5.3; AC-10, AC-11, AC-21, AC-22, AC-36; artboard `email-founder-*.dc.html`, "A1"
 * and "W"; TASK-332), and spec 030a's F1 `payout-prepaid-ready` (§5.2 "Founder emails"; AC-5,
 * AC-7; the same artboard, "F1"; TASK-363), in the layout's founder frame.
 *
 * **F1.** A prepaid payout is ready: the florist's shop code, which prepaid order of its limit
 * this is with the order reference, the amount in the florist's currency, and the payout's admin
 * link. Shop codes and order references only, no name or contact data (§5.2).
 *
 * Their words are English only and live in the admin catalogue (`emails.ops.*` in
 * the admin catalogue, spec 012 §2.2), which only `src/modules/admin` may read; the admin
 * order path is the admin module's too. Both are **handed in** as `OpsCopy` by the job worker
 * (`src/jobs/handlers.ts`), so this module neither imports the admin catalogue nor names an admin
 * path, and no public page reaches either.
 *
 * **A1.** The band and the "Cancels at" row say when the order cancels itself: `graceEnd` of the
 * exhaustion (the order's latest `order.no_partner_available` event), its delivery date and its
 * destination (the routing module's own function, so the email and the expiry job cannot
 * disagree), in the destination's zone; "tomorrow, {date}" when that instant falls on the next
 * local day. Every offer made, in order, with its outcome: a decline by its reason's **label
 * only** (spec 011's closed list; anything else reads "Another reason", so a free-text note never
 * leaves), "No answer by {time}" for a timeout. No offer at all prints the one "no florist covers
 * this date and place" row. Florists by their shop code; no buyer or recipient data (§8: ops
 * alerts carry ids, city and date). `routing.auto` off schedules the same expiry at `graceEnd`
 * (AC-11), so the band is the same in both cases.
 *
 * **W.** Two bodies only, the offer (V1) and the stop message (V4), never V2 or V5 (founder
 * 16-5); which one is the pipeline's `whatsappCopyOf`. The paste block is the florist's message in
 * the language of the shop's earliest owner member (`input.locale`), built from the same facts as
 * the florist's own email. The offer carries the inbox address **with no sign-in token**
 * (`input.inboxUrl`; `input.link` is never read here), so no bearer credential passes through the
 * founder's inbox or Meta; the stop message carries no link and no reason. The shop is named by
 * its name and code, never by a phone number.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { TRADING_NAME } from "@/config/company.data";
import { isCurrencyCode } from "@/config/currencies";
import {
  formatDate,
  formatMoney,
  formatRegionName,
  zonedClock,
} from "@/modules/i18n";
import { type OrderExecutor, graceEnd, orderReference } from "@/modules/orders";

import type {
  NotificationRenderInput,
  RenderedNotification,
} from "../templates";
import {
  notificationTemplate,
  registerNotificationTemplate,
} from "../templates";

import { loadFloristMessageFacts } from "./facts";
import {
  type FloristMessageFacts,
  floristDeadline,
  floristLanguageOf,
  whatsappFloristText,
} from "./florist";
import { type Child, fragment, text } from "./html";
import {
  type Block,
  type EmailFrame,
  attemptsTable,
  button,
  code,
  emailDocument,
  facts,
  heading,
  note,
  numeric,
  pasteBlock,
} from "./layout";

/** The founder's words and the admin order path, handed in by the worker. */
export interface OpsCopy {
  /** The admin catalogue's translator over `emails.ops.*` (`adminT`). */
  readonly t: (
    key: string,
    values?: Readonly<Record<string, string>>,
  ) => string;
  /** `/admin/orders/{id}` (spec 012). */
  readonly orderHref: (orderId: string) => string;
  /** `/admin/payouts/{id}` (spec 030a §2.8); F1 only, so a worker without it sends no F1. */
  readonly payoutHref?: (payoutId: string) => string;
}

/** The variable the alert address is read from (`src/lib/env.notifications.ts`), never the address. */
const ALERT_VARIABLE = "OPS_ALERT_EMAIL";

/** Placeholders no message contains, swapped for markup in the HTML part. */
const VARIABLE_SLOT = "\u0000variable\u0000";
const REFERENCE_SLOT = "\u0000reference\u0000";

/** The founder frame: "Internal", and the one "Sent to OPS_ALERT_EMAIL" line. */
function opsFrame(copy: OpsCopy): EmailFrame {
  const [before = "", after = ""] = copy
    .t("emails.ops.layout.sentTo", { variable: VARIABLE_SLOT })
    .split(VARIABLE_SLOT);
  return {
    audience: "ops",
    audienceLabel: copy.t("emails.ops.layout.audience"),
    brand: TRADING_NAME,
    footer: [{ html: fragment(before, code(ALERT_VARIABLE), after) }],
  };
}

function opsFooterText(copy: OpsCopy): string {
  return `--\n${copy.t("emails.ops.layout.sentTo", { variable: ALERT_VARIABLE })}`;
}

/* -------------------------------------------------------------------------- */
/* A1                                                                          */
/* -------------------------------------------------------------------------- */

const DECLINE_REASONS = [
  "capacity",
  "out_of_area",
  "product_unavailable",
  "closed",
  "other",
] as const;

const Instant = z.coerce.date();

/** One offer of the order, as the alert prints it. */
export const AlertOfferSchema = z
  .object({
    attempt: z.number().int().positive(),
    partnerCode: z.string().min(1),
    response: z.enum(["accept", "decline", "timeout"]).nullable(),
    reason: z.string().nullable(),
    slaExpiresAt: Instant,
    withdrawn: z.boolean(),
  })
  .strict();
export type AlertOffer = z.infer<typeof AlertOfferSchema>;

/** What A1 prints: ids, place, date, times and shop codes. Nothing about a person. */
export const NoPartnerAlertFactsSchema = z
  .object({
    orderId: z.uuid(),
    deliveryDate: z.iso.date(),
    countryIso2: z.string().regex(/^[A-Z]{2}$/u),
    city: z.string().min(1),
    timeZone: z.string().min(3),
    /** `country.same_day_cutoff_local` as `HH:mm`, or null when the country has none. */
    sameDayCutoffLocal: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u)
      .nullable(),
    exhaustedAt: Instant,
    offers: z.array(AlertOfferSchema),
  })
  .strict();
export type NoPartnerAlertFacts = z.infer<typeof NoPartnerAlertFactsSchema>;

/** "Europe/Warsaw" → "Warsaw": the zone's city, as the band names it. */
function zoneCity(timeZone: string): string {
  const last = timeZone.split("/").at(-1) ?? timeZone;
  return last.replaceAll("_", " ");
}

/** The destination-local calendar date of `instant`, as `YYYY-MM-DD`. */
function localDate(instant: Date, timeZone: string): string {
  const clock = zonedClock(instant, timeZone);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${String(clock.year)}-${pad(clock.month)}-${pad(clock.day)}`;
}

function outcomeOf(copy: OpsCopy, offer: AlertOffer, timeZone: string): string {
  if (offer.response === "decline") {
    const reason =
      DECLINE_REASONS.find((known) => known === offer.reason) ?? "other";
    return copy.t("emails.ops.noFlorist.outcome.declined", {
      reason: copy.t(`emails.ops.noFlorist.reason.${reason}`),
    });
  }
  if (offer.response === "timeout") {
    return copy.t("emails.ops.noFlorist.outcome.noAnswer", {
      time: formatDate(offer.slaExpiresAt, "en", "time", timeZone),
    });
  }
  if (offer.withdrawn) return copy.t("emails.ops.noFlorist.outcome.withdrawn");
  if (offer.response === "accept")
    return copy.t("emails.ops.noFlorist.outcome.accepted");
  return copy.t("emails.ops.noFlorist.outcome.open");
}

/** A1 from its facts: subject, HTML part in the founder frame, plain text. */
export function renderNoPartnerAlert(
  input: NoPartnerAlertFacts,
  copy: OpsCopy,
  siteOrigin: string,
): RenderedNotification {
  const { t } = copy;
  const alert = NoPartnerAlertFactsSchema.parse(input);
  const reference = orderReference(alert.orderId);
  const zone = alert.timeZone;
  const date = formatDate(
    new Date(`${alert.deliveryDate}T12:00:00Z`),
    "en",
    "deliveryDate",
    zone,
  );
  const exhaustedOn = localDate(alert.exhaustedAt, zone);
  const cancelsAt =
    alert.sameDayCutoffLocal === null
      ? null
      : graceEnd(alert.exhaustedAt, alert.deliveryDate, {
          ianaZone: zone,
          sameDayCutoffLocal: alert.sameDayCutoffLocal,
        });
  const cancelTime =
    cancelsAt === null ? null : formatDate(cancelsAt, "en", "time", zone);
  const band =
    cancelsAt === null || cancelTime === null
      ? null
      : localDate(cancelsAt, zone) === exhaustedOn
        ? t("emails.ops.noFlorist.band", {
            time: cancelTime,
            zone: zoneCity(zone),
          })
        : t("emails.ops.noFlorist.bandTomorrow", {
            time: cancelTime,
            date: formatDate(cancelsAt, "en", "deliveryDate", zone),
            zone: zoneCity(zone),
          });
  const rows = [
    {
      label: t("emails.ops.noFlorist.destination"),
      value: t("emails.ops.noFlorist.destinationValue", {
        city: alert.city,
        country: formatRegionName(alert.countryIso2, "en"),
      }),
    },
    {
      label: t("emails.ops.noFlorist.deliveryDate"),
      value:
        exhaustedOn === alert.deliveryDate
          ? t("emails.ops.noFlorist.today", { date })
          : date,
    },
    ...(cancelTime === null
      ? []
      : [
          {
            label: t("emails.ops.noFlorist.cancelsAt"),
            value: `${cancelTime} ${zone}`,
          },
        ]),
  ];
  const offers = [...alert.offers].sort((a, b) => a.attempt - b.attempt);
  const none = t("emails.ops.noFlorist.none");
  const noCandidate = t("emails.ops.noFlorist.noCandidate");
  const tableRows: (readonly [Child, Child, Child])[] =
    offers.length === 0
      ? [["", none, noCandidate]]
      : offers.map(
          (offer) =>
            [
              numeric(String(offer.attempt)),
              code(offer.partnerCode),
              outcomeOf(copy, offer, zone),
            ] as const,
        );
  const tableText =
    offers.length === 0
      ? `${none}: ${noCandidate}`
      : offers
          .map(
            (offer) =>
              `${String(offer.attempt)}. ${offer.partnerCode}: ${outcomeOf(copy, offer, zone)}`,
          )
          .join("\n");
  const link = new URL(copy.orderHref(alert.orderId), siteOrigin).toString();
  const title = t("emails.ops.noFlorist.heading", { reference });
  const [beforeRef = "", afterRef = ""] = t("emails.ops.noFlorist.heading", {
    reference: REFERENCE_SLOT,
  }).split(REFERENCE_SLOT);
  const open = t("emails.ops.noFlorist.open");
  const what = t("emails.ops.noFlorist.what");
  const offersMade = t("emails.ops.noFlorist.offersMade");
  const subject = t("emails.ops.noFlorist.subject", {
    reference,
    city: alert.city,
    date,
  });
  const blocks: Block[] = [
    heading(beforeRef, numeric(reference), afterRef),
    facts(rows),
    attemptsTable(
      offersMade,
      [
        t("emails.ops.noFlorist.column.number"),
        t("emails.ops.noFlorist.column.florist"),
        t("emails.ops.noFlorist.column.outcome"),
      ],
      tableRows,
    ),
    button(open, link),
    note(what),
  ];
  const html = emailDocument({
    locale: "en",
    subject,
    preheader: band ?? title,
    frame: opsFrame(copy),
    band: band === null ? null : text(band),
    blocks,
  });
  const textPart = [
    title,
    ...(band === null ? [] : [band]),
    rows.map((row) => `${row.label}: ${row.value}`).join("\n"),
    `${offersMade}:\n${tableText}`,
    `${open}:\n${link}`,
    what,
    opsFooterText(copy),
  ].join("\n\n");
  return { subject, html, text: `${textPart}\n` };
}

const AlertRow = z.object({
  order_id: z.uuid(),
  delivery_date: z.iso.date(),
  country_iso2: z.string(),
  city: z.string().nullable(),
  time_zone: z.string(),
  cutoff: z.string().nullable(),
  exhausted_at: z.union([z.date(), z.string()]).nullable(),
});

const OfferRow = z.object({
  attempt: z.coerce.number().int(),
  partner_code: z.string(),
  response: z.enum(["accept", "decline", "timeout"]).nullable(),
  reason: z.string().nullable(),
  sla_expires_at: z.union([z.date(), z.string()]),
  withdrawn: z.boolean(),
});

/**
 * The alert's facts at send time, through the delivery's transaction (`system` context): the
 * city's English name (else the city the order was sent to), the destination's zone and cutoff,
 * the exhaustion's time, and every offer with its shop code. No buyer or recipient column.
 */
export async function loadNoPartnerAlertFacts(
  executor: OrderExecutor,
  orderId: string,
  now: () => Date = () => new Date(),
): Promise<NoPartnerAlertFacts> {
  const [found] = await executor.execute(sql`
    SELECT o.id AS order_id, o.delivery_date::text AS delivery_date, c.iso2 AS country_iso2,
           coalesce((
             SELECT ct.name FROM city_translation ct
             WHERE ct.city_id = o.destination_city_id AND ct.locale_code = 'en' LIMIT 1
           ), o.recipient_snapshot ->> 'city') AS city,
           coalesce(ci.iana_zone, c.iana_zone) AS time_zone,
           to_char(c.same_day_cutoff_local, 'HH24:MI') AS cutoff,
           (SELECT e.occurred_at FROM order_event e
             WHERE e.order_id = o.id AND e.type = 'order.no_partner_available'
             ORDER BY e.seq DESC LIMIT 1) AS exhausted_at
    FROM "order" o
    JOIN country c ON c.id = o.destination_country_id
    LEFT JOIN city ci ON ci.id = o.destination_city_id
    WHERE o.id = ${orderId}`);
  if (found === undefined) {
    throw new Error("EMAIL_FACTS_MISSING: the order does not exist");
  }
  const row = AlertRow.parse(found);
  const offers = await executor.execute(sql`
    SELECT a.attempt, p.code AS partner_code, a.response, a.reason, a.sla_expires_at,
           (a.withdrawn_at IS NOT NULL) AS withdrawn
    FROM order_assignment a JOIN fulfillment_partner p ON p.id = a.partner_id
    WHERE a.order_id = ${orderId}
    ORDER BY a.attempt`);
  return NoPartnerAlertFactsSchema.parse({
    orderId: row.order_id,
    deliveryDate: row.delivery_date,
    countryIso2: row.country_iso2,
    city: row.city ?? row.country_iso2,
    timeZone: row.time_zone,
    sameDayCutoffLocal: row.cutoff,
    exhaustedAt: row.exhausted_at ?? now(),
    offers: offers.map((offer) => {
      const parsed = OfferRow.parse(offer);
      return {
        attempt: parsed.attempt,
        partnerCode: parsed.partner_code,
        response: parsed.response,
        reason: parsed.reason,
        slaExpiresAt: parsed.sla_expires_at,
        withdrawn: parsed.withdrawn,
      };
    }),
  });
}

/* -------------------------------------------------------------------------- */
/* W                                                                           */
/* -------------------------------------------------------------------------- */

export interface WhatsappCopyContext {
  readonly kind: "offer" | "offer-withdrawn";
  /** The florist's language (its earliest owner member's). */
  readonly language: string;
  /** The inbox address with no token (offer only). */
  readonly inboxUrl: string | null;
  /** The stop message of a timeout (no "if you have already started" line). */
  readonly timedOut: boolean;
}

/** W from its facts: subject, HTML part in the founder frame, plain text with the copy markers. */
export function renderWhatsappCopy(
  input: FloristMessageFacts,
  context: WhatsappCopyContext,
  copy: OpsCopy,
): RenderedNotification {
  const { t } = copy;
  const language = floristLanguageOf(context.language);
  const paste = whatsappFloristText(context.kind, input, {
    language,
    inboxUrl: context.inboxUrl,
    timedOut: context.timedOut,
  });
  const deadline = floristDeadline(input);
  const offer = context.kind === "offer";
  const subject = offer
    ? t("emails.ops.whatsapp.subjectOffer", {
        florist: input.partnerCode,
        time: deadline.time,
      })
    : t("emails.ops.whatsapp.subjectStop", { florist: input.partnerCode });
  const title = offer
    ? t("emails.ops.whatsapp.headingOffer")
    : t("emails.ops.whatsapp.headingStop");
  const languageName = t(`emails.ops.whatsapp.languageName.${language}`);
  const pasteBefore = `${deadline.time} ${deadline.timeZone}`;
  const rows = [
    {
      label: t("emails.ops.whatsapp.florist"),
      value: fragment(input.partnerName, " · ", code(input.partnerCode)),
      text: `${input.partnerName} (${input.partnerCode})`,
    },
    {
      label: t("emails.ops.whatsapp.language"),
      value: fragment(languageName),
      text: languageName,
    },
    ...(offer
      ? [
          {
            label: t("emails.ops.whatsapp.pasteBefore"),
            value: fragment(pasteBefore),
            text: pasteBefore,
          },
        ]
      : []),
  ];
  const guidance = t("emails.ops.whatsapp.note");
  const html = emailDocument({
    locale: "en",
    subject,
    preheader: t("emails.ops.whatsapp.preheader", { shop: input.partnerName }),
    frame: opsFrame(copy),
    blocks: [
      heading(title),
      facts(rows.map(({ label, value }) => ({ label, value }))),
      pasteBlock(paste),
      ...(offer ? [note(guidance)] : []),
    ],
  });
  const textPart = [
    title,
    rows.map((row) => `${row.label}: ${row.text}`).join("\n"),
    [
      t("emails.ops.whatsapp.copyFrom"),
      paste,
      t("emails.ops.whatsapp.copyTo"),
    ].join("\n"),
    ...(offer ? [guidance] : []),
    opsFooterText(copy),
  ].join("\n\n");
  return { subject, html, text: `${textPart}\n` };
}

/* -------------------------------------------------------------------------- */
/* F1                                                                          */
/* -------------------------------------------------------------------------- */

/** What F1 prints: ids, a shop code, two counts and an amount. Nothing about a person. */
export const PrepaidPayoutFactsSchema = z
  .object({
    payoutId: z.uuid(),
    orderId: z.uuid(),
    partnerCode: z.string().min(1),
    /** This payout's place among the florist's prepaid payouts, 1 for the first. */
    prepaidNumber: z.number().int().positive(),
    prepaidLimit: z.number().int().min(0),
    amountMinor: z.bigint(),
    currency: z.string().refine(isCurrencyCode, "an ISO 4217 code we support"),
  })
  .strict();
export type PrepaidPayoutFacts = z.infer<typeof PrepaidPayoutFactsSchema>;

/** F1 from its facts: subject, HTML part in the founder frame, plain text. */
export function renderPrepaidPayoutReady(
  input: PrepaidPayoutFacts,
  copy: OpsCopy,
  siteOrigin: string,
): RenderedNotification {
  const { t } = copy;
  const ready = PrepaidPayoutFactsSchema.parse(input);
  if (copy.payoutHref === undefined) {
    throw new Error("EMAIL_FACTS_MISSING: F1 has no payout link");
  }
  const link = new URL(copy.payoutHref(ready.payoutId), siteOrigin).toString();
  if (!isCurrencyCode(ready.currency)) {
    throw new Error("EMAIL_FACTS_MISSING: F1's currency is not supported");
  }
  const amount = formatMoney(
    { amountMinor: ready.amountMinor, currency: ready.currency },
    "en",
  );
  const counts = {
    number: String(ready.prepaidNumber),
    limit: String(ready.prepaidLimit),
  };
  const reference = orderReference(ready.orderId);
  const subject = t("emails.ops.payouts.prepaidReady.subject", {
    code: ready.partnerCode,
    amount,
  });
  const title = t("emails.ops.payouts.prepaidReady.heading");
  const open = t("emails.ops.payouts.prepaidReady.open");
  const what = t("emails.ops.payouts.prepaidReady.note");
  const prepaidValue = t("emails.ops.payouts.prepaidReady.prepaidOrderValue", {
    ...counts,
    reference,
  });
  const rows = [
    {
      label: t("emails.ops.payouts.prepaidReady.florist"),
      value: code(ready.partnerCode),
      text: ready.partnerCode,
    },
    {
      label: t("emails.ops.payouts.prepaidReady.prepaidOrder"),
      value: fragment(prepaidValue),
      text: prepaidValue,
    },
    {
      label: t("emails.ops.payouts.prepaidReady.amount"),
      value: numeric(amount),
      text: amount,
    },
  ];
  const html = emailDocument({
    locale: "en",
    subject,
    preheader: t("emails.ops.payouts.prepaidReady.preheader", counts),
    frame: opsFrame(copy),
    blocks: [
      heading(title),
      facts(rows.map(({ label, value }) => ({ label, value }))),
      button(open, link),
      note(what),
    ],
  });
  const textPart = [
    title,
    rows.map((row) => `${row.label}: ${row.text}`).join("\n"),
    `${open}:\n${link}`,
    what,
    opsFooterText(copy),
  ].join("\n\n");
  return { subject, html, text: `${textPart}\n` };
}

const PrepaidRow = z.object({
  payout_id: z.uuid(),
  order_id: z.uuid(),
  partner_code: z.string(),
  prepaid_number: z.coerce.number().int(),
  prepaid_limit: z.coerce.number().int(),
  total_minor: z.coerce.bigint(),
  currency_code: z.string(),
});

/**
 * F1's facts at send time, through the delivery's transaction: the prepaid payout that holds the
 * order's `order` line, its florist's code and limit, and its place among the florist's prepaid
 * payouts. No buyer, recipient or florist contact column.
 */
export async function loadPrepaidPayoutFacts(
  executor: OrderExecutor,
  orderId: string,
): Promise<PrepaidPayoutFacts> {
  const [found] = await executor.execute(sql`
    SELECT p.id AS payout_id, l.order_id, fp.code AS partner_code,
           fp.prepaid_order_limit AS prepaid_limit, p.total_minor::text AS total_minor,
           p.currency_code,
           (SELECT count(*) FROM payout q
             WHERE q.partner_id = p.partner_id AND q.kind = 'prepaid'
               AND (q.created_at, q.id) <= (p.created_at, p.id)) AS prepaid_number
    FROM payout_line l
    JOIN payout p ON p.id = l.payout_id
    JOIN fulfillment_partner fp ON fp.id = p.partner_id
    WHERE l.order_id = ${orderId} AND l.kind = 'order' AND p.kind = 'prepaid'`);
  if (found === undefined) {
    throw new Error("EMAIL_FACTS_MISSING: the order has no prepaid payout");
  }
  const row = PrepaidRow.parse(found);
  return PrepaidPayoutFactsSchema.parse({
    payoutId: row.payout_id,
    orderId: row.order_id,
    partnerCode: row.partner_code,
    prepaidNumber: row.prepaid_number,
    prepaidLimit: row.prepaid_limit,
    amountMinor: row.total_minor,
    currency: row.currency_code,
  });
}

/* -------------------------------------------------------------------------- */
/* Registration                                                                */
/* -------------------------------------------------------------------------- */

/** The registered renderer of F1. */
export async function renderPrepaidPayoutReadyNotification(
  input: NotificationRenderInput,
  copy: OpsCopy,
  siteOrigin: string,
): Promise<RenderedNotification> {
  if (input.orderId === null) {
    throw new Error("EMAIL_FACTS_MISSING: F1 has no order");
  }
  return renderPrepaidPayoutReady(
    await loadPrepaidPayoutFacts(input.executor, input.orderId),
    copy,
    siteOrigin,
  );
}

/** The registered renderer of A1. */
export async function renderNoPartnerAlertNotification(
  input: NotificationRenderInput,
  copy: OpsCopy,
  siteOrigin: string,
): Promise<RenderedNotification> {
  if (input.orderId === null) {
    throw new Error("EMAIL_FACTS_MISSING: A1 has no order");
  }
  return renderNoPartnerAlert(
    await loadNoPartnerAlertFacts(input.executor, input.orderId),
    copy,
    siteOrigin,
  );
}

/** The registered renderer of W. `input.link` (a sign-in link) is never read. */
export async function renderWhatsappCopyNotification(
  input: NotificationRenderInput,
  copy: OpsCopy,
): Promise<RenderedNotification> {
  if (input.assignmentId === null || input.whatsappCopyOf === null) {
    throw new Error("EMAIL_FACTS_MISSING: W has no assignment or no message");
  }
  const language = floristLanguageOf(input.locale);
  return renderWhatsappCopy(
    await loadFloristMessageFacts(input.executor, input.assignmentId, language),
    {
      kind: input.whatsappCopyOf,
      language,
      inboxUrl: input.inboxUrl,
      timedOut: input.trigger === "assignment.timed_out",
    },
    copy,
  );
}

/**
 * Registers A1 and W with the pipeline, once. `siteOrigin` is the pipeline's own default, the
 * deployment's `NEXT_PUBLIC_SITE_URL`: the origin A1's admin link is written against.
 */
export function registerOpsEmailTemplates(
  copy: OpsCopy,
  siteOrigin: () => string = () =>
    process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000",
): void {
  if (notificationTemplate("alert-no-partner") === undefined) {
    registerNotificationTemplate("alert-no-partner", (input) =>
      renderNoPartnerAlertNotification(input, copy, siteOrigin()),
    );
  }
  if (notificationTemplate("whatsapp-copy") === undefined) {
    registerNotificationTemplate("whatsapp-copy", (input) =>
      renderWhatsappCopyNotification(input, copy),
    );
  }
  if (notificationTemplate("payout-prepaid-ready") === undefined) {
    registerNotificationTemplate("payout-prepaid-ready", (input) =>
      renderPrepaidPayoutReadyNotification(input, copy, siteOrigin()),
    );
  }
}
