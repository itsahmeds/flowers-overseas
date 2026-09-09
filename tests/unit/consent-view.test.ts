/**
 * T-22 (the register projection) / AC-20, and the assertion `/review 28` item 8 carried here:
 * **every `purposeKey` in `src/config/cookies.ts` resolves in the message catalogue**.
 *
 * It could not be written in TASK-050 — the `consent.*` namespace is TASK-051's and
 * `pnpm i18n:check` refuses a key nothing reads — so it lands with the panel that renders it, and
 * it runs against the **real** catalogues through the same `createTranslator` next-intl uses on
 * the server, in all four launch locales. A missing key would otherwise surface as next-intl's
 * fallback string inside a legal disclosure, which is the one place a silent fallback is
 * unacceptable.
 */
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  COOKIE_REGISTRY,
  CONSENT_ACCEPT_MAX_AGE_SECONDS,
  CONSENT_COOKIE_NAME,
  CONSENT_REJECT_MAX_AGE_SECONDS,
  cookieCategories,
  cookiesInCategory,
} from "../../src/config/cookies";
import { CONSENT_POLICY_VERSION } from "../../src/lib/consent";
import { resolveCatalogue } from "../../src/modules/i18n/messages";
import { CONSENT_REOPEN_ATTRIBUTE } from "../../src/modules/ui";
import {
  CONSENT_ENDPOINT,
  type ConsentTranslate,
  consentView,
  lifetimeLabel,
} from "../../src/modules/ui/consent/consentView";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

/**
 * The translator the Server Component uses, with the resolved catalogue of `locale` and **no**
 * fallback: `onError`/`getMessageFallback` throw, so a missing or malformed key fails this test
 * instead of rendering as `consent.cookies.ga.purpose` on a cookie disclosure.
 */
function strictTranslate(locale: string): ConsentTranslate {
  const t = createTranslator({
    locale,
    messages: resolveCatalogue(locale),
    timeZone: "UTC",
    onError: (error) => {
      throw error;
    },
    getMessageFallback: ({ key }) => {
      throw new Error(`unresolved message key \`${key}\` in \`${locale}\``);
    },
  });
  return (key, values) =>
    t(key as Parameters<typeof t>[0], values as never) as unknown as string;
}

describe("every register purposeKey resolves (`/review 28` item 8)", () => {
  for (const locale of LOCALES) {
    it(`${locale}: all ${COOKIE_REGISTRY.length} rows have purpose copy`, () => {
      const translate = strictTranslate(locale);
      for (const entry of COOKIE_REGISTRY) {
        const purpose = translate(entry.purposeKey);
        expect(purpose, `${locale} ${entry.name}`).toBeTruthy();
        // Not the key echoed back: that is what next-intl renders when a key is missing.
        expect(purpose).not.toContain(entry.purposeKey);
      }
    });
  }

  it("the register's key pattern and the catalogue's shape agree", () => {
    const catalogue = resolveCatalogue("en") as {
      consent: { cookies: Record<string, unknown> };
    };
    // Every `consent.cookies.<id>` branch belongs to a register row: a purpose we disclose for a
    // cookie nobody declared is as wrong as a row with no purpose.
    const declared = new Set(
      COOKIE_REGISTRY.map(
        (entry) => entry.purposeKey.split(".")[2] ?? entry.name,
      ),
    );
    expect(Object.keys(catalogue.consent.cookies).sort()).toEqual(
      [...declared].sort(),
    );
  });
});

describe("consentView (AC-20's projection)", () => {
  const view = consentView(strictTranslate("en"));

  it("discloses every cookie category, essential first", () => {
    expect(view.categories.map((category) => category.key)).toEqual([
      ...cookieCategories,
    ]);
  });

  it("locks the essential category and explains why", () => {
    const essential = view.categories[0];
    expect(essential?.locked).toBe(true);
    expect(essential?.lockedReason).toBeTruthy();
    for (const category of view.categories.slice(1)) {
      expect(category.locked).toBe(false);
      expect(category.lockedReason).toBeUndefined();
    }
  });

  it("lists every register entry in its category with a purpose and a lifetime", () => {
    for (const category of view.categories) {
      const rows = cookiesInCategory(category.key);
      expect(category.cookies.map((cookie) => cookie.name)).toEqual(
        rows.map((entry) => entry.name),
      );
      for (const cookie of category.cookies) {
        expect(cookie.purpose.length).toBeGreaterThan(0);
        expect(cookie.lifetime.length).toBeGreaterThan(0);
      }
    }
    // No row is left out of the panel entirely.
    expect(
      view.categories.flatMap((category) =>
        category.cookies.map((cookie) => cookie.name),
      ).length,
    ).toBe(COOKIE_REGISTRY.length);
  });

  it("says so, honestly, for a category we declare but do not use yet", () => {
    const marketing = view.categories.find(
      (category) => category.key === "marketing",
    );
    expect(marketing?.cookies).toEqual([]);
    expect(marketing?.emptyNote).toBeTruthy();
    // And a category that *has* rows gets no note, so the note cannot become boilerplate.
    expect(
      view.categories.find((category) => category.key === "essential")
        ?.emptyNote,
    ).toBeUndefined();
  });

  it("carries the register's lifetimes, the policy version and the endpoint", () => {
    expect(view.config).toEqual({
      cookieName: CONSENT_COOKIE_NAME,
      policyVersion: CONSENT_POLICY_VERSION,
      acceptMaxAgeSeconds: CONSENT_ACCEPT_MAX_AGE_SECONDS,
      rejectMaxAgeSeconds: CONSENT_REJECT_MAX_AGE_SECONDS,
      endpoint: CONSENT_ENDPOINT,
      reopenAttribute: CONSENT_REOPEN_ATTRIBUTE,
    });
  });

  it("hands over no choice at all: nothing can be pre-enabled from the server", () => {
    // AC-20's "no non-essential category is pre-enabled" is structural here: the projection has
    // no field a server could set to `true`, so the island's own `NO_CHOICES` is the only default.
    expect(JSON.stringify(view)).not.toContain('"checked"');
    expect(Object.keys(view).sort()).toEqual([
      "categories",
      "config",
      "strings",
    ]);
  });

  it("renders every string non-empty in all four locales", () => {
    for (const locale of LOCALES) {
      const localised = consentView(strictTranslate(locale));
      for (const [name, value] of Object.entries(localised.strings)) {
        expect(value.length, `${locale} ${name}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("lifetimeLabel (no `Intl` call: ICU plurals only, §7)", () => {
  const translate = strictTranslate("en");

  it("names a session, minutes under a day, and days above it", () => {
    expect(
      lifetimeLabel(
        { ...COOKIE_REGISTRY[0]!, lifetime: { kind: "session" } },
        translate,
      ),
    ).toBe("This visit only");
    expect(
      lifetimeLabel(
        {
          ...COOKIE_REGISTRY[0]!,
          lifetime: { kind: "maxAge", seconds: 1800 },
        },
        translate,
      ),
    ).toBe("30 minutes");
    expect(
      lifetimeLabel(
        {
          ...COOKIE_REGISTRY[0]!,
          lifetime: { kind: "maxAge", seconds: 86_400 },
        },
        translate,
      ),
    ).toBe("1 day");
    expect(
      lifetimeLabel(
        {
          ...COOKIE_REGISTRY[0]!,
          lifetime: { kind: "maxAge", seconds: 365 * 86_400 },
        },
        translate,
      ),
    ).toBe("365 days");
  });

  it("never rounds a real lifetime down to zero", () => {
    expect(
      lifetimeLabel(
        { ...COOKIE_REGISTRY[0]!, lifetime: { kind: "maxAge", seconds: 5 } },
        translate,
      ),
    ).toBe("1 minute");
  });

  it("discloses the acceptance lifetime for `fo_consent`, not the refusal one", () => {
    // The shorter `secondsOnReject` is a property of the write, not of the disclosure; the copy
    // of `consent.cookies.consent.purpose` states both.
    const consentRow = COOKIE_REGISTRY.find(
      (entry) => entry.name === CONSENT_COOKIE_NAME,
    )!;
    expect(lifetimeLabel(consentRow, translate)).toBe("365 days");
    expect(translate("consent.cookies.consent.purpose")).toContain("6 months");
  });
});

describe("the endpoint the island posts to is the route that answers", () => {
  it("matches `src/app/api/consent/route.ts`", async () => {
    const { existsSync } = await import("node:fs");
    expect(CONSENT_ENDPOINT).toBe("/api/consent");
    expect(existsSync("src/app/api/consent/route.ts")).toBe(true);
  });
});
