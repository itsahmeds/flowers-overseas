/**
 * The `catalog` message namespace (spec 005 §7, AC-22, AC-23, T-20, T-21; TASK-067).
 *
 * Three properties, and each one is a way a price page silently breaks if it is not held:
 *
 *  1. **Every key the module can emit exists in `messages/en.json`** (AC-22). A `reasonKey` with
 *     no string renders as a raw dotted key to a buyer, which is both a WCAG 3.1.1 failure and
 *     the most embarrassing possible bug on a page asking for money. The list below is written out
 *     rather than derived from the catalogue, so adding a key to the module without adding the
 *     string fails here instead of on the page.
 *  2. **No new key is dead** (AC-22). `pnpm i18n:check` refuses an `en` key that no code in `src/`
 *     reads, and this test states which of the new keys are read where, so the one deliberate
 *     exception — `catalog.addon.allergen`, rendered by spec 009's PDP and `retained: true` in the
 *     manifest until then — is a recorded decision rather than an oversight.
 *  3. **Polish plurals are real Polish** (AC-23, T-21). `catalog.tier.stems` is the tier label of
 *     every stem-count product, and Polish has four plural categories whose `few`/`many` split
 *     depends on the *last two* digits: 22 is `few` and 25 is `many`. A `count === 1 ? … : …`
 *     ternary or an echoed English draft gets `2 łodygi` and `5 łodyg` wrong in a way no English
 *     or German test can see (`plan/03` §7). The translator is next-intl's over `loadMessages()` —
 *     the same pipeline a page uses, not a fixture catalogue.
 */
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { loadMessages } from "../../src/modules/i18n";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import en from "../../messages/en.json" with { type: "json" };
import enGb from "../../messages/en-gb.json" with { type: "json" };
import enMeta from "../../messages/en.meta.json" with { type: "json" };

const repoRoot = resolvePath(import.meta.dirname, "../..");

/** The value at a dotted key in a message tree, or `undefined`. */
function messageAt(tree: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, segment) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[segment]
          : undefined,
      tree,
    );
}

/**
 * Every key spec 005's TASK-067 row names for the `catalog` namespace, other than the generated
 * families (`catalog.facet.*`, `catalog.addon.{key}.*`) that `pnpm catalogue:check`'s `label-key`
 * mode already asserts row by row against the dataset.
 */
const KEYS = [
  "catalog.tier.stems",
  "catalog.tier.single",
  "catalog.tier.size.s",
  "catalog.tier.size.m",
  "catalog.tier.size.l",
  "catalog.price.inclusive",
  "catalog.price.from",
  "catalog.addon.allergen",
  "catalog.availability.inStock",
  "catalog.availability.outOfStock",
  "catalog.availability.countryDemo",
  "catalog.availability.noPartner",
  "catalog.availability.fxUnavailable",
  "catalog.surcharge.sunday",
  "catalog.surcharge.peakDay",
] as const;

/** The keys this task added, and the `src/` file whose literal keeps each of them alive. */
const NEW_KEYS: Readonly<Record<string, string | null>> = {
  "catalog.price.inclusive": "src/modules/catalog/pricing/project.ts",
  "catalog.price.from": "src/modules/catalog/pricing/project.ts",
  "catalog.availability.inStock": "src/modules/catalog/types.ts",
  "catalog.availability.outOfStock": "src/modules/catalog/types.ts",
  "catalog.availability.countryDemo": "src/modules/catalog/types.ts",
  "catalog.availability.noPartner": "src/modules/catalog/types.ts",
  "catalog.availability.fxUnavailable": "src/modules/catalog/types.ts",
  // Rendered by spec 009's PDP beside a food add-on; `retained: true` until that page exists,
  // which is `plan/03` §5's sanctioned escape and is asserted below.
  "catalog.addon.allergen": null,
};

describe("every key the module can emit has a string (AC-22, T-20)", () => {
  it.each(KEYS)("`%s` exists in messages/en.json", (key) => {
    expect(typeof messageAt(en, key)).toBe("string");
  });

  it("keeps each new key alive with a literal in `src/`, or marks it retained", () => {
    for (const [key, file] of Object.entries(NEW_KEYS)) {
      const record = (enMeta as Record<string, { retained?: boolean }>)[key];
      if (file === null) {
        expect(record?.retained, `${key} must be retained`).toBe(true);
        continue;
      }
      const source = readFileSync(resolvePath(repoRoot, file), "utf8");
      expect(source, `${key} is read nowhere in ${file}`).toContain(key);
    }
  });

  it("adds no `en-gb` override, because no wording is British-specific", () => {
    // `en-gb` is a *thin* override set (spec 003 §13 Q5) and `pnpm i18n:check` reports a value
    // byte-identical to the one it would inherit as redundant. "Includes VAT and delivery",
    // "Available to order" and the tier labels read the same in both Englishes, so the correct
    // number of overrides here is zero — recorded as an assertion so a future British-specific
    // wording is a deliberate change rather than a silent divergence.
    expect(Object.keys(enGb)).not.toContain("catalog");
  });

  it("says nothing about delivery timing and nothing about a partner", () => {
    // Spec 006 §14 A4: no copy in this namespace may promise a lead time we cannot honour.
    // Spec 004 §14 A5: we speak as the party delivering — "our florist", never "partner",
    // "relay" or "third party" — even where a *key* name (`noPartner`) uses the internal word.
    const banned =
      /\b(partner|relay|third party|same.?day|next.?day|within \d|\d+\s*(hours|days)|tomorrow)\b/iu;
    for (const key of KEYS) {
      const value = messageAt(en, key);
      expect(typeof value).toBe("string");
      expect(banned.test(String(value)), `${key}: ${String(value)}`).toBe(
        false,
      );
    }
  });
});

describe("`catalog.tier.stems` plurals through the real catalogue (AC-23, T-21)", () => {
  const stems = (locale: string): ((count: number) => string) => {
    const t = createTranslator({
      locale,
      messages: loadMessages(locale, MESSAGE_NAMESPACES),
    });
    return (count) => t("catalog.tier.stems", { count });
  };

  it("resolves the four Polish categories, including the last-two-digit rule", () => {
    const pl = stems("pl");
    expect(pl(1)).toBe("1 łodyga");
    expect(pl(2)).toBe("2 łodygi");
    expect(pl(5)).toBe("5 łodyg");
    expect(pl(22)).toBe("22 łodygi");
  });

  it("resolves `one`/`other` for en, en-gb and de", () => {
    const en_ = stems("en");
    expect(en_(1)).toBe("1 stem");
    expect(en_(2)).toBe("2 stems");

    // No `en-gb` override, so the key resolves through the fallback chain rather than missing.
    const gb = stems("en-gb");
    expect(gb(1)).toBe("1 stem");
    expect(gb(24)).toBe("24 stems");

    const de = stems("de");
    expect(de(1)).toBe("1 Stiel");
    expect(de(18)).toBe("18 Stiele");
  });
});

describe("the module constructs no `Intl` object (AC-23, `fo/no-adhoc-intl`)", () => {
  it("renders the VAT rate and every amount through spec 003's formatters", () => {
    const source = readFileSync(
      resolvePath(repoRoot, "src/modules/catalog/pricing/project.ts"),
      "utf8",
    );

    expect(source).toContain("formatPercentFromBasisPoints");
    expect(/new Intl\.|Intl\.[A-Z]/u.test(source)).toBe(false);
    expect(/\.toLocale[A-Z]/u.test(source)).toBe(false);
    // Nor a hand-built label: every string a caller renders is a message key.
    expect(
      /`\$\{[^}]*(?:amount|price|rate)[^}]*\}\s*(?:%|€|£|zł)/iu.test(source),
    ).toBe(false);
  });
});
