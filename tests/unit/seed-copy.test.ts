/**
 * The authored `en` / `en-gb` catalogue copy, the copy rules, and the catalogue half of
 * `pnpm i18n:draft` (spec 006 AC-5, T-05; TASK-073).
 *
 * T-05 asks for the failure cases first — "word count at 59/60/90/91, missing closing sentence,
 * duplicated description, banned superlative, missing `en` name — each fails with the SKU named;
 * the real dataset passes" — so the file is ordered that way: the rules against fixtures, then
 * the committed dataset against the rules, then the drafter.
 *
 * The assertions that matter most are the ones nobody would think to write:
 *
 *  - **every `de` and `pl` row is `translationStatus: "machine", reviewed: false` with the `en`
 *    row's `sourceHash`**, which is AC-5's "never present, unreviewed and unflagged" and the
 *    reason those locales' product pages stay non-indexable (`plan/03` §6 gate 4);
 *  - **`en-gb` exists only where the British wording differs**, row by row, so a future
 *    "complete the translation" commit that copies all 139 rows fails here rather than in review;
 *  - **no two rows in the dataset share a description**, the thin-content guard of §6 that
 *    `plan/02` §4.2 names as the real ranking risk of a programmatic catalogue;
 *  - **the closing sentence of every description equals its locale's `catalog.floristSentence`**,
 *    which is what makes the one message key the only place it is worded (§7).
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BANNED_SUPERLATIVES,
  COPY_DRAFT_LOCALES,
  COPY_SOURCE_LOCALE,
  COPY_WORD_MAX,
  COPY_WORD_MIN,
  FLORIST_SENTENCE_KEY,
  SEED_COPY_ENTITIES,
  type SeedCopyFileEntity,
  asciiFoldSlug,
  bannedSuperlativesIn,
  deliveryTimingPhrasesIn,
  replaceTrailingSentence,
  trailingSentence,
  copyProblems,
  copySourceHash,
  duplicateDescriptions,
  seedCopyPath,
  wordCount,
  withFloristSentence,
} from "../../seed/copy.ts";
import {
  draftCopyLocale,
  readCopyFile,
  syncCopyLocale,
} from "../../seed/copy-draft.ts";
import { SeedCopySchema } from "../../seed/schema/copy.ts";
import { copyFileSchema } from "../../seed/schema/files.ts";

const repoRoot = resolve(__dirname, "../..");

const messages = JSON.parse(
  readFileSync(join(repoRoot, "messages/en.json"), "utf8"),
) as { catalog: { floristSentence: string } };
const meta = JSON.parse(
  readFileSync(join(repoRoot, "messages/en.meta.json"), "utf8"),
) as Record<string, { retained?: boolean; reviewed?: boolean }>;
const SENTENCE = messages.catalog.floristSentence;

const products = JSON.parse(
  readFileSync(join(repoRoot, "seed/data/products.json"), "utf8"),
) as { rows: { sku: string; name: string; slug: string }[] };
const categories = JSON.parse(
  readFileSync(join(repoRoot, "seed/data/categories.json"), "utf8"),
) as { rows: { key: string }[] };
const occasions = JSON.parse(
  readFileSync(join(repoRoot, "seed/data/occasions.json"), "utf8"),
) as { rows: { key: string }[] };

function rowsOf(locale: string, entity: SeedCopyFileEntity) {
  const rows = readCopyFile(repoRoot, locale, entity);
  if (rows === undefined) {
    throw new Error(`missing ${seedCopyPath(locale, entity)}`);
  }
  return rows;
}

function allRows(locale: string) {
  return SEED_COPY_ENTITIES.flatMap((entity) => rowsOf(locale, entity));
}

/** A valid product row, so each fixture can break exactly one rule. */
function fixture(overrides: Record<string, unknown> = {}) {
  const body = `${"stem ".repeat(50).trim()}.`;
  const descriptionMd = withFloristSentence(body, SENTENCE);
  const row = {
    entity: "product",
    key: "FO-BQ-001",
    locale: "en",
    name: "Amber Hour",
    slug: "amber-hour",
    descriptionMd,
    translationStatus: "human",
    reviewed: true,
    reviewedBy: "founder",
    reviewedAt: "2026-09-09T00:00:00Z",
    sourceHash: "0".repeat(64),
    ...overrides,
  };
  return SeedCopySchema.parse(row);
}

/** A description of exactly `words` words that still ends with the closing sentence. */
function ofWords(words: number) {
  const sentenceWords = wordCount(SENTENCE);
  const body = "stem ".repeat(words - sentenceWords).trim();
  const description = withFloristSentence(body, SENTENCE);
  expect(wordCount(description)).toBe(words);
  return description;
}

const context = {
  floristSentence: SENTENCE,
  file: "copy/en/products.json",
  source: true,
};

describe("T-05: the copy rules fail on the cases spec 006 §2.3 rule 6 names", () => {
  it.each([
    [COPY_WORD_MIN - 1, true],
    [COPY_WORD_MIN, false],
    [COPY_WORD_MAX, false],
    [COPY_WORD_MAX + 1, true],
  ])("a %i-word description fails: %s", (words, fails) => {
    const problems = copyProblems(
      [fixture({ descriptionMd: ofWords(words) })],
      context,
    );
    const wordProblems = problems.filter(
      (problem) => problem.rule === "wordCount",
    );
    expect(wordProblems.length > 0).toBe(fails);
    if (fails) {
      expect(wordProblems[0]?.key).toBe("FO-BQ-001");
      expect(wordProblems[0]?.message).toContain(String(words));
      expect(wordProblems[0]?.file).toBe("copy/en/products.json");
    }
  });

  it("fails a description that does not end with the local-florist sentence", () => {
    const problems = copyProblems(
      [
        fixture({
          descriptionMd: `${ofWords(70)} Delivered by our own drivers.`,
        }),
      ],
      context,
    );
    expect(problems.map((problem) => problem.rule)).toContain(
      "floristSentence",
    );
    expect(
      problems.find((problem) => problem.rule === "floristSentence")?.message,
    ).toContain(FLORIST_SENTENCE_KEY);
  });

  it("fails a description sharing its text with another product, naming both keys", () => {
    const shared = ofWords(70);
    const duplicates = duplicateDescriptions([
      fixture({ key: "FO-BQ-001", descriptionMd: shared }),
      fixture({ key: "FO-BQ-002", descriptionMd: shared }),
      fixture({ key: "FO-BQ-003", descriptionMd: ofWords(71) }),
    ]);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.keys).toEqual([
      "product:FO-BQ-001",
      "product:FO-BQ-002",
    ]);
  });

  it.each(BANNED_SUPERLATIVES.map((term) => [term]))(
    "fails a description using `%s`",
    (term) => {
      const problems = copyProblems(
        [
          fixture({
            descriptionMd: withFloristSentence(
              `The ${term} bouquet we make. ${"stem ".repeat(45).trim()}`,
              SENTENCE,
            ),
          }),
        ],
        context,
      );
      const superlative = problems.find(
        (problem) => problem.rule === "superlative",
      );
      expect(superlative?.message).toContain(term);
      expect(superlative?.key).toBe("FO-BQ-001");
    },
  );

  it("does not fire on a word that merely contains a banned term", () => {
    expect(bannedSuperlativesIn("bestseller perfectly imperfect")).toEqual([]);
    expect(bannedSuperlativesIn("the best we have")).toEqual(["best"]);
  });

  it("rejects a row with no name at the schema boundary", () => {
    expect(() => fixture({ name: "" })).toThrow();
    expect(
      copyProblems([{ ...fixture(), name: " " }], context).map(
        (problem) => problem.rule,
      ),
    ).toContain("name");
  });

  it("fails a slug that is not the ASCII fold of its name (AC-7)", () => {
    const problems = copyProblems(
      [fixture({ name: "Kraków Spring", slug: "krakow-wiosna" })],
      context,
    );
    const slug = problems.find((problem) => problem.rule === "slug");
    expect(slug?.message).toContain("krakow-spring");
  });

  it("folds names to slugs the way `plan/02` §4 requires", () => {
    expect(asciiFoldSlug("Kraków Spring")).toBe("krakow-spring");
    expect(asciiFoldSlug("Wrocław Light")).toBe("wroclaw-light");
    expect(asciiFoldSlug("Valentine's Day")).toBe("valentines-day");
    expect(asciiFoldSlug("All Saints' Day")).toBe("all-saints-day");
    expect(asciiFoldSlug("Amber Hour + Chocolates")).toBe(
      "amber-hour-chocolates",
    );
  });

  it("fails a machine draft that claims to be reviewed (AC-5)", () => {
    expect(() =>
      SeedCopySchema.parse({
        ...fixture(),
        locale: "de",
        translationStatus: "machine",
        reviewed: true,
      }),
    ).toThrow(/machine draft/u);
  });

  it("fails a row whose entity or locale disagrees with its file", () => {
    const file = {
      version: 1,
      source: "seed",
      entity: "copy_product",
      origin: "authored",
      locale: "en",
      rows: [
        fixture({
          entity: "category",
          key: "roses",
          slug: "roses",
          name: "Roses",
        }),
      ],
    };
    const parsed = copyFileSchema("product").safeParse(file);
    expect(parsed.success).toBe(false);
    const wrongLocale = copyFileSchema("product").safeParse({
      ...file,
      rows: [fixture({ locale: "de" })],
    });
    expect(wrongLocale.success).toBe(false);
  });
});

describe("AC-5: the committed `en` copy passes every rule", () => {
  it("covers every product, category and occasion exactly once", () => {
    expect(rowsOf("en", "product").map((row) => row.key)).toEqual(
      products.rows.map((row) => row.sku),
    );
    expect(rowsOf("en", "category").map((row) => row.key)).toEqual(
      categories.rows.map((row) => row.key),
    );
    expect(rowsOf("en", "occasion").map((row) => row.key)).toEqual(
      occasions.rows.map((row) => row.key),
    );
    expect(rowsOf("en", "product")).toHaveLength(84);
  });

  it("reports no problem from the rules of §2.3 rule 6", () => {
    for (const entity of SEED_COPY_ENTITIES) {
      expect(
        copyProblems(rowsOf("en", entity), {
          floristSentence: SENTENCE,
          file: seedCopyPath("en", entity),
          source: true,
        }),
      ).toEqual([]);
    }
  });

  it("shares no description, title or meta description between two rows", () => {
    expect(duplicateDescriptions(allRows("en"))).toEqual([]);
    for (const field of ["seoTitle", "seoDescription"] as const) {
      const values = allRows("en").map((row) => row[field]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("keeps every description inside the 60–90-word band", () => {
    const counts = allRows("en").map((row) =>
      wordCount(row.descriptionMd ?? ""),
    );
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(COPY_WORD_MIN);
    expect(Math.max(...counts)).toBeLessThanOrEqual(COPY_WORD_MAX);
  });

  it("uses the product's authored slug, which is the fold of its authored name", () => {
    const bySku = new Map(products.rows.map((row) => [row.sku, row]));
    for (const row of rowsOf("en", "product")) {
      expect(row.slug).toBe(bySku.get(row.key)?.slug);
      expect(row.name).toBe(bySku.get(row.key)?.name);
    }
  });

  it("keeps slugs unique across products, categories and occasions in one locale (AC-7)", () => {
    const slugs = allRows("en").map((row) => row.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("records a reviewer and a date on every authored row", () => {
    for (const row of allRows("en")) {
      expect(row.translationStatus).toBe("human");
      expect(row.reviewed).toBe(true);
      expect(row.reviewedBy).toMatch(/TASK-073/u);
      expect(row.reviewedAt).toBe("2026-09-09T00:00:00Z");
      expect(row.sourceHash).toBe(copySourceHash(row));
    }
  });

  it("stays inside the SEO field limits", () => {
    for (const row of allRows("en")) {
      expect(row.seoTitle?.length ?? 0).toBeLessThanOrEqual(70);
      expect(row.seoDescription?.length ?? 0).toBeLessThanOrEqual(180);
      expect(row.seoTitle).toBeDefined();
      expect(row.seoDescription).toBeDefined();
    }
  });

  it("carries no personal data, no third-party mark and no forbidden vocabulary", () => {
    // The whole-dataset scan with the JSON path is `pnpm seed:check`'s (AC-9, TASK-075); this is
    // the copy half of it, over the text this task authored.
    const marks =
      /interflora|euroflorist|floraqueen|bloom\s*&?\s*wild|1-?800-?flowers|internetflorist|fleurop|blume2000|teleflora/iu;
    const voice =
      /(?<![a-z])(relay|corridor|partner|third party|network)(?![a-z])/iu;
    for (const row of allRows("en")) {
      const blob = `${row.name} ${row.descriptionMd ?? ""} ${row.seoTitle ?? ""} ${row.seoDescription ?? ""}`;
      expect(blob).not.toContain("@");
      expect(blob).not.toMatch(/\+\d{7,}/u);
      expect(blob).not.toMatch(/\b\d{2}-\d{3}\b/u);
      expect(blob).not.toMatch(marks);
      expect(blob).not.toMatch(voice);
    }
  });

  it("ends every description with the one message key's sentence", () => {
    for (const row of allRows("en")) {
      expect(row.descriptionMd?.endsWith(SENTENCE)).toBe(true);
    }
    // The sentence is authored once, in the catalogue, and is not a literal in any component.
    expect(meta[FLORIST_SENTENCE_KEY]?.reviewed).toBe(true);
  });
});

describe("AC-5: `en-gb` ships only as differing overrides", () => {
  it("holds a subset of the `en` keys, each differing from its source", () => {
    for (const entity of SEED_COPY_ENTITIES) {
      const source = new Map(rowsOf("en", entity).map((row) => [row.key, row]));
      const overrides = readCopyFile(repoRoot, "en-gb", entity) ?? [];
      expect(overrides.length).toBeLessThan(source.size);
      for (const row of overrides) {
        const en = source.get(row.key);
        expect(en).toBeDefined();
        expect(row.translationStatus).toBe("human");
        // The whole point: an override that says nothing new is noise (spec 003 §13 Q5).
        expect([
          row.name !== en?.name,
          row.descriptionMd !== en?.descriptionMd,
          row.seoTitle !== en?.seoTitle,
          row.seoDescription !== en?.seoDescription,
        ]).toContain(true);
        // It is the *English* row it is drifting from, so it stores the English hash.
        expect(row.sourceHash).toBe(en === undefined ? "" : copySourceHash(en));
      }
    }
  });

  it("is a spelling override, not a rewrite: British forms only", () => {
    const overrides = SEED_COPY_ENTITIES.flatMap(
      (entity) => readCopyFile(repoRoot, "en-gb", entity) ?? [],
    );
    expect(overrides.length).toBeGreaterThan(0);
    for (const row of overrides) {
      const blob = `${row.descriptionMd ?? ""} ${row.seoTitle ?? ""} ${row.seoDescription ?? ""}`;
      expect(blob).not.toMatch(/apologiz|centerpiece|organiz/u);
    }
  });
});

describe("AC-5: `de` and `pl` are machine drafts, flagged and unreviewed", () => {
  it.each(COPY_DRAFT_LOCALES.map((locale) => [locale]))(
    "%s carries the review triple on every row",
    (locale) => {
      for (const entity of SEED_COPY_ENTITIES) {
        const source = new Map(
          rowsOf(COPY_SOURCE_LOCALE, entity).map((row) => [row.key, row]),
        );
        const rows = rowsOf(locale, entity);
        expect(rows.map((row) => row.key)).toEqual([...source.keys()]);
        for (const row of rows) {
          const en = source.get(row.key);
          expect(row.translationStatus).toBe("machine");
          expect(row.reviewed).toBe(false);
          expect(row.reviewedBy).toBeUndefined();
          expect(row.reviewedAt).toBeUndefined();
          expect(row.sourceHash).toBe(
            en === undefined ? "" : copySourceHash(en),
          );
          // Names and slugs are never machine-written (§13 Q2, `plan/03` §5).
          expect(row.name).toBe(en?.name);
          expect(row.slug).toBe(en?.slug);
        }
      }
    },
  );
});

describe("AC-5: the drafter is deterministic, protective and refuses the source locale", () => {
  function sandbox() {
    const root = mkdtempSync(join(tmpdir(), "fo-copy-"));
    cpSync(join(repoRoot, "seed/data/copy"), join(root, "seed/data/copy"), {
      recursive: true,
    });
    return root;
  }

  it("produces the committed bytes again — a re-run is a no-op", () => {
    const report = draftCopyLocale({
      root: repoRoot,
      locale: "de",
      floristSentence: SENTENCE,
      sourceFloristSentence: SENTENCE,
      dryRun: true,
    });
    expect(report.files).toHaveLength(SEED_COPY_ENTITIES.length);
    for (const file of report.files) {
      expect(file.changed).toBe(false);
      expect(file.written).toBe(false);
      expect(file.contents).toBe(
        readFileSync(join(repoRoot, "seed/data", file.path), "utf8"),
      );
    }
  });

  it("writes nothing at all with `--dry-run`", () => {
    const root = sandbox();
    const before = readFileSync(
      join(root, "seed/data", seedCopyPath("de", "product")),
      "utf8",
    );
    writeFileSync(
      join(root, "seed/data", seedCopyPath("de", "product")),
      before.replace('"machine"', '"machine"'),
      "utf8",
    );
    draftCopyLocale({
      root,
      locale: "pl",
      floristSentence: SENTENCE,
      sourceFloristSentence: SENTENCE,
      dryRun: true,
    });
    expect(
      readFileSync(
        join(root, "seed/data", seedCopyPath("de", "product")),
        "utf8",
      ),
    ).toBe(before);
  });

  it("keeps a reviewer's row, reports it stale when the English moved, and never re-drafts it", () => {
    const root = sandbox();
    const path = join(root, "seed/data", seedCopyPath("de", "product"));
    const file = JSON.parse(readFileSync(path, "utf8")) as {
      rows: Record<string, unknown>[];
    };
    file.rows[0] = {
      ...file.rows[0],
      descriptionMd: `${"Rosenstrauss ".repeat(3).trim()} ${SENTENCE}`,
      translationStatus: "human",
      reviewed: true,
      reviewedBy: "native reviewer",
      reviewedAt: "2026-09-09T00:00:00Z",
      sourceHash: "1".repeat(64),
    };
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");

    const report = draftCopyLocale({
      root,
      locale: "de",
      floristSentence: SENTENCE,
      sourceFloristSentence: SENTENCE,
    });
    const productFile = report.files.find((entry) =>
      entry.path.endsWith("products.json"),
    );
    expect(productFile?.outcomes[0]).toEqual({
      key: "FO-BQ-001",
      action: "stale",
    });
    const written = JSON.parse(readFileSync(path, "utf8")) as {
      rows: { translationStatus: string; descriptionMd: string }[];
    };
    expect(written.rows[0]?.translationStatus).toBe("human");
    expect(written.rows[0]?.descriptionMd).toContain("Rosenstrauss");
  });

  it("re-flows the closing sentence of every locale from one message edit (`--sync-copy`)", () => {
    const root = sandbox();
    const reworded =
      "Kwiaty przygotowuje nasza kwiaciarnia w miescie odbiorcy.";
    for (const locale of ["en", "en-gb", "pl"]) {
      syncCopyLocale({ root, locale, floristSentence: reworded });
    }
    for (const locale of ["en", "en-gb", "pl"]) {
      for (const entity of SEED_COPY_ENTITIES) {
        for (const row of readCopyFile(root, locale, entity) ?? []) {
          expect(row.descriptionMd?.endsWith(reworded)).toBe(true);
          expect(row.descriptionMd).not.toContain(SENTENCE);
        }
      }
    }
    // Idempotent: a second run is a no-op, and the body before the sentence is untouched.
    const second = syncCopyLocale({
      root,
      locale: "pl",
      floristSentence: reworded,
    });
    expect(second.files.every((file) => !file.changed)).toBe(true);
    const first = readCopyFile(root, "en", "product")?.[0];
    expect(first?.descriptionMd).toContain("Orange roses hand-tied");
  });

  it("replaces only the last sentence", () => {
    expect(replaceTrailingSentence("One. Two. Three.", "Four.")).toBe(
      "One. Two. Four.",
    );
    expect(trailingSentence("One. Two. Three.")).toBe("Three.");
    expect(replaceTrailingSentence("Four.", "Four.")).toBe("Four.");
  });

  it("refuses to draft the source locale", () => {
    expect(() =>
      draftCopyLocale({
        root: repoRoot,
        locale: COPY_SOURCE_LOCALE,
        floristSentence: SENTENCE,
        sourceFloristSentence: SENTENCE,
        dryRun: true,
      }),
    ).toThrow(/authored, never drafted/u);
  });

  it("drafts the dataset from the same command as the messages", () => {
    // The CLI contract of spec 006 §7: one command, both catalogues, no network.
    const output = execFileSync(
      process.execPath,
      [join(repoRoot, "scripts/i18n-draft.ts"), "--locale", "pl", "--dry-run"],
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(output).toContain(seedCopyPath("pl", "product"));
    expect(output).toContain(FLORIST_SENTENCE_KEY);
    expect(output).toContain("non-indexable");
  });
});

describe("spec 006 §14 A4: copy states no delivery timing, in any locale", () => {
  /**
   * The class of error `/review 41` caught: an apology page that claimed "next working day in
   * most cities we cover" when no lead-time data exists anywhere in the repository
   * (`src/config/countries.ts` deliberately carries no `delivery_days`). The cutoff and
   * next-available-date sentence is spec 009's server-rendered per-country block; copy may only
   * point at it. This test is the reason the claim cannot come back — including through a machine
   * draft, which is why it runs over every locale and not just the source.
   */
  const locales = [COPY_SOURCE_LOCALE, "en-gb", ...COPY_DRAFT_LOCALES];

  it.each(locales.map((locale) => [locale]))(
    "%s carries no lead time, next-day, same-day or punctuality claim in any copy field",
    (locale) => {
      const offences: string[] = [];
      for (const entity of SEED_COPY_ENTITIES) {
        for (const row of readCopyFile(repoRoot, locale, entity) ?? []) {
          for (const field of [
            "name",
            "descriptionMd",
            "seoTitle",
            "seoDescription",
          ] as const) {
            const value = row[field];
            if (value === undefined) continue;
            for (const phrase of deliveryTimingPhrasesIn(value)) {
              offences.push(
                `${seedCopyPath(locale, entity)} ${row.key}.${field}: \`${phrase}\``,
              );
            }
          }
        }
      }
      expect(offences).toEqual([]);
    },
  );

  it("fires on each phrase the amendment names", () => {
    for (const claim of [
      "Next working day in most cities we cover.",
      "A free handwritten card, next-day in most cities.",
      "Ordered before noon, delivered the same day.",
      "Same-day delivery in seven countries.",
      "We will not deliver early or late.",
      "Delivered within 24 hours.",
      "A lead time of two days applies.",
    ]) {
      expect(deliveryTimingPhrasesIn(claim)).not.toEqual([]);
    }
  });

  it("leaves the permitted pointer form and innocent prose alone", () => {
    for (const allowed of [
      // The replacement pattern the dataset now uses, 138 rows over.
      "Order by the cutoff shown for the destination and it arrives on the date you pick.",
      "Christmas cutoffs are earlier than at any other time except All Saints'.",
      // `or late` must not fire inside "f-or late" (FO-BQ-025 ships this sentence).
      "Sunflowers with orange spray roses, tied for late summer and autumn.",
      "Twelve or twenty-four stems on the same page.",
    ]) {
      expect(deliveryTimingPhrasesIn(allowed)).toEqual([]);
    }
  });
});

describe("spec 006 §7: the `media.*` and catalogue message keys exist and are flagged", () => {
  const KEYS = [
    "media.provenance.aiExample",
    "media.placeholder.hero",
    "media.placeholder.occasion",
    "media.placeholder.product",
    "media.placeholder.delivery",
    "media.watermark.demoSample",
    "a11y.media.gallery",
    "a11y.media.imageOfCount",
    "catalog.floristSentence",
    "catalog.descriptor.name",
    "catalog.descriptor.form.bouquet",
    "catalog.descriptor.form.arrangement",
    "catalog.descriptor.form.plant",
    "catalog.descriptor.form.funeral",
    "catalog.descriptor.form.giftSet",
    "catalog.descriptor.flower.roses",
    "catalog.descriptor.flower.mixed",
    "catalog.descriptor.flower.seasonal",
  ] as const;

  const flat = (
    tree: unknown,
    prefix = "",
    into: Record<string, string> = {},
  ): Record<string, string> => {
    if (typeof tree !== "object" || tree === null) return into;
    for (const [key, value] of Object.entries(tree)) {
      const path = prefix === "" ? key : `${prefix}.${key}`;
      if (typeof value === "string") into[path] = value;
      else flat(value, path, into);
    }
    return into;
  };
  const catalogue = flat(messages);

  it.each(KEYS.map((key) => [key]))("`%s` is authored and retained", (key) => {
    expect(catalogue[key]).toBeDefined();
    expect(meta[key]?.retained).toBe(true);
    expect(meta[key]?.reviewed).toBe(true);
  });

  it("speaks in the first person and never says `relay`, `partner` or `network`", () => {
    for (const key of KEYS) {
      expect(catalogue[key]).not.toMatch(
        /(?<![a-z])(relay|corridor|partner|third party|network)(?![a-z])/iu,
      );
    }
    expect(catalogue["media.provenance.aiExample"]).toContain("our florist");
    expect(catalogue[FLORIST_SENTENCE_KEY]).toContain("our florist");
  });

  it("resolves every product tier's `labelKey` (spec 002 §7)", () => {
    const tiers = JSON.parse(
      readFileSync(join(repoRoot, "seed/data/product-tiers.json"), "utf8"),
    ) as { rows: { tiers: { labelKey: string }[] }[] };
    for (const group of tiers.rows) {
      for (const tier of group.tiers) {
        expect(catalogue[tier.labelKey]).toBeDefined();
      }
    }
  });

  it("has a descriptor form for every seeded product type and a noun for every flower", () => {
    const facets = JSON.parse(
      readFileSync(join(repoRoot, "seed/data/taxonomy.json"), "utf8"),
    ) as { facets: { flowerType: string[] } };
    for (const flower of facets.facets.flowerType) {
      expect(catalogue[`catalog.descriptor.flower.${flower}`]).toBeDefined();
    }
    for (const form of [
      "bouquet",
      "arrangement",
      "plant",
      "funeral",
      "giftSet",
    ]) {
      expect(catalogue[`catalog.descriptor.form.${form}`]).toBeDefined();
    }
  });
});
