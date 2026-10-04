/**
 * The founder's 2026-10-04 copy batch, pinned by exact text (decisions log, 2026-10-04: "The
 * 14-item v2 copy batch is approved … Only an exact text match may carry the attestation";
 * TASK-179, `/break` round 1 hole 3 on PR 170).
 *
 * An `en` record's `sourceHash` is the hash of its current text, so it checks only itself: a
 * reworded key with a refreshed hash keeps `reviewed: true` and the founder's name over words he
 * never read, and every catalogue check stays green (`docs/framework/gaps.md`). For this batch the
 * approved words are known, so they are written down here:
 *
 *  - every `en` key that carries the batch's attestation equals its approved string, and the set
 *    of attested keys is exactly the pinned set, so an attestation cannot move to another key;
 *  - item 11, the guide card answer's approved sentence, stands byte for byte in each of the five
 *    authored guides that answer the card question.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(resolve(repoRoot, path), "utf8"));

/** The batch's `en` strings as the founder approved them, key by key. */
const APPROVED: Readonly<Record<string, string>> = {
  "catalog.addon.card.description":
    "Your message, printed on our card and tucked into the bouquet.",
  "catalog.addon.card.name": "Printed card",
  "catalog.price.allIn": "all in",
  "catalog.price.equivalents": "about {amounts} at the rate of {date}",
  "company.support.hours":
    "Message us any time, 24/7 — we reply within a few hours.",
  "footer.signoff": "With love, from wherever you are.",
  // TASK-177 (PR 174): the home strings of the same batch, attested on `main`.
  "home.destinations.body":
    "We open each country only once we have local florists there we can stand behind.",
  "home.proof.guarantee.body":
    "If your flowers don't arrive fresh and in good condition, send us a photo within 72 hours of delivery and we'll replace them or refund you in full.",
  "home.proof.guarantee.title": "Fresh-flower promise",
  "home.sentence.frame":
    "Send flowers to <who></who> in <country></country> for <occasion></occasion>.",
  "home.sentence.heading": "Start with who it's for",
  "home.sentence.notYet": "{country} (not yet)",
  "home.sentence.who":
    "{who, select, mum {my mum} dad {my dad} grandma {my grandma} grandad {my grandad} partner {my partner} friend {a friend} other {someone I love}}",
  "nav.notice.lead": "A note from us:",
  "nav.send": "Send flowers",
  "nav.utility.guarantee": "Fresh-flower promise",
  "product.card.legend": "What should the card say?",
  "product.card.printed": "Printed on our card · included",
  "product.trust.freshness.body":
    "If your flowers don't arrive fresh and in good condition, send us a photo within 72 hours of delivery and we'll replace them or refund you in full.",
  "product.trust.freshness.title": "Fresh-flower promise",
  "shop.cardNote.heading": "Every one of these comes with a card, at no cost.",
  "shop.listing.eyebrow": "Sending to {country}",
  "shop.note.label": "A note before you choose",
  "shop.note.mark": "P.S.",
  "shop.root.tilesSubheading": "Narrow it down",
};

/** Item 11: the guide card answer's approved sentence. */
const CARD_SENTENCE =
  "We will print it on our card in whatever language you write it, exactly as you type it.";

/** The five authored guides that answer "should my card be in the local language?". */
const CARD_GUIDES = [
  "content/corridors/en/pl-guide.md",
  "content/corridors/en-gb/pl-guide.md",
  "content/corridors/en/de-guide.md",
  "content/corridors/en/fr-guide.md",
  "content/corridors/en/it-guide.md",
] as const;

const BATCH = /ok from my end/u;

function valueAt(tree: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      tree,
    );
}

describe("the 2026-10-04 founder batch carries its attestation on its exact words only", () => {
  const catalogue = readJson("messages/en.json");
  const meta = readJson("messages/en.meta.json") as Record<
    string,
    { reviewed?: boolean; reviewedBy?: string }
  >;

  it("attests exactly the pinned keys", () => {
    const attested = Object.entries(meta)
      .filter(([, record]) => BATCH.test(record.reviewedBy ?? ""))
      .map(([key]) => key)
      .sort();
    expect(attested).toEqual(Object.keys(APPROVED).sort());
  });

  it.each(Object.entries(APPROVED))(
    "`%s` is the approved string, reviewed",
    (key, approved) => {
      expect(valueAt(catalogue, key)).toBe(approved);
      expect(meta[key]?.reviewed).toBe(true);
    },
  );

  it.each(CARD_GUIDES)(
    "%s carries item 11's sentence byte for byte",
    (path) => {
      const guide = readFileSync(resolve(repoRoot, path), "utf8");
      expect(guide.split(CARD_SENTENCE)).toHaveLength(2);
    },
  );
});
