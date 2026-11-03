/**
 * Spec 020a AC-27, the catalogue half of T-28 (TASK-361): the admin's order-action copy lives in
 * `messages/admin/en.json` only. No public catalogue (`messages/{en,en-gb,de,pl}.json`) carries an
 * `orderActions` key or any sentence of `admin.orderActions` (reason labels, refusal lines, the
 * emails list's reasons), so nothing an admin picks or reads can reach a buyer surface by key.
 * The diff half (no public key and no file under `emails/` changed by this spec's tasks) is the
 * PR's file list, stated in its self-review.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const PUBLIC = ["en", "en-gb", "de", "pl"] as const;

function leaves(value: unknown, path: string[] = []): [string, string][] {
  if (typeof value === "string") return [[path.join("."), value]];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, [...path, key]),
  );
}

const read = (file: string): unknown =>
  JSON.parse(readFileSync(join(ROOT, "messages", file), "utf8"));

const adminCatalogue = read("admin/en.json") as {
  admin: { orderActions: unknown };
};
/** The admin's own sentences: long enough not to be a common phrase ("Other", "Payout statement"). */
const ADMIN_SENTENCES = leaves(adminCatalogue.admin.orderActions)
  .map(([, text]) => text)
  .filter((text) => text.length >= 20 && !text.includes("{"));

describe("spec 020a AC-27: the admin's order-action copy stays out of every public catalogue", () => {
  it("has admin sentences to look for", () => {
    expect(ADMIN_SENTENCES.length).toBeGreaterThan(50);
    expect(ADMIN_SENTENCES).toContain("Resent 3 times in 24 hours.");
  });

  for (const locale of PUBLIC) {
    it(`messages/${locale}.json has no orderActions key and no admin order-action sentence`, () => {
      const entries = leaves(read(`${locale}.json`));
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.filter(([key]) => key.includes("orderActions"))).toEqual(
        [],
      );
      const texts = new Set(entries.map(([, text]) => text));
      expect(ADMIN_SENTENCES.filter((sentence) => texts.has(sentence))).toEqual(
        [],
      );
    });
  }
});
