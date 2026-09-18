/**
 * T-24, register half (spec 004 §2 "Consent", §5.1, AC-22; TASK-050).
 *
 * `src/config/cookies.ts` is the machine cookie register: the file the settings panel
 * (TASK-051), spec 007's cookie-policy page, the RoPA and AC-22's "no cookie outside the
 * register" check all read. Three properties are worth a test rather than a review:
 *
 *  1. the **schema refuses a bad row** — a non-essential entry that claims no consent is
 *     needed, a missing purpose message key, a duplicate name, a Phase 0 row that says the
 *     *server* sets it;
 *  2. the **rows agree with the code that writes them** — `fo_locale`'s name and lifetime come
 *     from `src/modules/i18n/hints.ts`, and a register that disagreed with the writer would
 *     make the disclosure wrong rather than merely stale;
 *  3. the **prose file derives from this file** — `docs/compliance/cookie-register.md` carries a
 *     generated block, and the committed bytes must equal what the register produces
 *     (`node scripts/cookie-register.ts --write`).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONSENT_ACCEPT_MAX_AGE_SECONDS,
  CONSENT_COOKIE_NAME,
  CONSENT_REJECT_MAX_AGE_SECONDS,
  COOKIE_REGISTRY,
  CookieRegistryEntrySchema,
  CookieRegistrySchema,
  cookieRegistryEntry,
  cookiesInCategory,
  cookiesRequiringConsent,
  isRegisteredCookie,
  registeredCookieNames,
} from "../../src/config/cookies";
import {
  FO_LOCALE_COOKIE,
  FO_LOCALE_MAX_AGE,
} from "../../src/modules/i18n/hints";
import {
  GENERATED_BLOCK_END,
  GENERATED_BLOCK_START,
  renderRegisterBlock,
} from "../../scripts/cookie-register.ts";

const repoRoot = resolve(__dirname, "../..");

/** A valid row, cloned and broken per case below. */
const validEntry = {
  name: "fo_example",
  kind: "cookie",
  category: "essential",
  consentRequired: false,
  party: "first",
  writer: "browser",
  status: "declared",
  lifetime: { kind: "maxAge", seconds: 3600 },
  purposeKey: "consent.cookies.example.purpose",
  spec: "004",
  scope: "Path=/; SameSite=Lax",
} as const;

describe("the register itself (AC-22)", () => {
  it("parses at module load and carries every Phase 0 row the task names", () => {
    for (const name of [
      "fo_locale",
      // `fo_locale_suggestion_dismissed` left the register with the dismissal itself: spec 003
      // §14 A14 gave the suggestion popup two actions, both of which record `fo_locale`, so there
      // is nothing per-tab to remember (TASK-119).
      "fo_consent",
      "fo_session",
      "fo_csrf",
      "fo_currency",
      "fo_basket",
      "_ga",
      "_ga_*",
      "__stripe_mid",
      "__stripe_sid",
    ]) {
      expect(registeredCookieNames(), name).toContain(name);
    }
  });

  it("gives every entry a purpose message key and a lifetime", () => {
    for (const entry of COOKIE_REGISTRY) {
      expect(entry.purposeKey, entry.name).toMatch(
        /^consent\.cookies\.[a-z][A-Za-z0-9]*\.purpose$/,
      );
      expect(entry.lifetime.kind, entry.name).toMatch(/^(session|maxAge)$/);
    }
  });

  it("marks exactly the non-essential entries as consent-gated", () => {
    for (const entry of COOKIE_REGISTRY) {
      expect(entry.consentRequired, entry.name).toBe(
        entry.category !== "essential",
      );
    }
    expect(cookiesRequiringConsent().map((entry) => entry.name)).toEqual(
      COOKIE_REGISTRY.filter((entry) => entry.category !== "essential").map(
        (entry) => entry.name,
      ),
    );
  });

  it("sets nothing non-essential in Phase 0: every `set` row is essential and browser-written", () => {
    for (const entry of COOKIE_REGISTRY.filter(
      (candidate) => candidate.status === "set",
    )) {
      expect(entry.category, entry.name).toBe("essential");
      expect(entry.writer, entry.name).toBe("browser");
    }
    // The analytics and marketing rows exist so the disclosure is complete before the tag does
    // (spec 004 §2); none of them is set today.
    for (const entry of cookiesRequiringConsent()) {
      expect(entry.status, entry.name).toBe("declared");
    }
  });

  it("groups by category and finds an entry by name", () => {
    expect(cookiesInCategory("analytics").map((entry) => entry.name)).toEqual([
      "_ga",
      "_ga_*",
    ]);
    expect(cookieRegistryEntry("fo_consent")?.category).toBe("essential");
    expect(cookieRegistryEntry("fo_nope")).toBeUndefined();
  });

  it("matches a wildcard row on its prefix and nothing else", () => {
    expect(isRegisteredCookie("_ga_G12345")).toBe(true);
    expect(isRegisteredCookie("_ga")).toBe(true);
    expect(isRegisteredCookie("_gid")).toBe(false);
    expect(isRegisteredCookie("fo_locale")).toBe(true);
    expect(isRegisteredCookie("_vercel_jwt")).toBe(false);
  });

  it("agrees with `src/modules/i18n/hints.ts` about the cookie it declares (spec 003)", () => {
    const locale = cookieRegistryEntry(FO_LOCALE_COOKIE);
    expect(locale).toBeDefined();
    expect(locale?.spec).toBe("003");
    expect(
      locale?.lifetime.kind === "maxAge" ? locale.lifetime.seconds : undefined,
    ).toBe(FO_LOCALE_MAX_AGE);
  });

  it("exports `fo_consent`'s asymmetric lifetimes from the register, not from a literal", () => {
    const consent = cookieRegistryEntry(CONSENT_COOKIE_NAME);
    expect(consent?.lifetime.kind).toBe("maxAge");
    // 12 months on accept, 6 on reject (spec 004 §2, §8).
    expect(CONSENT_ACCEPT_MAX_AGE_SECONDS).toBe(365 * 24 * 60 * 60);
    expect(CONSENT_REJECT_MAX_AGE_SECONDS).toBe(183 * 24 * 60 * 60);
    expect(CONSENT_REJECT_MAX_AGE_SECONDS).toBeLessThan(
      CONSENT_ACCEPT_MAX_AGE_SECONDS,
    );
  });
});

describe("what the schema refuses (AC-22)", () => {
  it("accepts the valid row it is built from", () => {
    expect(CookieRegistryEntrySchema.safeParse(validEntry).success).toBe(true);
  });

  it("refuses a non-essential entry that claims consent is not required", () => {
    const result = CookieRegistryEntrySchema.safeParse({
      ...validEntry,
      category: "analytics",
      consentRequired: false,
    });
    expect(result.success).toBe(false);
  });

  it("refuses an essential entry that claims consent is required", () => {
    expect(
      CookieRegistryEntrySchema.safeParse({
        ...validEntry,
        consentRequired: true,
      }).success,
    ).toBe(false);
  });

  it("refuses a missing or malformed purpose message key", () => {
    const withoutKey: Record<string, unknown> = { ...validEntry };
    delete withoutKey["purposeKey"];
    expect(CookieRegistryEntrySchema.safeParse(withoutKey).success).toBe(false);
    expect(
      CookieRegistryEntrySchema.safeParse({
        ...validEntry,
        purposeKey: "cookies.example",
      }).success,
    ).toBe(false);
  });

  it("refuses a row the *server* sets while it is already set", () => {
    expect(
      CookieRegistryEntrySchema.safeParse({
        ...validEntry,
        status: "set",
        writer: "server",
      }).success,
    ).toBe(false);
  });

  it("refuses an unknown field, so a row cannot carry undeclared meaning", () => {
    expect(
      CookieRegistryEntrySchema.safeParse({ ...validEntry, note: "hello" })
        .success,
    ).toBe(false);
  });

  it("refuses a wildcard anywhere but at the end of a name", () => {
    expect(
      CookieRegistryEntrySchema.safeParse({ ...validEntry, name: "_ga_*_x" })
        .success,
    ).toBe(false);
  });

  it("refuses two rows with the same name", () => {
    expect(
      CookieRegistrySchema.safeParse([validEntry, validEntry]).success,
    ).toBe(false);
  });

  it("refuses a `maxAge` lifetime of zero or a session lifetime with seconds", () => {
    expect(
      CookieRegistryEntrySchema.safeParse({
        ...validEntry,
        lifetime: { kind: "maxAge", seconds: 0 },
      }).success,
    ).toBe(false);
    expect(
      CookieRegistryEntrySchema.safeParse({
        ...validEntry,
        lifetime: { kind: "session", seconds: 60 },
      }).success,
    ).toBe(false);
  });
});

describe("docs/compliance/cookie-register.md derives from this file (the PR's reconciliation)", () => {
  const doc = readFileSync(
    resolve(repoRoot, "docs/compliance/cookie-register.md"),
    "utf8",
  );

  it("carries the generated block, byte-identical to what the register renders", () => {
    const start = doc.indexOf(GENERATED_BLOCK_START);
    const end = doc.indexOf(GENERATED_BLOCK_END);
    expect(start, "generated block start marker").toBeGreaterThan(-1);
    expect(end, "generated block end marker").toBeGreaterThan(start);
    const committed = doc.slice(start, end + GENERATED_BLOCK_END.length);
    expect(committed).toBe(renderRegisterBlock(COOKIE_REGISTRY));
  });

  it("mentions every registered name in its prose, so the two tables cannot disagree", () => {
    // The **prose**, which is everything outside the generated block. Searching the whole file
    // would pass on the generated table alone, so the guard could never fail: a row added to the
    // register with no narrative would have been accepted (`/review 28` item 1).
    const start = doc.indexOf(GENERATED_BLOCK_START);
    const end = doc.indexOf(GENERATED_BLOCK_END);
    const prose =
      doc.slice(0, start) + doc.slice(end + GENERATED_BLOCK_END.length);
    expect(prose, "prose outside the generated block").not.toContain(
      GENERATED_BLOCK_START,
    );
    for (const name of registeredCookieNames()) {
      expect(prose, name).toContain(name);
    }
  });
});

describe("the compliance records this task is responsible for (spec 004 §8)", () => {
  const ropa = readFileSync(
    resolve(repoRoot, "docs/compliance/ropa.md"),
    "utf8",
  );
  const runbook = readFileSync(
    resolve(repoRoot, "docs/runbooks/analytics-consent.md"),
    "utf8",
  );

  it("has the consent-record row with its basis, article and retention", () => {
    const row = ropa.split("\n").find((line) => line.startsWith("| 3 |"));
    expect(row, "RoPA row 3 (consent records)").toBeDefined();
    expect(row).toContain("Legal obligation");
    expect(row).toContain("Art. 7(1)");
    expect(row).toContain("5 years");
    // The four fields, and the promise that nothing else is read.
    for (const field of ["`cid`", "timestamp", "analytics", "policy version"]) {
      expect(row, field).toContain(field);
    }
    for (const forbidden of ["No IP address", "no user agent", "no page URL"]) {
      expect(row, forbidden).toContain(forbidden);
    }
  });

  it("has the Google Analytics row marked inactive-until-configured", () => {
    const row = ropa.split("\n").find((line) => line.startsWith("| 4 |"));
    expect(row, "RoPA row 4 (GA4)").toBeDefined();
    expect(row).toContain("NEXT_PUBLIC_GA4_MEASUREMENT_ID");
    expect(row?.toLowerCase()).toContain("inactive");
    expect(row).toContain("Consent, Art. 6(1)(a)");
  });

  it("records that setting the env variable is a RoPA-affecting act, with the runbook", () => {
    expect(ropa).toContain("RoPA-affecting act");
    expect(ropa).toContain("docs/runbooks/analytics-consent.md");
    expect(runbook).toContain("RoPA-affecting act");
    // The runbook must put the paperwork before the variable, not after it.
    expect(runbook.indexOf("## 1. Before the variable is set")).toBeLessThan(
      runbook.indexOf("## 2. Setting it"),
    );
  });
});
