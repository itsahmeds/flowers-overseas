/**
 * T-02, T-03, T-27, T-50, T-51 — who may be offered an order and in what order (spec 016 §5.2
 * `eligibleCandidates`, `rankCandidates`, `ownerOfOrder`, `canServe`; §14 A-founder-2026-10-23;
 * AC-2, AC-3, AC-27, AC-50, AC-51; TASK-327).
 *
 * Every assertion names the one expected value (the exact ids, the exact rule, the exact reason),
 * so each passes only with its subject in place: the mutations listed in the PR's self-review
 * each turn a case here red.
 */
import { describe, expect, it } from "vitest";

import {
  type Candidate,
  createCanServe,
  type CoverageReader,
  eligibleCandidates,
  type EligibilityContext,
  ownerOfOrder,
  rankCandidates,
  type RoutingLine,
  type RoutingOrder,
  type RoutingPartner,
  servability,
} from "@/modules/orders/routing";

const CITY = "city-krakow";
const OTHER_CITY = "city-gdansk";
const ZONE = "zone-31";
const OTHER_ZONE = "zone-80";
const ROSES = "product-roses";
const TULIPS = "product-tulips";

/** Outside production, spec 011's `signInPolicy` allows `demo`; spec 026 widens it to `active`. */
const SIGN_IN: EligibilityContext = { signInStatuses: ["demo", "active"] };

const LIVE_ORDER: RoutingOrder = {
  mode: "live",
  postcodeZoneId: ZONE,
  cityId: CITY,
  deliveryDate: "2026-10-17",
  lines: [
    { kind: "product", productId: ROSES, tierKey: "large", qty: 2 },
    { kind: "addon", addonId: "addon-chocolates", qty: 1 },
  ],
  offeredPartnerIds: ["p-offered"],
};

function partner(
  partnerId: string,
  overrides: Partial<RoutingPartner> = {},
): RoutingPartner {
  return {
    partnerId,
    status: "active",
    capacityPerDay: 5,
    coverage: [{ cityId: CITY, postcodeZoneId: null, capacityPerDay: null }],
    catalog: [
      { productId: ROSES, tierKey: null, canFulfil: true, payoutMinor: 4000 },
    ],
    payoutCurrency: "PLN",
    blackoutDates: [],
    loadOnDate: 0,
    memberCount: 1,
    ratingBp: 9000,
    acceptanceRateBp: 9000,
    offers90d: 10,
    lastOfferedAt: null,
    ...overrides,
  };
}

const ids = (candidates: readonly Pick<Candidate, "partnerId">[]): string[] =>
  candidates.map((candidate) => candidate.partnerId);

describe("eligibleCandidates (T-02, AC-2)", () => {
  const ok = partner("p-ok");

  it("keeps a partner that passes every rule, with its payout for this order", () => {
    const result = eligibleCandidates(LIVE_ORDER, [ok], SIGN_IN);
    expect(result.excluded).toEqual([]);
    expect(result.candidates).toEqual([
      {
        partnerId: "p-ok",
        ratingBp: 9000,
        acceptanceRateBp: 9000,
        offers90d: 10,
        payout: { minor: 8000, currency: "PLN" },
        lastOfferedAt: null,
      },
    ]);
  });

  it.each([
    [
      "mode: an active-only order meets a demo florist",
      partner("p-x", { status: "demo" }),
      "mode",
    ],
    ["mode: a paused florist", partner("p-x", { status: "paused" }), "mode"],
    [
      "coverage: another city and another zone",
      partner("p-x", {
        coverage: [
          { cityId: OTHER_CITY, postcodeZoneId: null, capacityPerDay: null },
          { cityId: null, postcodeZoneId: OTHER_ZONE, capacityPerDay: null },
        ],
      }),
      "coverage",
    ],
    ["coverage: none at all", partner("p-x", { coverage: [] }), "coverage"],
    [
      "catalogue: the exact tier says no, though the any-tier row says yes",
      partner("p-x", {
        catalog: [
          {
            productId: ROSES,
            tierKey: null,
            canFulfil: true,
            payoutMinor: 4000,
          },
          {
            productId: ROSES,
            tierKey: "large",
            canFulfil: false,
            payoutMinor: 4000,
          },
        ],
      }),
      "catalogue",
    ],
    [
      "catalogue: no row for the product",
      partner("p-x", {
        catalog: [
          {
            productId: TULIPS,
            tierKey: null,
            canFulfil: true,
            payoutMinor: 4000,
          },
        ],
      }),
      "catalogue",
    ],
    [
      "blackout on the delivery date",
      partner("p-x", { blackoutDates: ["2026-10-16", "2026-10-17"] }),
      "blackout",
    ],
    [
      "capacity: the area's override (2) is full though the partner's (5) is not",
      partner("p-x", {
        loadOnDate: 2,
        coverage: [{ cityId: CITY, postcodeZoneId: null, capacityPerDay: 2 }],
      }),
      "capacity",
    ],
    [
      "capacity: the partner's own cap is full",
      partner("p-x", { loadOnDate: 5 }),
      "capacity",
    ],
    ["already offered this order", partner("p-offered"), "already_offered"],
    ["sign-in: no member", partner("p-x", { memberCount: 0 }), "sign_in"],
  ] as const)("excludes %s, alone", (_name, failing, rule) => {
    const result = eligibleCandidates(LIVE_ORDER, [ok, failing], SIGN_IN);
    expect(ids(result.candidates)).toEqual(["p-ok"]);
    expect(result.excluded).toEqual([{ partnerId: failing.partnerId, rule }]);
  });

  it("excludes on sign-in when the policy does not allow the status (production today)", () => {
    const result = eligibleCandidates(LIVE_ORDER, [ok], {
      signInStatuses: ["demo"],
    });
    expect(result.candidates).toEqual([]);
    expect(result.excluded).toEqual([{ partnerId: "p-ok", rule: "sign_in" }]);
  });

  it("pairs modes both ways: live → active, test → demo", () => {
    const active = partner("p-active");
    const demo = partner("p-demo", { status: "demo" });
    const live = eligibleCandidates(LIVE_ORDER, [active, demo], SIGN_IN);
    expect(ids(live.candidates)).toEqual(["p-active"]);
    expect(live.excluded).toEqual([{ partnerId: "p-demo", rule: "mode" }]);
    const test = eligibleCandidates(
      { ...LIVE_ORDER, mode: "test" },
      [active, demo],
      SIGN_IN,
    );
    expect(ids(test.candidates)).toEqual(["p-demo"]);
    expect(test.excluded).toEqual([{ partnerId: "p-active", rule: "mode" }]);
  });

  it("matches a zone row by zone alone, and a zone row of the city does not cover another zone", () => {
    const zoneOnly = partner("p-zone", {
      coverage: [{ cityId: null, postcodeZoneId: ZONE, capacityPerDay: null }],
    });
    const otherZoneInCity = partner("p-other-zone", {
      coverage: [
        { cityId: CITY, postcodeZoneId: OTHER_ZONE, capacityPerDay: null },
      ],
    });
    const result = eligibleCandidates(
      { ...LIVE_ORDER, cityId: null },
      [zoneOnly, otherZoneInCity],
      SIGN_IN,
    );
    expect(ids(result.candidates)).toEqual(["p-zone"]);
    expect(result.excluded).toEqual([
      { partnerId: "p-other-zone", rule: "coverage" },
    ]);
    // With the city known too: a row naming a zone of the city covers that zone, not the city.
    const withCity = eligibleCandidates(
      LIVE_ORDER,
      [zoneOnly, otherZoneInCity],
      SIGN_IN,
    );
    expect(ids(withCity.candidates)).toEqual(["p-zone"]);
    expect(withCity.excluded).toEqual([
      { partnerId: "p-other-zone", rule: "coverage" },
    ]);
  });

  it("uses the zone row's capacity over the city row's when both match", () => {
    const both = partner("p-both", {
      loadOnDate: 3,
      coverage: [
        { cityId: CITY, postcodeZoneId: null, capacityPerDay: 10 },
        { cityId: CITY, postcodeZoneId: ZONE, capacityPerDay: 3 },
      ],
    });
    expect(eligibleCandidates(LIVE_ORDER, [both], SIGN_IN).excluded).toEqual([
      { partnerId: "p-both", rule: "capacity" },
    ]);
  });

  it("lets a partner one below its cap through", () => {
    const almost = partner("p-almost", { loadOnDate: 4 });
    expect(
      ids(eligibleCandidates(LIVE_ORDER, [almost], SIGN_IN).candidates),
    ).toEqual(["p-almost"]);
  });
});

/* -------------------------------------------------------------------------- */

function candidate(
  partnerId: string,
  overrides: Partial<Candidate> = {},
): Candidate {
  return {
    partnerId,
    ratingBp: 9000,
    acceptanceRateBp: 9000,
    offers90d: 20,
    payout: { minor: 5000, currency: "PLN" },
    lastOfferedAt: new Date("2026-10-10T10:00:00Z"),
    ...overrides,
  };
}

/**
 * AC-3's five. The best rating is A's 9400, so the band is 8930 and above: A, B, C (null → 9000)
 * and D are in it, E (8929) is not. In the band ratings do not separate; C's 4 offers make its
 * 2000 read as 100 %, so C leads; D and B tie on acceptance and D's lower payout wins; A's 80 %
 * puts it last of the band; E, best on acceptance, payout and round-robin, is out of the band.
 */
const FIVE: readonly Candidate[] = [
  candidate("a", { ratingBp: 9400, acceptanceRateBp: 8000 }),
  candidate("b", { ratingBp: 9200, acceptanceRateBp: 9500 }),
  candidate("c", {
    ratingBp: null,
    acceptanceRateBp: 2000,
    offers90d: 4,
    payout: { minor: 6000, currency: "PLN" },
  }),
  candidate("d", {
    ratingBp: 9100,
    acceptanceRateBp: 9500,
    payout: { minor: 4500, currency: "PLN" },
    lastOfferedAt: new Date("2026-10-12T10:00:00Z"),
  }),
  candidate("e", {
    ratingBp: 8929,
    acceptanceRateBp: 10_000,
    payout: { minor: 1000, currency: "PLN" },
    lastOfferedAt: null,
  }),
];
const FIVE_ORDER = ["c", "d", "b", "a", "e"];

describe("rankCandidates (T-03, AC-3)", () => {
  it("orders the five exactly by the key, whatever the input order", () => {
    expect(ids(rankCandidates(FIVE, null))).toEqual(FIVE_ORDER);
    expect(ids(rankCandidates([...FIVE].reverse(), null))).toEqual(FIVE_ORDER);
  });

  it("reads a null acceptance rate with 5 or more offers as 100 % too", () => {
    const ranked = rankCandidates(
      [
        candidate("x", { acceptanceRateBp: 9999 }),
        candidate("y", { acceptanceRateBp: null, offers90d: 50 }),
      ],
      null,
    );
    expect(ids(ranked)).toEqual(["y", "x"]);
  });

  it("orders outside the band by rating, descending", () => {
    const ranked = rankCandidates(
      [
        candidate("top", { ratingBp: 10_000 }),
        candidate("low", { ratingBp: 7000, acceptanceRateBp: 10_000 }),
        candidate("mid", { ratingBp: 8000 }),
      ],
      null,
    );
    expect(ids(ranked)).toEqual(["top", "mid", "low"]);
  });

  it("breaks a tie on rating, acceptance and payout by the oldest last offer, never offered first", () => {
    const ranked = rankCandidates(
      [
        candidate("recent", {
          lastOfferedAt: new Date("2026-10-14T10:00:00Z"),
        }),
        candidate("never", { lastOfferedAt: null }),
        candidate("older", { lastOfferedAt: new Date("2026-10-01T10:00:00Z") }),
      ],
      null,
    );
    expect(ids(ranked)).toEqual(["never", "older", "recent"]);
  });

  it("lets the partner id decide between two candidates tied on every key", () => {
    const tied = [candidate("p-b"), candidate("p-a")];
    expect(ids(rankCandidates(tied, null))).toEqual(["p-a", "p-b"]);
    expect(ids(rankCandidates([...tied].reverse(), null))).toEqual([
      "p-a",
      "p-b",
    ]);
  });

  it("returns nothing for no candidates", () => {
    expect(rankCandidates([], null)).toEqual([]);
    expect(rankCandidates([], "a")).toEqual([]);
  });
});

describe("rankCandidates with the owner (T-50, AC-50)", () => {
  // O is worst on every key: out of the band, lowest rating, highest payout, latest offer.
  const worstOwner = candidate("o", {
    ratingBp: 5000,
    acceptanceRateBp: 3000,
    payout: { minor: 9999, currency: "PLN" },
    lastOfferedAt: new Date("2026-10-14T10:00:00Z"),
  });
  const withOwner = [...FIVE, worstOwner];

  it("puts the owner first and the five in AC-3's order behind it", () => {
    expect(ids(rankCandidates(withOwner, "o"))).toEqual(["o", ...FIVE_ORDER]);
  });

  it("is AC-3's order with no owner, and with an id that is not a candidate", () => {
    expect(ids(rankCandidates(withOwner, null))).toEqual([...FIVE_ORDER, "o"]);
    expect(ids(rankCandidates(withOwner, "not-a-candidate"))).toEqual([
      ...FIVE_ORDER,
      "o",
    ]);
    expect(ids(rankCandidates(FIVE, "not-a-candidate"))).toEqual(FIVE_ORDER);
  });

  it("computes the band over the others alone: an owner with the best rating moves nobody", () => {
    const bestOwner = candidate("o", { ratingBp: 10_000 });
    expect(ids(rankCandidates([...FIVE, bestOwner], "o"))).toEqual([
      "o",
      ...FIVE_ORDER,
    ]);
  });
});

/* -------------------------------------------------------------------------- */

describe("ownerOfOrder (T-51, AC-51)", () => {
  const product = (productId: string): RoutingLine => ({
    kind: "product",
    productId,
    tierKey: null,
    qty: 1,
  });
  const addon: RoutingLine = { kind: "addon", addonId: "addon-card", qty: 1 };
  const P_A = "p-owned-by-a";
  const P_A2 = "p-also-owned-by-a";
  const P_B = "p-owned-by-b";
  const P_NONE = "p-no-origin";
  const origins = new Map([
    [P_A, "florist-a"],
    [P_A2, "florist-a"],
    [P_B, "florist-b"],
  ]);

  it.each([
    ["one line owned by A", [product(P_A)], "florist-a"],
    ["two lines both owned by A", [product(P_A), product(P_A2)], "florist-a"],
    ["a product with no origin row", [product(P_NONE)], null],
    ["lines owned by A and by B", [product(P_A), product(P_B)], null],
    [
      "a line owned by A and one with no origin",
      [product(P_A), product(P_NONE)],
      null,
    ],
    ["a line owned by A plus an add-on", [product(P_A), addon], "florist-a"],
    ["add-ons only", [addon], null],
  ] as const)("%s", (_name, lines, expected) => {
    expect(ownerOfOrder(lines, origins)).toBe(expected);
  });
});

/* -------------------------------------------------------------------------- */

describe("canServe (T-27, AC-27)", () => {
  const order = {
    mode: "live" as const,
    postcodeZoneId: ZONE,
    cityId: CITY,
    deliveryDate: "2026-10-17",
    lines: LIVE_ORDER.lines,
  };

  describe.each([
    ["live", "active"],
    ["test", "demo"],
  ] as const)("a %s order and %s florists", (mode, status) => {
    const covering = partner("p-cover", { status });
    const elsewhere = partner("p-elsewhere", {
      status,
      coverage: [
        { cityId: OTHER_CITY, postcodeZoneId: null, capacityPerDay: null },
      ],
    });
    const full = partner("p-full", { status, loadOnDate: 5 });
    const cannotMake = partner("p-cannot", { status, catalog: [] });
    const wrongMode = partner("p-wrong-mode", {
      status: status === "active" ? "demo" : "active",
    });

    it("is ok when one covering partner can take it", () => {
      expect(
        servability({ ...order, mode }, [elsewhere, full, covering], SIGN_IN),
      ).toEqual({
        ok: true,
      });
    });

    it("is no_coverage for a postcode no eligible partner covers", () => {
      expect(
        servability(
          { ...order, mode },
          [elsewhere, cannotMake, wrongMode],
          SIGN_IN,
        ),
      ).toEqual({
        ok: false,
        reason: "no_coverage",
      });
      expect(servability({ ...order, mode }, [], SIGN_IN)).toEqual({
        ok: false,
        reason: "no_coverage",
      });
    });

    it("is no_capacity when every covering partner is full that date", () => {
      expect(
        servability({ ...order, mode }, [elsewhere, full], SIGN_IN),
      ).toEqual({
        ok: false,
        reason: "no_capacity",
      });
    });
  });

  const reader = (partners: readonly RoutingPartner[]): CoverageReader => ({
    postcodeZoneId: (_country, postcode) =>
      Promise.resolve(postcode.startsWith("31") ? ZONE : null),
    partnersFor: () => Promise.resolve(partners),
  });
  const input = {
    countryIso2: "PL",
    postcode: "31-000",
    cityId: null,
    deliveryDate: "2026-10-17",
    lines: LIVE_ORDER.lines,
    mode: "live" as const,
  };
  const zoneCovering = partner("p-zone", {
    coverage: [{ cityId: null, postcodeZoneId: ZONE, capacityPerDay: null }],
  });

  it("accepts a null cityId and matches by postcode zone alone", async () => {
    const canServe = createCanServe(reader([zoneCovering]), SIGN_IN);
    await expect(canServe(input)).resolves.toEqual({ ok: true });
    await expect(canServe({ ...input, postcode: "80-000" })).resolves.toEqual({
      ok: false,
      reason: "no_coverage",
    });
  });

  it("refuses a demo order and a malformed input at the boundary, and passes a reader failure on", async () => {
    const canServe = createCanServe(reader([zoneCovering]), SIGN_IN);
    await expect(
      canServe({ ...input, mode: "demo" as never }),
    ).rejects.toThrow();
    await expect(canServe({ ...input, postcode: " " })).rejects.toThrow();
    const failing = createCanServe(
      {
        ...reader([]),
        partnersFor: () => Promise.reject(new Error("db down")),
      },
      SIGN_IN,
    );
    await expect(failing(input)).rejects.toThrow("db down");
  });
});
