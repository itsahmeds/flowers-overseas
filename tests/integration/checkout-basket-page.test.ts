/**
 * The basket page's view model against a migrated PG16 (spec 010 §14 A-founder-2026-10-22 item 6,
 * D5, D8; AC-57 server half of the render; T-57 unit + integration; TASK-349).
 *
 * `loadBasketPage()` is everything `/{locale}/basket` decides before it renders: the empty state
 * for each of its causes, each line's state and shown amount, the one total of the available
 * lines, the start route's notice shown once (cleared without moving the 30-day window) and the
 * "Continue shopping" destination. Same harness as `checkout-basket.test.ts`: a scratch database
 * of a disposable local Postgres 16, `app_web` with `app.role = 'system'`, a rolled-back
 * transaction per case, injected flags and clock.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FX_SNAPSHOT_AS_OF } from "../../src/config/catalogue/fx.data.ts";
import { listProducts, listTiers, priceProjection } from "@/modules/catalog";
import {
  type CheckoutFlagReader,
  type DraftConnection,
  draftTokenFromCookieHeader,
  loadBasketPage,
  runRemoveLine,
  startCheckout,
} from "@/modules/checkout";

import { country } from "./support/rows.ts";
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

const [PRODUCT, SECOND] = await listProducts({ countryIso: "PL" });
if (PRODUCT === undefined || SECOND === undefined) {
  throw new Error("the dataset needs two products priced for PL");
}
const [TIER] = await listTiers(PRODUCT.sku);
const [SECOND_TIER] = await listTiers(SECOND.sku);
if (TIER === undefined || SECOND_TIER === undefined) {
  throw new Error("each product needs a tier");
}

const OPEN: CheckoutFlagReader = () => Promise.resolve(true);

let db: ScratchDatabase | undefined;

beforeAll(async () => {
  if (server.url !== undefined) {
    db = await scratchDatabase(server.url, "checkout_basket_page");
  }
}, 180_000);

afterAll(async () => {
  await db?.drop();
});

async function seeded(tx: Tx): Promise<DraftConnection> {
  await country(tx, "PL");
  await tx`INSERT INTO locale (code, bcp47, name) VALUES ('en-gb', 'en-GB', 'English (UK)')
           ON CONFLICT DO NOTHING`;
  for (const sku of [PRODUCT?.sku ?? "", SECOND?.sku ?? ""]) {
    await tx`
      INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                           substitution_class, freshness_days)
      VALUES (${sku}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
      ON CONFLICT DO NOTHING`;
  }
  await asApp(tx, { role: "system" });
  return { executor: runnerOf(tx) };
}

async function shownMinor(sku: string, tierKey: string): Promise<number> {
  const projection = await priceProjection("pl", {
    productId: sku,
    tierKey,
    countryIso: "PL",
    now: T0,
  });
  return projection.displayPrice.amountMinor;
}

/** One add through the start route, as the product page posts it; returns the token. */
async function add(
  connection: DraftConnection,
  sku: string,
  tierKey: string,
  token: string | null,
  now: Date,
): Promise<string> {
  const projection = await priceProjection("pl", {
    productId: sku,
    tierKey,
    countryIso: "PL",
    now,
  });
  const body = new URLSearchParams({
    locale: "pl",
    countryIso: "PL",
    sku,
    tierKey,
    expectedTotalMinor: String(projection.displayPrice.amountMinor),
    expectedCurrency: projection.displayPrice.currency,
    then: "basket",
  });
  const response = await startCheckout(
    new Request("http://flowersoverseas.test/api/checkout/start", {
      method: "POST",
      headers: {
        host: "flowersoverseas.test",
        origin: "http://flowersoverseas.test",
        "content-type": "application/x-www-form-urlencoded",
        ...(token === null ? {} : { cookie: `fo_checkout=${token}` }),
      },
      body: body.toString(),
    }),
    { now: () => now, connection, flags: OPEN },
  );
  if (token !== null) return token;
  const started = draftTokenFromCookieHeader(
    response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith("fo_checkout=")),
  );
  if (started === null) throw new Error("no basket started");
  return started;
}

describe.skipIf(server.url === undefined)(
  `the basket page on PG16${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    const run = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
      if (db === undefined) throw new Error("no scratch database");
      return rolledBack(db.sql, fn);
    };

    it("empty for no cookie, an unknown token, an expired basket and a basket with no line left", async () => {
      await run(async (tx) => {
        const connection = await seeded(tx);
        const base = { locale: "pl" as const, connection, flags: OPEN };
        expect(
          await loadBasketPage({ ...base, token: null, now: at(1) }),
        ).toEqual({
          kind: "empty",
        });
        expect(
          await loadBasketPage({
            ...base,
            token: "A".repeat(43),
            now: at(1),
          }),
        ).toEqual({ kind: "empty" });

        const token = await add(
          connection,
          PRODUCT.sku,
          TIER.tierKey,
          null,
          T0,
        );
        expect(
          (await loadBasketPage({ ...base, token, now: at(1) })).kind,
        ).toBe("lines");
        // 30 days after the last change the basket has expired.
        expect(
          await loadBasketPage({ ...base, token, now: at(30 * DAY + 1) }),
        ).toEqual({ kind: "empty" });

        const other = await add(
          connection,
          PRODUCT.sku,
          TIER.tierKey,
          null,
          T0,
        );
        const form = new FormData();
        form.append("line", "1");
        await runRemoveLine(
          {
            locale: "pl",
            token: other,
            connection,
            flags: OPEN,
            now: () => at(2),
          },
          form,
        );
        expect(
          await loadBasketPage({ ...base, token: other, now: at(3) }),
        ).toEqual({
          kind: "empty",
        });
      });
    });

    it("lines in basket order, each with its display and amount; the total is the sum of the available ones", async () => {
      await run(async (tx) => {
        const connection = await seeded(tx);
        const token = await add(
          connection,
          PRODUCT.sku,
          TIER.tierKey,
          null,
          T0,
        );
        await add(connection, SECOND.sku, SECOND_TIER.tierKey, token, at(1));
        const first = await shownMinor(PRODUCT.sku, TIER.tierKey);
        const second = await shownMinor(SECOND.sku, SECOND_TIER.tierKey);

        const page = await loadBasketPage({
          token,
          locale: "pl",
          now: at(2),
          connection,
          flags: OPEN,
        });
        if (page.kind !== "lines") throw new Error("expected lines");
        expect(page.lines.map((line) => line.position)).toEqual([1, 2]);
        expect(page.lines.map((line) => line.state)).toEqual(["ok", "ok"]);
        expect(page.lines[0]?.display.name).not.toBeNull();
        expect(page.lines[0]?.display.tier?.labelKey).toBe(TIER.labelKey);
        expect(page.lines[0]?.amount?.amountMinor).toBe(first);
        expect(page.lines[1]?.amount?.amountMinor).toBe(second);
        expect(page.total?.amountMinor).toBe(first + second);
        expect(page.blocked).toBe(0);
        expect(page.continueCountry).toBe("PL");

        // Line 2's tier is no longer priced: it stays visible, at its quoted amount, out of the total.
        await tx`UPDATE checkout_draft_line SET tier_key = 'stems_999' WHERE position = 2`;
        const after = await loadBasketPage({
          token,
          locale: "pl",
          now: at(3),
          connection,
          flags: OPEN,
        });
        if (after.kind !== "lines") throw new Error("expected lines");
        expect(after.lines.map((line) => line.state)).toEqual([
          "ok",
          "unavailable",
        ]);
        expect(after.lines[1]?.amount?.amountMinor).toBe(second);
        expect(after.lines[1]?.display.tier).toBeNull();
        expect(after.total?.amountMinor).toBe(first);
        expect(after.blocked).toBe(1);
      });
    });

    it("the start route's notice shows on one render only, and reading it does not move the 30-day window", async () => {
      await run(async (tx) => {
        const connection = await seeded(tx);
        const token = await add(
          connection,
          PRODUCT.sku,
          TIER.tierKey,
          null,
          T0,
        );
        const [before] = await tx<
          { expires_at: Date; last_activity_at: Date }[]
        >`
          SELECT expires_at, last_activity_at FROM checkout_draft`;
        const once = await loadBasketPage({
          token,
          locale: "pl",
          now: at(5),
          connection,
          flags: OPEN,
        });
        expect(once.kind === "lines" && once.notice).toBe("added");
        const twice = await loadBasketPage({
          token,
          locale: "pl",
          now: at(6),
          connection,
          flags: OPEN,
        });
        expect(twice.kind === "lines" && twice.notice).toBeNull();
        const [after] = await tx<
          { expires_at: Date; last_activity_at: Date }[]
        >`
          SELECT expires_at, last_activity_at FROM checkout_draft`;
        expect(after?.expires_at.getTime()).toBe(before?.expires_at.getTime());
        expect(after?.last_activity_at.getTime()).toBe(
          before?.last_activity_at.getTime(),
        );
      });
    });
  },
);
