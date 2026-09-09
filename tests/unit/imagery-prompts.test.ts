/**
 * The prompt records of `content/imagery/prompts/**` and the canonicalisation that makes their
 * hashes reproducible (spec 006 §2.4, AC-8; T-08; TASK-077).
 *
 * Two things are asserted here and they are different in kind. First, the **hash is a function of
 * the prompt and nothing else**: reordering the JSON keys, reflowing the text or recomposing a
 * `ó` must not move it, while changing a word, the model or the seed must. Second, the committed
 * prompt files **say what the style guide requires them to say** — the exclusions are in the
 * negative prompt, no person or premises is described, and the generator is the labelled
 * placeholder that `docs/compliance/imagery-generator-terms.md` is pending on.
 *
 * The manifest side of the link — every asset's `promptHash` equals the hash of its record — is
 * `tests/unit/seed-media-manifest.test.ts`, where the dataset lives.
 */
import { readFileSync, readdirSync } from "node:fs";
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
  it("holds one file per demo product plus the homepage slots", () => {
    const skuFiles = promptFileNames.filter((name) => name !== "homepage.json");
    expect(promptFileNames).toContain("homepage.json");
    expect(skuFiles).toHaveLength(12);
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

describe("the generator is a labelled placeholder until the founder files its terms", () => {
  it("records `to-be-confirmed`, which ADR-0014 names no value for", () => {
    for (const record of records) {
      expect(record.generator, record.assetId).toBe("to-be-confirmed");
      expect(record.generatorModel, record.assetId).toBe("to-be-confirmed");
    }
  });

  it("has a pending compliance record naming what must be filed (ADR-0014's condition)", () => {
    const terms = readFileSync(
      join(repoRoot, "docs/compliance/imagery-generator-terms.md"),
      "utf8",
    );
    expect(terms).toContain("**pending**");
    expect(terms).toContain("ADR-0014");
    expect(terms).toContain("to-be-confirmed");
    expect(terms.toLowerCase()).toContain("commercial");
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
