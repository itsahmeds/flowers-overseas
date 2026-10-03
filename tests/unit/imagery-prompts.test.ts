/**
 * The prompt records of `content/imagery/prompts/**` and the canonicalisation that makes their
 * hashes reproducible (spec 006 §2.4, AC-8; T-08; TASK-077).
 *
 * Two things are asserted here and they are different in kind. First, the **hash is a function of
 * the prompt and nothing else**: reordering the JSON keys, reflowing the text or recomposing a
 * `ó` must not move it, while changing a word, the model or the seed must. Second, the committed
 * prompt files **say what the style guide requires them to say** — the exclusions are in the
 * negative prompt, no person or premises is described, and the generator is the labelled
 * placeholder that `docs/compliance/imagery-generator-terms.md` was pending on; the record was
 * filed on 2026-09-18 and TASK-080 swaps the placeholder for the filed generator.
 *
 * The manifest side of the link — every asset's `promptHash` equals the hash of its record — is
 * `tests/unit/seed-media-manifest.test.ts`, where the dataset lives.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  IMAGERY_PROMPT_VERSION,
  ImageryPromptFileSchema,
  type ImageryPromptRecord,
  canonicalisePromptRecord,
  promptHash,
  promptSeed,
} from "../../seed/schema/prompts.ts";
import { PRODUCTS } from "../../src/config/catalogue/products.data.ts";

const repoRoot = resolve(__dirname, "../..");
const promptsDir = join(repoRoot, "content/imagery/prompts");

const promptFileNames = readdirSync(promptsDir).sort();

/** Every committed prompt file, parsed. A malformed file throws here, before any assertion. */
const promptFiles = promptFileNames.map((name) => ({
  name,
  file: ImageryPromptFileSchema.parse(
    JSON.parse(readFileSync(join(promptsDir, name), "utf8")),
  ),
}));

const records: ImageryPromptRecord[] = promptFiles.flatMap(
  ({ file }) => file.records,
);

/** The reference record to vary from: the first committed one, so the fixture cannot rot. */
const [reference] = records;
if (reference === undefined) {
  throw new Error("content/imagery/prompts/ holds no prompt record at all");
}

describe("canonicalisePromptRecord: the hash is a function of the prompt, not of the file", () => {
  it("ignores the order the JSON file happens to store the fields in", () => {
    const reordered = Object.fromEntries(
      Object.entries(reference).reverse(),
    ) as unknown as ImageryPromptRecord;
    expect(canonicalisePromptRecord(reordered)).toBe(
      canonicalisePromptRecord(reference),
    );
    expect(promptHash(reordered)).toBe(promptHash(reference));
  });

  it("ignores insignificant whitespace: a reflowed prompt is the same prompt", () => {
    const reflowed = {
      ...reference,
      prompt: reference.prompt.replace(/, /gu, ",\n   ").concat("  "),
    };
    expect(promptHash(reflowed)).toBe(promptHash(reference));
  });

  it("ignores CRLF, so a Windows checkout hashes what a mac checkout hashes", () => {
    expect(
      promptHash({
        ...reference,
        negativePrompt: reference.negativePrompt.replace(/, /gu, ",\r\n"),
      }),
    ).toBe(promptHash(reference));
  });

  it("normalises to NFC, so a decomposed `Kraków` is not a second prompt", () => {
    const composed = { ...reference, prompt: `${reference.prompt} Kraków.` };
    const decomposed = {
      ...reference,
      prompt: `${reference.prompt} Kraków.`.normalize("NFD"),
    };
    expect(promptHash(decomposed)).toBe(promptHash(composed));
    expect(promptHash(composed)).not.toBe(promptHash(reference));
  });

  it("ignores the parameter bag's key order, because a map has none", () => {
    const parameters = Object.fromEntries(
      Object.entries(reference.parameters).reverse(),
    );
    expect(promptHash({ ...reference, parameters })).toBe(
      promptHash(reference),
    );
  });

  const patches: [string, Partial<ImageryPromptRecord>][] = [
    ["prompt", { prompt: `${reference.prompt} One more clause.` }],
    ["generatorModel", { generatorModel: "some-other-model" }],
    ["generatorSeed", { generatorSeed: reference.generatorSeed + 1 }],
    ["assetId", { assetId: "some-other-asset" }],
    ["parameters", { parameters: { ...reference.parameters, steps: 30 } }],
  ];

  it.each(patches)("changes the hash when %s changes", (_field, patch) => {
    expect(promptHash({ ...reference, ...patch })).not.toBe(
      promptHash(reference),
    );
  });

  it("produces a lowercase hex sha256, which is what the manifest column stores", () => {
    expect(promptHash(reference)).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("is stable across processes: the canonical form is pure text, no clock and no locale", () => {
    expect(canonicalisePromptRecord(reference)).toBe(
      canonicalisePromptRecord(
        JSON.parse(JSON.stringify(reference)) as ImageryPromptRecord,
      ),
    );
  });
});

describe("promptSeed: the seed is declared, not discovered", () => {
  it("derives a stable, non-negative, unique seed per asset id", () => {
    expect(promptSeed("fo-bq-001-hero")).toBe(promptSeed("fo-bq-001-hero"));
    expect(promptSeed("fo-bq-001-hero")).not.toBe(
      promptSeed("fo-bq-001-detail"),
    );
    expect(promptSeed("fo-bq-001-hero")).toBeGreaterThanOrEqual(0);
    expect(promptSeed("fo-bq-001-hero")).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it("is the seed every committed record carries, so nobody has to remember one", () => {
    for (const record of records) {
      expect(record.generatorSeed, record.assetId).toBe(
        promptSeed(record.assetId),
      );
    }
  });
});

describe("the committed prompt files (spec 006 §2.4)", () => {
  it("holds one file per active product plus the homepage slots", () => {
    // Derived from the catalogue, not a literal. This read `toHaveLength(12)` while only the demo
    // dozen had records (TASK-080); TASK-144 added the other 72, and a hard-coded count would have
    // had to be edited every time the catalogue moved — which is a test that tracks the answer
    // instead of checking it. The catalogue is now the subject: add a product without a prompt
    // record and this fails, which is the thing worth knowing.
    const activeSkus = (
      JSON.parse(
        readFileSync(join(repoRoot, "seed/data/products.json"), "utf8"),
      ) as { rows: { sku: string; status: string }[] }
    ).rows
      .filter((row) => row.status === "active")
      .map((row) => row.sku);
    const skuFiles = promptFileNames.filter((name) => name !== "homepage.json");

    expect(promptFileNames).toContain("homepage.json");
    expect(activeSkus.length).toBeGreaterThan(0);
    expect(skuFiles.toSorted()).toEqual(
      activeSkus.map((sku) => `${sku}.json`).toSorted(),
    );
  });

  it("names the file after the key it declares, so a record cannot sit in the wrong file", () => {
    for (const { name, file } of promptFiles) {
      expect(`${file.key}.json`, name).toBe(name);
      expect(file.version, name).toBe(IMAGERY_PROMPT_VERSION);
    }
  });

  it("describes a product that exists in the catalogue dataset", () => {
    const skus = new Set(PRODUCTS.map((product) => product.sku));
    for (const record of records) {
      if (record.sku === null) continue;
      expect(skus, record.assetId).toContain(record.sku);
    }
  });

  it("gives each product a hero and a detail record, and no third asset", () => {
    for (const { file } of promptFiles) {
      if (file.key === "homepage") continue;
      expect(
        file.records.map((record) => record.role).sort(),
        file.key,
      ).toEqual(["detail", "hero"]);
    }
  });

  it("gives the homepage one hero-band record and six occasion tiles", () => {
    const homepage = promptFiles.find(({ name }) => name === "homepage.json");
    const roles = homepage?.file.records.map((record) => record.role) ?? [];
    expect(roles.filter((role) => role === "brand")).toHaveLength(1);
    expect(roles.filter((role) => role === "occasion")).toHaveLength(6);
    expect(roles).toHaveLength(7);
  });

  it("crops products at 4:5, tiles at 1:1 and the hero band at 16:9 (§13 Q5)", () => {
    for (const record of records) {
      const expected =
        record.role === "brand"
          ? "16:9"
          : record.role === "occasion"
            ? "1:1"
            : "4:5";
      expect(record.aspectRatio, record.assetId).toBe(expected);
    }
  });
});

describe("the style guide is enforced in the prompt text, not merely written down", () => {
  it("states the whole review checklist in every negative prompt", () => {
    for (const record of records) {
      const negative = record.negativePrompt.toLowerCase();
      for (const exclusion of [
        "hands",
        "faces",
        "people",
        "premises",
        "signage",
        "text",
        "lettering",
        "watermark",
        "logo",
        "impossible stems",
        "melted",
        "plastic or silk flowers",
        "wrong flower species",
        "implausible stem count",
      ]) {
        expect(negative, `${record.assetId} / ${exclusion}`).toContain(
          exclusion,
        );
      }
    }
  });

  it('repeats "no hands, no faces, no text" in every positive prompt', () => {
    for (const record of records) {
      const prompt = record.prompt.toLowerCase();
      expect(prompt, record.assetId).toContain("no hands");
      expect(prompt, record.assetId).toContain("no faces");
      expect(prompt, record.assetId).toContain("no text");
    }
  });

  it("asks for the locked background and light on every product asset", () => {
    for (const record of records) {
      if (record.sku === null) continue;
      const prompt = record.prompt.toLowerCase();
      expect(prompt, record.assetId).toContain(
        "neutral warm-grey seamless background",
      );
      expect(prompt, record.assetId).toContain(
        "soft north light from the left",
      );
      expect(prompt, record.assetId).toContain("colour-accurate");
    }
  });

  it("puts the funeral piece on neutral stone and the plant in a plain pot (`plan/10` §3)", () => {
    const bySku = new Map(PRODUCTS.map((product) => [product.sku, product]));
    // The whole-product shot: a detail crop may legitimately not show the pot or the surface.
    for (const record of records) {
      if (record.sku === null || record.role !== "hero") continue;
      const type = bySku.get(record.sku)?.productType;
      if (type === "funeral") {
        expect(record.prompt.toLowerCase(), record.assetId).toContain(
          "neutral stone surface",
        );
      }
      if (type === "plant") {
        expect(record.prompt.toLowerCase(), record.assetId).toMatch(
          /plain (white ceramic|terracotta) pot/u,
        );
      }
    }
  });

  it("names the product's own primary flower, so the picture matches the facet", () => {
    const bySku = new Map(PRODUCTS.map((product) => [product.sku, product]));
    const singular: Record<string, string> = {
      roses: "rose",
      tulips: "tulip",
      lilies: "lil",
      peonies: "peon",
      sunflowers: "sunflower",
      orchids: "orchid",
      chrysanthemums: "chrysanthemum",
      gerberas: "gerbera",
    };
    for (const record of records) {
      if (record.sku === null) continue;
      const flower = bySku.get(record.sku)?.primaryFlower ?? "";
      const stem = singular[flower];
      if (stem === undefined) continue; // `mixed` / `seasonal` name no single species
      expect(record.prompt.toLowerCase(), record.assetId).toContain(stem);
    }
  });

  it("states the default tier's stem count where the product has one", () => {
    const bySku = new Map(PRODUCTS.map((product) => [product.sku, product]));
    for (const record of records) {
      if (record.sku === null || record.role !== "hero") continue;
      const stems = bySku.get(record.sku)?.stemCount;
      if (stems === null || stems === undefined) continue;
      expect(record.prompt, record.assetId).toContain(String(stems));
    }
  });

  it("describes no person, no premises and no in-image text", () => {
    for (const record of records) {
      // Only the *positive* prompt: the negative prompt names all of these on purpose.
      const prompt = record.prompt.toLowerCase();
      for (const forbidden of [
        "hand holding",
        "woman",
        "man ",
        "child",
        "florist standing",
        "shopfront",
        "shop window",
        "storefront",
        "smiling",
        "portrait of",
      ]) {
        expect(prompt, `${record.assetId} / ${forbidden}`).not.toContain(
          forbidden,
        );
      }
    }
  });

  it("carries no competitor mark and no personal data (AC-9)", () => {
    const marks = [
      "interflora",
      "floraqueen",
      "euroflorist",
      "bloom & wild",
      "bloomandwild",
      "internetflorist",
      "1-800-flowers",
      "fleurop",
      "eflorist",
      "poczta kwiatowa",
    ];
    for (const record of records) {
      const haystack = JSON.stringify(record).toLowerCase();
      for (const mark of marks) {
        expect(haystack, `${record.assetId} / ${mark}`).not.toContain(mark);
      }
      // No address, no phone, no postcode shape anywhere in a prompt record.
      expect(haystack, record.assetId).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/u);
      expect(haystack, record.assetId).not.toMatch(/\+\d{6,}/u);
      expect(haystack, record.assetId).not.toMatch(/\b\d{2}-\d{3}\b/u);
    }
  });
});

/**
 * Each generator's identity, filed and then written into the data (TASK-080; spec 006 §14 A7
 * clause 2, AC-29, AC-31, AC-32; T-31, T-32; TASK-167).
 *
 * TASK-080 pinned one generator against one terms file. A7 admits a second, so the pin becomes a
 * map: every generator the data may name, the compliance record that files its terms, and the
 * models that record lists. The compliance record and the data must name the **same** generator
 * and model, or the record documents terms that were never the ones we generated under — which is
 * why a name only counts in a terms file as an **exact token** (`` `name` `` or `"name"`, one
 * delimiter on each side, the same one): `gpt-image 2.0` does not file `gpt-image`, and
 * `"xAI Grok Imagine"` does not file `Grok Imagine`.
 *
 * The rules are pure functions over plain values so that every failure case below runs the exact
 * code the real-data assertions run, on a fixture that differs from the real input in one place.
 */
export interface GeneratorTerms {
  readonly termsFile: string;
  readonly models: readonly string[];
}

export const GENERATOR_TERMS: ReadonlyMap<string, GeneratorTerms> = new Map([
  [
    "OpenAI ChatGPT",
    {
      termsFile: "docs/compliance/imagery-generator-terms.md",
      models: ["gpt-image 2.0", "gpt-image"],
    },
  ],
  [
    "xAI Grok Imagine",
    {
      termsFile: "docs/compliance/imagery-generator-terms-grok.md",
      models: ["Grok Imagine"],
    },
  ],
]);

/** The generator whose record bounds its assets to a listed SKU set (AC-32). */
const BOUNDED_GENERATOR = "xAI Grok Imagine";
const BOUNDED_TERMS_FILE = "docs/compliance/imagery-generator-terms-grok.md";

/** What AC-31/AC-32 read off a prompt record or an `ai` row of `seed/data/media.json`. */
export interface ProvenanceClaim {
  readonly id: string;
  readonly sku: string | null;
  readonly generator: string | undefined;
  readonly model: string | undefined;
}

/** `` `name` `` or `"name"`: the name with matching delimiters, never a substring of a longer name. */
export function hasExactToken(text: string, name: string): boolean {
  return text.includes(`\`${name}\``) || text.includes(`"${name}"`);
}

/** AC-31's terms-file half. `read` returns `null` for a file that does not exist. */
export function termsProblems(
  terms: ReadonlyMap<string, GeneratorTerms>,
  read: (path: string) => string | null,
): string[] {
  const problems: string[] = [];
  for (const [generator, { termsFile, models }] of terms) {
    const text = read(termsFile);
    if (text === null) {
      problems.push(
        `${termsFile}: missing, so \`${generator}\` has no filed terms record`,
      );
      continue;
    }
    if (!/\*\*Filed \d{4}-\d{2}-\d{2}\.\*\*/u.test(text)) {
      problems.push(`${termsFile}: not filed (no **Filed YYYY-MM-DD.**)`);
    }
    if (!text.includes("ADR-0014")) {
      problems.push(`${termsFile}: does not name ADR-0014`);
    }
    if (!text.toLowerCase().includes("commercial")) {
      problems.push(`${termsFile}: does not answer commercial use`);
    }
    for (const name of [generator, ...models]) {
      if (!hasExactToken(text, name)) {
        problems.push(
          `${termsFile}: does not name \`${name}\` as an exact token`,
        );
      }
    }
  }
  return problems;
}

/** The Grok record's Assets row: its backticked SKUs and the product count it states (AC-32). */
export function parseAssetsRow(text: string): {
  readonly skus: ReadonlySet<string>;
  readonly stated: number | null;
} {
  const row = text.split("\n").find((line) => line.startsWith("| Assets |"));
  if (row === undefined) return { skus: new Set(), stated: null };
  const skus = new Set(
    [...row.matchAll(/`(FO-[A-Z]{2}-\d{3})`/gu)].map((match) => match[1] ?? ""),
  );
  const stated = /hero and detail of (\d+) products/u.exec(row)?.[1];
  return { skus, stated: stated === undefined ? null : Number(stated) };
}

export function assetsRowProblems(text: string): string[] {
  const { skus, stated } = parseAssetsRow(text);
  if (stated === null) return ["the Assets row states no product count"];
  return skus.size === stated
    ? []
    : [
        `the Assets row lists ${String(skus.size)} SKUs but states ${String(stated)} products`,
      ];
}

/** AC-31's data half and AC-32: a mapped generator, a listed model, a listed SKU for Grok. */
export function claimProblems(
  claims: readonly ProvenanceClaim[],
  terms: ReadonlyMap<string, GeneratorTerms>,
  boundedSkus: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  for (const claim of claims) {
    const entry =
      claim.generator === undefined ? undefined : terms.get(claim.generator);
    if (entry === undefined) {
      problems.push(
        `${claim.id}: names generator \`${String(claim.generator)}\`, which has no filed terms record`,
      );
    } else if (
      claim.model === undefined ||
      !entry.models.includes(claim.model)
    ) {
      problems.push(
        `${claim.id}: names model \`${String(claim.model)}\`, which ${entry.termsFile} does not list for \`${String(claim.generator)}\``,
      );
    }
    if (
      claim.generator === BOUNDED_GENERATOR &&
      (claim.sku === null || !boundedSkus.has(claim.sku))
    ) {
      problems.push(
        `${claim.id}: names \`${BOUNDED_GENERATOR}\` on \`${String(claim.sku)}\`, which is not in the Assets row of ${BOUNDED_TERMS_FILE}`,
      );
    }
  }
  return problems;
}

function readRepoFile(path: string): string | null {
  const absolute = join(repoRoot, path);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : null;
}

const mediaRows = (
  JSON.parse(readFileSync(join(repoRoot, "seed/data/media.json"), "utf8")) as {
    rows: {
      id: string;
      source: string;
      productSku?: string;
      generator?: string;
      generatorModel?: string;
    }[];
  }
).rows;

const claims: ProvenanceClaim[] = [
  ...records.map((record) => ({
    id: `prompt ${record.assetId}`,
    sku: record.sku,
    generator: record.generator,
    model: record.generatorModel,
  })),
  ...mediaRows
    .filter((row) => row.source === "ai")
    .map((row) => ({
      id: `media ${row.id}`,
      sku: row.productSku ?? null,
      generator: row.generator,
      model: row.generatorModel,
    })),
];

const grokText = readRepoFile(BOUNDED_TERMS_FILE) ?? "";
const grokSkus = parseAssetsRow(grokText).skus;

/** A filed terms text naming exactly the given tokens, for the exact-token cases. */
function filedTerms(...tokens: string[]): string {
  return `| Status | **Filed 2026-09-30.** |\nADR-0014. Commercial use: allowed.\n${tokens.join("\n")}\n`;
}

/** A reader that serves the repository's files, with `overrides` replacing (or deleting) some. */
function readerWith(
  overrides: Record<string, string | null>,
): (path: string) => string | null {
  return (path) =>
    path in overrides ? (overrides[path] ?? null) : readRepoFile(path);
}

const chatgptClaim: ProvenanceClaim = {
  id: "fixture fo-bq-001-hero",
  sku: "FO-BQ-001",
  generator: "OpenAI ChatGPT",
  model: "gpt-image",
};
const grokClaim = (sku: string | null): ProvenanceClaim => ({
  id: `fixture ${String(sku)}`,
  sku,
  generator: BOUNDED_GENERATOR,
  model: "Grok Imagine",
});

describe("AC-29 / AC-31: every generator the data names has a filed terms record (T-31)", () => {
  it("every prompt record and every `ai` row names a mapped generator and a model listed for it", () => {
    expect(claims.length).toBe(
      records.length + mediaRows.filter((row) => row.source === "ai").length,
    );
    expect(claims.length).toBeGreaterThan(0);
    expect(claimProblems(claims, GENERATOR_TERMS, grokSkus)).toEqual([]);
  });

  it("every mapped terms file is filed, names ADR-0014, answers commercial use and names each of its names as an exact token", () => {
    expect(termsProblems(GENERATOR_TERMS, readRepoFile)).toEqual([]);
  });

  it("goes red for a row naming an unmapped generator", () => {
    expect(
      claimProblems(
        [{ ...chatgptClaim, generator: "Midjourney" }],
        GENERATOR_TERMS,
        grokSkus,
      ),
    ).toEqual([
      "fixture fo-bq-001-hero: names generator `Midjourney`, which has no filed terms record",
    ]);
  });

  it("goes red for a row naming a model its generator's record does not list", () => {
    expect(
      claimProblems(
        [{ ...chatgptClaim, model: "Grok Imagine" }],
        GENERATOR_TERMS,
        grokSkus,
      ),
    ).toEqual([
      "fixture fo-bq-001-hero: names model `Grok Imagine`, which docs/compliance/imagery-generator-terms.md does not list for `OpenAI ChatGPT`",
    ]);
  });

  it("goes red when a mapped terms file is deleted", () => {
    expect(
      termsProblems(
        GENERATOR_TERMS,
        readerWith({ [BOUNDED_TERMS_FILE]: null }),
      ),
    ).toEqual([
      "docs/compliance/imagery-generator-terms-grok.md: missing, so `xAI Grok Imagine` has no filed terms record",
    ]);
  });

  it("goes red when a mapped terms file is unfiled", () => {
    expect(
      termsProblems(
        GENERATOR_TERMS,
        readerWith({
          [BOUNDED_TERMS_FILE]: grokText.replaceAll(
            "**Filed 2026-09-30.**",
            "**Draft.**",
          ),
        }),
      ),
    ).toEqual([
      "docs/compliance/imagery-generator-terms-grok.md: not filed (no **Filed YYYY-MM-DD.**)",
    ]);
  });

  it("goes red when a terms file is missing its generator as an exact token", () => {
    expect(
      termsProblems(
        GENERATOR_TERMS,
        readerWith({
          [BOUNDED_TERMS_FILE]: grokText.replaceAll(
            '"xAI Grok Imagine"',
            "xAI Grok Imagine",
          ),
        }),
      ),
    ).toEqual([
      "docs/compliance/imagery-generator-terms-grok.md: does not name `xAI Grok Imagine` as an exact token",
    ]);
  });

  it("goes red when a terms file is missing a model as an exact token", () => {
    const chatgptFile = "docs/compliance/imagery-generator-terms.md";
    expect(
      termsProblems(
        GENERATOR_TERMS,
        readerWith({
          [chatgptFile]: filedTerms('"OpenAI ChatGPT"', "`gpt-image`"),
        }),
      ),
    ).toEqual([
      "docs/compliance/imagery-generator-terms.md: does not name `gpt-image 2.0` as an exact token",
    ]);
  });

  it("goes red for mismatched delimiters: an opening backtick closes with a backtick", () => {
    expect(hasExactToken('`gpt-image"', "gpt-image")).toBe(false);
    expect(hasExactToken('"gpt-image`', "gpt-image")).toBe(false);
    expect(hasExactToken("`gpt-image`", "gpt-image")).toBe(true);
    expect(hasExactToken('"gpt-image"', "gpt-image")).toBe(true);
    expect(
      termsProblems(
        GENERATOR_TERMS,
        readerWith({
          "docs/compliance/imagery-generator-terms.md": filedTerms(
            '"OpenAI ChatGPT"',
            "`gpt-image 2.0`",
            '`gpt-image"',
          ),
        }),
      ),
    ).toEqual([
      "docs/compliance/imagery-generator-terms.md: does not name `gpt-image` as an exact token",
    ]);
  });

  it("goes red for `gpt-image` when the terms file names only `gpt-image 2.0`", () => {
    expect(
      termsProblems(
        GENERATOR_TERMS,
        readerWith({
          "docs/compliance/imagery-generator-terms.md": filedTerms(
            '"OpenAI ChatGPT"',
            "`gpt-image 2.0`",
          ),
        }),
      ),
    ).toEqual([
      "docs/compliance/imagery-generator-terms.md: does not name `gpt-image` as an exact token",
    ]);
  });

  it("goes red for `Grok Imagine` when the terms file names only `xAI Grok Imagine`", () => {
    expect(
      termsProblems(
        GENERATOR_TERMS,
        readerWith({ [BOUNDED_TERMS_FILE]: filedTerms('"xAI Grok Imagine"') }),
      ),
    ).toEqual([
      "docs/compliance/imagery-generator-terms-grok.md: does not name `Grok Imagine` as an exact token",
    ]);
  });
});

describe("AC-32: a generator's record bounds its assets (T-32)", () => {
  it("reads the SKU set from the Assets row, and its size equals the product count the row states", () => {
    const { skus, stated } = parseAssetsRow(grokText);
    expect(stated).not.toBeNull();
    expect(skus.size).toBe(stated);
    expect(assetsRowProblems(grokText)).toEqual([]);
  });

  it("counts only backticked SKUs: a SKU the row names without backticks is not in the set (`/break 142` HOLE 4)", () => {
    const sentence = "this row uses no ranges.";
    expect(grokText).toContain(sentence);
    const mentioning = grokText.replace(
      sentence,
      "this row uses no ranges, and FO-BQ-007 and FO-FN-011 are not in it.",
    );
    const real = parseAssetsRow(grokText);
    const parsed = parseAssetsRow(mentioning);
    expect(parsed.skus.has("FO-BQ-007")).toBe(false);
    expect(parsed.skus.has("FO-FN-011")).toBe(false);
    expect([...parsed.skus].sort()).toEqual([...real.skus].sort());
    expect(assetsRowProblems(mentioning)).toEqual([]);
  });

  it("goes red when the parsed SKU count differs from the row's stated count", () => {
    const shortRow = grokText.replace("`FO-BQ-008`, ", "");
    expect(shortRow).not.toBe(grokText);
    const { stated } = parseAssetsRow(grokText);
    expect(assetsRowProblems(shortRow)).toEqual([
      `the Assets row lists ${String((stated ?? 0) - 1)} SKUs but states ${String(stated)} products`,
    ]);
  });

  it("accepts a Grok row on a listed SKU, so the red cases below are about the SKU alone", () => {
    expect(
      claimProblems([grokClaim("FO-BQ-005")], GENERATOR_TERMS, grokSkus),
    ).toEqual([]);
  });

  it.each([
    ["FO-BQ-007", "falls between two listed SKUs"],
    ["FO-FN-011", "follows the last listed FO-FN SKU"],
  ])("goes red for a Grok row on %s, which %s", (sku) => {
    expect(claimProblems([grokClaim(sku)], GENERATOR_TERMS, grokSkus)).toEqual([
      `fixture ${sku}: names \`xAI Grok Imagine\` on \`${sku}\`, which is not in the Assets row of docs/compliance/imagery-generator-terms-grok.md`,
    ]);
  });

  it("goes red for a Grok row with no SKU (a homepage slot)", () => {
    expect(claimProblems([grokClaim(null)], GENERATOR_TERMS, grokSkus)).toEqual(
      [
        "fixture null: names `xAI Grok Imagine` on `null`, which is not in the Assets row of docs/compliance/imagery-generator-terms-grok.md",
      ],
    );
  });
});

describe("the generator fields carry no placeholder and invent no setting", () => {
  it("leaves the placeholder nowhere in the prompt records or the media manifest", () => {
    for (const record of records) {
      expect(
        JSON.stringify(record).includes("to-be-confirmed"),
        record.assetId,
      ).toBe(false);
    }
    const media = readFileSync(join(repoRoot, "seed/data/media.json"), "utf8");
    expect(media).not.toContain("to-be-confirmed");
  });

  it("keeps the parameter bag generator-neutral, so no setting is invented for it", () => {
    for (const record of records) {
      expect(Object.keys(record.parameters).sort(), record.assetId).toEqual([
        "aspectRatio",
        "colourProfile",
        "minLongEdgePx",
        "styleReference",
      ]);
      expect(record.parameters.aspectRatio, record.assetId).toBe(
        record.aspectRatio,
      );
      expect(record.parameters.minLongEdgePx, record.assetId).toBe(2000);
    }
  });
});

describe("content/imagery/ documents the guide, the checklist and the intake rule", () => {
  // Whitespace-normalised, so a clause quoted across a wrapped blockquote line still reads as one
  // sentence — the same reason `canonicalisePromptRecord` collapses whitespace.
  const guide = readFileSync(
    join(repoRoot, "content/imagery/style-guide.md"),
    "utf8",
  )
    .replace(/\n>\s*/gu, " ")
    .replace(/\s+/gu, " ");
  const readme = readFileSync(
    join(repoRoot, "content/imagery/README.md"),
    "utf8",
  );

  it("carries `plan/10` §3's locked style guide clause by clause", () => {
    for (const clause of [
      "neutral warm-grey seamless background",
      "soft north-light from the left",
      "4:5",
      "8% margin",
      "kraft or white",
      "no hands, no faces, no text",
      "colour-accurate to the product's colour facet",
      "stem count visually plausible for the tier",
      "neutral stone surface",
      "plain terracotta or white pot",
    ]) {
      expect(guide, clause).toContain(clause);
    }
  });

  it("carries the six review-checklist rejection reasons (§2.4)", () => {
    for (const reason of [
      "Impossible stems",
      "Melted petals",
      "Wrong flower",
      "Implausible count",
      "Visible text",
      "Any person or premises",
    ]) {
      expect(guide, reason).toContain(reason);
    }
  });

  it("makes `licence` and `credit` mandatory for the one permitted stock class (§13 Q1)", () => {
    expect(guide).toContain("CC0 1.0");
    expect(guide).toContain("Unsplash Licence");
    expect(guide).toMatch(/paid stock is never used/iu);
    expect(guide).toMatch(/`licence` and `credit` are both mandatory/iu);
  });

  it("states the prompt template and the hash contract", () => {
    expect(guide).toContain("promptHash()");
    expect(guide).toContain("seed/schema/prompts.ts");
    expect(guide).toMatch(/declared, not discovered/u);
  });

  it("says an original is never committed and where the intake directory is", () => {
    expect(readme).toContain(".local/imagery/originals/");
    expect(readme).toMatch(/never commit an original/iu);
    const gitignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");
    expect(gitignore).toMatch(/^\.local\/$/mu);
  });
});
