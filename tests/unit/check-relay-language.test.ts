/**
 * T-38 / AC-38 (spec 018 §7; TASK-337): `scripts/check-relay-language.ts`, the catalogue scan of
 * spec 018's buyer namespaces, also check 14 of `pnpm i18n:check`.
 *
 * The committed catalogues pass. Then each mutation T-38 names turns the scan red, at the key it
 * planted and nowhere else: "partner" in a value, "partner" in a key name, "until our florist
 * accepts" in a value, and a locale's pattern list emptied. Beside them: a §7 term dropped from a
 * list, an `en-gb` override, an exemption reaching a buyer namespace, and the CLI's exit code.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { RELAY_EXEMPT, RELAY_PATTERNS } from "../../src/config/honesty.ts";
import {
  BUYER_NAMESPACES,
  SCAN_LOCALES,
  SECTION_7_TERMS,
  keyWords,
  main,
  mergeCatalogues,
  readCatalogues,
  relayLanguageProblems,
} from "../../scripts/check-relay-language.ts";

type Catalogue = Record<string, unknown>;

const MESSAGES = resolve(process.cwd(), "messages");
const committed = readCatalogues(MESSAGES);
const raw = Object.fromEntries(
  SCAN_LOCALES.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(join(MESSAGES, `${locale}.json`), "utf8"),
    ) as Catalogue,
  ]),
) as Record<(typeof SCAN_LOCALES)[number], Catalogue>;

/** A deep copy of `catalogue` with `key` set to `value`, creating namespaces on the way. */
function withValue(
  catalogue: Catalogue,
  key: string,
  value: unknown,
): Catalogue {
  const copy = structuredClone(catalogue);
  const segments = key.split(".");
  let node: Record<string, unknown> = copy;
  for (const segment of segments.slice(0, -1)) {
    const next = node[segment];
    if (typeof next !== "object" || next === null) node[segment] = {};
    node = node[segment] as Record<string, unknown>;
  }
  node[segments.at(-1) ?? ""] = value;
  return copy;
}

/**
 * The four catalogues with `value` planted at `key` in one locale's **file**, then resolved as the
 * scan resolves them (`en`, and each other locale over it), so a key planted in `en` reaches every
 * locale that does not override it, exactly as a buyer would read it.
 */
function planted(
  locale: (typeof SCAN_LOCALES)[number],
  key: string,
  value: string,
): Partial<Record<(typeof SCAN_LOCALES)[number], Catalogue>> {
  const files = { ...raw, [locale]: withValue(raw[locale], key, value) };
  return Object.fromEntries(
    SCAN_LOCALES.map((code) => [
      code,
      code === "en" ? files.en : mergeCatalogues(files.en, files[code]),
    ]),
  );
}

const keysOf = (problems: readonly { key?: string; locale?: string }[]) =>
  problems.map((problem) => `${problem.locale ?? ""} ${problem.key ?? ""}`);

describe("the committed tree (AC-38)", () => {
  it("reads all four locales and finds nothing", () => {
    expect(Object.keys(committed).sort()).toEqual([...SCAN_LOCALES].sort());
    expect(relayLanguageProblems(committed)).toEqual([]);
  });

  it("scans exactly spec 018's eight buyer namespaces, none of them exempt", () => {
    expect(BUYER_NAMESPACES).toEqual([
      "tracking",
      "trackLookup",
      "invoice",
      "emails.account",
      "confirmation.postPurchase",
      "account",
      "auth.account",
      "privacy",
    ]);
  });
});

describe("T-38's mutations each turn the scan red, at the planted key", () => {
  it('"partner" added to a value', () => {
    const problems = relayLanguageProblems(
      planted(
        "en",
        "tracking.headline.confirmed",
        "Our partner has your order",
      ),
    );
    // No locale translates the key yet, so the English sentence reaches all four.
    expect(keysOf(problems)).toEqual([
      "en tracking.headline.confirmed",
      "en-gb tracking.headline.confirmed",
      "de tracking.headline.confirmed",
      "pl tracking.headline.confirmed",
    ]);
    expect(problems[0]?.reason).toContain("partner");
  });

  it('"partner" added to a key name', () => {
    const problems = relayLanguageProblems(
      planted(
        "pl",
        "confirmation.postPurchase.partnerLine",
        "Mamy Twoje zamówienie",
      ),
    );
    expect(keysOf(problems)).toEqual([
      "pl confirmation.postPurchase.partnerLine",
    ]);
    expect(problems[0]?.reason).toContain("key name");
  });

  it('"partner" hidden inside a camelCase key name is still a word', () => {
    expect(keyWords("noPartnerLine")).toBe("no Partner Line");
    expect(keyWords("re_route")).toBe("re route");
    const problems = relayLanguageProblems(
      planted("de", "trackLookup.noPartnerLine", "Wir haben Ihre Bestellung"),
    );
    expect(keysOf(problems)).toEqual(["de trackLookup.noPartnerLine"]);
  });

  it('"until our florist accepts" added to a value', () => {
    const problems = relayLanguageProblems(
      planted(
        "en",
        "confirmation.postPurchase.cancelLine",
        "Plans changed? You can cancel for free until our florist accepts your order.",
      ),
    );
    expect(keysOf(problems)).toContain(
      "en confirmation.postPurchase.cancelLine",
    );
    expect(problems.map((problem) => problem.reason).join(" ")).toMatch(
      /until-a-florist|accept/u,
    );
  });

  it("a locale's list emptied", () => {
    const problems = relayLanguageProblems(committed, {
      ...RELAY_PATTERNS,
      de: [],
    });
    expect(problems.map((problem) => problem.reason)).toEqual([
      "RELAY_PATTERNS.de is empty (spec 018 AC-38: the list must not be emptied)",
    ]);
  });

  it("a §7 term dropped from a list", () => {
    const problems = relayLanguageProblems(committed, {
      ...RELAY_PATTERNS,
      pl: RELAY_PATTERNS.pl.filter((pattern) => pattern.id !== "pl-oferta"),
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]?.reason).toContain("RELAY_PATTERNS.pl lacks a term");
    expect(problems[0]?.reason).toContain("ofertę");
  });

  it("each §7 probe is caught by its own list alone, so no list leans on the English", () => {
    for (const list of ["en", "de", "pl"] as const) {
      for (const probe of SECTION_7_TERMS[list]) {
        const others = { en: [], de: [], pl: [], [list]: RELAY_PATTERNS[list] };
        expect(
          relayLanguageProblems(committed, others).filter((problem) =>
            problem.reason.includes(probe),
          ),
          probe,
        ).toEqual([]);
      }
    }
  });

  it("an en-gb override is read over en", () => {
    const problems = relayLanguageProblems(
      planted(
        "en-gb",
        "tracking.cancelled.byUs",
        "No florist could deliver this order.",
      ),
    );
    expect(keysOf(problems)).toEqual(["en-gb tracking.cancelled.byUs"]);
  });

  it("a value outside the buyer namespaces is not this scan's", () => {
    expect(
      relayLanguageProblems(
        planted("en", "forFlorists.offerLine", "Accept the offer"),
      ),
    ).toEqual([]);
  });

  it("an exemption that reaches a buyer namespace is refused", () => {
    const widened = [
      ...RELAY_EXEMPT,
      { kind: "non-buyer-namespace", namespace: "tracking.", reason: "test" },
      {
        kind: "messageCase",
        key: "confirmation.postPurchase.cancelLine",
        selectCase: "other",
        text: "x",
        locales: ["en"],
        reason: "test",
      },
    ] as const;
    const problems = relayLanguageProblems(committed, RELAY_PATTERNS, widened);
    expect(problems.map((problem) => problem.key)).toEqual([
      "tracking",
      "confirmation.postPurchase",
    ]);
  });
});

describe("the CLI", () => {
  it("exits 0 on the committed tree and 1, naming the key, on a planted one", () => {
    const out: string[] = [];
    const err: string[] = [];
    const streams = {
      out: { write: (chunk: string) => out.push(chunk) },
      err: { write: (chunk: string) => err.push(chunk) },
    };
    expect(main(["--messages-dir", MESSAGES], streams)).toBe(0);
    expect(out.join("")).toContain("no relay language");

    const dir = mkdtempSync(join(tmpdir(), "relay-scan-"));
    try {
      for (const locale of SCAN_LOCALES) {
        writeFileSync(
          join(dir, `${locale}.json`),
          readFileSync(join(MESSAGES, `${locale}.json`), "utf8"),
        );
      }
      const pl = JSON.parse(
        readFileSync(join(dir, "pl.json"), "utf8"),
      ) as Catalogue;
      writeFileSync(
        join(dir, "pl.json"),
        JSON.stringify(
          withValue(pl, "invoice.title", "Faktura naszego partnera"),
        ),
      );
      expect(main(["--messages-dir", dir], streams)).toBe(1);
      expect(err.join("")).toContain("pl invoice.title");
      rmSync(join(dir, "de.json"));
      expect(main(["--messages-dir", dir], streams)).toBe(1);
      expect(err.join("")).toContain("de: has no catalogue to scan");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("merges an override over its base, objects deeply", () => {
    expect(
      mergeCatalogues({ a: { b: "1", c: "2" }, d: "3" }, { a: { c: "x" } }),
    ).toEqual({ a: { b: "1", c: "x" }, d: "3" });
  });
});
