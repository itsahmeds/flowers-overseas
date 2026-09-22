/**
 * Generate the prompt records for every product that has no imagery yet.
 *
 * Why this is a script and not 72 hand-written files: `content/imagery/style-guide.md` §6 says the
 * bracketed parts are substituted **from the product's own facets in the catalogue data — never
 * from a description, and never from memory**. A script is the only way to keep that promise for
 * 72 products, and it is auditable: every clause below is derived from a named field, and the
 * mapping tables were read off the twelve records the founder has already approved rather than
 * invented (see `deriveWrap` and `GREENERY`).
 *
 *   pnpm tsx scripts/imagery-prompts-remaining.ts          # write the records + the sheet
 *   pnpm tsx scripts/imagery-prompts-remaining.ts --check  # fail if either is stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { promptSeed } from "../seed/schema/prompts.ts";

const ROOT = process.cwd();
const PROMPTS_DIR = join(ROOT, "content/imagery/prompts");
const SHEET = join(ROOT, "content/imagery/requirements-remaining.md");

/** Identical on every record: every rejection reason belongs to every asset (style guide §6). */
const NEGATIVE =
  "hands, fingers, arms, faces, people, shop interior, shopfront, premises, signage, text, " +
  "lettering, numbers, watermark, logo, price tag, greetings card message, fused or impossible " +
  "stems, extra petals, melted or waxy petals, plastic or silk flowers, wilted flowers, wrong " +
  "flower species, implausible stem count, harsh flash, heavy vignette, cluttered background, " +
  "props, tiled or repeated pattern";

type Product = {
  sku: string;
  name: string;
  productType: "bouquet" | "arrangement" | "plant" | "funeral" | "gift_set";
  primaryFlower: string;
  colourPrimary: string;
  style: string;
  priceTier: string;
  stemCount: number | null;
  occasions: string[];
  vaseIncluded: boolean;
  status: string;
};

/**
 * Read off the approved twelve, not chosen: every `premium`/`luxury` **bouquet** ships white paper
 * (FO-BQ-002, 015, 019) and every `essential`/`classic` one ships kraft (FO-BQ-001, 009, 023, 028).
 * FO-GS-001 is `premium` and kraft, so the rule is keyed on bouquets alone.
 */
function deriveWrap(p: Product): "white" | "kraft" {
  return p.productType === "bouquet" &&
    (p.priceTier === "premium" || p.priceTier === "luxury")
    ? "white"
    : "kraft";
}

/** Also read off the approved twelve. A flower with no entry takes no greenery clause. */
const GREENERY: Record<string, string> = {
  roses: "eucalyptus",
  lilies: "dark green foliage",
  sunflowers: "wheat and green foliage",
  chrysanthemums: "dark green foliage",
  hydrangeas: "dark green foliage",
  orchids: "",
};

/** The colour word that goes into the prompt. `mixed`/`pastel`/`vibrant` describe a palette. */
const COLOUR: Record<string, string> = {
  mixed: "mixed-colour",
  pastel: "soft pastel",
  vibrant: "vivid",
  white: "pure white",
  red: "deep red",
  pink: "soft pink",
  orange: "warm orange",
  yellow: "bright yellow",
  purple: "deep purple",
  blue: "blue",
};

/** The named texture the detail shot must resolve. Keyed on the flower, per style guide §6. */
const TEXTURE: Record<string, string> = {
  roses: "petal texture and calyx",
  tulips: "satin petal texture",
  lilies: "stamens and petal veining",
  peonies: "ruffled petal layers and green sepals",
  sunflowers: "seed-head texture and petal edges",
  gerberas: "the flat disc florets and petal edges",
  carnations: "the fringed petal edges",
  hydrangeas: "the clustered florets",
  freesias: "the trumpet throats and buds",
  chrysanthemums: "the dense incurved petals",
  alstroemeria: "the petal markings and throat",
  orchids: "the lip and column",
  mixed: "petal texture across the three nearest heads",
  seasonal: "petal texture across the three nearest heads",
};

const STYLE_WORD: Record<string, string> = {
  rustic: "rustic ",
  minimal: "restrained ",
  luxury: "luxury ",
  modern: "modern ",
  classic: "",
};

/** "A" or "An", so a generated sentence never reads "A arrangement" or "A orchid plant". */
function Article(word: string): string {
  return /^[aeiou]/i.test(word) ? "An" : "A";
}

/** The singular of a flower name, for the plant template ("an orchid plant", not "orchids"). */
function singular(flower: string): string {
  if (flower.endsWith("ies")) return `${flower.slice(0, -3)}y`;
  if (flower.endsWith("es") && !flower.endsWith("ses"))
    return flower.slice(0, -2);
  if (flower.endsWith("s")) return flower.slice(0, -1);
  return flower;
}

/**
 * What to call a potted plant. `mixed` and `seasonal` are palette words, not species, so a plant
 * carrying one is "flowering plant" — naming a species the data does not claim would be the exact
 * "never from memory" failure the style guide forbids.
 */
function plantKind(p: Product): string {
  const f = p.primaryFlower;
  return f === "mixed" || f === "seasonal"
    ? "flowering plant"
    : `${singular(f)} plant`;
}

function subject(p: Product): string {
  const colour = COLOUR[p.colourPrimary] ?? p.colourPrimary;
  const flower =
    p.primaryFlower === "seasonal" ? "seasonal stems" : p.primaryFlower;
  const count = p.stemCount && p.stemCount > 0 ? `${p.stemCount} ` : "";
  return `${count}${colour} ${flower}`;
}

function heroPrompt(p: Product): string {
  const style = STYLE_WORD[p.style] ?? "";
  const green = GREENERY[p.primaryFlower];
  const withGreen = green ? ` with ${green}` : "";
  const colour = COLOUR[p.colourPrimary] ?? p.colourPrimary;
  const tail =
    `centred at 4:5 with an 8% margin on every side, on a neutral warm-grey seamless background, ` +
    `soft north light from the left, colour-accurate ${colour} heads, natural stem structure, ` +
    `no hands, no faces, no text.`;

  switch (p.productType) {
    case "bouquet":
      return `A hand-tied ${style}bouquet of ${subject(p)}${withGreen}, wrapped in ${deriveWrap(p)} paper and tied with plain twine, ${tail}`;
    case "arrangement":
      return `${Article(style || "arrangement")} ${style}arrangement of ${subject(p)}${withGreen}, arranged low in a plain kraft gift box, ${tail}`;
    case "plant": {
      const kind = plantKind(p);
      const inFlower = kind === "flowering plant" ? "" : " in flower";
      return `${Article(kind)} ${kind}${inFlower}, its ${colour} blooms open, in a plain white ceramic pot, ${tail}`;
    }
    case "funeral":
      return `A restrained funeral tribute of ${subject(p)}${withGreen}, standing on a neutral stone surface, dignified and unadorned, no ribbon lettering, ${tail}`;
    case "gift_set":
      return `A hand-tied ${style}bouquet of ${subject(p)}${withGreen}, wrapped in ${deriveWrap(p)} paper, beside a plain closed box of chocolates with an unmarked lid and no branding, ${tail}`;
  }
}

function detailPrompt(p: Product): string {
  const texture = TEXTURE[p.primaryFlower] ?? "petal texture";
  const colour = COLOUR[p.colourPrimary] ?? p.colourPrimary;
  const noun =
    p.productType === "plant"
      ? `${singular(p.primaryFlower)} plant`
      : p.productType === "funeral"
        ? "tribute"
        : p.productType === "arrangement"
          ? "arrangement"
          : "bouquet";
  const edge =
    p.productType === "plant"
      ? "the rim of the plain pot visible at the bottom"
      : p.productType === "funeral"
        ? "the stone surface visible beneath"
        : `the ${deriveWrap(p)} paper edge visible at the bottom`;
  const what =
    p.productType === "plant"
      ? `the same ${plantKind(p)}: two or three ${colour} blooms filling`
      : `the same ${noun} of ${subject(p)}: the three nearest heads filling`;
  return (
    `A close detail of ${what} the frame at 4:5, ${edge}, on a neutral warm-grey seamless ` +
    `background, soft north light from the left, ${texture} sharp, colour-accurate ${colour}, ` +
    `no hands, no faces, no text.`
  );
}

function recordFor(p: Product, role: "hero" | "detail") {
  const assetId = `${p.sku.toLowerCase()}-${role}`;
  return {
    assetId,
    sku: p.sku,
    slot: role === "hero" ? "productHero" : "productDetail",
    role,
    aspectRatio: "4:5",
    generator: "OpenAI ChatGPT",
    generatorModel: "gpt-image 2.0",
    generatorSeed: promptSeed(assetId),
    prompt: role === "hero" ? heroPrompt(p) : detailPrompt(p),
    negativePrompt: NEGATIVE,
    parameters: {
      aspectRatio: "4:5",
      colourProfile: "sRGB",
      minLongEdgePx: 2000,
      styleReference: "content/imagery/style-guide.md",
    },
  };
}

function main(): void {
  const check = process.argv.includes("--check");
  const products: Product[] = JSON.parse(
    readFileSync(join(ROOT, "seed/data/products.json"), "utf8"),
  ).rows;
  const media = JSON.parse(
    readFileSync(join(ROOT, "seed/data/media.json"), "utf8"),
  ).rows;
  const have = new Set<string>(
    media.map((m: { productSku?: string }) => m.productSku).filter(Boolean),
  );
  const todo = products.filter(
    (p) => !have.has(p.sku) && p.status !== "archived",
  );

  // Mother's Day first: `/en/poland/occasions/mothers-day` is the only occasion page the corpus
  // has and it renders no photograph at all today (spec 008 §14 A11).
  const priority = (p: Product) =>
    p.occasions?.includes("mothers_day") ? 0 : 1;
  todo.sort((a, b) => priority(a) - priority(b) || a.sku.localeCompare(b.sku));

  let stale = 0;
  for (const p of todo) {
    const file = join(PROMPTS_DIR, `${p.sku}.json`);
    const body =
      JSON.stringify(
        {
          version: 1,
          key: p.sku,
          records: [recordFor(p, "hero"), recordFor(p, "detail")],
        },
        null,
        2,
      ) + "\n";
    let current = "";
    try {
      current = readFileSync(file, "utf8");
    } catch {
      /* new file */
    }
    if (current !== body) {
      stale += 1;
      if (!check) writeFileSync(file, body);
    }
  }

  const rows = todo
    .map((p, i) => {
      const md = p.occasions?.includes("mothers_day")
        ? " **· Mother's Day**"
        : "";
      return `| ${i * 2 + 1}–${i * 2 + 2} | \`${p.sku}\` | ${p.name}${md} | ${p.productType} · ${p.style} · ${p.priceTier} | ${subject(p)} | \`${p.sku}.json\` |`;
    })
    .join("\n");

  const sheet = `# Imagery requirements — the remaining ${todo.length} products

Generated by \`scripts/imagery-prompts-remaining.ts\` from \`seed/data/products.json\`. Do not edit
by hand: re-run the script. Every prompt is derived from the product's own facets, per
\`content/imagery/style-guide.md\` §6 — never from a description and never from memory.

**${todo.length} products × 2 assets = ${todo.length * 2} images.** The twelve products that already
have imagery are excluded. Mother's Day products are first in the table, because
\`/{locale}/{country}/occasions/mothers-day\` is the only occasion page the catalogue has and it
renders **no photograph at all** today.

## Before you start

1. **Generator and terms are already filed** — \`docs/compliance/imagery-generator-terms.md\`
   records OpenAI ChatGPT / \`gpt-image 2.0\`, commercial use allowed, output assigned, no
   attribution required. Use the same generator or the record stops being true.
2. **Generate into \`.local/imagery/originals/{assetId}.png\`** (git-ignored). Never commit an
   original. \`{assetId}\` is the lower-cased SKU plus \`-hero\` or \`-detail\`, e.g.
   \`fo-bq-007-hero.png\`.
3. **Long edge ≥ 2000 px, sRGB, 4:5.** The existing set came in at 1024–1672 px, which forced a
   shorter variant ladder; 2000 px fixes that. No upscaling — generate large.
4. Paste the **prompt** and the **negative prompt** from the product's JSON record. The seed is
   recorded; if the generator will not take it, record the run's actual seed back into the file.

## The review checklist — apply to every image before you keep it

Reject and regenerate if any is true. These are the rejection reasons the negative prompt exists
for, and they are also what \`docs/compliance\` expects you to be counting:

- a hand, finger, arm, face or person anywhere in frame
- any text, lettering, number, watermark, logo or price tag
- fused, impossible or melted stems; extra or waxy petals; plastic or silk-looking flowers
- the wrong flower species, or a stem count that plainly contradicts the product
- a visibly wilted or browning head
- harsh flash, heavy vignette, a cluttered background, or props the prompt did not ask for

**Record your rejections.** ADR-0014 asks for the reject rate as a risk measure, and the first
run recorded none — so that measure is currently unmeasured rather than zero. A tally per product
is enough.

## After generating

\`\`\`bash
pnpm media:variants          # derives the AVIF/WebP ladder into .local/media/
pnpm seed:check              # per-slot byte caps, nine rule families
pnpm media:upload            # puts the derived files to R2, idempotent by checksum
pnpm media:upload --verify   # public HEAD per row: content-length and content-type agree
\`\`\`

Approving an asset is a data edit, not a code change: set \`reviewState: "approved"\`,
\`reviewedBy\` and \`reviewedAt\` on its row in \`seed/data/media.json\`.

## The ${todo.length * 2} images

| # | SKU | Product | Type · style · tier | Subject | Prompt record |
|---|---|---|---|---|---|
${rows}
`;

  let sheetStale = false;
  try {
    sheetStale = readFileSync(SHEET, "utf8") !== sheet;
  } catch {
    sheetStale = true;
  }
  if (sheetStale && !check) writeFileSync(SHEET, sheet);

  if (check && (stale > 0 || sheetStale)) {
    console.error(
      `imagery prompts: ${stale} record(s)${sheetStale ? " and the sheet" : ""} are stale — run \`pnpm tsx scripts/imagery-prompts-remaining.ts\``,
    );
    process.exit(1);
  }
  console.log(
    check
      ? `imagery prompts ok: ${todo.length} product(s), ${todo.length * 2} asset(s) current`
      : `wrote ${stale} prompt record(s) and the sheet — ${todo.length} product(s), ${todo.length * 2} asset(s)`,
  );
}

main();
