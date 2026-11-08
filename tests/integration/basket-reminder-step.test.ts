/**
 * Spec 034's box on step 3 through the real step runner and screen on PG16 (T-07 server half,
 * T-08 through the step; AC-7, AC-8; TASK-449): offered only with the flag on and the box's copy
 * reviewed for the locale; never ticked by the server unless the draft holds the buyer's consent;
 * saving unticked advances and records nothing; ticking records the consent; a refused post keeps
 * the buyer's tick in its values; with the box not offered a posted tick records nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FX_SNAPSHOT_AS_OF } from "../../src/config/catalogue/fx.data.ts";
import { CHECKOUT_SAMPLES } from "../../src/config/checkout-samples.ts";
import { listProducts, listTiers, priceProjection } from "@/modules/catalog";
import {
  type CheckoutFlagReader,
  type Draft,
  type DraftConnection,
  type StepOutcome,
  checkoutScreen,
  draftTokenFromCookieHeader,
  loadDraft,
  nextDeliveryDate,
  runBuyerStep,
  runCardStep,
  runRecipientStep,
  startCheckout,
} from "@/modules/checkout";
import type { ReminderGate } from "../../src/modules/checkout/reminders/offer.ts";

import { country, partner } from "./support/rows.ts";
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

const T0 = new Date(`${FX_SNAPSHOT_AS_OF}T09:00:00.000Z`);
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);
const DAY = 24 * 60;

const PRODUCTS = await listProducts({ countryIso: "PL" });
const [PRODUCT, SECOND] = PRODUCTS;
if (PRODUCT === undefined || SECOND === undefined) {
  throw new Error("the dataset needs two products priced for PL");
}
const [TIER] = await listTiers(PRODUCT.sku);
const [SECOND_TIER] = await listTiers(SECOND.sku);
if (TIER === undefined || SECOND_TIER === undefined) {
  throw new Error("each product needs a tier");
}

const OPEN: CheckoutFlagReader = () => Promise.resolve(true);
const SAMPLE = CHECKOUT_SAMPLES.PL;
const DELIVERY_DATE =
  nextDeliveryDate("PL", new Date(T0.getTime() + 3 * DAY * 60_000)) ?? "";

let db: ScratchDatabase | undefined;

beforeAll(async () => {
  if (server.url !== undefined) {
    db = await scratchDatabase(server.url, "basket_reminder_step");
  }
}, 180_000);

afterAll(async () => {
  await db?.drop();
});

async function seeded(tx: Tx): Promise<DraftConnection> {
  const plId = await country(tx, "PL");
  for (const sku of [PRODUCT?.sku ?? "", SECOND?.sku ?? ""]) {
    await tx`
      INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                           substitution_class, freshness_days)
      VALUES (${sku}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
      ON CONFLICT DO NOTHING`;
  }
  await partner(tx, plId, "demo");
  await asApp(tx, { role: "system" });
  return { executor: runnerOf(tx) };
}

function form(values: Record<string, string | readonly string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of typeof value === "string" ? [value] : value) {
      data.append(key, item);
    }
  }
  return data;
}

/** "Add to basket" for one product; returns the basket's token. */
async function add(
  connection: DraftConnection,
  sku: string,
  tierKey: string,
  token: string | null = null,
): Promise<string> {
  const display = (
    await priceProjection("pl", {
      productId: sku,
      tierKey,
      countryIso: "PL",
      now: T0,
    })
  ).displayPrice;
  const response = await startCheckout(
    new Request("http://flowersoverseas.test/api/checkout/start", {
      method: "POST",
      headers: {
        host: "flowersoverseas.test",
        origin: "http://flowersoverseas.test",
        "content-type": "application/x-www-form-urlencoded",
        ...(token === null ? {} : { cookie: `fo_checkout=${token}` }),
      },
      body: new URLSearchParams({
        locale: "pl",
        countryIso: "PL",
        sku,
        tierKey,
        expectedTotalMinor: String(display.amountMinor),
        expectedCurrency: display.currency,
        then: "checkout",
      }).toString(),
    }),
    { now: () => T0, connection, flags: OPEN },
  );
  if (token !== null) return token;
  const started = draftTokenFromCookieHeader(
    response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith("fo_checkout=")),
  );
  if (started === null)
    throw new Error(`no basket: ${String(response.status)}`);
  return started;
}

/** A basket of `lines` lines, alternating the two products. */
async function basket(
  connection: DraftConnection,
  lines: number,
): Promise<string> {
  const token = await add(connection, PRODUCT?.sku ?? "", TIER?.tierKey ?? "");
  for (let line = 2; line <= lines; line += 1) {
    const [sku, tierKey] =
      line % 2 === 0
        ? [SECOND?.sku ?? "", SECOND_TIER?.tierKey ?? ""]
        : [PRODUCT?.sku ?? "", TIER?.tierKey ?? ""];
    await add(connection, sku, tierKey, token);
  }
  return token;
}

function ctx(connection: DraftConnection, token: string, minutes = 1) {
  return {
    locale: "pl",
    token,
    connection,
    flags: OPEN,
    now: () => at(minutes),
  };
}

function location(outcome: StepOutcome): string {
  if (outcome.kind !== "redirect") {
    throw new Error(`expected a redirect, got ${JSON.stringify(outcome)}`);
  }
  return outcome.location;
}

const recipientForm = (line: number): FormData =>
  form({
    line: String(line),
    ...SAMPLE.recipient.fields,
    fullName: `Anna Przykładowa ${String(line)}`,
    placeKind: SAMPLE.recipient.placeKind,
    deliveryNote: "",
    deliveryDate: DELIVERY_DATE,
  });

const cardForm = (
  line: number,
  overrides: Record<string, string> = {},
): FormData =>
  form({
    line: String(line),
    cardMessage: `Wszystkiego najlepszego ${String(line)}`,
    signAs: "Sam",
    ...overrides,
  });

const BUYER = {
  email: SAMPLE.buyer.email,
  buyerName: SAMPLE.buyer.buyerName,
  buyerPhone: "",
  residenceCountry: SAMPLE.buyer.residenceCountry,
} as const;

async function draftOf(
  connection: DraftConnection,
  token: string,
  minutes = 2,
): Promise<Draft> {
  const lookup = await loadDraft(token, at(minutes), connection);
  if (lookup.status !== "active") throw new Error(lookup.status);
  return lookup.draft;
}

const ON: ReminderGate = { readFlag: async () => true, reviewed: () => true };
const FLAG_OFF: ReminderGate = {
  readFlag: async () => false,
  reviewed: () => true,
};
const UNREVIEWED: ReminderGate = {
  readFlag: async () => true,
  reviewed: () => false,
};

/** A one-line basket with steps 1 and 2 saved: step 3 is next. */
async function atDetails(connection: DraftConnection): Promise<string> {
  const token = await basket(connection, 1);
  location(await runRecipientStep(ctx(connection, token), recipientForm(1)));
  location(await runCardStep(ctx(connection, token), cardForm(1)));
  return token;
}

async function box(
  connection: DraftConnection,
  token: string,
  gate: ReminderGate,
): Promise<{ checked: boolean } | null | undefined> {
  const screen = await checkoutScreen({
    locale: "pl",
    token,
    step: "details",
    now: () => at(2),
    connection,
    flags: OPEN,
    reminderGate: gate,
  });
  if (screen.kind !== "step") throw new Error(screen.kind);
  return screen.basketReminder;
}

async function contactRows(tx: Tx): Promise<number> {
  const [row] = await tx<{ count: number }[]>`
    SELECT count(*)::int AS count FROM consent_log WHERE subject_kind = 'contact'`;
  return row?.count ?? -1;
}

describe.skipIf(server.url === undefined)(
  "spec 034's box on step 3 (PG16)",
  () => {
    const run = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
      if (db === undefined) throw new Error("no scratch database");
      return rolledBack(db.sql, fn);
    };

    it("offered unticked; saving unticked advances and records nothing; ticking records the consent and the box then renders ticked", async () => {
      await run(async (tx) => {
        const connection = await seeded(tx);
        const token = await atDetails(connection);
        expect(await box(connection, token, ON)).toEqual({ checked: false });

        expect(
          location(
            await runBuyerStep(
              { ...ctx(connection, token), reminderGate: ON },
              form(BUYER),
            ),
          ),
        ).toBe("/pl/checkout?step=review");
        expect((await draftOf(connection, token)).reminderConsentAt).toBeNull();
        expect(await contactRows(tx)).toBe(0);

        location(
          await runBuyerStep(
            { ...ctx(connection, token, 3), reminderGate: ON },
            form({ ...BUYER, basketReminder: "on" }),
          ),
        );
        const saved = await draftOf(connection, token, 4);
        expect(saved.reminderConsentAt?.toISOString()).toBe(
          at(3).toISOString(),
        );
        expect(saved.buyer).toEqual({ ...BUYER, buyerPhone: null });
        expect(await contactRows(tx)).toBe(1);
        expect(await box(connection, token, ON)).toEqual({ checked: true });
      });
    });

    it("absent with the flag off or the copy unreviewed; a posted tick then records nothing", async () => {
      await run(async (tx) => {
        const connection = await seeded(tx);
        const token = await atDetails(connection);
        expect(await box(connection, token, FLAG_OFF)).toBeNull();
        expect(await box(connection, token, UNREVIEWED)).toBeNull();
        for (const gate of [FLAG_OFF, UNREVIEWED]) {
          location(
            await runBuyerStep(
              { ...ctx(connection, token), reminderGate: gate },
              form({ ...BUYER, basketReminder: "on" }),
            ),
          );
        }
        expect((await draftOf(connection, token)).reminderConsentAt).toBeNull();
        expect(await contactRows(tx)).toBe(0);
      });
    });

    it("a refused post keeps the buyer's tick in its values and writes nothing", async () => {
      await run(async (tx) => {
        const connection = await seeded(tx);
        const token = await atDetails(connection);
        const outcome = await runBuyerStep(
          { ...ctx(connection, token), reminderGate: ON },
          form({ ...BUYER, email: "not-an-email", basketReminder: "on" }),
        );
        expect(outcome.kind).toBe("render");
        if (outcome.kind === "render" && outcome.state.status === "invalid") {
          expect(outcome.state.values["basketReminder"]).toBe("on");
        } else {
          throw new Error("expected an invalid render");
        }
        expect((await draftOf(connection, token)).reminderConsentAt).toBeNull();
        expect(await contactRows(tx)).toBe(0);
      });
    });
  },
);
