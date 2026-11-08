/**
 * The four checkout steps against a migrated PG16 (spec 010 §14 A-founder-2026-10-25a item 1;
 * T-105 integration half, T-07 and T-58 as amended; AC-105, AC-7, AC-58; TASK-418).
 *
 * Step 1 "Who are the flowers for?" and step 2 "Your card" run once per line, step 3 "Your
 * details" once per order, step 4 "Check and pay" once. Each case starts a basket through the real
 * start route and the real step runners on a scratch database of a disposable local Postgres 16,
 * inside a transaction that is rolled back. Flags are injected (`checkout.open` and
 * `checkout.demo_guard` on: the mode is `demo`); the clock is injected.
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
    db = await scratchDatabase(server.url, "checkout_steps_split");
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

async function screenOf(
  connection: DraftConnection,
  token: string,
  step?: string,
  line?: string,
): Promise<{ step: string; line: number }> {
  const screen = await checkoutScreen({
    locale: "pl",
    token,
    step,
    line,
    now: () => at(2),
    connection,
    flags: OPEN,
  });
  if (screen.kind !== "step") throw new Error(`not a step: ${screen.kind}`);
  return { step: screen.step, line: screen.line };
}

describe.skipIf(server.url === undefined)(
  `the four checkout steps on PG16${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    const run = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
      if (db === undefined) throw new Error("no scratch database");
      return rolledBack(db.sql, fn);
    };

    it("a three-line basket: step 1 per line, step 2 per line with no buyer field, step 3 once, then step 4 (AC-58, AC-105)", async () => {
      await run(async (tx) => {
        const connection = await seeded(tx);
        const token = await basket(connection, 3);
        const after: string[] = [];
        for (let line = 1; line <= 3; line += 1) {
          after.push(
            location(
              await runRecipientStep(
                ctx(connection, token),
                recipientForm(line),
              ),
            ),
          );
        }
        for (let line = 1; line <= 3; line += 1) {
          after.push(
            location(await runCardStep(ctx(connection, token), cardForm(line))),
          );
        }
        expect(after).toEqual([
          "/pl/checkout?step=recipient&line=2",
          "/pl/checkout?step=recipient&line=3",
          "/pl/checkout?step=card",
          "/pl/checkout?step=card&line=2",
          "/pl/checkout?step=card&line=3",
          "/pl/checkout?step=details",
        ]);
        const beforeBuyer = await draftOf(connection, token);
        expect(beforeBuyer.buyer).toBeNull();
        expect(beforeBuyer.buyerSaved).toBe(false);
        expect(await screenOf(connection, token)).toEqual({
          step: "details",
          line: 1,
        });
        expect(
          location(await runBuyerStep(ctx(connection, token), form(BUYER))),
        ).toBe("/pl/checkout?step=review");
        const saved = await draftOf(connection, token);
        expect(saved.buyerSaved).toBe(true);
        expect(saved.buyer).toEqual({ ...BUYER, buyerPhone: null });
        expect(await screenOf(connection, token)).toEqual({
          step: "review",
          line: 1,
        });
      });
    });

    it("a one-line basket goes recipient, card, details, review (AC-7)", async () => {
      await run(async (tx) => {
        const connection = await seeded(tx);
        const token = await basket(connection, 1);
        expect(
          location(
            await runRecipientStep(ctx(connection, token), recipientForm(1)),
          ),
        ).toBe("/pl/checkout?step=card");
        expect(
          location(await runCardStep(ctx(connection, token), cardForm(1))),
        ).toBe("/pl/checkout?step=details");
        expect(
          location(await runBuyerStep(ctx(connection, token), form(BUYER))),
        ).toBe("/pl/checkout?step=review");
      });
    });

    it("a five-line basket reaches step 3 only after the fifth line's step 2", async () => {
      await run(async (tx) => {
        const connection = await seeded(tx);
        const token = await basket(connection, 5);
        for (let line = 1; line <= 5; line += 1) {
          await runRecipientStep(ctx(connection, token), recipientForm(line));
        }
        for (let line = 1; line <= 4; line += 1) {
          await runCardStep(ctx(connection, token), cardForm(line));
        }
        expect(await screenOf(connection, token, "details")).toEqual({
          step: "card",
          line: 5,
        });
        expect(
          location(await runCardStep(ctx(connection, token), cardForm(5))),
        ).toBe("/pl/checkout?step=details");
        expect(await screenOf(connection, token, "details")).toEqual({
          step: "details",
          line: 1,
        });
      });
    });

    it("?step=details with a line's step 2 incomplete renders that step 2; ?step=review with step 1 incomplete renders step 1 (AC-7 amended)", async () => {
      await run(async (tx) => {
        const connection = await seeded(tx);
        const token = await basket(connection, 3);
        expect(await screenOf(connection, token, "review")).toEqual({
          step: "recipient",
          line: 1,
        });
        expect(await screenOf(connection, token, "details")).toEqual({
          step: "recipient",
          line: 1,
        });
        for (let line = 1; line <= 3; line += 1) {
          await runRecipientStep(ctx(connection, token), recipientForm(line));
        }
        await runCardStep(ctx(connection, token), cardForm(1));
        expect(await screenOf(connection, token, "details")).toEqual({
          step: "card",
          line: 2,
        });
        expect(await screenOf(connection, token, "review")).toEqual({
          step: "card",
          line: 2,
        });
        // `&line=` never gives step 3 a line of its own.
        await runCardStep(ctx(connection, token), cardForm(2));
        await runCardStep(ctx(connection, token), cardForm(3));
        expect(await screenOf(connection, token, "details", "3")).toEqual({
          step: "details",
          line: 1,
        });
      });
    });

    it("a crafted saveBuyerStep post before every step 2 is complete writes nothing and goes to the first incomplete screen", async () => {
      await run(async (tx) => {
        const connection = await seeded(tx);
        const token = await basket(connection, 2);
        expect(
          location(await runBuyerStep(ctx(connection, token), form(BUYER))),
        ).toBe("/pl/checkout");
        await runRecipientStep(ctx(connection, token), recipientForm(1));
        await runRecipientStep(ctx(connection, token), recipientForm(2));
        await runCardStep(ctx(connection, token), cardForm(1));
        expect(
          location(await runBuyerStep(ctx(connection, token), form(BUYER))),
        ).toBe("/pl/checkout?step=card&line=2");
        const draft = await draftOf(connection, token);
        expect(draft.buyer).toBeNull();
        expect(draft.buyerSaved).toBe(false);
      });
    });

    it("step 2 refuses a buyer field and step 3 a card field, writing nothing", async () => {
      await run(async (tx) => {
        const connection = await seeded(tx);
        const token = await basket(connection, 1);
        await runRecipientStep(ctx(connection, token), recipientForm(1));
        const card = await runCardStep(
          ctx(connection, token),
          cardForm(1, { email: SAMPLE.buyer.email }),
        );
        expect(card.kind).toBe("render");
        expect((await draftOf(connection, token)).lines[0]?.card).toBeNull();
        await runCardStep(ctx(connection, token), cardForm(1));
        const buyer = await runBuyerStep(
          ctx(connection, token),
          form({ ...BUYER, cardMessage: "Hello" }),
        );
        expect(buyer).toMatchObject({
          kind: "render",
          state: { status: "invalid", step: "details", line: 1 },
        });
        const invalid = await runBuyerStep(
          ctx(connection, token),
          form({ ...BUYER, email: "not-an-email" }),
        );
        expect(
          invalid.kind === "render" && invalid.state.status === "invalid"
            ? invalid.state.errors["email"]
            : undefined,
        ).toEqual([{ key: "checkout.error.emailInvalid" }]);
        const draft = await draftOf(connection, token);
        expect(draft.buyer).toBeNull();
        expect(draft.buyerSaved).toBe(false);
      });
    });

    it("a card changed after step 3 is saved keeps the buyer's fields (AC-105)", async () => {
      await run(async (tx) => {
        const connection = await seeded(tx);
        const token = await basket(connection, 2);
        for (let line = 1; line <= 2; line += 1) {
          await runRecipientStep(ctx(connection, token), recipientForm(line));
        }
        for (let line = 1; line <= 2; line += 1) {
          await runCardStep(ctx(connection, token), cardForm(line));
        }
        await runBuyerStep(ctx(connection, token), form(BUYER));
        expect(
          location(
            await runCardStep(
              ctx(connection, token, 3),
              cardForm(2, { cardMessage: "Changed my mind" }),
            ),
          ),
        ).toBe("/pl/checkout?step=review");
        const draft = await draftOf(connection, token, 4);
        expect(draft.lines[1]?.card?.cardMessage).toBe("Changed my mind");
        expect(draft.buyerSaved).toBe(true);
        expect(draft.buyer).toEqual({ ...BUYER, buyerPhone: null });
      });
    });
  },
);
