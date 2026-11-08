/**
 * The alert module's boundary schemas (spec 025 §5.2; AC-3, AC-30, AC-38; TASK-488).
 *
 * `AlertContextSchema` is `.strict()` over a **closed key set**: ids, counts, rates, provider and
 * closed-set codes, ISO instants, the destination country code, the city id and the probe key.
 * There is no key a name, an address, a phone, an email, a card message or any free text could
 * travel in, and every string value has a shape (a UUID, an identifier, an ISO instant), so a
 * sentence cannot slip through a permitted key either (§8 "Storage", AC-38).
 */
import { z } from "zod";

import { zonedClock } from "@/modules/i18n";

import {
  alertComponents,
  alertResolutions,
} from "../../../db/schema/alerts.ts";

const id = z.uuid();
const count = z.number().int().min(0).max(1_000_000_000);
/** A closed-set word or code from the source: lowercase identifier characters, no spaces. */
const code = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_.:-]{0,63}$/u, "must be a closed-set code");
const instant = z.iso.datetime({ offset: true });

/** Every key an alert's context may carry (§5.1 `context`, §5.5 email content). */
export const AlertContextSchema = z
  .object({
    payment_id: id,
    purchase_id: id,
    refund_id: id,
    dispute_id: id,
    inbox_id: id,
    invoice_id: id,
    partner_id: id,
    assignment_id: id,
    payout_id: id,
    delivery_id: id,
    city_id: id,
    provider: z.enum(["stripe", "mollie", "resend"]),
    code,
    reason: code,
    job: code,
    probe: z.enum(["health", "home", "sitemap", "corridor", "product"]),
    http_status: z.number().int().min(100).max(599),
    attempts: count,
    count,
    failed: count,
    received: count,
    sends: count,
    bounces: count,
    complaints: count,
    minutes: count,
    remaining: count,
    sent: count,
    reached: z.boolean(),
    livemode: z.boolean(),
    rate_bp: count,
    percent: z.number().min(0).max(100),
    country: z.string().regex(/^[A-Z]{2}$/u),
    delivery_date: z.iso.date(),
    fx_as_of: z.iso.date(),
    stale_at: instant,
    last_success_at: instant,
    expected_at: instant,
  })
  .partial()
  .strict();
export type AlertContext = z.infer<typeof AlertContextSchema>;

/** The context keys, for the adapter that maps a legacy call's fields (`alertRaiser`). */
export const ALERT_CONTEXT_KEYS = Object.keys(
  AlertContextSchema.shape,
) as (keyof AlertContext)[];

export const AlertComponentSchema = z.enum(alertComponents);

/** `raiseAlert`'s input (§5.2). */
export const AlertInputSchema = z
  .object({
    orderId: z.uuid().optional(),
    component: AlertComponentSchema.optional(),
    /** A sub-key of the subject: a probe key, a provider, a partner id (§5.4 "Fingerprint"). */
    subKey: code.optional(),
    mode: z.enum(["test", "live"]).optional(),
    actBy: z.date().optional(),
    /** A monitor's own threshold raised the level (`order.not_accepted` at the deadline). */
    severity: z.enum(["P1", "P2", "P3"]).optional(),
    context: AlertContextSchema.optional(),
  })
  .strict();
export type AlertInput = z.input<typeof AlertInputSchema>;

/** Who acknowledged or resolved: an admin actor label (`admin:<uuid>`) or `pushover`. */
export const AlertActorSchema = z
  .string()
  .regex(/^(pushover|system:[a-z0-9._-]+|(admin|ops):[0-9a-f-]{36})$/u);

/** `resolveAlertAction`'s input (§5.2). */
export const ResolveAlertSchema = z
  .object({
    alertId: z.uuid(),
    resolution: z.enum(alertResolutions),
  })
  .strict();

const clock = z
  .string()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/u, "must be HH:MM");

/** True for an IANA zone ICU knows (the i18n module's zone reader is the one `Intl` door). */
export function isTimeZone(zone: string): boolean {
  try {
    zonedClock(new Date(0), zone);
    return true;
  } catch {
    return false;
  }
}

/** The quiet-hours setting (§5.1 item 3; AC-30: a valid zone, start and end not equal). */
export const AlertSettingSchema = z
  .object({
    quietStart: clock,
    quietEnd: clock,
    timeZone: z.string().min(1).max(64).refine(isTimeZone, {
      message: "must be an IANA time zone",
    }),
  })
  .strict()
  .refine((value) => value.quietStart !== value.quietEnd, {
    message: "start and end must differ",
    path: ["quietEnd"],
  });
export type AlertSetting = z.infer<typeof AlertSettingSchema>;

/** The seeded default (§13 Q2). */
export const DEFAULT_ALERT_SETTING: AlertSetting = {
  quietStart: "23:00",
  quietEnd: "07:00",
  timeZone: "Asia/Karachi",
};
