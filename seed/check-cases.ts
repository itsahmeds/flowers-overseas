/**
 * The fixture format behind "one fixture per rule family" (spec 006 AC-10, T-10; TASK-075).
 *
 * A case is a **small, declarative overlay on the real dataset**: it names the file it replaces,
 * the family and rule it must trip, a substring the message must contain, and the one or two
 * mutations that introduce the fault. `applySeedCheckCase()` returns a new `SeedTree` value, so a
 * case costs no temp directory and no file copy.
 *
 * Why not "a fixture is a whole copy of the file it replaces": `seed/data/copy/en/products.json`
 * is 84 authored descriptions and `products.json` is 84 authored products. A committed copy of
 * either would rot the first time TASK-073 rewords the florist sentence, and a rotted fixture is
 * worse than no fixture — it fails for the wrong reason and nobody notices. The five price
 * fixtures TASK-074 shipped **are** whole blocks (one product, one destination), and they are
 * wired in unchanged through `replaceRowsFromFile`, which is the same splice
 * `tests/unit/seed-prices.test.ts` does: replace that product's rows, keep the other 83 priced.
 *
 * Pure and I/O-free apart from reading the fixture files a case names (`readFixture` is injected,
 * so a test can drive a case from a literal).
 */
import { z } from "zod";

import { SEED_CHECK_FAMILIES, type SeedTree } from "./check.ts";

/** A row matcher: every named field must equal the given value. */
const MatchSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.null()]),
);

const OpSchema = z.discriminatedUnion("op", [
  /** Delete a header field — how the schema family's fixture loses its `version`. */
  z.object({ op: z.literal("unsetHeader"), field: z.string().min(1) }).strict(),
  z
    .object({
      op: z.literal("setHeader"),
      field: z.string().min(1),
      value: z.unknown(),
    })
    .strict(),
  z
    .object({
      op: z.literal("setRow"),
      match: MatchSchema,
      set: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z
    .object({ op: z.literal("addRow"), row: z.record(z.string(), z.unknown()) })
    .strict(),
  z.object({ op: z.literal("removeRow"), match: MatchSchema }).strict(),
  /**
   * Replace every row matching `match` with the rows of a fixture file in the case's own
   * directory. This is how the five AC-6 price blocks are spliced into the destination's file.
   */
  z
    .object({
      op: z.literal("replaceRowsFromFile"),
      file: z.string().min(3),
      match: MatchSchema,
    })
    .strict(),
  /** Replace the whole file with a fixture file's contents. */
  z.object({ op: z.literal("setFile"), file: z.string().min(3) }).strict(),
  /**
   * Empty a file's row list, keeping its header. The case for it is family 9's two fixtures
   * (TASK-080): they replace the committed-image *listing* wholesale with two invented files, and
   * a variants manifest describing 118 real ones would then be 118 orphan-and-missing problems in
   * family 7 — collateral that says nothing about the byte budget the fixture is there to test.
   */
  z.object({ op: z.literal("clearRows") }).strict(),
  /**
   * Tree-level: the derived-image listing family 7's file half reads.
   *
   * **An empty listing is legal and load-bearing since TASK-138.** The derived bytes are
   * git-ignored now that they live in `flowersoverseas-media`, so "no derived tree" is the state
   * of every CI runner and of a clean clone — and a case that must not be disturbed by whatever
   * happens to sit in a founder's `.local/media/` says so by setting the listing to empty,
   * rather than passing on a runner and failing on the machine that derived the images.
   */
  z
    .object({
      op: z.literal("setMediaFiles"),
      files: z.array(
        z
          .object({ path: z.string().min(3), bytes: z.number().int().min(0) })
          .strict(),
      ),
    })
    .strict(),
]);

export type SeedCheckCaseOp = z.infer<typeof OpSchema>;

/**
 * One case. `expect` is a substring of the message the gate must print: the assertion is that the
 * *message names the fault*, not merely that some problem appeared, which is what spec 006 §2.3
 * asks a line to do.
 */
export const SeedCheckCaseSchema = z
  .object({
    family: z.enum(SEED_CHECK_FAMILIES),
    rule: z.string().min(2),
    /** Path relative to `seed/data/`, or `-` for a case that only mutates tree-level facts. */
    replaces: z.string().min(1),
    expect: z.string().min(4),
    /**
     * Families this fault necessarily also trips, with the reason. A float amount is both a schema
     * violation and a price violation, and pretending otherwise would need a weaker assertion; the
     * test asserts the family set **exactly**, so an unexpected extra family fails.
     */
    alsoFamilies: z.array(z.enum(SEED_CHECK_FAMILIES)).default([]),
    why: z.string().min(10),
    ops: z.array(OpSchema).min(1),
  })
  .strict();

export type SeedCheckCase = z.infer<typeof SeedCheckCaseSchema>;

function matches(
  row: Record<string, unknown>,
  match: Record<string, string | number | null>,
): boolean {
  return Object.entries(match).every(([field, value]) => row[field] === value);
}

interface FileValue {
  rows?: unknown;
  [key: string]: unknown;
}

/**
 * Apply a case to a tree, returning a new tree. The mutated file is recorded in `overlaid`, which
 * is what keeps the projection-staleness rule (family 1) from firing on a fixture: staleness is a
 * property of the committed bytes and an overlay is not committed.
 */
export function applySeedCheckCase(
  tree: SeedTree,
  testCase: SeedCheckCase,
  readFixture: (file: string) => unknown,
): SeedTree {
  const raw = new Map(tree.raw);
  let mediaFiles = tree.mediaFiles;
  const path = testCase.replaces;
  const current = raw.get(path);
  let value: FileValue =
    current === undefined ? {} : (structuredClone(current) as FileValue);

  for (const op of testCase.ops) {
    switch (op.op) {
      case "unsetHeader": {
        delete value[op.field];
        break;
      }
      case "setHeader": {
        value[op.field] = op.value;
        break;
      }
      case "setRow": {
        const rows =
          (value.rows as Record<string, unknown>[] | undefined) ?? [];
        let hit = false;
        for (const row of rows) {
          if (!matches(row, op.match)) continue;
          Object.assign(row, op.set);
          hit = true;
        }
        if (!hit) {
          throw new Error(
            `seed-check case for ${testCase.family}/${testCase.rule}: no row in ${path} matches ${JSON.stringify(op.match)} — the fixture has rotted away from the dataset`,
          );
        }
        break;
      }
      case "addRow": {
        const rows = (value.rows as unknown[] | undefined) ?? [];
        value.rows = [...rows, op.row];
        break;
      }
      case "removeRow": {
        const rows =
          (value.rows as Record<string, unknown>[] | undefined) ?? [];
        const kept = rows.filter((row) => !matches(row, op.match));
        if (kept.length === rows.length) {
          throw new Error(
            `seed-check case for ${testCase.family}/${testCase.rule}: no row in ${path} matches ${JSON.stringify(op.match)}`,
          );
        }
        value.rows = kept;
        break;
      }
      case "replaceRowsFromFile": {
        const rows =
          (value.rows as Record<string, unknown>[] | undefined) ?? [];
        const fixture = readFixture(op.file) as { rows?: unknown };
        const incoming = (fixture.rows as unknown[] | undefined) ?? [];
        value.rows = [
          ...rows.filter((row) => !matches(row, op.match)),
          ...incoming,
        ];
        break;
      }
      case "setFile": {
        value = readFixture(op.file) as FileValue;
        break;
      }
      case "clearRows": {
        value.rows = [];
        break;
      }
      case "setMediaFiles": {
        mediaFiles = op.files;
        break;
      }
    }
  }

  const overlaid = [...tree.overlaid];
  if (path !== "-") {
    raw.set(path, value);
    if (!overlaid.includes(path)) overlaid.push(path);
  }
  return { ...tree, raw, overlaid, mediaFiles };
}
