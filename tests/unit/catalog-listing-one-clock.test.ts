/**
 * One clock for the whole listing view (spec 004 §14 A21 clause 6 (d); spec 005 §14 A3; TASK-178,
 * `/break` round 2 holes 4 and 5 on PR 169).
 *
 * No route passes `now` to `listingView()`, so in production the view reads the wall clock itself.
 * If it read it twice, once for the cards and once for the page's stale-rate sentence, a request
 * that straddled the 48-hour FX bound would render cards carrying equivalents under a sentence
 * saying the rate is stale: a false statement about the price shown. Likewise the category tiles'
 * from-prices must be projected at the cards' instant, or an injected fresh clock prints the cards
 * in euros and the tiles in złoty.
 *
 * (a) replaces `Date` with a clock that is current on its first reading and past the bound on
 * every later one, so any second reading on the render path disagrees with the first. (b) injects
 * a fresh `now` and compares the tiles' currency with the cards'.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { listingView } from "../../src/modules/catalog";

/** Inside the 48-hour window of the committed 2026-09-08 snapshot. */
const FRESH = new Date("2026-09-09T12:00:00Z");
/** Past it. */
const STALE = new Date("2026-09-11T00:00:01Z");

const SHOP_ROOT = {
  locale: "en",
  pageType: "countryShopRoot",
  country: "poland",
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * A `Date` whose argument-less readings tick across the bound: the first is `FRESH`, every one
 * after it is `STALE`. Dates built from a value (parsing, arithmetic) are untouched.
 */
function stubTickingClock(): { readings: () => number } {
  const RealDate = Date;
  let readings = 0;
  class TickingDate extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date> | []) {
      if (args.length === 0) {
        readings += 1;
        super((readings === 1 ? FRESH : STALE).getTime());
      } else {
        super(...(args as ConstructorParameters<typeof Date>));
      }
    }
  }
  vi.stubGlobal("Date", TickingDate);
  return { readings: () => readings };
}

describe("a view built without `now` reads the clock once (hole 4)", () => {
  it("cards and the stale-rate sentence agree when the clock crosses the 48-hour bound mid-render", async () => {
    const clock = stubTickingClock();
    const view = await listingView(SHOP_ROOT, { from: "2026-09-09" });
    expect(view).toBeDefined();
    const cards = view!.items;
    expect(cards.length).toBeGreaterThan(0);
    const withLine = cards.filter((card) => card.equivalents !== undefined);
    // Either every card carries the line and the page says nothing about a stale rate, or no
    // card carries it and the page says which currency it quotes. Never both.
    if (view!.fxFallback) {
      expect(withLine).toHaveLength(0);
    } else {
      expect(withLine).toHaveLength(cards.length);
    }
    // And the one reading was the current one: the view is the fresh state.
    expect(view!.fxFallback).toBe(false);
    expect(withLine).toHaveLength(cards.length);
    expect(clock.readings()).toBeGreaterThan(0);
  });
});

describe("the tiles are projected at the cards' instant (hole 5)", () => {
  it("an injected fresh clock prints tiles and cards in the same currency", async () => {
    const view = await listingView(SHOP_ROOT, {
      from: "2026-09-09",
      now: FRESH,
    });
    expect(view).toBeDefined();
    const cardCurrencies = new Set(
      view!.items.map((card) => card.price.currency),
    );
    const tileCurrencies = new Set(
      view!.tiles.flatMap((tile) =>
        tile.fromPrice === undefined ? [] : [tile.fromPrice.currency],
      ),
    );
    expect(view!.tiles.length).toBeGreaterThan(0);
    // `/en` over Poland at a current rate is charged in euros, cards and tiles alike.
    expect([...cardCurrencies]).toEqual(["EUR"]);
    expect([...tileCurrencies]).toEqual(["EUR"]);
  });

  it("a stale injected clock prints both in the destination's own currency", async () => {
    const view = await listingView(SHOP_ROOT, {
      from: "2026-09-09",
      now: STALE,
    });
    const tileCurrencies = new Set(
      view!.tiles.flatMap((tile) =>
        tile.fromPrice === undefined ? [] : [tile.fromPrice.currency],
      ),
    );
    expect([
      ...new Set(view!.items.map((card) => card.price.currency)),
    ]).toEqual(["PLN"]);
    expect([...tileCurrencies]).toEqual(["PLN"]);
  });
});
