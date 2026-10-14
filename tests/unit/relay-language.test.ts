/**
 * **AC-51, catalogue half** (spec 010 §14 A4.3; the relay-language check's canonical definition
 * is spec 041 §14 A-founder-2026-10-14; TASK-226).
 *
 * The founder's ruling, 2026-10-14: buyers never learn that we relay an order to a florist. This
 * file holds the check to its definition and the catalogues to the check:
 *
 *  - **The patterns.** Every pattern flags its own `mustMatch` and the whole list passes its
 *    `mustNotMatch`; the module's required positives and negatives hold; no locale's list is
 *    empty.
 *  - **The catalogues.** Every value of `messages/{en,en-gb,de,pl}.json` outside `RELAY_EXEMPT`
 *    gives no match. Key names are not read (the orchestrator's ruling: `noPartner` is a name,
 *    and its text is clean). A phrase planted into any one key of any one locale is found, and
 *    only there.
 *  - **The approved copy.** The four `en` texts the founder approved on 2026-10-14 (and the em
 *    dash fix) are the catalogue's values byte for byte, shipped `reviewed: false`; `de` and `pl`
 *    carry unreviewed machine drafts that are not the English; the fourteen guide FAQ answers
 *    read the approved sentence with their country.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  RELAY_EXEMPT,
  RELAY_PATTERNS,
  type RelayExemption,
  type RelayLocale,
  relayExemptKey,
  relayMatches,
  withoutDecidedStrings,
} from "../../src/config/honesty.ts";
import { MessageMetaManifestSchema } from "../../src/modules/i18n/schemas.ts";
import { corridorCopy } from "../support/forbidden-phrases.ts";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;
type Locale = (typeof LOCALES)[number];
const EM_DASH = "—";
const PLANTED = "until our florist accepts your order";

type Catalogue = Record<string, unknown>;

function readMessages(file: string): Catalogue {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "messages", file), "utf8"),
  ) as Catalogue;
}

/** Every string leaf of a catalogue, with its dotted key. */
function leaves(value: unknown, path = ""): readonly [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      leaves(item, path === "" ? key : `${path}.${key}`),
    );
  }
  return [];
}

/** The value at a dotted key, or `undefined`. */
function at(catalogue: unknown, key: string): unknown {
  let value: unknown = catalogue;
  for (const segment of key.split(".")) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

/** A deep copy with `key` set to `value`. */
function withValue(
  catalogue: Catalogue,
  key: string,
  value: string,
): Catalogue {
  const copy = structuredClone(catalogue);
  const segments = key.split(".");
  let node = copy as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) {
    node = node[segment] as Record<string, unknown>;
  }
  node[segments.at(-1) ?? ""] = value;
  return copy;
}

/** `locale › key › pattern` for every relay match in a catalogue, outside `RELAY_EXEMPT`. */
function catalogueFindings(
  locale: Locale,
  catalogue: Catalogue,
  exempt: readonly RelayExemption[] = RELAY_EXEMPT,
): readonly string[] {
  return leaves(catalogue)
    .filter(([key]) => !relayExemptKey(key, exempt))
    .flatMap(([key, value]) =>
      relayMatches(
        withoutDecidedStrings(value, locale, key, exempt),
        locale,
      ).map((match) => `${locale} › ${key} › ${match.id}`),
    );
}

const CATALOGUES: Readonly<Record<Locale, Catalogue>> = {
  en: readMessages("en.json"),
  "en-gb": readMessages("en-gb.json"),
  de: readMessages("de.json"),
  pl: readMessages("pl.json"),
};

describe("RELAY_PATTERNS: each pattern holds to its own sentences (spec 041 §14 A-founder-2026-10-14)", () => {
  for (const locale of [
    "en",
    "de",
    "pl",
  ] as const satisfies readonly RelayLocale[]) {
    it(`\`${locale}\`'s list is not empty`, () => {
      expect(RELAY_PATTERNS[locale].length).toBeGreaterThan(0);
    });

    for (const pattern of RELAY_PATTERNS[locale]) {
      it(`${locale} \`${pattern.id}\` flags its mustMatch and the list passes its mustNotMatch`, () => {
        expect(
          relayMatches(pattern.mustMatch, locale).map((match) => match.id),
        ).toContain(pattern.id);
        expect(relayMatches(pattern.mustNotMatch, locale)).toEqual([]);
      });
    }
  }

  it("flags the required positives", () => {
    for (const positive of [
      "until a florist accepts",
      "our partner florist",
      "another florist",
      "Your card is held",
      "Where our florist offers a slot",
    ]) {
      expect(relayMatches(positive, "en"), positive).not.toEqual([]);
    }
  });

  it("passes the required negatives", () => {
    for (const negative of [
      "Your bank declined this card.",
      "Accept all",
      "We are not taking orders yet.",
      "Nothing was charged.",
      "our florist makes it",
      "Where a morning or afternoon slot is available",
    ]) {
      expect(relayMatches(negative, "en"), negative).toEqual([]);
    }
  });

  it("reads `en-gb` with the `en` list, case-insensitively, across a line fold", () => {
    expect(
      relayMatches("Until OUR\n florist ACCEPTS it.", "en-gb").map(
        (match) => match.id,
      ),
    ).toEqual(["until-a-florist", "accept"]);
  });

  it("keeps an in-context verb to its own sentence", () => {
    // "order" is in the first sentence and "accept" in the second: no match.
    expect(relayMatches("Your order is placed. Accept all.", "en")).toEqual([]);
    expect(
      relayMatches("Bestellung bestätigt. Alle akzeptieren.", "de"),
    ).toEqual([]);
  });
});

describe("AC-51: no buyer message value relays, in en, en-gb, de or pl", () => {
  it("reads every catalogue", () => {
    // A scan of nothing passes; these floors make an empty read red.
    expect(leaves(CATALOGUES.en).length).toBeGreaterThan(500);
    expect(leaves(CATALOGUES.de).length).toBe(leaves(CATALOGUES.en).length);
    expect(leaves(CATALOGUES.pl).length).toBe(leaves(CATALOGUES.en).length);
    expect(leaves(CATALOGUES["en-gb"]).length).toBeGreaterThan(0);
  });

  for (const locale of LOCALES) {
    it(`\`${locale}\` gives no relay match outside RELAY_EXEMPT`, () => {
      expect(catalogueFindings(locale, CATALOGUES[locale])).toEqual([]);
    });

    it(`a phrase planted into one \`${locale}\` key is found, and only there`, () => {
      const [key] = leaves(CATALOGUES[locale]).at(-1) ?? [""];
      expect(
        catalogueFindings(locale, withValue(CATALOGUES[locale], key, PLANTED)),
      ).toEqual([
        `${locale} › ${key} › until-a-florist`,
        `${locale} › ${key} › accept`,
      ]);
    });
  }

  for (const [locale, planted, id] of [
    [
      "de",
      "Kostenlos stornieren, bis unser Florist Ihre Bestellung akzeptiert.",
      "de-akzeptieren",
    ],
    [
      "pl",
      "Bezpłatne anulowanie, dopóki florysta nie zaakceptuje zamówienia.",
      "pl-zaakceptowac",
    ],
  ] as const) {
    it(`a \`${locale}\` sentence planted into one \`${locale}\` key is found with its own list`, () => {
      const [key] = leaves(CATALOGUES[locale])[0] ?? [""];
      expect(
        catalogueFindings(locale, withValue(CATALOGUES[locale], key, planted)),
      ).toEqual([`${locale} › ${key} › ${id}`]);
    });
  }

  it("exempts the one decided string and nothing broader (decisions-log 2026-10-04, spec 004 §14 A22 clause 2)", () => {
    const who = at(CATALOGUES.en, "home.sentence.who");
    expect(who).toContain("partner {my partner}");
    // Without the exemption, the who option is a match: the exemption is doing the work.
    expect(catalogueFindings("en", CATALOGUES.en, [])).toEqual([
      "en › home.sentence.who › partner",
    ]);
    // The same text under another key, a longer case, or another locale is not exempt.
    for (const [locale, key, value] of [
      ["en", "home.howItWorks.make.title", String(who)],
      [
        "en",
        "home.sentence.who",
        String(who).replace("{my partner}", "{my partner florist}"),
      ],
      ["de", "home.sentence.who", String(who)],
    ] as const) {
      expect(
        catalogueFindings(locale, withValue(CATALOGUES[locale], key, value)),
        `${locale} ${key}`,
      ).not.toEqual([]);
    }
  });

  it("lists only non-buyer surfaces, quoted records and the one decided string", () => {
    expect(
      RELAY_EXEMPT.filter((rule) => rule.kind === "decided-string"),
    ).toHaveLength(1);
    for (const rule of RELAY_EXEMPT)
      expect(rule.reason.length).toBeGreaterThan(0);
    // No buyer namespace of today's catalogues is exempt.
    expect(
      leaves(CATALOGUES.en).filter(([key]) => relayExemptKey(key)),
    ).toEqual([]);
  });
});

/** The founder's approval of 2026-10-14 ("3 ok"), and the em dash fix of the same day. */
const APPROVED = {
  "home.howItWorks.make.title": "Our florist nearby makes it that morning.",
  "corridor.facts.orderBy.none": "None yet.",
  "checkout.price.currencyLine": "You pay in {buyerCurrency}.",
  "delivery.picker.live":
    "Order by {time} in {city}, the recipient's time, not yours",
  // The second batch (founder, 2026-10-14, "R ok"; rows R2 to R24 of the brief).
  "home.proof.local.body":
    "Made by our florist, a few streets from their door.",
  "home.destinations.body":
    "We open one country at a time, and only when we can promise the same flowers and the same care.",
  "destinationsHub.intro":
    "Seven countries in Europe, and we have written a guide to every one of them: what is given, what is never given, how an address is written, and which dates matter in a year there. We write the guide first and open delivery after it. Where we are not delivering yet, this page says so in the same words on every row.",
  "corridor.steps.guide.twoBody":
    "Our florist sees the recipient's address and your card message, and nothing else about you.",
  "corridor.steps.live.twoBody":
    "Our florist sees the recipient's address and your card message, and nothing else about you.",
  "checkout.privacy.demoNotice":
    "<b>Please use sample details, not a real person's.</b> We keep what you type here for {period, select, hours24 {24 hours} other {7 days}} to show how ordering works, then we delete the personal details. {controllerLine}",
  "catalog.addon.plush.description":
    "A small, new soft toy, chosen to suit the bouquet.",
  "catalog.addon.chocolates.description":
    "A box of good chocolates, delivered with the flowers.",
  "catalog.addon.wine.description":
    "A bottle of local wine, where local law allows it.",
  "faq.photo.answer":
    "Close, not identical. Our florist works with what is fresh that morning and substitutes like for like in colour and value. Every change is noted on your delivery photo.",
  "corridor.shop.body":
    "Bouquets our florist in {country} can make, priced for {country}, with delivery and VAT already in the price.",
  "shop.category.seoDescription":
    "The {entity} our florist can make in {country}, each with one price that includes VAT and delivery. Nothing can be ordered yet.",
  "shop.root.seoDescription":
    "Every bouquet our florist can make in {country}, with one all-in price that includes VAT and delivery. Nothing can be ordered yet.",
} as const;

const hash = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

describe("the approved copy (spec 041 §14 A-founder-2026-10-14; spec 010 §14 A4.3)", () => {
  const enMeta = MessageMetaManifestSchema.parse(readMessages("en.meta.json"));

  for (const [key, text] of Object.entries(APPROVED)) {
    it(`\`${key}\` is the approved English, byte for byte, shipped unreviewed`, () => {
      expect(at(CATALOGUES.en, key)).toBe(text);
      // `en-gb` inherits it: an override would bypass the approval.
      expect(at(CATALOGUES["en-gb"], key)).toBeUndefined();
      expect(enMeta[key]?.reviewed).toBe(false);
      expect(enMeta[key]?.reviewedBy).toBeUndefined();
      expect(enMeta[key]?.sourceHash).toBe(hash(text));
    });
  }

  for (const locale of ["de", "pl"] as const) {
    it(`\`${locale}\` drafts every approved key in ${locale}, unreviewed, from the new English`, () => {
      const meta = MessageMetaManifestSchema.parse(
        readMessages(`${locale}.meta.json`),
      );
      for (const [key, text] of Object.entries(APPROVED)) {
        const value = at(CATALOGUES[locale], key);
        expect(typeof value, `${locale} ${key}`).toBe("string");
        expect(value, `${locale} ${key} is still the English`).not.toBe(text);
        expect(meta[key]?.source, `${locale} ${key}`).toBe("machine");
        expect(meta[key]?.reviewed, `${locale} ${key}`).toBe(false);
        expect(meta[key]?.sourceHash, `${locale} ${key}`).toBe(hash(text));
      }
    });
  }

  for (const locale of LOCALES) {
    it(`no approved key in \`${locale}\` carries an em dash or \`{destinationCurrency}\``, () => {
      for (const key of Object.keys(APPROVED)) {
        const value = at(CATALOGUES[locale], key);
        if (locale === "en-gb" && value === undefined) continue;
        expect(String(value), `${locale} ${key}`).not.toContain(EM_DASH);
        expect(String(value), `${locale} ${key}`).not.toContain(
          "destinationCurrency",
        );
      }
    });
  }
});

/** The guide FAQ that asks whether we deliver yet, per file, with the country as it reads. */
const COUNTRY: Readonly<Record<string, string>> = {
  de: "Germany",
  es: "Spain",
  fr: "France",
  it: "Italy",
  nl: "the Netherlands",
  pl: "Poland",
  ro: "Romania",
};

describe("the fourteen guide FAQ answers (founder, 2026-10-14)", () => {
  const answers = corridorCopy().filter(({ id }) =>
    /› faq › .*(?:today|now|at the moment)\?$/u.test(id),
  );

  it("finds one such question in each of the fourteen guides", () => {
    expect(new Set(answers.map(({ id }) => id.split(" › ")[0])).size).toBe(14);
  });

  for (const answer of answers) {
    const file = answer.id.split(" › ")[0] ?? "";
    const iso = /\/([a-z]{2})-guide\.md$/u.exec(file)?.[1] ?? "";
    // `corridorCopy()` names the question and gives the answer as an item's last leaf.
    it(`${file} answers with the approved sentence for ${COUNTRY[iso] ?? "?"}`, () => {
      const texts = corridorCopy()
        .filter(({ id }) => id === answer.id)
        .map(({ text }) => text);
      expect(texts).toContain(
        `Not yet. Ordering for ${COUNTRY[iso] ?? "?"} is not open. When it opens, this page shows the delivery days and the order-by time.`,
      );
    });
  }
});
