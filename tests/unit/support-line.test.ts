/**
 * T-36's unit half and AC-12's amended last sentence (spec 041 §14 A-founder-2026-10-14d clause 1
 * and clause 3; TASK-238).
 *
 *  - `company.support.hours` resolves to exactly "Message us on WhatsApp. We reply the same day."
 *    in `en` and in `en-gb` (which inherits it), and the `en` record is `reviewed: false` until the
 *    founder's own `record-approval` run (spec 003 §14 A17 clause 5). `de` and `pl` carry drafts
 *    with A15 clause 2's meta.
 *  - No value in any `messages/*.json` contains "24/7", and none still says "Mon–Sat 8–20".
 *  - The help channel's one link target is `https://wa.me/` plus the E.164 number without its
 *    `+`, with no query string and never `tel:`.
 *
 * Red when "24/7" is restored to one value in one locale, and when the target gains `tel:` or a
 * `?text=`.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { COMPANY, whatsappHref } from "../../src/config/company.ts";
import { loadMessages } from "../../src/modules/i18n";

const SUPPORT_LINE = "Message us on WhatsApp. We reply the same day.";
const messagesDir = resolve(__dirname, "../../messages");

/** Every string leaf of a catalogue, with its dot path. */
function leaves(tree: unknown, prefix = ""): [string, string][] {
  if (typeof tree === "string") return [[prefix, tree]];
  if (typeof tree !== "object" || tree === null) return [];
  return Object.entries(tree).flatMap(([key, value]) =>
    leaves(value, prefix === "" ? key : `${prefix}.${key}`),
  );
}

const catalogueFiles = readdirSync(messagesDir).filter(
  (file) => file.endsWith(".json") && !file.endsWith(".meta.json"),
);

function meta(locale: string): Record<string, Record<string, unknown>> {
  return JSON.parse(
    readFileSync(resolve(messagesDir, `${locale}.meta.json`), "utf8"),
  ) as Record<string, Record<string, unknown>>;
}

describe("the support line (AC-12 as amended, T-36)", () => {
  it("reads exactly the ruled line in `en` and `en-gb`", () => {
    for (const locale of ["en", "en-gb"]) {
      const company = loadMessages(locale, ["company"])["company"] as {
        support: { hours: string };
      };
      expect(company.support.hours, locale).toBe(SUPPORT_LINE);
    }
  });

  it("ships the `en` value unreviewed, and `de`/`pl` as machine drafts of it", () => {
    const hash = createHash("sha256").update(SUPPORT_LINE).digest("hex");
    expect(meta("en")["company.support.hours"]).toEqual({
      source: "human",
      reviewed: false,
      sourceHash: hash,
    });
    for (const locale of ["de", "pl"]) {
      expect(meta(locale)["company.support.hours"], locale).toEqual({
        source: "machine",
        reviewed: false,
        sourceHash: hash,
      });
    }
  });

  it("scans every catalogue: no value says 24/7 or Mon–Sat 8–20", () => {
    expect(catalogueFiles.toSorted()).toEqual([
      "de.json",
      "en-gb.json",
      "en.json",
      "pl.json",
    ]);
    for (const file of catalogueFiles) {
      const values = leaves(
        JSON.parse(readFileSync(resolve(messagesDir, file), "utf8")),
      );
      expect(values.length, file).toBeGreaterThan(0);
      expect(
        values.filter(([, value]) => value.includes("24/7")),
        file,
      ).toEqual([]);
      expect(
        values.filter(([, value]) => value.includes("Mon–Sat 8–20")),
        file,
      ).toEqual([]);
    }
  });
});

describe("the help channel's link target (AC-34)", () => {
  it("is wa.me and the number without its plus, with no query and never tel:", () => {
    expect(COMPANY.contact.phoneE164).toBe("+12135925150");
    expect(whatsappHref(COMPANY.contact)).toBe("https://wa.me/12135925150");
  });
});
