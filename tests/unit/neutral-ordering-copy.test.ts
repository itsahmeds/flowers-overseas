/**
 * **T-40 for N1–N7 and the unit half of T-47** (spec 004 §14 A23 clause 12, open item (vii),
 * AC-37's phrase bullet, AC-38; TASK-193).
 *
 * Founder, 2026-10-05: "approve the wording just no em dash". Nothing on the site may imply we
 * have no florists yet, so the seven strings below replace the "still choosing florists" wording,
 * and the "first florist" line in the notice bar is gone with its keys.
 *
 *  - **T-40.** Each N id's `en` value equals its approved text byte for byte. The implementer's
 *    commit shipped each `reviewed: false`, unattributed; the founder's own `record-approval-193.py`
 *    run (its own commit, never an agent's) attests exactly these values, so each now carries his
 *    record and the hash of the approved text. No N value in `en`, `en-gb`, `de` or `pl` carries an em dash (U+2014); the
 *    `de`/`pl` values are the drafts of the new English; `nav.utility.datesPending*` is in no
 *    catalogue and no meta sidecar.
 *  - **T-47 (unit).** Every `en`/`en-gb` catalogue value, seed copy record and corridor file is
 *    scanned for AC-37's four phrases, and the records that match equal the named exception list
 *    exactly: a match outside it is red, and so is an entry that no longer matches.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { MessageMetaManifestSchema } from "../../src/modules/i18n/schemas.ts";
import {
  PHRASE_EXCEPTIONS,
  catalogueCopy,
  corridorCopy,
  englishCopy,
  forbiddenPhrasesIn,
  phraseMatches,
  seedCopy,
} from "../support/forbidden-phrases.ts";

/** Spec 004 §14 A23 clause 12's table, verbatim. */
const APPROVED = {
  N1: [
    "shop.root.demoNotice",
    "Ordering opens soon. Every price here is the price you will pay, with VAT and delivery included.",
  ],
  N2: [
    "product.demo.body",
    "When ordering opens, this is the price you will pay. Nothing is added at a later step.",
  ],
  N3: [
    "delivery.picker.unavailable",
    "Delivery dates for {country} open when ordering does.",
  ],
  N4: [
    "corridor.facts.delivering.none",
    "Not yet. This page will say so the day we start delivering in {country}.",
  ],
  N5: [
    "corridor.coverage.bodyNone",
    "We are not delivering in {country} yet, so this page lists no towns.",
  ],
  N6: [
    "categoryHub.destinationPending",
    "No page yet. This becomes a link the day we start delivering here.",
  ],
  N7: [
    "catalog.availability.noPartner",
    "We do not deliver to this destination yet.",
  ],
} as const;

const REMOVED = ["nav.utility.datesPending", "nav.utility.datesPendingShort"];
const EM_DASH = "—";

function readMessages(file: string): unknown {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "messages", file), "utf8"),
  ) as unknown;
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

describe("T-40: the neutral copy batch N1–N7 (AC-38)", () => {
  const en = readMessages("en.json");
  const enMeta = MessageMetaManifestSchema.parse(readMessages("en.meta.json"));

  for (const [id, [key, text]] of Object.entries(APPROVED)) {
    it(`${id} \`${key}\` is the approved English, byte for byte, attested by the founder's run`, () => {
      expect(at(en, key)).toBe(text);
      // The founder's record-approval run is the only attestation, and it is of this value.
      expect(enMeta[key]?.reviewed).toBe(true);
      expect(enMeta[key]?.reviewedBy).toMatch(
        /^founder, 2026-10-05: ran record-approval-193\.py /u,
      );
      expect(enMeta[key]?.reviewedAt).toBe("2026-10-05T06:22:50Z");
      expect(enMeta[key]?.sourceHash).toBe(
        createHash("sha256").update(text).digest("hex"),
      );
    });
  }

  for (const locale of ["en", "en-gb", "de", "pl"] as const) {
    it(`no N value in \`${locale}\` carries an em dash`, () => {
      const catalogue = readMessages(`${locale}.json`);
      for (const [id, [key]] of Object.entries(APPROVED)) {
        const value = at(catalogue, key);
        // `en-gb` inherits every N key; an override would have to obey the same rule.
        if (locale === "en-gb" && value === undefined) continue;
        expect(typeof value, `${locale} ${id}`).toBe("string");
        expect(String(value), `${locale} ${id}`).not.toContain(EM_DASH);
      }
    });
  }

  for (const locale of ["de", "pl"] as const) {
    it(`\`${locale}\` drafts N1–N7 from the new English, unreviewed`, () => {
      const catalogue = readMessages(`${locale}.json`);
      const meta = MessageMetaManifestSchema.parse(
        readMessages(`${locale}.meta.json`),
      );
      for (const [id, [key, text]] of Object.entries(APPROVED)) {
        // The Phase 0 provider echoes the English (spec 003 §14 A15); its hash records the source.
        expect(at(catalogue, key), `${locale} ${id}`).toBe(text);
        expect(meta[key]?.reviewed, `${locale} ${id}`).toBe(false);
        expect(meta[key]?.sourceHash, `${locale} ${id}`).toBe(
          createHash("sha256").update(text).digest("hex"),
        );
      }
    });
  }

  it("`nav.utility.datesPending` and `datesPendingShort` are in no catalogue and no sidecar", () => {
    for (const locale of ["en", "en-gb", "de", "pl"]) {
      const catalogue = readMessages(`${locale}.json`);
      const meta = readMessages(`${locale}.meta.json`) as Record<
        string,
        unknown
      >;
      for (const key of REMOVED) {
        expect(at(catalogue, key), `${locale} ${key}`).toBeUndefined();
        expect(Object.keys(meta), `${locale}.meta ${key}`).not.toContain(key);
      }
    }
  });
});

describe("T-47: AC-37's phrases in the English copy (unit)", () => {
  it("reads every source AC-37 names", () => {
    // A scan of nothing passes; these floors make an empty read red.
    expect(catalogueCopy().length).toBeGreaterThan(500);
    expect(seedCopy().length).toBeGreaterThan(100);
    expect(
      new Set(corridorCopy().map(({ id }) => id.split(" › ")[0])).size,
    ).toBe(14);
  });

  it("matches the phrases case-insensitively, across a line fold", () => {
    expect(forbiddenPhrasesIn("We are Still\n  Choosing florists")).toEqual([
      "still choosing",
      "choosing florists",
    ]);
    expect(forbiddenPhrasesIn("our FIRST FLORIST")).toEqual(["first florist"]);
    expect(forbiddenPhrasesIn("no florist has agreed")).toEqual(["no florist"]);
    expect(forbiddenPhrasesIn("Ordering opens soon.")).toEqual([]);
  });

  it("finds the four phrases only in the named exception list, and every entry still matches", () => {
    expect(phraseMatches(englishCopy())).toStrictEqual(
      [...PHRASE_EXCEPTIONS].sort(),
    );
  });

  it("`en/pl-guide.md`'s intro carries the founder's replacement sentence (2026-10-05, \"2–6 yes\")", () => {
    const intro = corridorCopy().filter(
      ({ id }) => id === "content/corridors/en/pl-guide.md › intro",
    );
    expect(intro).toHaveLength(1);
    expect(
      intro[0]?.text.split(
        "Ordering for Poland is not open yet, so this page makes no promise about when a bouquet would arrive.",
      ),
    ).toHaveLength(2);
  });

  it("names exactly open item (vii)'s entries, and the list never grows", () => {
    expect(PHRASE_EXCEPTIONS).toStrictEqual([
      "content/corridors/en-gb/es-guide.md › faq › Can you send flowers to Spain now?",
      "content/corridors/en-gb/fr-guide.md › faq › Can you deliver to France today?",
      "content/corridors/en-gb/pl-guide.md › faq › Can you deliver to Poland today?",
      "content/corridors/en/es-guide.md › faq › Can you send flowers to Spain now?",
      "content/corridors/en/pl-guide.md › faq › Can you deliver to Poland today?",
      "corridor.facts.orderBy.none",
    ]);
  });
});
