/**
 * The codebase map — AC-33 / T-34 (spec 001 §14 A15, TASK-086).
 *
 * `docs/codebase-map.md` is the one file an agent reads to find out where something lives, so it
 * does not have to open `docs/architecture.md` (41 KB) and grep `src/`. It is generated, never
 * hand-written above the "Where does X live?" heading: every module barrel, every `src/config/`
 * module, every `src/app/**` route file and every `scripts/*.ts` gets one line with its purpose
 * (the first doc-comment line, or an explicit `@purpose` tag), its owning spec (an explicit
 * `@spec NNN` tag, the barrel's `Owned by: spec NNN` sentence, or the `spec NNN` reference in the
 * purpose line) and the test files that import it, resolved statically from the relative import
 * specifiers under `tests/`.
 *
 * A file with no doc comment renders as `TODO purpose` and `pnpm codebase:map --check` fails, so
 * the map cannot rot into a list of paths. The tail of the document — the hand-maintained
 * "Where does X live?" table — is copied through verbatim; the generator never rewrites it.
 *
 * Run `pnpm codebase:map` to rewrite the file and `pnpm codebase:map --check` to fail when the
 * committed copy is stale. `tests/unit/codebase-map.test.ts` drives the pure functions.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The heading the hand-maintained tail starts at; everything from here down is preserved. */
export const HAND_MAINTAINED_HEADING = "## Where does X live?";
/** Where the map lives, relative to the repository root. */
export const MAP_PATH = "docs/codebase-map.md";
/** Rendered when a file has no first doc-comment line and no `@purpose` tag. */
export const MISSING_PURPOSE = "TODO purpose";
/**
 * Purposes longer than this are cut; the map is an index, not the documentation.
 *
 * 100 until TASK-056, when the four files spec 004's last task adds took the generated file to
 * 12 748 B against AC-33's ≤ 12 KB target (it had 76 B of slack). The target exists because every
 * subagent reads this file before its first useful action (spec 001 §14, the orientation
 * measurement), so the honest lever is a tighter index rather than a wider budget: at 80 the map
 * is 12 086 B, every row still names what the file is for, and the sentence that was cut was
 * never the documentation — the file's own doc comment is.
 */
export const PURPOSE_LIMIT = 80;
/** At most this many test files are named per entry, then `+N more`. */
export const TESTS_LISTED = 3;
/** The test layers enumerated at the end of the generated half. */
export const TEST_LAYERS = [
  "unit",
  "integration",
  "contract",
  "e2e",
  "a11y",
  "visual",
  "dev-os",
  "fixtures",
  "msw",
] as const;

export interface MapEntry {
  /** Repository-relative path. */
  readonly path: string;
  /** Display label (the module name, the file name, the route). */
  readonly label: string;
  readonly purpose: string;
  readonly spec: string;
  readonly tests: string[];
  /** The `pnpm` script that runs this file, for `scripts/*.ts`. */
  readonly script?: string;
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Every file under `dir` matching one of `extensions`, repository-relative and sorted. */
export function filesUnder(
  root: string,
  dir: string,
  extensions: readonly string[],
): string[] {
  const absolute = join(root, dir);
  if (!isDir(absolute)) return [];
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) {
          continue;
        }
        walk(full);
        continue;
      }
      if (extensions.some((extension) => entry.name.endsWith(extension))) {
        out.push(relative(root, full).split("\\").join("/"));
      }
    }
  };
  walk(absolute);
  return out.sort();
}

/**
 * The purpose of a file: an explicit `@purpose` tag wins, otherwise the first content line of the
 * first `/** ` block (which may sit after `"use client"` or after the imports, as the route files
 * do). Empty string when there is neither.
 */
export function purposeOf(source: string): string {
  const tagged = /@purpose\s+(.+)/.exec(source);
  if (tagged?.[1] !== undefined) return clean(tagged[1]);
  const block = /\/\*\*\s*\n([\s\S]*?)\*\//.exec(source);
  const body = block?.[1];
  if (body === undefined) {
    // A one-line doc comment: `/** … */`.
    const single = /\/\*\*\s*(.+?)\s*\*\//.exec(source);
    return single?.[1] === undefined ? "" : clean(single[1]);
  }
  for (const line of body.split("\n")) {
    const text = line.replace(/^\s*\*\s?/, "").trim();
    if (text !== "") return clean(text);
  }
  return "";
}

function clean(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\|/g, "\\|")
    .trim()
    .replace(/[.\s]+$/, "");
}

/** The owning spec of a file, as `spec NNN`, or `—` when nothing names one. */
export function specOf(source: string): string {
  const head = source.slice(0, 4000);
  const tagged = /@spec\s+(\d{3})/.exec(head);
  if (tagged?.[1] !== undefined) return `spec ${tagged[1]}`;
  const owned = /Owned by: ([^*.]+)/.exec(head);
  if (owned?.[1] !== undefined) {
    const specs = [...owned[1].matchAll(/spec (\d{3})/g)].map(
      (match) => match[1] ?? "",
    );
    if (specs.length > 0) return `spec ${[...new Set(specs)].join(", ")}`;
  }
  const mentioned = /spec[s]? (\d{3})/.exec(head);
  return mentioned?.[1] === undefined ? "—" : `spec ${mentioned[1]}`;
}

/** Strips the barrel's `Owned by: …` sentence from the purpose; the spec has its own column. */
function withoutOwner(purpose: string): string {
  return purpose.replace(/\s*Owned by:.*$/, "").replace(/[.\s]+$/, "");
}

function truncate(text: string, limit = PURPOSE_LIMIT): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Which test files import which source file. Only relative specifiers are resolved (the repository
 * has no path aliases in tests), and a specifier without an extension is matched against the
 * candidate paths with `.ts`, `.tsx` and `/index.ts` appended.
 */
export function testIndex(root: string): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const testFiles = filesUnder(root, "tests", [".ts", ".tsx"]);
  for (const file of testFiles) {
    const source = readFileSync(join(root, file), "utf8");
    const specifiers = [
      ...source.matchAll(/from\s+"([^"]+)"/g),
      ...source.matchAll(/import\(\s*"([^"]+)"/g),
    ]
      .map((match) => match[1] ?? "")
      .filter((specifier) => specifier.startsWith("."));
    for (const specifier of new Set(specifiers)) {
      const resolved = relative(
        root,
        resolve(dirname(join(root, file)), specifier),
      )
        .split("\\")
        .join("/");
      for (const candidate of [
        resolved,
        `${resolved}.ts`,
        `${resolved}.tsx`,
        `${resolved}/index.ts`,
      ]) {
        const bucket = index.get(candidate);
        if (bucket === undefined) index.set(candidate, [file]);
        else if (!bucket.includes(file)) bucket.push(file);
      }
    }
  }
  for (const bucket of index.values()) bucket.sort();
  return index;
}

/** The `pnpm` script that runs each `scripts/*.ts` file, keyed by repository-relative path. */
export function scriptNames(root: string): Map<string, string[]> {
  const manifest: unknown = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  const scripts =
    typeof manifest === "object" &&
    manifest !== null &&
    "scripts" in manifest &&
    typeof manifest.scripts === "object" &&
    manifest.scripts !== null
      ? (manifest.scripts as Record<string, string>)
      : {};
  const byPath = new Map<string, string[]>();
  for (const [name, command] of Object.entries(scripts)) {
    for (const match of command.matchAll(/(?:scripts|seed)\/[\w./-]+\.ts/g)) {
      const path = match[0];
      const bucket = byPath.get(path);
      if (bucket === undefined) byPath.set(path, [name]);
      else if (!bucket.includes(name)) bucket.push(name);
    }
  }
  return byPath;
}

function entryFor(
  root: string,
  path: string,
  label: string,
  tests: Map<string, string[]>,
  scripts?: Map<string, string[]>,
): MapEntry {
  const source = readFileSync(join(root, path), "utf8");
  const purpose = withoutOwner(purposeOf(source));
  const script = scripts?.get(path)?.[0];
  return {
    path,
    label,
    purpose: purpose === "" ? MISSING_PURPOSE : truncate(purpose),
    spec: specOf(source),
    tests: tests.get(path) ?? [],
    ...(script === undefined ? {} : { script }),
  };
}

export interface CodebaseMap {
  readonly modules: MapEntry[];
  readonly config: MapEntry[];
  readonly routes: MapEntry[];
  readonly scripts: MapEntry[];
  readonly layers: { readonly layer: string; readonly files: number }[];
}

/** Every entry the map lists, collected from the tree. */
export function collect(root: string): CodebaseMap {
  const tests = testIndex(root);
  const scripts = scriptNames(root);

  const modules = filesUnder(root, "src/modules", [".ts"])
    .filter((path) => /^src\/modules\/[^/]+\/index\.ts$/.test(path))
    .map((path) =>
      entryFor(root, path, path.split("/")[2] ?? path, testIndex1(tests, path)),
    );

  const config = filesUnder(root, "src/config", [".ts"]).map((path) =>
    entryFor(root, path, path.replace("src/config/", ""), tests),
  );

  const routes = filesUnder(root, "src/app", [".ts", ".tsx"]).map((path) =>
    entryFor(root, path, path.replace("src/app/", ""), tests),
  );

  const scriptEntries = filesUnder(root, "scripts", [".ts"]).map((path) =>
    entryFor(root, path, path.replace("scripts/", ""), tests, scripts),
  );

  const layers = TEST_LAYERS.map((layer) => ({
    layer,
    files: filesUnder(root, `tests/${layer}`, [
      ".ts",
      ".tsx",
      ".json",
      ".md",
      ".css",
    ]).length,
  })).filter((entry) => entry.files > 0);

  return { modules, config, routes, scripts: scriptEntries, layers };
}

/**
 * A module's tests are the tests importing anything under `src/modules/<name>/`, not only the
 * barrel — the unit suite imports `…/i18n/messages.ts` directly.
 */
function testIndex1(
  tests: Map<string, string[]>,
  barrel: string,
): Map<string, string[]> {
  const prefix = barrel.replace(/index\.ts$/, "");
  const files = new Set<string>();
  for (const [target, importers] of tests) {
    if (target.startsWith(prefix) && target.endsWith(".ts")) {
      for (const importer of importers) files.add(importer);
    }
  }
  return new Map([[barrel, [...files].sort()]]);
}

function testCell(tests: string[]): string {
  if (tests.length === 0) return "—";
  const shown = tests
    .slice(0, TESTS_LISTED)
    .map((test) => `\`${test.replace(/^tests\//, "")}\``)
    .join(", ");
  const rest = tests.length - TESTS_LISTED;
  return rest > 0 ? `${shown} +${String(rest)}` : shown;
}

function table(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  return [
    `| ${header.join(" | ")} |`,
    `|${"---|".repeat(header.length)}`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

/** The generated half of the map, ending with a blank line before the hand-maintained tail. */
export function renderGenerated(map: CodebaseMap): string {
  const sections: string[] = [
    "# Codebase map",
    "",
    "Generated by `pnpm codebase:map` from the module barrels, `src/config/`, `src/app/**`,",
    '`scripts/*.ts` and `tests/<layer>/`. **Do not edit above the "Where does X live?" heading** —',
    "edit the doc comment of the file instead and re-run the generator. `pnpm codebase:map --check`",
    "fails when this file is stale or when a file has no purpose (spec 001 §14 A15, AC-33).",
    "",
    "Read this before exploring: it is the index an agent needs to open the two or three files a",
    "task actually touches.",
    "",
    "## Modules (`src/modules/*/index.ts`)",
    "",
    table(
      ["Module", "Purpose", "Spec", "Tests"],
      map.modules.map((entry) => [
        `\`${entry.label}\``,
        entry.purpose,
        entry.spec,
        testCell(entry.tests),
      ]),
    ),
    "",
    "## Config (`src/config/`)",
    "",
    table(
      ["File", "Purpose", "Spec"],
      map.config.map((entry) => [
        `\`${entry.label}\``,
        entry.purpose,
        entry.spec,
      ]),
    ),
    "",
    "## Routes (`src/app/`)",
    "",
    table(
      ["File", "Purpose", "Spec"],
      map.routes.map((entry) => [
        `\`${entry.label}\``,
        entry.purpose,
        entry.spec,
      ]),
    ),
    "",
    "## Scripts (`scripts/`)",
    "",
    table(
      ["Script", "`pnpm`", "Purpose"],
      map.scripts.map((entry) => [
        `\`${entry.label}\``,
        entry.script === undefined ? "—" : `\`${entry.script}\``,
        entry.purpose,
      ]),
    ),
    "",
    "## Test layers (`tests/`)",
    "",
    table(
      ["Layer", "Files"],
      map.layers.map((entry) => [
        `\`tests/${entry.layer}/\``,
        String(entry.files),
      ]),
    ),
    "",
  ];
  return sections.join("\n");
}

/** The whole file: the generated half plus the hand-maintained tail, taken from `committed`. */
export function renderMap(map: CodebaseMap, committed: string): string {
  const index = committed.indexOf(HAND_MAINTAINED_HEADING);
  const tail =
    index === -1
      ? `${HAND_MAINTAINED_HEADING}\n\n${table(["Question", "Where"], [["TODO", "TODO"]])}\n`
      : committed.slice(index);
  return `${renderGenerated(map)}\n${tail.replace(/\n*$/, "\n")}`;
}

export function readCommitted(root: string): string {
  try {
    return readFileSync(join(root, MAP_PATH), "utf8");
  } catch {
    return "";
  }
}

/** Everything wrong with the committed map (empty = healthy). */
export function checkMap(root: string): string[] {
  const problems: string[] = [];
  const committed = readCommitted(root);
  if (committed === "") {
    problems.push(`${MAP_PATH} is missing — run \`pnpm codebase:map\``);
    return problems;
  }
  if (!committed.includes(HAND_MAINTAINED_HEADING)) {
    problems.push(
      `${MAP_PATH} has no "${HAND_MAINTAINED_HEADING}" section — the hand-maintained table must stay`,
    );
  }
  const map = collect(root);
  for (const entry of [
    ...map.modules,
    ...map.config,
    ...map.routes,
    ...map.scripts,
  ]) {
    if (entry.purpose === MISSING_PURPOSE) {
      problems.push(
        `${entry.path}: no doc comment — add a first doc-comment line or an \`@purpose\` tag`,
      );
    }
  }
  const generated = renderMap(map, committed);
  if (generated !== committed) {
    problems.push(
      `${MAP_PATH} is stale — run \`pnpm codebase:map\` and commit the result`,
    );
  }
  return problems;
}

/** Rewrites the map, preserving the hand-maintained tail. Returns the bytes written. */
export function writeMap(root: string): number {
  const contents = renderMap(collect(root), readCommitted(root));
  writeFileSync(join(root, MAP_PATH), contents, "utf8");
  return Buffer.byteLength(contents, "utf8");
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  const root = resolve(
    args.find((arg) => !arg.startsWith("--")) ?? process.cwd(),
  );
  if (args.includes("--check")) {
    const problems = checkMap(root);
    if (problems.length > 0) {
      for (const problem of problems)
        process.stderr.write(`codebase map: ${problem}\n`);
      process.exit(1);
    }
    const bytes = Buffer.byteLength(readCommitted(root), "utf8");
    process.stdout.write(
      `codebase map ok: ${MAP_PATH} is current (${String(bytes)} bytes)\n`,
    );
  } else {
    const bytes = writeMap(root);
    const map = collect(root);
    process.stdout.write(
      `wrote ${MAP_PATH}: ${String(map.modules.length)} module(s), ` +
        `${String(map.config.length)} config file(s), ${String(map.routes.length)} route file(s), ` +
        `${String(map.scripts.length)} script(s), ${String(bytes)} bytes\n`,
    );
  }
}
