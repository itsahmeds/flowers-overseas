/**
 * The checkout's one decision (spec 010 §5.2's table, AC-1 / T-01, AC-2's mode half, AC-4 / T-04,
 * AC-8's closed half; TASK-200).
 *
 *  - **T-01, the table.** Every combination of the ten inputs (7 680 of them) against an oracle
 *    that is §5.2's table transcribed row by row (first matching row wins), plus AC-8's generic
 *    address-format row. The oracle is written as data, not as the branch structure of
 *    `checkoutMode()`, so a reordered or dropped branch disagrees with it somewhere.
 *  - **T-01, the grep.** No file outside `src/modules/checkout/mode.ts` and the allow-list of
 *    ruling R5 (decisions log 2026-10-05) reads `checkout.demo_guard`, `checkout.open` or a Stripe
 *    key's kind.
 *  - **T-04.** With the guard off and a live destination, each of the seven terms of AC-4
 *    (company, privacy page, terms, cancellation, reviewed legal keys, confirmation email, live
 *    payment step) made false in turn gives `closed`; all true gives `live`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { deploymentEnvironments } from "../../src/lib/env.schema.ts";
import { pickerStates } from "../../src/modules/geo/index.ts";
import {
  type CheckoutMode,
  type CheckoutModeInputs,
  type LegalReadinessSources,
  type LegalReadinessTerm,
  PHASE_0_LEGAL_SOURCES,
  addressFormatKinds,
  checkoutEntryFor,
  checkoutMode,
  legalReadiness,
  legalReadinessReport,
  legalReadinessTerms,
  legalRegimeFor,
  stripeKeyKind,
  stripeKeyKinds,
} from "../../src/modules/checkout/index.ts";

const repoRoot = resolve(import.meta.dirname, "../..");

/* -------------------------------------------------------------------------- */
/* T-01: the table                                                             */
/* -------------------------------------------------------------------------- */

type Row = {
  readonly name: string;
  readonly when: (inputs: CheckoutModeInputs) => boolean;
  readonly mode: CheckoutMode;
};

/** The test step's column of §5.2: "registered · on · `sk_test_` · not production". */
const testColumn = (i: CheckoutModeInputs): boolean =>
  i.testStepRegistered &&
  i.stripeFlag &&
  i.stripeKeyKind === "test" &&
  i.appEnv !== "production";

/** §5.2's table, one entry per row, in the table's order, plus AC-8's precondition. */
const TABLE: readonly Row[] = [
  { name: "open off", when: (i) => !i.countryCheckoutOpen, mode: "closed" },
  {
    name: "AC-8 generic format",
    when: (i) => i.addressFormat === "generic",
    mode: "closed",
  },
  {
    name: "unavailable",
    when: (i) => i.pickerState === "unavailable",
    mode: "closed",
  },
  {
    name: "guard on, no test column",
    when: (i) => i.demoGuard && !testColumn(i),
    mode: "demo",
  },
  {
    name: "guard on, test column",
    when: (i) => i.demoGuard && testColumn(i),
    mode: "test",
  },
  {
    name: "preview, guard off",
    when: (i) => i.pickerState === "preview" && !i.demoGuard,
    mode: "closed",
  },
  {
    name: "live, guard off, a precondition false",
    when: (i) =>
      i.pickerState === "live" &&
      !i.demoGuard &&
      !(i.legalReady && i.liveStepRegistered),
    mode: "closed",
  },
  {
    name: "live, guard off, all true",
    when: (i) =>
      i.pickerState === "live" &&
      !i.demoGuard &&
      i.legalReady &&
      i.liveStepRegistered,
    mode: "live",
  },
];

function oracle(inputs: CheckoutModeInputs): CheckoutMode {
  const row = TABLE.find((candidate) => candidate.when(inputs));
  if (row === undefined) throw new Error("the table has no row for this case");
  return row.mode;
}

const BOOLS = [false, true] as const;

function* everyCombination(): Generator<CheckoutModeInputs> {
  for (const countryCheckoutOpen of BOOLS)
    for (const addressFormat of addressFormatKinds)
      for (const pickerState of pickerStates)
        for (const demoGuard of BOOLS)
          for (const testStepRegistered of BOOLS)
            for (const stripeFlag of BOOLS)
              for (const kind of stripeKeyKinds)
                for (const appEnv of deploymentEnvironments)
                  for (const legalReady of BOOLS)
                    for (const liveStepRegistered of BOOLS)
                      yield {
                        countryCheckoutOpen,
                        addressFormat,
                        pickerState,
                        demoGuard,
                        testStepRegistered,
                        stripeFlag,
                        stripeKeyKind: kind,
                        appEnv,
                        legalReady,
                        liveStepRegistered,
                      };
}

/** Phase 0 on staging: Poland open, a preview picker, the guard on, nothing registered. */
const PHASE_0: CheckoutModeInputs = {
  countryCheckoutOpen: true,
  addressFormat: "authored",
  pickerState: "preview",
  demoGuard: true,
  testStepRegistered: false,
  stripeFlag: false,
  stripeKeyKind: "absent",
  appEnv: "staging",
  legalReady: false,
  liveStepRegistered: false,
};

describe("checkoutMode() decides every row of §5.2's table (AC-1, T-01)", () => {
  const cases = [...everyCombination()];

  it("enumerates every combination of the ten inputs", () => {
    expect(cases).toHaveLength(2 * 2 * 3 * 2 * 2 * 2 * 4 * 5 * 2 * 2);
  });

  it("returns the table's mode for every combination", () => {
    const disagreements = cases
      .filter((inputs) => checkoutMode(inputs) !== oracle(inputs))
      .slice(0, 5)
      .map((inputs) => ({
        inputs,
        got: checkoutMode(inputs),
        want: oracle(inputs),
      }));
    expect(disagreements).toEqual([]);
  });

  it("reaches every mode, so the table is not vacuously matched", () => {
    const counts = new Map<CheckoutMode, number>();
    for (const inputs of cases) {
      const mode = checkoutMode(inputs);
      counts.set(mode, (counts.get(mode) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([
      "closed",
      "demo",
      "live",
      "test",
    ]);
  });

  it("gives Phase 0 `demo`: the guard on and no test step registered", () => {
    expect(checkoutMode(PHASE_0)).toBe("demo");
  });

  it("never returns `live` while the guard is on, whatever else holds", () => {
    const guarded = cases.filter((inputs) => inputs.demoGuard);
    expect(guarded.some((inputs) => checkoutMode(inputs) === "live")).toBe(
      false,
    );
    expect(
      checkoutMode({
        ...PHASE_0,
        pickerState: "live",
        legalReady: true,
        liveStepRegistered: true,
      }),
    ).toBe("demo");
  });

  it("returns `test` only with every one of spec 013's preconditions, never in production (AC-2)", () => {
    const testing: CheckoutModeInputs = {
      ...PHASE_0,
      testStepRegistered: true,
      stripeFlag: true,
      stripeKeyKind: "test",
    };
    expect(checkoutMode(testing)).toBe("test");
    expect(checkoutMode({ ...testing, appEnv: "production" })).toBe("demo");
    expect(checkoutMode({ ...testing, testStepRegistered: false })).toBe(
      "demo",
    );
    expect(checkoutMode({ ...testing, stripeFlag: false })).toBe("demo");
    expect(checkoutMode({ ...testing, stripeKeyKind: "live" })).toBe("demo");
    expect(checkoutMode({ ...testing, stripeKeyKind: "unknown" })).toBe("demo");
    expect(checkoutMode({ ...testing, stripeKeyKind: "absent" })).toBe("demo");
  });

  it("is `closed` for a destination with only the generic address format (AC-8)", () => {
    expect(checkoutMode({ ...PHASE_0, addressFormat: "generic" })).toBe(
      "closed",
    );
  });

  it("is `closed` with `checkout.open` off and with an unavailable picker (AC-3's decision)", () => {
    expect(checkoutMode({ ...PHASE_0, countryCheckoutOpen: false })).toBe(
      "closed",
    );
    expect(checkoutMode({ ...PHASE_0, pickerState: "unavailable" })).toBe(
      "closed",
    );
  });

  it("refuses an input the table does not name", () => {
    expect(() =>
      checkoutMode({
        ...PHASE_0,
        buyerCountry: "DE",
      } as unknown as CheckoutModeInputs),
    ).toThrow();
  });
});

describe("stripeKeyKind() reads a key's prefix and nothing else", () => {
  it.each([
    [undefined, "absent"],
    ["", "absent"],
    ["   ", "absent"],
    ["sk_test_51Habc", "test"],
    ["sk_live_51Habc", "live"],
    ["pk_test_51Habc", "unknown"],
    ["rk_test_51Habc", "unknown"],
    ["SK_TEST_51Habc", "unknown"],
  ] as const)("%j → %s", (key, kind) => {
    expect(stripeKeyKind(key)).toBe(kind);
  });
});

/* -------------------------------------------------------------------------- */
/* T-01: the grep                                                              */
/* -------------------------------------------------------------------------- */

/** The one file that may read the decision's inputs. */
const DECISION_FILE = "src/modules/checkout/mode.ts";

/**
 * Ruling R5's allow-list, by path: the flag registry (TASK-219) declares the keys, the admin flags
 * page (TASK-220) toggles them, TASK-021's seed migration inserts them. None of them decides a
 * mode. Tests are outside the scanned roots altogether (their fixtures carry the key strings).
 */
const ALLOW_LIST: readonly RegExp[] = [
  /^src\/config\/feature-flags\.ts$/u,
  /^src\/app\/.*\/admin\/flags\//u,
  /^db\/migrations\/[^/]+\.sql$/u,
];

/** The code a mode could be decided in. */
const SCANNED_ROOTS = ["src", "scripts", "seed", "db"] as const;

/** The two flags, as whole keys (`checkout.openSomething` is another key), and a key's kind. */
const DECISION_INPUTS: readonly RegExp[] = [
  /checkout\.demo_guard\b/u,
  /checkout\.open\b(?![A-Za-z0-9_])/u,
  /\b[sr]k_(?:test|live)_/u,
];

function filesUnder(root: string): string[] {
  const absolute = join(repoRoot, root);
  let entries: string[];
  try {
    entries = readdirSync(absolute);
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(absolute, entry);
    if (statSync(path).isDirectory())
      files.push(...filesUnder(join(root, entry)));
    else if (/\.(?:[cm]?[jt]sx?|sql|json)$/u.test(entry))
      files.push(relative(repoRoot, path));
  }
  return files;
}

/** Every scanned file that mentions a decision input, outside the decision file. */
function readersOutsideTheDecision(): string[] {
  return SCANNED_ROOTS.flatMap(filesUnder)
    .filter((file) => file !== DECISION_FILE)
    .filter((file) => !ALLOW_LIST.some((allowed) => allowed.test(file)))
    .filter((file) => {
      const text = readFileSync(join(repoRoot, file), "utf8");
      return DECISION_INPUTS.some((pattern) => pattern.test(text));
    })
    .sort();
}

describe("only mode.ts reads the decision's inputs (AC-1, T-01, ruling R5)", () => {
  it("scans a real tree", () => {
    expect(SCANNED_ROOTS.flatMap(filesUnder).length).toBeGreaterThan(300);
  });

  it("finds the inputs in mode.ts, so the patterns are live", () => {
    const text = readFileSync(join(repoRoot, DECISION_FILE), "utf8");
    for (const pattern of DECISION_INPUTS) {
      expect(pattern.test(text), String(pattern)).toBe(true);
    }
  });

  it("finds no other reader of checkout.demo_guard, checkout.open or a Stripe key's kind", () => {
    expect(readersOutsideTheDecision()).toEqual([]);
  });

  it("does not count another key that merely starts with checkout.open", () => {
    const pattern = DECISION_INPUTS[1];
    expect(pattern?.test('"checkout.openingHours"')).toBe(false);
    expect(pattern?.test('"checkout.open"')).toBe(true);
    expect(pattern?.test("checkout.open.PL")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* T-04: legal readiness                                                       */
/* -------------------------------------------------------------------------- */

/** Every source true: the state spec 013, 017 and 041 will one day produce. */
const ALL_TRUE: LegalReadinessSources = {
  isCompanyRegistered: () => true,
  infoPageExists: () => true,
  legalDocument: () => ({ inForce: true, lawyerReviewed: true }),
  legalKeysReviewed: () => true,
  confirmationEmailRegistered: () => true,
};

/** `ALL_TRUE` with one named term made false. */
function withFalse(term: LegalReadinessTerm): LegalReadinessSources {
  switch (term) {
    case "companyRegistered":
      return { ...ALL_TRUE, isCompanyRegistered: () => false };
    case "privacyPage":
      return { ...ALL_TRUE, infoPageExists: () => false };
    case "terms":
      return {
        ...ALL_TRUE,
        legalDocument: (kind) => ({
          inForce: true,
          lawyerReviewed: kind !== "terms",
        }),
      };
    case "cancellation":
      return {
        ...ALL_TRUE,
        legalDocument: (kind) => ({
          inForce: kind !== "cancellation",
          lawyerReviewed: true,
        }),
      };
    case "legalKeysReviewed":
      return { ...ALL_TRUE, legalKeysReviewed: () => false };
    case "confirmationEmail":
      return { ...ALL_TRUE, confirmationEmailRegistered: () => false };
  }
}

/** Guard off, a live destination: the only rows where legal readiness decides anything. */
function liveModeWith(
  sources: LegalReadinessSources,
  liveStepRegistered = true,
): CheckoutMode {
  return checkoutMode({
    ...PHASE_0,
    pickerState: "live",
    demoGuard: false,
    legalReady: legalReadiness("pl", "DE", sources),
    liveStepRegistered,
  });
}

describe("legalReadiness() gates live mode term by term (AC-4, T-04)", () => {
  it("names the six legal terms of §5.2", () => {
    expect([...legalReadinessTerms]).toEqual([
      "companyRegistered",
      "privacyPage",
      "terms",
      "cancellation",
      "legalKeysReviewed",
      "confirmationEmail",
    ]);
  });

  it("is `live` only when every term and the live payment step hold", () => {
    expect(liveModeWith(ALL_TRUE)).toBe("live");
  });

  it.each(legalReadinessTerms)("is `closed` when %s is false", (term) => {
    expect(legalReadinessReport("pl", "DE", withFalse(term))[term]).toBe(false);
    expect(legalReadiness("pl", "DE", withFalse(term))).toBe(false);
    expect(liveModeWith(withFalse(term))).toBe("closed");
  });

  it("is `closed` when spec 013's live payment step is not registered", () => {
    expect(liveModeWith(ALL_TRUE, false)).toBe("closed");
  });

  it("reads the buyer's regime: uk for a GB buyer, eu for everyone else", () => {
    expect(legalRegimeFor("GB")).toBe("uk");
    expect(legalRegimeFor("PL")).toBe("eu");
    expect(legalRegimeFor("DE")).toBe("eu");
    const asked: string[] = [];
    const recording: LegalReadinessSources = {
      ...ALL_TRUE,
      legalDocument: (kind, regime) => {
        asked.push(`${kind}:${regime}`);
        return { inForce: true, lawyerReviewed: true };
      },
    };
    legalReadiness("en-gb", "GB", recording);
    legalReadiness("pl", "FR", recording);
    expect(asked).toEqual([
      "terms:uk",
      "cancellation:uk",
      "terms:eu",
      "cancellation:eu",
    ]);
  });

  it("only the UK documents decide a GB buyer's readiness", () => {
    const ukOnly: LegalReadinessSources = {
      ...ALL_TRUE,
      legalDocument: (_kind, regime) => ({
        inForce: regime === "uk",
        lawyerReviewed: regime === "uk",
      }),
    };
    expect(legalReadiness("en-gb", "GB", ukOnly)).toBe(true);
    expect(legalReadiness("en-gb", "DE", ukOnly)).toBe(false);
  });

  it("is false in Phase 0, so the live mode is unreachable without spec 013, 017 and 041", () => {
    const report = legalReadinessReport("pl", "PL", PHASE_0_LEGAL_SOURCES);
    expect(report).toEqual({
      companyRegistered: false,
      privacyPage: false,
      terms: false,
      cancellation: false,
      legalKeysReviewed: false,
      confirmationEmail: false,
    });
    expect(legalReadiness("pl", "PL")).toBe(false);
  });

  it("refuses an unknown locale or a malformed buyer country", () => {
    expect(() => legalReadiness("xx" as "pl", "PL", ALL_TRUE)).toThrow();
    expect(() => legalReadiness("pl", "pl", ALL_TRUE)).toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* checkoutEntryFor(): the product page's build-time entry                     */
/* -------------------------------------------------------------------------- */

describe("checkoutEntryFor() decides the product page's entry with no database (§5.3)", () => {
  it("offers nothing for an unavailable destination", () => {
    for (const environment of deploymentEnvironments) {
      expect(checkoutEntryFor("unavailable", { environment })).toBe("none");
    }
  });

  it("offers the demo for a preview destination in every deployment (§13 Q1: everyone)", () => {
    for (const environment of deploymentEnvironments) {
      expect(checkoutEntryFor("preview", { environment })).toBe("demo");
    }
  });

  it("offers the continue button for a live destination", () => {
    expect(checkoutEntryFor("live", { environment: "production" })).toBe(
      "continue",
    );
  });

  it("refuses an unknown picker state or environment", () => {
    expect(() =>
      checkoutEntryFor("open" as "live", { environment: "production" }),
    ).toThrow();
    expect(() =>
      checkoutEntryFor("preview", {
        environment: "prod" as "production",
      }),
    ).toThrow();
  });
});
