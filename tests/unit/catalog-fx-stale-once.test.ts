/**
 * `catalog.fx_stale` is sent once per process per stale `fx_as_of` (spec 005 §14 A7 Corrected 4,
 * AC-32; T-32; TASK-180).
 *
 * Before A7 the signal fired on every refused conversion: three equivalents legs per product card
 * on `/pl`, once per prebuilt page in a build, and the production build log hit Vercel's 4 MB cap
 * on 2026-10-02. The dedupe lives in `observability.ts`; this file drives the real listing of the
 * `/pl` shop root (every card, every equivalent currency) through a capturing logger and a Sentry
 * spy, in **one** module graph, so the process-local memory is what is under test:
 *
 *  1. stale snapshot: exactly one `warn` line and one `captureWarning`, however many cards;
 *  2. a second, different stale `fx_as_of` (the rows swapped in place, as after a redeploy that
 *     fetched an older file): exactly one more;
 *  3. a fresh instant: none at all.
 *
 * Removing the dedupe turns (1) red: the listing refuses dozens of conversions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FxRateRecord } from "../../src/modules/catalog/providers.ts";

const holder = vi.hoisted(() => ({
  rows: undefined as readonly FxRateRecord[] | undefined,
}));

const captureMessage = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureMessage,
  getCurrentScope: () => ({ setTag: (): void => undefined }),
}));

vi.mock("../../src/modules/catalog/static/index.ts", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../src/modules/catalog/static/index.ts")
    >();
  return {
    ...actual,
    staticFxRateProvider: {
      fxRates: async () => holder.rows ?? actual.staticFxRateProvider.fxRates(),
    },
  };
});

const { FX_SNAPSHOT, FX_SNAPSHOT_AS_OF } =
  await import("../../src/config/catalogue/fx.data.ts");
const { logger } = await import("../../src/lib/logger.ts");
const { CATALOG_SIGNALS } =
  await import("../../src/modules/catalog/observability.ts");
const { listingView } = await import("../../src/modules/catalog/index.ts");

/** Inside the committed snapshot's window: Tuesday's rate, Wednesday noon. */
const FRESH = new Date(`2026-09-09T12:00:00Z`);
/** Past it: stale after Thursday 2026-09-10 00:00Z (AC-35). */
const STALE = new Date("2026-09-11T00:00:01Z");
/** A second, older publication date, for the "different `fx_as_of`" step. */
const OTHER_AS_OF = "2026-09-07";

let staleLines: unknown[] = [];

beforeEach(() => {
  staleLines = [];
  captureMessage.mockClear();
  vi.spyOn(logger, "warn").mockImplementation(
    (fields: unknown, message?: string) => {
      if (message === CATALOG_SIGNALS.fxStale) staleLines.push(fields);
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Every card of the `/pl` shop root, with its price and its equivalents line, at `now`. */
async function renderPolishShopRoot(now: Date): Promise<number> {
  const view = await listingView(
    { locale: "pl", pageType: "countryShopRoot", country: "polska" },
    { from: "2026-09-09", now },
  );
  if (view === undefined) throw new Error("the /pl shop root exists");
  return view.items.length;
}

function staleCaptures(): number {
  return captureMessage.mock.calls.filter(
    ([message]) => message === CATALOG_SIGNALS.fxStale,
  ).length;
}

describe("catalog.fx_stale, once per process per stale fx_as_of (AC-32, T-32)", () => {
  it("emits exactly one line and one Sentry warning for every card on /pl", async () => {
    const cards = await renderPolishShopRoot(STALE);
    // The control: enough cards that a per-refusal signal would be many lines, not one.
    expect(cards).toBeGreaterThanOrEqual(6);

    expect(staleLines).toEqual([
      { currency: "EUR", fx_as_of: FX_SNAPSHOT_AS_OF },
    ]);
    expect(staleCaptures()).toBe(1);

    // A second render of the same page in the same process adds nothing.
    await renderPolishShopRoot(STALE);
    expect(staleLines).toHaveLength(1);
    expect(staleCaptures()).toBe(1);
  });

  it("emits exactly one more for a second, different fx_as_of", async () => {
    holder.rows = FX_SNAPSHOT.map((row) => ({ ...row, asOf: OTHER_AS_OF }));
    try {
      await renderPolishShopRoot(STALE);
      await renderPolishShopRoot(STALE);
    } finally {
      holder.rows = undefined;
    }
    expect(staleLines).toHaveLength(1);
    expect(staleLines[0]).toMatchObject({ fx_as_of: OTHER_AS_OF });
    expect(staleCaptures()).toBe(1);
  });

  it("emits nothing when the snapshot is fresh, in a process that has reported nothing yet", async () => {
    // A fresh module graph, so the dedupe holds no date: a signal fired on a fresh conversion
    // would be emitted here, not hidden by the earlier cases' entry (`/break 177` hole 12).
    vi.resetModules();
    const fresh = await import("../../src/modules/catalog/index.ts");
    const { CATALOG_SIGNALS: signals } =
      await import("../../src/modules/catalog/observability.ts");
    const { logger: freshLogger } = await import("../../src/lib/logger.ts");
    const lines: unknown[] = [];
    vi.spyOn(freshLogger, "warn").mockImplementation(
      (fields: unknown, message?: string) => {
        if (message === signals.fxStale) lines.push(fields);
      },
    );
    const view = await fresh.listingView(
      { locale: "pl", pageType: "countryShopRoot", country: "polska" },
      { from: "2026-09-09", now: FRESH },
    );
    // The control: the fresh render converted (every card carries its equivalents line).
    expect(view?.items.every((card) => card.equivalents !== undefined)).toBe(
      true,
    );
    expect(lines).toEqual([]);
    expect(staleCaptures()).toBe(0);
  });
});
