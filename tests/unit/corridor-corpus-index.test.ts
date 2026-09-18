/**
 * The generated corpus index, and the `node:fs` line it exists to draw (spec 007 §2 "The content
 * model"; `/review 63` carry-forward (b); AC-1; TASK-091).
 *
 * Two assertions, both of them about the same claim — *the render path never opens a file*:
 *
 *  1. **the committed index is current**: byte-identical to what `pnpm corridor:index` would
 *     write from `content/corridors/**` today, so a guide edited without regenerating fails here
 *     rather than serving the previous text from the bundle;
 *  2. **nothing reachable from a page imports `node:fs`**: the module graph is walked from the
 *     corridor route and from the `geo` barrel, and the one file that does read the filesystem
 *     (`content/corpus-files.ts`) must be absent from it.
 *
 * The second is the carry-forward `/review 63` left on this task. TASK-087 read the corpus with
 * `readFileSync`/`readdirSync` at module load, which was invisible while nothing under `src/app/`
 * imported `src/modules/geo` — and would have become a server bundle carrying `node:fs`, an
 * edge runtime foreclosed and a container image that has to ship `content/` the moment this route
 * landed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CORRIDOR_INDEX_PATH,
  corridorIndexSource,
} from "../../scripts/corridor-index.ts";
import { corridorCorpus } from "../../src/modules/geo/content/corpus.ts";
import { readCorridorCorpus } from "../../src/modules/geo/content/corpus-files.ts";
import { importClosure } from "./support/import-closure.ts";

const repoRoot = resolve(import.meta.dirname, "../..");

/**
 * Every first-party module reachable from `entry`, transitively.
 *
 * `importClosure()` resolves **both** conventions the repository writes: relative `./…`
 * specifiers and the `@/*` alias it reads out of `tsconfig.json`'s `compilerOptions.paths`. That
 * matters here and is `/review 70`'s change 4: the corridor route imports *only* through `@/`, so
 * a walker that followed relative specifiers alone saw a graph of one module — itself — and the
 * route's `node:fs` assertion could not fail whatever the route imported. It is now the real
 * graph, which is why the size assertion below is part of the test rather than decoration.
 */
function moduleGraph(entry: string): ReadonlySet<string> {
  return importClosure(entry).files;
}

describe("the generated typed index (AC-1)", () => {
  it("is byte-identical to a fresh projection of `content/corridors/**`", () => {
    const committed = readFileSync(
      resolve(repoRoot, CORRIDOR_INDEX_PATH),
      "utf8",
    );
    expect(committed).toBe(corridorIndexSource(repoRoot));
  });

  it("carries exactly the committed corpus, file for file and byte for byte", () => {
    const fromDisk = readCorridorCorpus(repoRoot);
    expect(corridorCorpus().map((file) => file.path)).toEqual(
      fromDisk.map((file) => file.path),
    );
    for (const [index, file] of fromDisk.entries()) {
      expect(corridorCorpus()[index]?.source, file.path).toBe(file.source);
    }
    expect(fromDisk).toHaveLength(14);
  });
});

describe("no `node:fs` on the render path (`/review 63` carry-forward (b))", () => {
  // The shared depth-3 route file: spec 008 §14 A5 / spec 007 §14 A8 moved the corridor page into
  // `/[locale]/[segment]/[child]` beside the country shop root, because Next.js allows one dynamic
  // slug name per (depth, position). The rule this suite pins is unchanged, and it now covers the
  // shop root's graph too (TASK-109).
  const ROUTE = resolve(
    repoRoot,
    "src/app/[locale]/[segment]/[child]/page.tsx",
  );
  const BARREL = resolve(repoRoot, "src/modules/geo/index.ts");
  const READER = resolve(repoRoot, "src/modules/geo/content/corpus-files.ts");

  for (const [name, entry] of [
    ["the corridor route", ROUTE],
    ["the geo barrel", BARREL],
  ] as const) {
    it(`${name} reaches no module that imports \`node:fs\``, () => {
      const graph = [...moduleGraph(entry)];
      // A graph of one module is a vacuous assertion: it would pass however the entry imports.
      expect(graph.length, `${name} graph size`).toBeGreaterThan(1);
      expect(graph).not.toContain(READER);
      const withFs = graph.filter((file) =>
        /from\s+"node:fs"/u.test(readFileSync(file, "utf8")),
      );
      expect(withFs.map((file) => file.replace(`${repoRoot}/`, ""))).toEqual(
        [],
      );
    });
  }

  it("keeps the reader reachable from the gate that needs it", () => {
    // `pnpm corridor:check` is a script, not a page: it reads the authored markdown, and the
    // generator it feeds is what keeps the two halves in step.
    const graph = moduleGraph(resolve(repoRoot, "scripts/corridor-check.ts"));
    expect(graph.has(READER)).toBe(true);
  });
});
