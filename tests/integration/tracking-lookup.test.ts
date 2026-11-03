/**
 * The tracking lookup against a disposable PG16 (spec 018 §5.2 `lookupTracking`, "Rate limits";
 * AC-8; T-08 integration half; TASK-339).
 *
 *  - A matching reference and email sends T16 once, to the order's own address, with a link that
 *    `tracking.resolve` opens to that order; the reference is found through spec 010's
 *    `order_reference(uuid)` (typed in lower case and with spaces, read in capitals).
 *  - A wrong email, an unknown reference, a fourth lookup in an hour (spec 012's
 *    `auth_email_send` counter under the `track` scope, the real `claimSend`) and a non-live order
 *    in production send nothing; the outcome is the log line's only value.
 *  - The lookup counter and the sign-in counter never count against each other.
 *  - An order whose link no longer opens (delivery date + 90 days) is not mailed a dead link.
 *  - Schema introspection: `order_reference(uuid)` and `order_reference_idx` exist (their
 *    behaviour is spec 010's T-45).
 *  - T16 as sent: the order's address only, no relay language, no marker of the recipient.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { relayMatches } from "@/config/honesty";
import type { AuthRunner } from "@/lib/auth/adapter";
import { claimSend } from "@/lib/auth/send-limit";
import { renderTrackingLinkEmail } from "@/modules/notifications/emails";
import {
  lookupTracking,
  orderReference,
  tracking,
  TRACKING_LOOKUP_LIMIT,
  TRACKING_LOOKUP_SCOPE,
  type TrackingLinkMail,
  type TrackingLookupDeps,
} from "@/modules/orders";

import { insertPlacedOrder } from "../fixtures/order-state.ts";
import { drizzleOver } from "./support/drizzle-tx.ts";
import { country, customer, unique } from "./support/rows.ts";
import {
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();

const SECRET = "s".repeat(64);
const ORIGIN = "https://flowersoverseas.com";
const NOW = new Date("2026-11-04T10:00:00Z");

describe.skipIf(server.url === undefined)(
  `spec 018 tracking lookup${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "tracklookup");
    }, 300_000);
    afterAll(async () => {
      await scratch.drop();
    });

    /** A placed order of `mode` whose buyer typed `email`, delivered on `deliveryDate`. */
    async function orderFor(
      tx: Tx,
      email: string,
      mode: "demo" | "test" | "live" = "live",
      deliveryDate = "2026-11-10",
    ): Promise<string> {
      const countryId = await country(tx);
      const customerId = await customer(tx);
      const [recipient] = await tx<{ id: string }[]>`
        INSERT INTO recipient (customer_id, full_name, phone_e164)
        VALUES (${customerId}, 'Zxqmarkername', '+48555019283') RETURNING id`;
      const id = await insertPlacedOrder(tx, {
        countryId,
        customerId,
        recipientId: recipient?.id ?? "",
        mode,
      });
      await tx`
        UPDATE "order" SET buyer_snapshot = ${JSON.stringify({ name: "Zxqmarkerbuyer", email })}::text::jsonb,
                           delivery_date = ${deliveryDate}::date
        WHERE id = ${id}`;
      return id;
    }

    function deps(
      tx: Tx,
      sent: TrackingLinkMail[],
      overrides: Partial<TrackingLookupDeps> = {},
    ): TrackingLookupDeps {
      return {
        executor: runnerOf(tx),
        secret: SECRET,
        origin: ORIGIN,
        now: () => NOW,
        claim: (email) =>
          claimSend(email, {
            run: (fn) => fn(drizzleOver(tx, scratch.sql)),
            now: () => NOW,
            limit: TRACKING_LOOKUP_LIMIT,
            scope: TRACKING_LOOKUP_SCOPE,
          }),
        send: (mail) => {
          sent.push(mail);
          return Promise.resolve();
        },
        sendsNonLive: false,
        ...overrides,
      };
    }

    it("AC-8: only the matching pair within its limit sends T16, to the order's address, with a link that opens", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const email = `${unique("buyer")}@example.test`;
        const id = await orderFor(tx, email);
        const reference = orderReference(id);
        const typed = ` ${reference.toLowerCase()} `;
        const sent: TrackingLinkMail[] = [];
        const d = deps(tx, sent);
        const outcomes = {
          match: await lookupTracking(
            { reference: typed, email: email.toUpperCase() },
            "pl",
            d,
          ),
          wrongEmail: await lookupTracking(
            { reference, email: `other.${email}` },
            "pl",
            d,
          ),
          unknown: await lookupTracking(
            { reference: "FO-0000-0000", email },
            "pl",
            d,
          ),
        };
        const mails = [...sent];
        const opened =
          mails[0] === undefined
            ? null
            : await tracking.resolve(mails[0].link.split("/track/")[1] ?? "", {
                executor: runnerOf(tx),
                secret: SECRET,
                now: () => NOW,
              });
        // The address has had two lookups (the match and the unknown reference): a third
        // passes, the fourth is over the limit and sends nothing.
        const third = await lookupTracking({ reference, email }, "pl", d);
        const fourth = await lookupTracking({ reference, email }, "pl", d);
        const [counter] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM auth_email_send`;
        return {
          id,
          email,
          reference,
          outcomes,
          mails,
          opened,
          third,
          fourth,
          sentAfter: sent.length,
          rows: counter?.n ?? 0,
        };
      });
      expect(result.outcomes).toEqual({
        match: "sent",
        wrongEmail: "silent",
        unknown: "silent",
      });
      expect(result.mails).toEqual([
        {
          to: result.email,
          locale: "pl",
          reference: result.reference,
          link: expect.stringMatching(
            /^https:\/\/flowersoverseas\.com\/pl\/track\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u,
          ) as unknown as string,
        },
      ]);
      expect(result.opened).toEqual({ ok: true, orderId: result.id });
      expect(result.third).toBe("sent");
      expect(result.fourth).toBe("limited");
      expect(result.sentAfter).toBe(2);
      expect(result.rows).toBe(TRACKING_LOOKUP_LIMIT + 1);
    });

    it("keeps the lookup's counter and the sign-in counter apart", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const email = `${unique("both")}@example.test`;
        const run: AuthRunner = (fn) => fn(drizzleOver(tx, scratch.sql));
        const lookups = [];
        for (let i = 0; i < 4; i += 1) {
          lookups.push(
            await claimSend(email, {
              run,
              now: () => NOW,
              limit: TRACKING_LOOKUP_LIMIT,
              scope: TRACKING_LOOKUP_SCOPE,
            }),
          );
        }
        const signIn = await claimSend(email, { run, now: () => NOW });
        return { lookups, signIn };
      });
      expect(result.lookups).toEqual([true, true, true, false]);
      expect(result.signIn).toBe(true);
    });

    it("mails no demo or test order in production, and no link that no longer opens", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const sent: TrackingLinkMail[] = [];
        const demoEmail = `${unique("demo")}@example.test`;
        const demo = await orderFor(tx, demoEmail, "demo");
        const oldEmail = `${unique("old")}@example.test`;
        // Delivered 2026-07-01: the link stopped opening on the 91st day after it.
        const old = await orderFor(tx, oldEmail, "live", "2026-07-01");
        return {
          demoProduction: await lookupTracking(
            { reference: orderReference(demo), email: demoEmail },
            "en-gb",
            deps(tx, sent),
          ),
          demoTest: await lookupTracking(
            { reference: orderReference(demo), email: demoEmail },
            "en-gb",
            deps(tx, sent, { sendsNonLive: true }),
          ),
          expired: await lookupTracking(
            { reference: orderReference(old), email: oldEmail },
            "en-gb",
            deps(tx, sent),
          ),
          sent: sent.map((mail) => mail.to),
          demoEmail,
        };
      });
      expect(result.demoProduction).toBe("silent");
      expect(result.demoTest).toBe("sent");
      expect(result.expired).toBe("silent");
      expect(result.sent).toEqual([result.demoEmail]);
    });

    it("finds the reference through order_reference and its unique index (schema introspection)", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const [fn] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM pg_proc p
          JOIN pg_namespace ns ON ns.oid = p.pronamespace
          WHERE ns.nspname = 'public' AND p.proname = 'order_reference'
            AND pg_get_function_identity_arguments(p.oid) = 'order_id uuid'`;
        const [index] = await tx<{ def: string }[]>`
          SELECT indexdef AS def FROM pg_indexes
          WHERE schemaname = 'public' AND indexname = 'order_reference_idx'`;
        const email = `${unique("one")}@example.test`;
        const id = await orderFor(tx, email);
        const [found] = await tx<{ id: string }[]>`
          SELECT id FROM "order" WHERE public.order_reference(id) = ${orderReference(id)}`;
        return {
          fn: fn?.n ?? 0,
          index: index?.def ?? "",
          found: found?.id,
          id,
        };
      });
      expect(result.fn).toBe(1);
      expect(result.index).toMatch(
        /UNIQUE INDEX order_reference_idx .*order_reference\(id\)/u,
      );
      expect(result.found).toBe(result.id);
    });

    it("T16 as sent carries the link and the reference, and nothing of the recipient or a florist", async () => {
      const link = `${ORIGIN}/pl/track/${randomUUID()}`;
      for (const locale of ["en-gb", "de", "pl"] as const) {
        const mail = renderTrackingLinkEmail({
          locale,
          reference: "FO-7K2M-9QXA",
          link,
        });
        for (const part of [mail.subject, mail.text, mail.html]) {
          expect(part).not.toContain("Zxqmarker");
        }
        expect(relayMatches(mail.text, locale), locale).toEqual([]);
        expect(mail.text).toContain(link);
        expect(mail.subject).toContain("FO-7K2M-9QXA");
      }
    });
  },
);
