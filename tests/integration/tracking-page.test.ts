/**
 * The tracking page against a disposable PG16 (spec 018 §5.2, §5.3; AC-3, AC-4, AC-5, AC-6, AC-7,
 * AC-11, AC-41; T-03, T-04 render half, T-05, T-06, T-07 resolve half, T-11 route half, T-41;
 * TASK-338).
 *
 *  - **AC-3 / T-03:** every one of A6.4's 26 statuses, reached with `walkOrderTo`: the view's
 *    projection and the page's headline are `buyerStep` of the fixture's `buyer_projection`
 *    (`accepted` and `paid` read `confirmed`); five steps, or the cancelled line; times in
 *    Europe/Warsaw across the October DST night; `closed → disputed` shows `closed` as future.
 *  - **AC-4 / T-04:** unique markers in the recipient's name, phone, street, postcode, card message
 *    and the buyer's email never reach the page in any state, nor the `.ics`.
 *  - **AC-5 / T-05:** no florist name, city or "our florist" before an `in_production` event, an
 *    accepted assignment notwithstanding; then the named and unnamed lines.
 *  - **AC-6 / T-06:** the photo route's bytes, MIME and `private, max-age=300`, with
 *    `public_use_consent = false`; 404 for a bad token and for no photo; the deleted state.
 *  - **AC-7 / T-07 (resolve half):** invalid, forged, rotated, expired by delivery date and by
 *    cancellation all resolve to nothing, so the page answers its one not-working 404 (the body is
 *    `NotWorkingView`, one per locale, `tests/unit/tracking-page.test.tsx`).
 *  - **AC-41 / T-41:** two orders equal but for an assignment history (two declines, a timeout,
 *    `no_partner_available`, `manual_reroute`): the same view and the same HTML at every status
 *    both reach.
 *  - **AC-2 (CLI half):** `pnpm orders:rotate-tracking` revokes the old link and writes the audit
 *    row `rotateTrackingToken` writes.
 *  - **AC-10 / T-10 (tracking half; TASK-339):** a status from each projection with refunds in
 *    each of `requested`, `pending`, `succeeded` (two), `failed` and `cancelled`: exactly the two
 *    succeeded lines, oldest first by `succeeded_at` (inserted newest first, dated days away from
 *    every event), formatted in the refund's currency; `refunded_full` reads `closed`, a partial
 *    refund on `in_production` reads `being_made`.
 *  - **AC-42 / T-42 (TASK-339):** cancelled through spec 013's `cancelOrder` by `system` from
 *    `no_partner_available`, by `admin` from `routed` and by `system` from `manual_reroute`: one
 *    page, "We could not deliver this order.", no cause; the full refund `requested`, `pending`,
 *    then `succeeded`: the pending sentence, then the dated line in its place; the buyer's own
 *    cancel, and an admin's with `buyer_cancel`, read "You cancelled this order."; `payment_failed`
 *    and `abandoned` show no refund text.
 */
import { randomUUID } from "node:crypto";

import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createTranslator } from "next-intl";

import { relayMatches } from "@/config/honesty";
import { InMemoryStorage } from "@/lib/storage";
import { sign } from "@/lib/signed-link";
import { loadMessages } from "@/modules/i18n";
import { MESSAGE_NAMESPACES } from "@/modules/i18n/messages";
import { cancelOrder } from "@/modules/payments";
import {
  type Actor,
  buyerStep,
  getTrackingView,
  rotateTrackingToken,
  tracking,
  type TrackingView,
} from "@/modules/orders";

import { rotateTrackingIn } from "../../scripts/orders-rotate-tracking.ts";
import { STATES } from "../fixtures/order-machine.ts";
import {
  applyTransition,
  insertPlacedOrder,
  walkOrderTo,
} from "../fixtures/order-state.ts";
import { base, mediaAsset, unique } from "./support/rows.ts";
import {
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

vi.mock("next-intl/server", () => ({
  getTranslations: ({
    locale,
    namespace,
  }: {
    locale: string;
    namespace?: string;
  }) =>
    Promise.resolve(
      createTranslator({
        locale,
        messages: loadMessages(locale, MESSAGE_NAMESPACES),
        ...(namespace === undefined ? {} : { namespace }),
      } as Parameters<typeof createTranslator>[0]),
    ),
}));

const { TrackingPageView } =
  await import("../../src/app/[locale]/(track)/track/[token]/TrackingPageView.tsx");
const { calendarResponse, orderForToken, photoResponse } =
  await import("../../src/app/[locale]/(track)/track/[token]/tracking-routes.ts");

const server = await probeLocalServer();

const SECRET = "s".repeat(64);
/** The en-gb headline of each buyer step (spec 018 §7), the one value each status must print. */
const HEADLINE: Readonly<Record<string, string>> = {
  placed: "We are confirming your payment",
  confirmed: "We have your order",
  being_made: "Being made",
  on_its_way: "On its way",
  delivered: "Delivered",
  closed: "Closed",
  cancelled: "Cancelled",
};
const MARKERS = {
  name: "Zxqmarkername",
  phone: "+48555019283",
  street: "Zxqmarkerstreet 17",
  postcode: "99-123",
  card: "Zxqmarkercard happy day",
  email: "zxqmarkeremail@example.test",
  partner: "Zxqmarkerpartner",
};

const opts = (tx: Tx, now?: Date) => ({
  executor: runnerOf(tx),
  secret: SECRET,
  ...(now === undefined ? {} : { now: () => now }),
});

/** A country in Warsaw's zone, a buyer and a recipient carrying the markers. */
async function poland(tx: Tx): Promise<string> {
  await base(tx);
  const [country] = await tx<{ id: string }[]>`
    INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone)
    VALUES ('PL', 'PLN', 800, 'Europe/Warsaw')
    ON CONFLICT (iso2) DO UPDATE SET iana_zone = EXCLUDED.iana_zone
    RETURNING id`;
  return country?.id ?? "";
}

async function parents(
  tx: Tx,
): Promise<{ countryId: string; customerId: string; recipientId: string }> {
  const countryId = await poland(tx);
  const [customer] = await tx<{ id: string }[]>`
    INSERT INTO customer (email_normalised)
    VALUES (${`${unique("m")}${MARKERS.email}`}) RETURNING id`;
  const [recipient] = await tx<{ id: string }[]>`
    INSERT INTO recipient (customer_id, full_name, phone_e164)
    VALUES (${customer?.id ?? ""}, ${MARKERS.name}, ${MARKERS.phone}) RETURNING id`;
  return {
    countryId,
    customerId: customer?.id ?? "",
    recipientId: recipient?.id ?? "",
  };
}

/** A placed order whose recipient snapshot carries every marker, delivered on 2026-10-25. */
async function order(
  tx: Tx,
  mode: "demo" | "test" | "live" = "live",
): Promise<string> {
  const id = await insertPlacedOrder(tx, { ...(await parents(tx)), mode });
  await tx`
    UPDATE "order" SET delivery_date = DATE '2026-10-25',
      recipient_snapshot = ${tx.json({
        fullName: MARKERS.name,
        phoneE164: MARKERS.phone,
        addressLines: [MARKERS.street],
        postcode: MARKERS.postcode,
        city: "Warszawa",
        placeKind: "home",
        cardMessage: MARKERS.card,
      })}
    WHERE id = ${id}`;
  return id;
}

async function partner(tx: Tx, firstName: string | null): Promise<string> {
  const countryId = await poland(tx);
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO fulfillment_partner (code, legal_name, city_label, country_id, status,
                                     contact_email, payout_currency_code, capacity_per_day,
                                     display_first_name)
    VALUES (${unique("florist-")}, ${MARKERS.partner}, 'Warszawa', ${countryId}, 'active',
            'florist@example.test', 'PLN', 15, ${firstName})
    RETURNING id`;
  return row?.id ?? "";
}

async function assignment(
  tx: Tx,
  orderId: string,
  partnerId: string,
  attempt: number,
  response: "accept" | "decline" | "timeout",
): Promise<void> {
  await tx`
    INSERT INTO order_assignment (order_id, partner_id, offered_at, sla_expires_at,
                                  responded_at, response, attempt)
    VALUES (${orderId}, ${partnerId}, now() - interval '1 hour', now() + interval '1 hour',
            now(), ${response}, ${attempt})`;
}

async function tokenOf(tx: Tx, orderId: string): Promise<string> {
  const link = await tracking.linkFor(orderId, "en-gb", {
    ...opts(tx),
    origin: "https://flowersoverseas.com",
  });
  return link.split("/track/")[1] ?? "";
}

async function render(
  model: TrackingView,
  locale: "en-gb" | "de" | "pl" = "en-gb",
): Promise<string> {
  return renderToStaticMarkup(
    await TrackingPageView({
      locale,
      view: model,
      photoHref: `/${locale}/track/T/photo`,
      calendarHref: `/${locale}/track/T/calendar.ics`,
    }),
  );
}

/** A captured card payment of the order's purchase, at 189.00 PLN. */
async function capturedPayment(tx: Tx, orderId: string): Promise<string> {
  const [payment] = await tx<{ id: string }[]>`
    INSERT INTO payment (purchase_id, provider, provider_ref, status, method, amount_minor,
                         currency_code, livemode, capture_method, amount_captured_minor,
                         captured_at)
    VALUES ((SELECT purchase_id FROM "order" WHERE id = ${orderId}), 'stripe',
            ${`pi_${randomUUID().slice(0, 12)}`}, 'captured', 'card', 18900, 'PLN', true,
            'automatic', 18900, now())
    RETURNING id`;
  return payment?.id ?? "";
}

/** One refund row of the order in `status`; `succeededAt` for a succeeded one. */
async function refundRow(
  tx: Tx,
  orderId: string,
  paymentId: string,
  status: "requested" | "pending" | "succeeded" | "failed" | "cancelled",
  amountMinor: number,
  succeededAt?: string,
): Promise<string> {
  const [refund] = await tx<{ id: string }[]>`
    INSERT INTO refund (payment_id, order_id, purchase_id, provider_ref, amount_minor,
                        currency_code, reason, status, requested_by, succeeded_at)
    VALUES (${paymentId}, ${orderId}, (SELECT purchase_id FROM "order" WHERE id = ${orderId}),
            ${status === "requested" ? null : `re_${randomUUID().slice(0, 12)}`},
            ${amountMinor}, 'PLN', 'quality', ${status}, 'system:payments',
            ${status === "succeeded" ? (succeededAt ?? null) : null}::timestamptz)
    RETURNING id`;
  return refund?.id ?? "";
}

function markersIn(text: string): string[] {
  return Object.values(MARKERS).filter((marker) => text.includes(marker));
}

const visible = (markup: string): string =>
  markup
    .replace(/<[^>]+>/gu, " ")
    .replace(/&#x27;/gu, "'")
    .replace(/\s+/gu, " ");

describe.skipIf(server.url === undefined)(
  `spec 018 tracking page${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "trackpage");
    }, 300_000);
    afterAll(async () => {
      await scratch.drop();
    });

    it("AC-3, AC-4, AC-5: every status reads its folded projection, five steps or the cancelled line, no marker, no florist before production", async () => {
      const results = await rolledBack(scratch.sql, async (tx) => {
        const named = await partner(tx, "Anna");
        const out: {
          status: string;
          view: TrackingView;
          html: string;
          ics: string;
          produced: boolean;
        }[] = [];
        for (const state of STATES) {
          const id = await order(tx);
          // An accepted assignment from the start: only a production event may reveal it.
          await assignment(tx, id, named, 1, "accept");
          await walkOrderTo(tx, id, state.key);
          const view = await getTrackingView(id, opts(tx));
          const [produced] = await tx<{ p: boolean }[]>`
            SELECT EXISTS (SELECT 1 FROM order_event WHERE order_id = ${id}
                           AND to_status = 'in_production') AS p`;
          const ics = await (
            await calendarResponse(await tokenOf(tx, id), "en-gb", {
              ...opts(tx, new Date("2026-10-20T10:00:00Z")),
              host: "flowersoverseas.com",
            })
          ).text();
          out.push({
            status: state.key,
            view,
            html: await render(view),
            ics,
            produced: produced?.p ?? false,
          });
        }
        return out;
      });
      expect(results).toHaveLength(26);
      for (const { status, view, html, ics, produced } of results) {
        const expected = buyerStep(
          STATES.find((row) => row.key === status)?.buyerProjection ?? "",
        );
        expect(view.projection, status).toBe(expected);
        expect(html, status).toMatch(
          new RegExp(
            `data-fo-track-headline="${expected}"[^>]*>${HEADLINE[expected]}</h1>`,
            "u",
          ),
        );
        if (expected === "cancelled") {
          expect(view.timeline.cancelledAt, status).not.toBeNull();
          expect(html, status).toContain(
            'data-fo-track-timeline-step="cancelled"',
          );
        } else {
          expect(
            view.timeline.steps.map((step) => step.step),
            status,
          ).toEqual([
            "confirmed",
            "being_made",
            "on_its_way",
            "delivered",
            "closed",
          ]);
          for (const step of view.timeline.steps) {
            if (step.state === "future") {
              expect(step.at, `${status} ${step.step}`).toBeNull();
            }
          }
          expect(
            view.timeline.steps.find((step) => step.step === expected)?.state ??
              "current",
            status,
          ).toBe("current");
        }
        expect(markersIn(html), status).toEqual([]);
        expect(markersIn(ics), status).toEqual([]);
        expect(html.toLowerCase(), status).not.toContain("accepted");
        expect(relayMatches(visible(html), "en-gb"), status).toEqual([]);
        if (produced) {
          expect(visible(html), status).toContain(
            "Made by our florist Anna in Warszawa",
          );
        } else {
          expect(view.floristFirstName, status).toBeNull();
          expect(view.floristCity, status).toBeNull();
          expect(html, status).not.toContain("our florist");
          expect(html, status).not.toContain("Anna");
        }
      }
      // AC-3's named pair: accepted and paid read "We have your order".
      for (const key of ["accepted", "paid"]) {
        const row = results.find((result) => result.status === key);
        expect(row?.view.projection).toBe("confirmed");
        expect(visible(row?.html ?? "")).toContain("We have your order");
      }
      // AC-11 (route half): the calendar file of a working link.
      const ics = results[0]?.ics ?? "";
      expect(ics).toContain("DTSTART;VALUE=DATE:20261025");
      expect(ics).toContain("SUMMARY:Flowers delivered in Warszawa");
    }, 240_000);

    it("AC-5: the unnamed florist line, and AC-3: steps dated in Warsaw across the DST night; closed then disputed", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const unnamed = await partner(tx, null);
        const id = await order(tx);
        await assignment(tx, id, unnamed, 1, "accept");
        const steps: [string, string, string][] = [
          ["order.captured", "paid_unrouted", "2026-10-23T08:00:00Z"],
          ["order.routed", "routed", "2026-10-23T08:01:00Z"],
          ["assignment.accepted", "accepted", "2026-10-23T09:00:00Z"],
          ["order.captured", "paid", "2026-10-23T09:00:01Z"],
          // 02:30 CEST, half an hour before the clocks go back.
          ["order.in_production", "in_production", "2026-10-25T00:30:00Z"],
          // 02:30 CET, an hour later.
          [
            "order.out_for_delivery",
            "out_for_delivery",
            "2026-10-25T01:30:00Z",
          ],
          ["order.delivered", "delivered", "2026-10-25T09:00:00Z"],
          ["order.photo_uploaded", "photo_uploaded", "2026-10-25T09:05:00Z"],
          ["order.closed", "closed", "2026-10-28T09:05:00Z"],
          ["order.disputed", "disputed", "2026-10-29T09:05:00Z"],
        ];
        for (const [event, to, when] of steps) {
          await applyTransition(tx, id, event, to, new Date(when));
        }
        const view = await getTrackingView(id, opts(tx));
        return { view, html: await render(view), pl: await render(view, "pl") };
      });
      expect(visible(result.html)).toContain("Made by our florist in Warszawa");
      expect(result.view.projection).toBe("delivered");
      expect(
        result.view.timeline.steps.map((step) => [step.step, step.state]),
      ).toEqual([
        ["confirmed", "done"],
        ["being_made", "done"],
        ["on_its_way", "done"],
        ["delivered", "current"],
        ["closed", "future"],
      ]);
      expect(result.html).toContain("Sun 25 Oct, 02:30 CEST");
      expect(result.html).toContain("Sun 25 Oct, 02:30 CET<");
      expect(result.pl).toContain("02:30 CEST");
      expect(result.pl).toContain("02:30 CET<");
      // The photo was uploaded and its row is gone (no `delivery_proof`): the dated deletion,
      // 730 days (`retention_policy.delivery_photo`) after the upload.
      expect(result.view.photoState).toEqual({
        kind: "deleted",
        deletedOn: new Date(
          new Date("2026-10-25T09:05:00Z").getTime() + 730 * 86_400_000,
        ),
      });
      expect(visible(result.html)).toContain(
        "The delivery photo was deleted on 24 October under our privacy policy.",
      );
    });

    it("AC-6: the photo route serves the bytes privately for five minutes, consent or not; 404 otherwise", async () => {
      const storage = new InMemoryStorage();
      const result = await rolledBack(scratch.sql, async (tx) => {
        const id = await order(tx);
        await walkOrderTo(tx, id, "photo_uploaded");
        const token = await tokenOf(tx, id);
        const dependencies = {
          ...opts(tx),
          storage,
          fetchObject: (url: string) => storage.fetch(url),
        };
        const none = await photoResponse(token, dependencies);
        const assetId = await mediaAsset(tx);
        const [asset] = await tx<{ bucket: string; object_key: string }[]>`
          SELECT bucket, object_key FROM media_asset WHERE id = ${assetId}`;
        const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
        await storage.put({
          bucket: asset?.bucket ?? "",
          objectKey: asset?.object_key ?? "",
          body: bytes,
          mime: "image/jpeg",
        });
        await tx`
          INSERT INTO delivery_proof (order_id, media_asset_id, uploaded_by, public_use_consent)
          VALUES (${id}, ${assetId}, 'partner', false)`;
        const ok = await photoResponse(token, dependencies);
        const bad = await photoResponse(
          `${token.slice(0, -2)}AA`,
          dependencies,
        );
        const noStorage = await photoResponse(token, {
          ...opts(tx),
          storage: undefined,
        });
        const view = await getTrackingView(id, opts(tx));
        return {
          none: none.status,
          ok: {
            status: ok.status,
            type: ok.headers.get("content-type"),
            cache: ok.headers.get("cache-control"),
            robots: ok.headers.get("x-robots-tag"),
            referrer: ok.headers.get("referrer-policy"),
            bytes: [...new Uint8Array(await ok.arrayBuffer())],
          },
          bad: { status: bad.status, body: await bad.text() },
          noStorage: noStorage.status,
          view,
          html: await render(view),
        };
      });
      expect(result.none).toBe(404);
      expect(result.ok).toEqual({
        status: 200,
        type: "image/jpeg",
        cache: "private, max-age=300",
        robots: "noindex, nofollow",
        referrer: "no-referrer",
        bytes: [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3],
      });
      expect(result.bad).toEqual({ status: 404, body: "" });
      expect(result.noStorage).toBe(404);
      expect(result.view.photoState.kind).toBe("available");
      expect(result.html).toContain('src="/en-gb/track/T/photo"');
      expect(result.html).toMatch(
        /alt="Photo of your delivered flowers, taken on [^"]+"/u,
      );
    });

    it("AC-7: invalid, forged, rotated and expired links (by delivery date and by cancellation) all open nothing", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const live = await order(tx);
        await walkOrderTo(tx, live, "paid_unrouted");
        const good = await tokenOf(tx, live);
        const [row] = await tx<{ public_token: string }[]>`
          SELECT public_token FROM "order" WHERE id = ${live}`;
        const forged = sign(
          "track",
          { publicToken: row?.public_token ?? "", version: 1 },
          undefined,
          { secret: "f".repeat(64) },
        );
        const rotatedFrom = await order(tx);
        const before = await tokenOf(tx, rotatedFrom);
        await rotateTrackingToken(rotatedFrom, "system:test" as Actor, {
          executor: runnerOf(tx),
          channel: "system",
        });
        const after = await tokenOf(tx, rotatedFrom);
        // Delivered 2026-10-25 (Warsaw): the link works until local midnight ending day 90.
        const lastDay = new Date("2027-01-23T22:59:00Z");
        const pastDelivery = new Date("2027-01-23T23:00:00Z");
        const cancelled = await order(tx);
        await tx`UPDATE "order" SET delivery_date = DATE '2027-12-31' WHERE id = ${cancelled}`;
        await applyTransition(
          tx,
          cancelled,
          "order.captured",
          "paid_unrouted",
          new Date("2026-11-01T10:00:00Z"),
        );
        await applyTransition(
          tx,
          cancelled,
          "order.cancelled",
          "cancelled",
          new Date("2026-11-01T11:00:00Z"),
        );
        const cancelledToken = await tokenOf(tx, cancelled);
        const at = (now?: Date) => opts(tx, now);
        return {
          good: await orderForToken(good, at()),
          garbage: await orderForToken("not-a-token", at()),
          percent: await orderForToken("%E0%A4%A", at()),
          forged: await orderForToken(forged, at()),
          rotatedOld: await orderForToken(before, at()),
          rotatedNew: await orderForToken(after, at()),
          lastDay: await orderForToken(good, at(lastDay)),
          pastDelivery: await orderForToken(good, at(pastDelivery)),
          cancelledInside: await orderForToken(
            cancelledToken,
            at(new Date("2027-01-30T10:00:00Z")),
          ),
          cancelledPast: await orderForToken(
            cancelledToken,
            at(new Date("2027-01-30T23:00:00Z")),
          ),
          ids: { live, rotatedFrom, cancelled },
        };
      });
      expect(result.good).toBe(result.ids.live);
      expect(result.rotatedNew).toBe(result.ids.rotatedFrom);
      expect(result.lastDay).toBe(result.ids.live);
      expect(result.cancelledInside).toBe(result.ids.cancelled);
      for (const failed of [
        result.garbage,
        result.percent,
        result.forged,
        result.rotatedOld,
        result.pastDelivery,
        result.cancelledPast,
      ]) {
        expect(failed).toBeNull();
      }
    });

    it("AC-41: an assignment history changes neither the view nor the page", async () => {
      const pairs = await rolledBack(scratch.sql, async (tx) => {
        const florist = await partner(tx, "Anna");
        const other = await partner(tx, "Zxqother");
        const plain = await order(tx);
        const noisy = await order(tx);
        const t = (minutes: number): Date =>
          new Date(Date.UTC(2026, 9, 23, 8, minutes));
        const both = async (event: string, to: string, when: Date) => {
          await applyTransition(tx, plain, event, to, when);
          await applyTransition(tx, noisy, event, to, when);
        };
        const snapshot = async () => {
          const [a, b] = [
            await getTrackingView(plain, opts(tx)),
            await getTrackingView(noisy, opts(tx)),
          ];
          return {
            a: { ...a, reference: "" },
            b: { ...b, reference: "" },
            htmlA: (await render(a)).replaceAll(a.reference, "REF"),
            htmlB: (await render(b)).replaceAll(b.reference, "REF"),
          };
        };
        const out = [];
        await both("order.captured", "paid_unrouted", t(0));
        await both("order.routed", "routed", t(1));
        out.push(await snapshot());
        // The noisy order's history: two declines, a timeout, no florist, a manual re-route.
        await assignment(tx, noisy, other, 1, "decline");
        await applyTransition(tx, noisy, "assignment.declined", "routed", t(5));
        await assignment(tx, noisy, other, 2, "decline");
        await applyTransition(
          tx,
          noisy,
          "assignment.declined",
          "routed",
          t(10),
        );
        await assignment(tx, noisy, other, 3, "timeout");
        await applyTransition(
          tx,
          noisy,
          "assignment.timed_out",
          "routed",
          t(15),
        );
        await applyTransition(
          tx,
          noisy,
          "order.no_partner_available",
          "no_partner_available",
          t(16),
        );
        out.push(await snapshot());
        await applyTransition(
          tx,
          noisy,
          "order.manual_reroute",
          "manual_reroute",
          t(20),
        );
        out.push(await snapshot());
        await applyTransition(tx, noisy, "order.routed", "routed", t(21));
        out.push(await snapshot());
        await assignment(tx, plain, florist, 1, "accept");
        await assignment(tx, noisy, florist, 4, "accept");
        for (const [event, to, minutes] of [
          ["assignment.accepted", "accepted", 30],
          ["order.captured", "paid", 31],
          ["order.in_production", "in_production", 40],
          ["order.out_for_delivery", "out_for_delivery", 50],
          ["order.delivered", "delivered", 55],
        ] as const) {
          await both(event, to, t(minutes));
          out.push(await snapshot());
        }
        return out;
      });
      expect(pairs).toHaveLength(9);
      for (const [index, pair] of pairs.entries()) {
        expect(pair.b, String(index)).toStrictEqual(pair.a);
        expect(pair.htmlB, String(index)).toBe(pair.htmlA);
        expect(markersIn(pair.htmlB), String(index)).toEqual([]);
        expect(pair.htmlB).not.toContain("Zxqother");
      }
      expect(visible(pairs.at(-1)?.htmlB ?? "")).toContain(
        "Made by our florist Anna in Warszawa",
      );
    });

    it("AC-2 (CLI): pnpm orders:rotate-tracking revokes the old link and audits like rotateTrackingToken", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const viaCli = await order(tx);
        const viaModule = await order(tx);
        const before = await tokenOf(tx, viaCli);
        const versions = await rotateTrackingIn(tx, viaCli);
        await rotateTrackingToken(
          viaModule,
          "system:orders.rotate_tracking" as Actor,
          { executor: runnerOf(tx), channel: "cli" },
        );
        const audits = await tx<
          {
            entity_id: string;
            actor_label: string;
            action: string;
            channel: string;
            before: unknown;
            after: unknown;
            request_id: string;
          }[]
        >`
          SELECT entity_id, actor_label, action, channel, before, after, request_id
          FROM audit_log WHERE entity_id IN (${viaCli}, ${viaModule}) ORDER BY entity_id = ${viaCli} DESC`;
        return {
          versions,
          missing: await rotateTrackingIn(tx, randomUUID()),
          old: await orderForToken(before, opts(tx)),
          fresh: await orderForToken(await tokenOf(tx, viaCli), opts(tx)),
          viaCli,
          audits,
        };
      });
      expect(result.versions).toEqual({ before: 1, after: 2 });
      expect(result.missing).toBeNull();
      expect(result.old).toBeNull();
      expect(result.fresh).toBe(result.viaCli);
      expect(result.audits).toHaveLength(2);
      const [cli, module] = result.audits;
      expect({ ...cli, entity_id: "" }).toEqual({ ...module, entity_id: "" });
      expect(cli?.channel).toBe("cli");
    });
    it("AC-10: one dated line per succeeded refund, oldest first, in every projection; refunded_full reads closed", async () => {
      const targets = [
        "paid_unrouted",
        "in_production",
        "out_for_delivery",
        "delivered",
        "closed",
        "cancelled",
      ];
      const results = await rolledBack(scratch.sql, async (tx) => {
        const out: { status: string; view: TrackingView; html: string }[] = [];
        for (const status of targets) {
          const id = await order(tx);
          await walkOrderTo(tx, id, status);
          const paymentId = await capturedPayment(tx, id);
          // Inserted newest first, dated days away from every event (all of them `now()`).
          await refundRow(
            tx,
            id,
            paymentId,
            "succeeded",
            400,
            "2026-10-09T08:00:00Z",
          );
          await refundRow(
            tx,
            id,
            paymentId,
            "succeeded",
            300,
            "2026-10-07T08:00:00Z",
          );
          await refundRow(tx, id, paymentId, "requested", 100);
          await refundRow(tx, id, paymentId, "pending", 200);
          await refundRow(tx, id, paymentId, "failed", 250);
          await refundRow(tx, id, paymentId, "cancelled", 350);
          const view = await getTrackingView(id, opts(tx));
          out.push({ status, view, html: await render(view) });
        }
        // refunded_full and a partial refund while being made.
        const full = await order(tx);
        await walkOrderTo(tx, full, "refunded_full");
        const partial = await order(tx);
        await walkOrderTo(tx, partial, "in_production");
        await refundRow(
          tx,
          partial,
          await capturedPayment(tx, partial),
          "succeeded",
          1,
          "2026-10-08T22:30:00Z",
        );
        return {
          out,
          full: await getTrackingView(full, opts(tx)),
          partial: await getTrackingView(partial, opts(tx)),
        };
      });
      for (const { status, view, html } of results.out) {
        // The open refunds (100 requested + 200 pending) are a sentence on a cancelled order only.
        expect(view.refundPending, status).toEqual(
          status === "cancelled"
            ? { amountMinor: 300, currencyCode: "PLN" }
            : null,
        );
        expect(html.includes("We are refunding"), status).toBe(
          status === "cancelled",
        );
        expect(view.refundLines, status).toEqual([
          {
            amountMinor: 300,
            currencyCode: "PLN",
            succeededAt: new Date("2026-10-07T08:00:00Z"),
          },
          {
            amountMinor: 400,
            currencyCode: "PLN",
            succeededAt: new Date("2026-10-09T08:00:00Z"),
          },
        ]);
        expect(
          [...html.matchAll(/data-fo-track-refund=""[^>]*>([^<]*)</gu)].map(
            (match) => (match[1] ?? "").replace(/\s+/gu, " "),
          ),
          status,
        ).toEqual([
          "Refunded PLN 3.00 on 7 October",
          "Refunded PLN 4.00 on 9 October",
        ]);
      }
      expect(results.full.projection).toBe("closed");
      expect(results.partial.projection).toBe("being_made");
      // 22:30 UTC on the 8th is the 9th in Warsaw.
      expect(results.partial.refundLines).toEqual([
        {
          amountMinor: 1,
          currencyCode: "PLN",
          succeededAt: new Date("2026-10-08T22:30:00Z"),
        },
      ]);
    }, 120_000);

    it("AC-42: the cancelled page by actor class, the pending sentence, then the dated line", async () => {
      const admin = `admin:${randomUUID()}`;
      const result = await rolledBack(scratch.sql, async (tx) => {
        const cancelledFrom = async (
          from: string,
          actor: string,
          reason: "no_partner" | "other" | "buyer_cancel",
        ): Promise<string> => {
          const id = await order(tx);
          await walkOrderTo(tx, id, from);
          const done = await cancelOrder(id, actor, reason, {
            executor: runnerOf(tx),
          });
          if (done.kind !== "cancelled") {
            throw new Error(
              `cancel refused from ${from}: ${JSON.stringify(done)}`,
            );
          }
          return id;
        };
        const ours = [
          await cancelledFrom(
            "no_partner_available",
            "system:routing.no_partner_expiry",
            "no_partner",
          ),
          await cancelledFrom("routed", admin, "other"),
          await cancelledFrom(
            "manual_reroute",
            "system:routing.no_partner_expiry",
            "no_partner",
          ),
        ];
        const oursViews = [];
        for (const id of ours)
          oursViews.push(await getTrackingView(id, opts(tx)));

        // The full refund of the first, through its three states.
        const [first = ""] = ours;
        const paymentId = await capturedPayment(tx, first);
        const refundId = await refundRow(
          tx,
          first,
          paymentId,
          "requested",
          18_900,
        );
        const requested = await getTrackingView(first, opts(tx));
        await tx`UPDATE refund SET status = 'pending', provider_ref = ${`re_${randomUUID().slice(0, 12)}`}
                 WHERE id = ${refundId}`;
        const pending = await getTrackingView(first, opts(tx));
        await tx`UPDATE refund SET status = 'succeeded', succeeded_at = '2026-10-07T08:00:00Z'
                 WHERE id = ${refundId}`;
        const succeeded = await getTrackingView(first, opts(tx));

        const byBuyer = await getTrackingView(
          await cancelledFrom("paid_unrouted", "buyer", "buyer_cancel"),
          opts(tx),
        );
        const byAdminForBuyer = await getTrackingView(
          await cancelledFrom("paid", admin, "buyer_cancel"),
          opts(tx),
        );
        const failed = await order(tx);
        await walkOrderTo(tx, failed, "payment_failed");
        const abandoned = await order(tx);
        await walkOrderTo(tx, abandoned, "abandoned");
        return {
          oursViews,
          requested,
          pending,
          succeeded,
          byBuyer,
          byAdminForBuyer,
          unpaid: [
            await getTrackingView(failed, opts(tx)),
            await getTrackingView(abandoned, opts(tx)),
          ],
        };
      });
      // One page for every cause: the same view once the reference and the instants are set aside.
      const bare = (view: TrackingView): TrackingView => ({
        ...view,
        reference: "FO-0000-0000",
        timeline: {
          ...view.timeline,
          steps: view.timeline.steps.map((step) => ({ ...step, at: null })),
          cancelledAt: null,
        },
      });
      const pages = await Promise.all(
        result.oursViews.map(async (view) => render(bare(view))),
      );
      expect(new Set(pages).size).toBe(1);
      for (const view of result.oursViews) {
        expect(view.projection).toBe("cancelled");
        expect(view.cancelledBy).toBe("us");
      }
      const page = visible(pages[0] ?? "");
      expect(page).toContain("We could not deliver this order.");
      for (const cause of [
        "florist",
        "partner",
        "available",
        "reroute",
        "reason",
      ]) {
        expect(page.toLowerCase()).not.toContain(cause);
      }

      expect(result.requested.refundPending).toEqual({
        amountMinor: 18_900,
        currencyCode: "PLN",
      });
      expect(result.pending.refundPending).toEqual({
        amountMinor: 18_900,
        currencyCode: "PLN",
      });
      const pendingText = visible(await render(result.pending));
      expect(pendingText).toContain(
        "We could not deliver this order. We are refunding PLN 189.00 to your original payment method.",
      );
      expect(result.succeeded.refundPending).toBeNull();
      const doneText = visible(await render(result.succeeded));
      expect(doneText).not.toContain("We are refunding");
      expect(doneText).toContain("Refunded PLN 189.00 on 7 October");

      expect(result.byBuyer.cancelledBy).toBe("buyer");
      expect(visible(await render(result.byBuyer))).toContain(
        "You cancelled this order.",
      );
      expect(result.byAdminForBuyer.cancelledBy).toBe("buyer");

      for (const view of result.unpaid) {
        expect(view.projection).toBe("cancelled");
        expect(view.cancelledBy).toBeNull();
        expect(view.refundPending).toBeNull();
        expect(view.refundLines).toEqual([]);
        const text = visible(await render(view)).toLowerCase();
        expect(text).not.toContain("refund");
        expect(text).not.toContain("could not deliver");
        expect(text).not.toContain("you cancelled");
      }
    }, 120_000);
  },
);
