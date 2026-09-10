/**
 * The pin on `docs/design/` — the design source of truth (`CLAUDE.md`; spec 004 §14 A3; TASK-059).
 *
 * A design directory that agents are instructed to read before building a page is only worth
 * reading if it is complete and internally consistent, and neither property survives being a
 * convention. Five things are therefore asserted mechanically:
 *
 *  1. **Coverage.** Every Phase 0 row of `plan/05-page-inventory.md` §1–§2 is mapped by
 *     `docs/design/README.md` to artboard files that exist. A new Phase 0 page type in `plan/05`
 *     fails here until it is wireframed, which is what makes "every UI spec adds its wireframes
 *     before `/plan-tasks`" enforceable rather than aspirational.
 *  2. **Tokens.** No `.dc.html` artboard writes a colour literal. Colour comes from the token
 *     custom properties, exactly as `fo/no-raw-color` requires of the application, so a palette
 *     change is one edit in `system/tokens.css` and `src/app/globals.css` rather than a search
 *     across forty-six hand-written files. The two `tokens.css` files are the declared exceptions.
 *  3. **Canvases.** Every `canvas.json` entry points at a file that exists, so publishing a canvas
 *     cannot silently drop an artboard — the failure mode that had `homepage-v1/canvas.json`
 *     naming three files that had been renamed.
 *  4. **Voice.** No artboard uses one of the words spec 004 §14 A5 bans from customer copy. The
 *     words on an artboard are the words that ship, because an implementer copies them into a
 *     message key; a convention that "we speak in the first person" survives exactly as long as
 *     nobody is in a hurry, so it is asserted instead.
 *  5. **Benchmarks.** `docs/design/benchmarks/README.md` maps every file of the 2026-09-09
 *     competitor study to the wireframes it informed, and every artboard it names exists. A study
 *     nobody can trace back to a page is a document; a study mapped page by page is a design record.
 *
 * Deliberately *not* asserted: that an artboard looks right. That is a founder review on the
 * canvas, and no test replaces it.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseTables } from "../../scripts/tasks-open-decisions.ts";

const repoRoot = resolve(__dirname, "../..");
const designRoot = resolve(repoRoot, "docs/design");
const readme = readFileSync(resolve(designRoot, "README.md"), "utf8");

/** Every file under `docs/design/`, as paths relative to it. */
function walk(dir: string, prefix = ""): string[] {
  return readdirSync(resolve(designRoot, dir === "" ? "." : dir), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    return entry.isDirectory() ? walk(rel, rel) : [rel];
  });
}

const allFiles = walk("");
const artboards = allFiles.filter((file) => file.endsWith(".dc.html"));

/** The two files where a colour literal is the point: the canonical and the frozen token sets. */
const TOKEN_FILES = ["system/tokens.css", "homepage-v1/tokens.css"];

/* ------------------------------------------------------------------ 1. coverage */

/** The `plan/05` §1–§2 sections, by their heading text. */
const INVENTORY_SECTIONS = [
  "1. Public commerce pages",
  "2. Content and trust pages",
];

interface InventoryRow {
  readonly number: number;
  readonly pageType: string;
  readonly phase: string;
}

/** Rows of `plan/05` §1–§2 whose Phase column starts with `0`. */
function phaseZeroRows(): InventoryRow[] {
  const inventory = readFileSync(
    resolve(repoRoot, "plan/05-page-inventory.md"),
    "utf8",
  );
  const rows: InventoryRow[] = [];
  for (const table of parseTables(inventory)) {
    if (!INVENTORY_SECTIONS.includes(table.section)) continue;
    const phaseIndex = table.header.indexOf("Phase");
    expect(
      phaseIndex,
      `plan/05 §${table.section} has no Phase column`,
    ).toBeGreaterThan(-1);
    for (const cells of table.rows) {
      const number = Number(cells[0]);
      const phase = (cells[phaseIndex] ?? "").trim();
      // "0", "0 (noindex demo)", "0 (demo guard), 1 (real)" are all Phase 0 rows.
      if (!Number.isInteger(number) || !/^0\b/.test(phase)) continue;
      rows.push({ number, pageType: (cells[1] ?? "").trim(), phase });
    }
  }
  return rows;
}

/**
 * The README's page-type tables, keyed by the `plan/05` row numbers each row claims.
 *
 * The first column is a comma-separated list of inventory row numbers (`35, 36`) or a range
 * (`46–51, 54`); the artboard files are every backticked path in the row.
 */
function readmeCoverage(): Map<number, string[]> {
  const coverage = new Map<number, string[]>();
  for (const table of parseTables(readme)) {
    if (table.header[0] !== "plan/05 #") continue;
    for (const cells of table.rows) {
      const files = [
        ...(cells.join(" ").match(/`([\w./-]+\.dc\.html)`/g) ?? []),
      ].map((match) => match.replaceAll("`", ""));
      for (const part of (cells[0] ?? "").split(",")) {
        const range = /^(\d+)[–-](\d+)$/.exec(part.trim());
        if (range?.[1] !== undefined && range[2] !== undefined) {
          for (let n = Number(range[1]); n <= Number(range[2]); n += 1) {
            coverage.set(n, files);
          }
          continue;
        }
        const number = Number(part.trim());
        if (Number.isInteger(number)) coverage.set(number, files);
      }
    }
  }
  return coverage;
}

describe("docs/design/README.md maps every Phase 0 page type", () => {
  const rows = phaseZeroRows();
  const coverage = readmeCoverage();

  it("finds the Phase 0 rows of plan/05 §1–§2", () => {
    // A parser that silently matched nothing would make every assertion below vacuous.
    expect(rows.length).toBeGreaterThanOrEqual(20);
  });

  it("finds the README's page-type tables", () => {
    expect(coverage.size).toBeGreaterThanOrEqual(rows.length);
  });

  it.each(rows)(
    "maps plan/05 row $number ($pageType) to artboards that exist",
    ({ number, pageType }) => {
      const files = coverage.get(number);
      expect(
        files,
        `plan/05 row ${String(number)} (${pageType}) is Phase 0 but docs/design/README.md maps no wireframe to it. Add the artboards and a table row, or move the page out of Phase 0.`,
      ).toBeDefined();
      expect(
        files ?? [],
        `plan/05 row ${String(number)} (${pageType}) has a README row with no artboard file in it`,
      ).not.toHaveLength(0);
      for (const file of files ?? []) {
        expect(
          existsSync(join(designRoot, file)),
          `docs/design/README.md maps plan/05 row ${String(number)} to \`${file}\`, which does not exist`,
        ).toBe(true);
      }
    },
  );

  it("names a desktop and a mobile artboard for each mapped page type", () => {
    for (const { number, pageType } of rows) {
      const files = coverage.get(number) ?? [];
      const widths = {
        desktop: files.some((file) => file.includes("desktop")),
        mobile: files.some((file) => file.includes("mobile")),
      };
      expect(
        widths,
        `plan/05 row ${String(number)} (${pageType}) must have both a desktop (1440) and a mobile (390) artboard`,
      ).toStrictEqual({ desktop: true, mobile: true });
    }
  });
});

/* ------------------------------------------------------------------ 2. tokens */

/**
 * A hex, `rgb()`/`rgba()` or `hsl()`/`hsla()` colour. `oklch()` is deliberately absent: the token
 * block at the top of every artboard declares the palette in OKLCH, which is the same arrangement
 * `src/app/globals.css` has — the literals live in one place and everything else references them.
 */
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g;

describe("every .dc.html artboard takes its colour from the tokens", () => {
  it("has found the artboards", () => {
    expect(artboards.length).toBeGreaterThanOrEqual(46);
  });

  it.each(artboards)("%s writes no colour literal", (file) => {
    const matches = readFileSync(join(designRoot, file), "utf8").match(
      COLOUR_LITERAL,
    );
    expect(
      matches ?? [],
      `${file} writes ${String(matches?.length)} colour literal(s) (${(matches ?? []).join(", ")}). Colour in an artboard comes from a token: use var(--color-…) and declare the value in docs/design/system/tokens.css.`,
    ).toStrictEqual([]);
  });

  it.each(TOKEN_FILES)("%s is the declared exception and exists", (file) => {
    expect(existsSync(join(designRoot, file))).toBe(true);
  });

  it("declares every token name the artboards reference", () => {
    const declared = new Set(
      [
        ...readFileSync(join(designRoot, "system/tokens.css"), "utf8").matchAll(
          /^\s*(--[\w-]+):/gm,
        ),
      ].map(([, name]) => name),
    );
    const missing = new Set<string>();
    for (const file of artboards) {
      const source = readFileSync(join(designRoot, file), "utf8");
      // Only the tokens an artboard *reads*; the ones it declares inline are its own copy.
      for (const [, name] of source.matchAll(/var\((--[\w-]+)\)/g)) {
        if (name !== undefined && !declared.has(name)) missing.add(name);
      }
    }
    expect(
      [...missing],
      "an artboard references a custom property that docs/design/system/tokens.css does not declare",
    ).toStrictEqual([]);
  });
});

/* ------------------------------------------------------------------ 3. canvases */

interface Canvas {
  readonly artboards?: readonly { readonly file?: string }[];
  readonly launch?: { readonly view?: string };
}

const canvases = allFiles.filter((file) => file.endsWith("canvas.json"));

describe("every canvas.json points at files that exist", () => {
  it("has found the canvases", () => {
    // Root, flows/, wireframes/, homepage-v1/.
    expect(canvases.sort()).toStrictEqual([
      "canvas.json",
      "flows/canvas.json",
      "homepage-v1/canvas.json",
      "wireframes/canvas.json",
    ]);
  });

  it.each(canvases)("%s", (canvasFile) => {
    const canvas = JSON.parse(
      readFileSync(join(designRoot, canvasFile), "utf8"),
    ) as Canvas;
    const dir = canvasFile.includes("/")
      ? canvasFile.slice(0, canvasFile.lastIndexOf("/"))
      : "";
    expect(canvas.artboards ?? []).not.toHaveLength(0);
    for (const artboard of canvas.artboards ?? []) {
      expect(
        artboard.file,
        `${canvasFile} has an entry with no file`,
      ).toBeDefined();
      const target =
        dir === "" ? (artboard.file ?? "") : `${dir}/${artboard.file ?? ""}`;
      expect(
        existsSync(join(designRoot, target)),
        `${canvasFile} points at \`${artboard.file ?? ""}\`, which does not exist (resolved as docs/design/${target})`,
      ).toBe(true);
    }
  });

  it("opens the root canvas as a canvas", () => {
    const root = JSON.parse(
      readFileSync(join(designRoot, "canvas.json"), "utf8"),
    ) as Canvas;
    expect(root.launch?.view).toBe("canvas");
  });

  it("covers every artboard in the root canvas", () => {
    const root = JSON.parse(
      readFileSync(join(designRoot, "canvas.json"), "utf8"),
    ) as Canvas;
    const placed = new Set((root.artboards ?? []).map((one) => one.file ?? ""));
    expect(
      artboards.filter((file) => !placed.has(file)),
      "an artboard exists but the root canvas.json does not place it, so it would not be published",
    ).toStrictEqual([]);
  });

  it("leaves room between artboards", () => {
    for (const canvasFile of canvases) {
      const canvas = JSON.parse(
        readFileSync(join(designRoot, canvasFile), "utf8"),
      ) as {
        artboards?: readonly {
          file?: string;
          x?: number;
          y?: number;
          w?: number;
          h?: number;
        }[];
      };
      const list = canvas.artboards ?? [];
      for (const a of list) {
        for (const b of list) {
          if (a === b) continue;
          const overlapX =
            (a.x ?? 0) < (b.x ?? 0) + (b.w ?? 0) &&
            (b.x ?? 0) < (a.x ?? 0) + (a.w ?? 0);
          const overlapY =
            (a.y ?? 0) < (b.y ?? 0) + (b.h ?? 0) &&
            (b.y ?? 0) < (a.y ?? 0) + (a.h ?? 0);
          expect(
            overlapX && overlapY,
            `${canvasFile}: \`${a.file ?? ""}\` and \`${b.file ?? ""}\` overlap on the canvas`,
          ).toBe(false);
        }
      }
    }
  });
});

/* ------------------------------------------------------------------ 4. the rules are written down */

describe("docs/design/README.md states the rules an agent needs", () => {
  it.each([
    ["the design source of truth", "design source of truth"],
    ["the two artboard widths", "1440"],
    ["the mobile artboard width", "390"],
    ["the honesty rules", "No photograph we do not have"],
    ["how a new spec adds wireframes", "How a new UI spec adds its wireframes"],
    ["how the sheet stays in step with the code", "If a state exists in code"],
    [
      "where the sheet and the code differ",
      "Where the sheet and the code currently differ",
    ],
  ])("documents %s", (_what, needle) => {
    expect(readme).toContain(needle);
  });

  it("names each folder", () => {
    for (const folder of ["homepage-v1/", "system/", "flows/", "wireframes/"]) {
      expect(readme).toContain(folder);
    }
  });
});

/* ------------------------------------------------------------------ 5. voice */

/**
 * The words spec 004 §14 A5 bans from customer copy (2026-09-09).
 *
 * `corridor` is the one word with an exemption: `plan/05` and the specs use it as internal
 * vocabulary, so it may survive inside an artboard's annotation block — the `<section class="note">`
 * whose label ends `· [internal]` — and nowhere else, not in a state stub and not in a designer's
 * note. Identifiers inside `<code>` are exempt for every word, because a route or a table name is
 * not copy: `/demo/vendor-inbox`, `partner_application` and `corridorPagePublished` are the names
 * the code actually uses and renaming them in a drawing would make the drawing wrong.
 */
const BANNED = [
  "relay",
  "corridor",
  "partner",
  "third party",
  "third-party",
  "vendor",
  "anywhere in the world",
  "super fresh",
] as const;

/** The word that may appear inside an `[internal]` annotation block. */
const INTERNAL_ONLY = "corridor";

/**
 * The prose of an artboard: identifiers dropped, and `corridor` dropped from the annotation blocks
 * that declare themselves internal.
 */
function customerCopy(source: string): string {
  return source
    .replaceAll(/<code>[\s\S]*?<\/code>/g, " ")
    .replaceAll(/<section class="note"[\s\S]*?<\/section>/g, (block) =>
      block.includes("[internal]")
        ? block.replaceAll(new RegExp(INTERNAL_ONLY, "gi"), " ")
        : block,
    );
}

describe("every artboard speaks in the first person (spec 004 §14 A5)", () => {
  it.each(artboards)("%s uses no banned word", (file) => {
    const copy = customerCopy(readFileSync(join(designRoot, file), "utf8"));
    const found = BANNED.flatMap((word) => {
      const hits =
        copy.match(new RegExp(word.replaceAll("-", "[- ]"), "gi")) ?? [];
      return hits.length === 0 ? [] : [`${word} (${String(hits.length)}×)`];
    });
    expect(
      found,
      `${file} uses ${String(found.length)} banned word(s): ${found.join(", ")}. Spec 004 §14 A5: customer copy speaks as Flowers Overseas in the first person — "our florist in Warsaw", "our team", never "relay"/"corridor"/"partner"/"third party"/"vendor". "corridor" is allowed only inside an annotation block marked [internal]; an identifier belongs in <code>.`,
    ).toStrictEqual([]);
  });

  it("keeps the internal exemption honest", () => {
    // The exemption is worthless if no artboard declares an annotation block, and dangerous if the
    // marker can be spelled any other way.
    const annotated = artboards.filter((file) =>
      readFileSync(join(designRoot, file), "utf8").includes("[internal]"),
    );
    expect(annotated.length).toBeGreaterThanOrEqual(20);
  });

  /**
   * The honesty label's pronoun, pinned (spec 006 §14 A2; TASK-079). The label an implementer
   * copies into `media.provenance.aiExample` is the label on the artboard, so "your florist" on a
   * drawing becomes "your florist" on a page — the one string in this design that a lawyer will
   * read (spec 006 §13 Q8 (i)). Four artboards carry it and all four say *our*.
   */
  it("writes the AI honesty label in the first person on every artboard", () => {
    const labelled = artboards.filter((file) =>
      readFileSync(join(designRoot, file), "utf8").includes(
        "Example arrangement",
      ),
    );
    expect(labelled.length).toBeGreaterThanOrEqual(4);
    for (const file of labelled) {
      const source = readFileSync(join(designRoot, file), "utf8");
      expect(source, file).toContain(
        "Example arrangement · our florist hand-makes each one",
      );
      expect(source, file).not.toContain("your florist");
    }
  });

  it("states the rule in the README", () => {
    expect(readme).toContain("## Voice");
    expect(readme).toContain("## Density");
    for (const word of BANNED) expect(readme.toLowerCase()).toContain(word);
  });
});

/* ------------------------------------------------------------------ 6. benchmarks */

describe("docs/design/benchmarks/ maps the study to the wireframes", () => {
  const benchmarkDir = "benchmarks";
  const studyFiles = allFiles
    .filter(
      (file) => file.startsWith(`${benchmarkDir}/`) && file.endsWith(".md"),
    )
    .map((file) => file.slice(benchmarkDir.length + 1))
    .filter((name) => name !== "README.md")
    .sort();
  const mapping = readFileSync(
    join(designRoot, benchmarkDir, "README.md"),
    "utf8",
  );

  it("has the nine study files", () => {
    // 00-summary plus one per page type.
    expect(studyFiles).toStrictEqual([
      "00-summary.md",
      "01-product-page.md",
      "02-category-and-shop-grid.md",
      "03-destination-and-corridor-pages.md",
      "04-checkout.md",
      "05-occasion-pages.md",
      "06-for-florists-recruitment.md",
      "07-track-and-confirmation.md",
      "08-help-contact-and-legal.md",
    ]);
  });

  it.each(studyFiles)("%s is named by benchmarks/README.md", (name) => {
    expect(
      mapping,
      `docs/design/benchmarks/${name} exists but benchmarks/README.md does not reference it, so no wireframe is traceable to it`,
    ).toContain(name);
  });

  it("names artboards that exist, for the page types the study covers", () => {
    const named = [
      ...mapping.matchAll(/`(wireframes\/[\w*-]+\.dc\.html)`/g),
    ].map(([, path]) => path ?? "");
    expect(named.length).toBeGreaterThanOrEqual(8);
    for (const path of named) {
      // The mapping writes one row per page type using the `-*` desktop/mobile pair.
      const pair = path.includes("-*")
        ? [path.replace("-*", "-desktop"), path.replace("-*", "-mobile")]
        : [path];
      for (const one of pair) {
        expect(
          existsSync(join(designRoot, one)),
          `benchmarks/README.md maps a benchmark to \`${one}\`, which does not exist`,
        ).toBe(true);
      }
    }
  });

  it("records the ten patterns and the founder's open questions", () => {
    expect(mapping).toContain("The ten patterns, and where each one landed");
    expect(mapping).toContain("Still open");
    // Every pattern number from the summary is placed somewhere.
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(mapping).toMatch(new RegExp(`\\|\\s*${String(n)}\\s*\\|`));
    }
  });

  it("is linked from the design README", () => {
    expect(readme).toContain("benchmarks/");
  });
});
