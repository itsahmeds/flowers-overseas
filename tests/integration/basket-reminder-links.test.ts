/**
 * Spec 034's link back and stopping against a migrated PG16 (T-15 expiry, T-16, T-17, T-19, T-20
 * effects, T-21; AC-15 to AC-17, AC-19 to AC-21; TASK-451): the restore route in the same browser,
 * in a new browser and twice; every ended link's identical 303 with nothing written; the one-click
 * `POST` and the page's channel; the Resend lookup that suppresses on a hard bounce or complaint.
 * Each case is rolled back; the request handlers run in the case's transaction.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type ReminderTransaction,
  oneClickMethodNotAllowed,
  oneClickUnsubscribeResponse,
  restoreResponse,
  sendBasketReminder,
  unsubscribeBasketReminders,
} from "@/modules/checkout";
import { processResendWebhook } from "@/modules/notifications";

import {
  DAY,
  EMAIL,
  HOUR,
  NOW,
  hmac,
  liveDraft,
  quiet,
  reminderRow,
  scheduled,
  sendDeps,
  spyMailer,
} from "./support/basket-reminder.ts";
import { base } from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();

let db: ScratchDatabase | undefined;

beforeAll(async () => {
  if (server.url !== undefined) {
    db = await scratchDatabase(server.url, "basket_reminder_links");
  }
}, 180_000);

afterAll(async () => {
  await db?.drop();
});

async function run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return rolledBack(db!.sql, async (tx) => {
    await base(tx);
    return fn(tx);
  });
}

const inTx =
  (tx: Tx): ReminderTransaction =>
  (_name, fn) =>
    fn(runnerOf(tx));

/** A sent reminder of a fresh draft; its restore and unsubscribe tokens; the draft's cookie token. */
async function sent(tx: Tx, cookieToken?: string) {
  const draftId = await liveDraft(tx, { lines: 2 });
  if (cookieToken !== undefined) {
    const { draftTokenHash } =
      await import("../../src/modules/checkout/cookie.ts");
    await tx`UPDATE checkout_draft SET token_sha256 = ${draftTokenHash(cookieToken)} WHERE id = ${draftId}`;
  }
  const id = await scheduled(tx, draftId);
  await asApp(tx, { role: "system" });
  const mailer = spyMailer();
  await sendBasketReminder(id, NOW, sendDeps(tx, mailer));
  const text = mailer.calls[0]?.text ?? "";
  return {
    draftId,
    id,
    restore: /\/basket\/restore\/([A-Za-z0-9_-]{43})/u.exec(text)?.[1] ?? "",
    unsubscribe:
      /\/basket\/unsubscribe\/([A-Za-z0-9_-]{43})/u.exec(text)?.[1] ?? "",
  };
}

const COOKIE = "c".repeat(43);
const get = (cookie?: string) =>
  new Request("https://flowersoverseas.com/pl/basket/restore/x", {
    headers: cookie === undefined ? {} : { cookie: `fo_checkout=${cookie}` },
  });

function expectLinkHeaders(response: Response): void {
  expect(response.status).toBe(303);
  expect(response.headers.get("cache-control")).toBe("no-store, private");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}

async function counts(tx: Tx) {
  const [row] = await tx<
    { drafts: number; lines: number; reminders: string }[]
  >`
    SELECT (SELECT count(*)::int FROM checkout_draft) AS drafts,
           (SELECT count(*)::int FROM checkout_draft_line) AS lines,
           (SELECT string_agg(to_jsonb(r)::text, ',' ORDER BY id) FROM basket_reminder r) AS reminders`;
  return row;
}

describe.skipIf(server.url === undefined)(
  "spec 034 link back and stopping (PG16)",
  () => {
    it("T-16 (AC-16a): the same browser opens its basket with the restored notice; nothing else changes", async () => {
      await run(async (tx) => {
        const link = await sent(tx, COOKIE);
        const before = await counts(tx);
        const response = await restoreResponse(get(COOKIE), {
          locale: "pl",
          token: link.restore,
          now: new Date(NOW.getTime() + HOUR),
          transaction: inTx(tx),
        });
        expectLinkHeaders(response);
        expect(response.headers.get("location")).toBe("/pl/basket");
        expect(response.headers.get("set-cookie")).toBeNull();
        const after = await counts(tx);
        expect([after?.drafts, after?.lines]).toEqual([
          before?.drafts,
          before?.lines,
        ]);
        const [draft] = await tx<{ notice: string; buyer: unknown }[]>`
        SELECT pending_notice AS notice, buyer FROM checkout_draft WHERE id = ${link.draftId}`;
        expect(draft?.notice).toBe("restored");
        expect(draft?.buyer).not.toBeNull();
        expect(await reminderRow(tx, link.id)).toMatchObject({
          restore_count: 1,
        });
      });
    });

    it("T-16 (AC-16b, c): a new browser gets one new basket with the bouquets only; a second click makes none", async () => {
      await run(async (tx) => {
        const link = await sent(tx);
        const response = await restoreResponse(get(), {
          locale: "pl",
          token: link.restore,
          now: new Date(NOW.getTime() + HOUR),
          transaction: inTx(tx),
        });
        expectLinkHeaders(response);
        expect(response.headers.get("location")).toBe("/pl/basket");
        expect(response.headers.get("location")).not.toContain(link.restore);
        const cookies = response.headers.getSetCookie();
        expect(cookies.map((cookie) => cookie.split("=")[0])).toEqual([
          "fo_checkout",
          "fo_basket",
        ]);
        expect(cookies[0]).toMatch(/HttpOnly; Secure; SameSite=Lax/u);
        const token = /^fo_checkout=([^;]+)/u.exec(cookies[0] ?? "")?.[1] ?? "";

        const [restored] = await tx<Record<string, unknown>[]>`
        SELECT * FROM checkout_draft WHERE restored_from_reminder_id = ${link.id}`;
        expect(restored).toMatchObject({
          buyer: null,
          buyer_saved: false,
          reminder_consent_at: null,
          pending_notice: "restored_details",
          locale_code: "pl",
          currency_code: "PLN",
          mode: "live",
        });
        const pick = (rows: Record<string, unknown>[]) =>
          rows.map((row) => [
            row["destination_country_id"],
            row["product_id"],
            row["tier_key"],
            String(row["delivery_date"]),
            row["addon_keys"],
            String(row["last_seen_total_minor"]),
            row["last_seen_currency_code"],
          ]);
        const source = await tx<Record<string, unknown>[]>`
        SELECT * FROM checkout_draft_line WHERE draft_id = ${link.draftId} ORDER BY position`;
        const copy = await tx<Record<string, unknown>[]>`
        SELECT * FROM checkout_draft_line WHERE draft_id = ${String(restored?.["id"])} ORDER BY position`;
        expect(pick(copy)).toEqual(pick(source));
        for (const line of copy) {
          expect([
            line["recipient"],
            line["card"],
            line["quote"],
            line["order_id"],
          ]).toEqual([null, null, null, null]);
        }

        const before = await counts(tx);
        const again = await restoreResponse(get(token), {
          locale: "pl",
          token: link.restore,
          now: new Date(NOW.getTime() + 2 * HOUR),
          transaction: inTx(tx),
        });
        expect(again.headers.get("location")).toBe("/pl/basket");
        expect(again.headers.get("set-cookie")).toBeNull();
        const after = await counts(tx);
        expect([after?.drafts, after?.lines]).toEqual([
          before?.drafts,
          before?.lines,
        ]);
      });
    });

    it("T-15, T-17 (AC-15, AC-17): unknown, malformed, expired, placed and deleted links answer the identical 303 and write nothing", async () => {
      await run(async (tx) => {
        const live = await sent(tx);
        const placed = await sent(tx);
        const deleted = await sent(tx);
        await tx`INSERT INTO purchase (id, mode, buyer_currency_code, total_minor, locale_code)
               VALUES (${randomUUID()}, 'live', 'PLN', 100, 'en')`;
        const [purchase] = await tx<
          { id: string }[]
        >`SELECT id FROM purchase LIMIT 1`;
        await tx`UPDATE checkout_draft SET purchase_id = ${purchase?.id ?? ""} WHERE id = ${placed.draftId}`;
        await tx`DELETE FROM checkout_draft WHERE id = ${deleted.draftId}`;
        const before = await counts(tx);
        const cases: [string, Date][] = [
          ["A".repeat(43), NOW],
          ["short", NOW],
          [live.restore, new Date(NOW.getTime() + 7 * DAY + 1_000)],
          [placed.restore, NOW],
          [deleted.restore, NOW],
        ];
        const answers: string[] = [];
        for (const [token, now] of cases) {
          const response = await restoreResponse(get(), {
            locale: "pl",
            token,
            now,
            transaction: inTx(tx),
          });
          expectLinkHeaders(response);
          answers.push(
            JSON.stringify([response.status, [...response.headers.entries()]]),
          );
        }
        expect(new Set(answers).size).toBe(1);
        expect(JSON.parse(answers[0] ?? "[]")[1]).toContainEqual([
          "location",
          "/pl/basket/link-ended",
        ]);
        expect(await counts(tx)).toEqual(before);
        // At exactly 7 days it still restores (the expiry is after, not at).
        const atEdge = await restoreResponse(get(), {
          locale: "pl",
          token: live.restore,
          now: new Date(NOW.getTime() + 7 * DAY),
          transaction: inTx(tx),
        });
        expect(atEdge.headers.get("location")).toBe("/pl/basket");
      });
    });

    it("T-19 (AC-19): the one-click POST suppresses, records and clears, and a later send for the same address skips", async () => {
      await run(async (tx) => {
        const link = await sent(tx);
        // Consent given before the unsubscribe (the suppression's `updated_at` is the database's own clock).
        const other = await liveDraft(tx, {
          consentAt: new Date("2026-01-01T00:00:00.000Z"),
        });
        const pending = await scheduled(tx, other);
        const post = (
          body: string,
          type = "application/x-www-form-urlencoded",
        ) =>
          new Request(
            "https://flowersoverseas.com/api/basket-reminders/unsubscribe/x",
            {
              method: "POST",
              headers: { "content-type": type },
              body,
            },
          );
        expect(
          (
            await oneClickUnsubscribeResponse(post("List-Unsubscribe=Yes"), {
              token: link.unsubscribe,
              transaction: inTx(tx),
            })
          ).status,
        ).toBe(400);
        expect(
          (
            await tx<
              { n: number }[]
            >`SELECT count(*)::int AS n FROM email_suppression`
          )[0]?.n,
        ).toBe(0);

        const ok = await oneClickUnsubscribeResponse(
          post("List-Unsubscribe=One-Click"),
          {
            token: link.unsubscribe,
            now: NOW,
            transaction: inTx(tx),
          },
        );
        const unknown = await oneClickUnsubscribeResponse(
          post("List-Unsubscribe=One-Click"),
          {
            token: "B".repeat(43),
            transaction: inTx(tx),
          },
        );
        expect([ok.status, await ok.text()]).toEqual([200, "OK"]);
        expect([unknown.status, await unknown.text()]).toEqual([200, "OK"]);
        expect(oneClickMethodNotAllowed().status).toBe(405);

        expect(
          await tx`SELECT email_hmac, reason FROM email_suppression`,
        ).toEqual([{ email_hmac: hmac(EMAIL), reason: "unsubscribed" }]);
        const consent = await tx<{ choices: Record<string, unknown> }[]>`
        SELECT choices FROM consent_log WHERE subject_kind = 'contact' AND subject_hmac = ${hmac(EMAIL)}`;
        expect(consent.map((row) => row.choices)).toEqual([
          { basket_reminder: false, locale: "en", channel: "header" },
        ]);
        const [draft] = await tx<{ at: Date | null }[]>`
        SELECT reminder_consent_at AS at FROM checkout_draft WHERE id = ${link.draftId}`;
        expect(draft?.at).toBeNull();

        const mailer = spyMailer();
        expect(
          await sendBasketReminder(
            pending,
            new Date(NOW.getTime() + 1_000),
            sendDeps(tx, mailer),
          ),
        ).toEqual({ status: "skipped", reason: "suppressed" });
        expect(mailer.calls).toHaveLength(0);
      });
    });

    it("T-20 (AC-20): the page's action has the same effects with channel 'page'; an unknown token writes nothing", async () => {
      await run(async (tx) => {
        const link = await sent(tx);
        const executor = runnerOf(tx);
        expect(
          await unsubscribeBasketReminders({
            token: "Z".repeat(43),
            channel: "page",
            now: NOW,
            executor,
          }),
        ).toBe(false);
        expect(
          (
            await tx<
              { n: number }[]
            >`SELECT count(*)::int AS n FROM email_suppression`
          )[0]?.n,
        ).toBe(0);
        expect(
          await unsubscribeBasketReminders({
            token: link.unsubscribe,
            channel: "page",
            now: NOW,
            executor,
          }),
        ).toBe(true);
        const [row] = await tx<{ choices: Record<string, unknown> }[]>`
        SELECT choices FROM consent_log WHERE subject_kind = 'contact'`;
        expect(row?.choices["channel"]).toBe("page");
      });
    });

    it("T-21 (AC-21): a hard bounce or a complaint suppresses; a later fresh grant lifts only an unsubscribe; precedence holds; opened changes nothing", async () => {
      await run(async (tx) => {
        const link = await sent(tx);
        const [row] = await tx<{ provider_message_id: string }[]>`
        SELECT provider_message_id FROM basket_reminder WHERE id = ${link.id}`;
        const messageId = row?.provider_message_id ?? "";
        const inbox = async (
          type: string,
          extra: Record<string, unknown> = {},
        ) => {
          const [stored] = await tx<{ id: string }[]>`
          INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw, livemode, event_type, received_at)
          VALUES ('resend', ${`msg_${randomUUID()}`}, true,
                  ${tx.json({ type, created_at: NOW.toISOString(), data: { email_id: messageId, ...extra } } as never)},
                  false, ${type}, ${NOW})
          RETURNING id`;
          return processResendWebhook(stored?.id ?? "", {
            transaction: (fn) => fn(runnerOf(tx)),
            log: quiet,
            alert: async () => undefined,
          });
        };
        await inbox("email.bounced", { bounce: { type: "Transient" } });
        expect(
          (
            await tx<
              { n: number }[]
            >`SELECT count(*)::int AS n FROM email_suppression`
          )[0]?.n,
        ).toBe(0);
        await inbox("email.bounced", { bounce: { type: "Permanent" } });
        expect(await tx`SELECT reason FROM email_suppression`).toEqual([
          { reason: "bounced" },
        ]);
        expect(await reminderRow(tx, link.id)).toMatchObject({
          delivery_status: "bounced",
        });
        await inbox("email.delivered");
        expect(await reminderRow(tx, link.id)).toMatchObject({
          delivery_status: "bounced",
        });
        await inbox("email.opened");
        await inbox("email.clicked");
        expect(await reminderRow(tx, link.id)).toMatchObject({
          delivery_status: "bounced",
        });
        await inbox("email.complained");
        expect(await tx`SELECT reason FROM email_suppression`).toEqual([
          { reason: "complained" },
        ]);

        // A fresh grant after a complaint is still suppressed at the send.
        const fresh = await liveDraft(tx, {
          consentAt: new Date(NOW.getTime() + DAY),
          lastActivity: new Date(NOW.getTime() + DAY - 3 * HOUR),
        });
        const pending = await scheduled(tx, fresh);
        await tx`UPDATE basket_reminder SET email_hmac = NULL, status = 'skipped', skip_reason = 'too_late', sent_at = NULL WHERE id = ${link.id}`;
        expect(
          await sendBasketReminder(
            pending,
            new Date(NOW.getTime() + DAY),
            sendDeps(tx, spyMailer()),
          ),
        ).toEqual({ status: "skipped", reason: "suppressed" });
      });
    });
  },
);
