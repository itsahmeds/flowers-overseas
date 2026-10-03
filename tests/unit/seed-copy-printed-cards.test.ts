/**
 * Cards are printed, never claimed as handwritten (spec 004 §14 A21 clause 5, founder ruling
 * 2026-10-03; TASK-178).
 *
 * The seed listing copy — category and occasion intros and their meta descriptions, in every
 * locale — feeds the listing pages and their `<meta name="description">`. A claim that the card is
 * handwritten, or written out by hand, there is a promise nobody keeps. This scans every
 * translatable field of every committed copy row, in every locale directory, for the claim in
 * English, German and Polish.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const COPY_DIR = resolve(__dirname, "../../seed/data/copy");
const FIELDS = ["name", "descriptionMd", "seoTitle", "seoDescription"] as const;

/** The claim shapes: "handwritten", "hand-written", "written out by hand", and de/pl forms. */
const HANDWRITTEN =
  /hand-?written|written (?:it )?out by hand|writes it out|handgeschrieb|von hand (?:ge|ab)schreib|odręczn|przepisz\w* .*odręcz/iu;

interface CopyRow {
  readonly key: string;
  readonly locale: string;
  readonly [field: string]: unknown;
}

/** Every `{field, text}` that carries the claim, as `locale/file/key.field`. */
function handwrittenClaims(
  files: readonly {
    readonly path: string;
    readonly rows: readonly CopyRow[];
  }[],
): string[] {
  const found: string[] = [];
  for (const file of files) {
    for (const row of file.rows) {
      for (const field of FIELDS) {
        const text = row[field];
        if (typeof text === "string" && HANDWRITTEN.test(text)) {
          found.push(`${file.path}#${row.key}.${field}`);
        }
      }
    }
  }
  return found;
}

function committedCopy(): { path: string; rows: CopyRow[] }[] {
  const files: { path: string; rows: CopyRow[] }[] = [];
  for (const locale of readdirSync(COPY_DIR)) {
    for (const name of readdirSync(resolve(COPY_DIR, locale))) {
      if (!name.endsWith(".json")) continue;
      const data = JSON.parse(
        readFileSync(resolve(COPY_DIR, locale, name), "utf8"),
      ) as { rows: CopyRow[] };
      files.push({ path: `${locale}/${name}`, rows: data.rows });
    }
  }
  return files;
}

describe("seed copy never claims a handwritten card (A21 clause 5)", () => {
  it("reads every locale's category, occasion and product copy", () => {
    const files = committedCopy();
    const locales = new Set(files.map((file) => file.path.split("/")[0]));
    expect([...locales].sort()).toEqual(["de", "en", "en-gb", "pl"]);
    expect(files.map((file) => file.path)).toContain("en/categories.json");
    expect(files.map((file) => file.path)).toContain("en/occasions.json");
    expect(files.map((file) => file.path)).toContain("en-gb/categories.json");
  });

  it("finds no handwritten-card claim in any committed copy row", () => {
    expect(handwrittenClaims(committedCopy())).toEqual([]);
  });

  it.each([
    ["en", "A handwritten card is free and worth using here."],
    ["en", "A hand-written card is included."],
    ["en", "One card can carry many names, written out by hand."],
    ["de", "Eine handgeschriebene Karte ist kostenlos dabei."],
    ["de", "und wir lassen sie von Hand abschreiben."],
    ["pl", "Odręcznie napisany bilecik gratis."],
  ])("would catch the %s claim %j", (locale, text) => {
    expect(
      handwrittenClaims([
        {
          path: `${locale}/categories.json`,
          rows: [{ key: "apology", locale, descriptionMd: text }],
        },
      ]),
    ).toEqual([`${locale}/categories.json#apology.descriptionMd`]);
  });

  it("lets the printed card through", () => {
    expect(
      handwrittenClaims([
        {
          path: "en/categories.json",
          rows: [
            {
              key: "apology",
              locale: "en",
              descriptionMd: "A printed card is free and worth using here.",
            },
          ],
        },
      ]),
    ).toEqual([]);
  });
});
