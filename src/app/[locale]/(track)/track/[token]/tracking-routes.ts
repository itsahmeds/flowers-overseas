/**
 * @purpose Tracking routes' work, .ics
 * @spec 018
 *
 * The work behind the tracking routes' handlers (spec 018 §5.3, AC-6, AC-7, AC-11, AC-12;
 * TASK-338), outside the route files so the tests can call it with a scratch database, a fake
 * storage and a fixed clock.
 *
 * Every token failure (a bad MAC, another purpose, an unknown or rotated public token, an expired
 * order) is one answer: `tracking.resolve`'s `TRACKING_FAILURE`, which the page turns into its
 * not-working page and the photo and calendar routes into a bare 404. Nothing here logs the token
 * or the order.
 */
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { COMPANY } from "@/config/company";
import type { LocaleCode } from "@/config/locales";
import type { Storage } from "@/lib/storage";
import {
  getTrackingView,
  tracking,
  type TrackingOptions,
  trackingPhotoLocation,
} from "@/modules/orders";
// Outside the barrel: it reads spec 013's `succeededRefunds` (TASK-339).
import { buyerRefundLines } from "@/modules/orders/buyer-refund-lines";

/** The robots header every tracking response carries (AC-12). */
export const TRACK_ROBOTS = "noindex, nofollow";

/** The photo's cache policy (AC-6). */
export const PHOTO_CACHE = "private, max-age=300";

/** The calendar file's and every 404's cache policy (AC-12). */
export const TRACK_NO_STORE = "private, no-store";

/**
 * A stored delivery photo as read back from the private bucket: at least one byte and at most the
 * 15 MB a florist's upload may be (spec 011's pipeline), so a wrong object is refused, not served.
 */
const PhotoBytesSchema = z
  .instanceof(ArrayBuffer)
  .refine(
    (buffer) => buffer.byteLength > 0 && buffer.byteLength <= 15 * 1024 * 1024,
  );

/** How long the server's own read URL into the private bucket lives. */
const READ_URL_TTL_SECONDS = 60;

/** The order a token opens, or `null` for every kind of failure. */
export async function orderForToken(
  token: string,
  options?: TrackingOptions,
): Promise<string | null> {
  // A token is base64url and a dot: a percent sign in the address is never part of one, so a
  // malformed escape is a failure like any other rather than a thrown `URIError`.
  if (!/^[A-Za-z0-9_.-]{1,512}$/u.test(token)) return null;
  const resolved = await tracking.resolve(token, options);
  return resolved.ok ? resolved.orderId : null;
}

/** A bare 404 with the tracking headers: the same for every cause. */
export function trackNotFound(): Response {
  return new Response(null, {
    status: 404,
    headers: {
      "Cache-Control": TRACK_NO_STORE,
      "X-Robots-Tag": TRACK_ROBOTS,
      "Referrer-Policy": "no-referrer",
    },
  });
}

export interface PhotoDependencies extends TrackingOptions {
  /** The private bucket's storage; absent until the R2 adapter exists (TASK-082). */
  readonly storage: Storage | undefined;
  /** How a signed read URL is fetched; `fetch` in production, the fake's own in tests. */
  readonly fetchObject?: (url: string) => Promise<Response>;
}

/**
 * `GET /{locale}/track/{token}/photo` (AC-6): the newest `delivery_proof` asset's bytes with its
 * MIME type and `private, max-age=300`, whatever `public_use_consent` is (the buyer's own photo).
 * 404 for any token failure, for no photo, and while no storage is configured.
 */
export async function photoResponse(
  token: string,
  dependencies: PhotoDependencies,
): Promise<Response> {
  const orderId = await orderForToken(token, dependencies);
  if (orderId === null) return trackNotFound();
  const location = await trackingPhotoLocation(orderId, dependencies);
  if (location === null || dependencies.storage === undefined) {
    return trackNotFound();
  }
  const url = await dependencies.storage.getSignedUrl(
    { bucket: location.bucket, objectKey: location.objectKey },
    READ_URL_TTL_SECONDS,
  );
  const fetchObject = dependencies.fetchObject ?? ((target) => fetch(target));
  const object = await fetchObject(url);
  if (!object.ok) return trackNotFound();
  const bytes = PhotoBytesSchema.parse(await object.arrayBuffer());
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": location.mime,
      "Cache-Control": PHOTO_CACHE,
      "X-Robots-Tag": TRACK_ROBOTS,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export interface CalendarDependencies extends TrackingOptions {
  readonly host: string;
}

/** `GET /{locale}/track/{token}/calendar.ics` (AC-11): the event, or a bare 404. */
export async function calendarResponse(
  token: string,
  locale: LocaleCode,
  dependencies: CalendarDependencies,
): Promise<Response> {
  const orderId = await orderForToken(token, dependencies);
  if (orderId === null) return trackNotFound();
  const view = await getTrackingView(orderId, {
    ...dependencies,
    refundLines: buyerRefundLines,
  });
  const t = await getTranslations({ locale, namespace: "tracking" });
  const summary =
    view.destinationCity === null
      ? t("calendar.summaryNoCity")
      : t("calendar.summary", { city: view.destinationCity });
  const now = (dependencies.now ?? (() => new Date()))();
  const body = calendarIcs({
    deliveryDate: view.deliveryDate,
    summary,
    reference: view.reference,
    host: dependencies.host,
    productName: COMPANY.tradingName,
    now,
  });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${view.reference}.ics"`,
      "Cache-Control": TRACK_NO_STORE,
      "X-Robots-Tag": TRACK_ROBOTS,
      "Referrer-Policy": "no-referrer",
    },
  });
}

/* ---- The calendar file ---- */

/**
 * The tracking page's calendar file (spec 018 §5.3 `track/[token]/calendar.ics`, AC-11; TASK-338):
 * one RFC 5545 all-day `VEVENT` on the order's delivery date.
 *
 * Its summary is the localised "Flowers delivered in {city}" and nothing else: no recipient name,
 * no address, no card message (AC-4). The `UID` is the order reference, which identifies the
 * event across re-downloads and carries nothing personal. Lines end in CRLF and are folded at 75
 * octets (RFC 5545 §3.1); text is escaped (§3.3.11).
 */

export interface CalendarInput {
  /** `YYYY-MM-DD`, the order's delivery date. */
  readonly deliveryDate: string;
  /** The localised summary, already resolved. */
  readonly summary: string;
  /** The order reference (`orderReference`). */
  readonly reference: string;
  /** The site's host name, for the `UID`. */
  readonly host: string;
  /** The trading name, for `PRODID`. */
  readonly productName: string;
  /** `DTSTAMP`: when the file was made. */
  readonly now: Date;
}

const CRLF = "\r\n";
const MAX_OCTETS = 75;

/** RFC 5545 §3.3.11 TEXT escaping. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/;/gu, "\\;")
    .replace(/,/gu, "\\,")
    .replace(/\r?\n/gu, "\\n");
}

/** RFC 5545 §3.1 folding: at most 75 octets a line, never inside a UTF-8 sequence. */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, "utf8");
    const limit = parts.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1;
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

function basicDate(isoDate: string): string {
  return z.iso.date().parse(isoDate).replace(/-/gu, "");
}

function nextDay(isoDate: string): string {
  const [year = 0, month = 1, day = 1] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

function stamp(now: Date): string {
  return `${now.toISOString().slice(0, 19).replace(/[-:]/gu, "")}Z`;
}

/** The whole `.ics` body. */
export function calendarIcs(input: CalendarInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${escapeText(input.productName)}//Tracking//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.reference}@${input.host}`,
    `DTSTAMP:${stamp(input.now)}`,
    `DTSTART;VALUE=DATE:${basicDate(input.deliveryDate)}`,
    `DTEND;VALUE=DATE:${basicDate(nextDay(input.deliveryDate))}`,
    `SUMMARY:${escapeText(input.summary)}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}
