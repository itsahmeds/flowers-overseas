/**
 * Walk the import graph of a repository file — the shared half of two guards (TASK-046's
 * `error-document.test.ts`, TASK-085's `client-message-graph.test.ts`).
 *
 * Both answer a question about a graph nobody can hold in their head: "can this Client Component
 * reach zod / a message catalogue / next-intl's client hooks?" Reading the file is not enough,
 * because the failure mode is a transitive import three files deep that nobody notices, and one
 * such import puts tens of kilobytes into every document's initial script set (spec 003 §14 A12,
 * spec 004 §14 A1 addendum).
 *
 * Deliberately a text walk over `import`/`export … from` specifiers rather than a TypeScript
 * program: it needs no compiler host, it runs in milliseconds, and it over-approximates in the
 * safe direction — a type-only import of a value module still counts as an edge, so a guard built
 * on it can only be too strict, never too lax. `JSON` imports are recorded rather than followed,
 * because a static `messages/*.json` import is exactly what TASK-085 had to catch.
 *
 * The path aliases are **read from `tsconfig.json`** rather than hardcoded (`/review 70` change
 * 4): a walker that follows only `./…` specifiers sees a one-module graph for any file that
 * imports through `@/`, and a guard over a one-module graph cannot fail.
 */
import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../..");

/** Extensions the repository writes explicitly; anything else is part of the module's name. */
const MODULE_EXTENSIONS = [".ts", ".tsx", ".json", ".js", ".mjs", ".css"];

/**
 * `compilerOptions.paths` of the root `tsconfig.json`, as `[prefix, target]` pairs with the `*`
 * stripped — today the single `@/*` -> `./src/*`. Reading it keeps the walker honest if the
 * aliases ever change: nothing here has to be updated in two places.
 *
 * `tsconfig.json` is JSONC and the repository writes its comments on their own lines, so dropping
 * comment-only lines is enough to hand it to `JSON.parse`; a full JSONC parser would be a
 * dependency for one file.
 */
function tsconfigAliases(): readonly (readonly [string, string])[] {
  const jsonc = readFileSync(resolve(repoRoot, "tsconfig.json"), "utf8");
  const json = jsonc
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
  const parsed = JSON.parse(json) as {
    compilerOptions?: { paths?: Record<string, readonly string[]> };
  };
  return Object.entries(parsed.compilerOptions?.paths ?? {}).flatMap(
    ([pattern, targets]) => {
      const target = targets[0];
      return target === undefined
        ? []
        : [
            [
              pattern.replace(/\*$/u, ""),
              target.replace(/^\.\//u, "").replace(/\*$/u, ""),
            ] as const,
          ];
    },
  );
}

const ALIASES = tsconfigAliases();

/**
 * Resolve a specifier to a file inside the repository, or `undefined` for a package. Handles the
 * repository's two conventions: explicit `.ts`/`.tsx` extensions and the path aliases declared in
 * `tsconfig.json`'s `compilerOptions.paths` (`@/*` today).
 */
export function resolveImport(
  fromFile: string,
  specifier: string,
): string | undefined {
  const alias = ALIASES.find(([prefix]) => specifier.startsWith(prefix));
  const base =
    alias !== undefined
      ? resolve(repoRoot, alias[1], specifier.slice(alias[0].length))
      : specifier.startsWith(".")
        ? resolve(dirname(fromFile), specifier)
        : undefined;
  if (base === undefined) return undefined;
  // Only a *module* extension means "this is the file"; `error-copy.data` ends in `.data`, which
  // is part of the name (`locales.data.ts`, `error-copy.data.ts` — the repository's convention for
  // an import-free constants module), so it still needs the candidate loop below.
  if (MODULE_EXTENSIONS.includes(extname(base))) return base;
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      continue;
    }
  }
  return undefined;
}

/** `import … from "x"`, `export … from "x"` and bare `import "x"`, single or double quoted. */
const SPECIFIER =
  /(?:^|\n)\s*(?:import|export)\s(?:[^;'"]*?from\s*)?["']([^"']+)["']/g;

export interface ImportClosure {
  /** Every repository file reachable from the entry, the entry included. */
  readonly files: ReadonlySet<string>;
  /** Every bare package specifier seen anywhere in the closure. */
  readonly packages: ReadonlySet<string>;
  /** Every repository `.json` reached — recorded, not walked. */
  readonly json: ReadonlySet<string>;
}

/** Every repository file reachable from `entry`, plus the packages and JSON files it reaches. */
export function importClosure(entry: string): ImportClosure {
  const files = new Set<string>();
  const packages = new Set<string>();
  const json = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || files.has(file)) continue;
    files.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(SPECIFIER)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      const resolved = resolveImport(file, specifier);
      if (resolved === undefined) {
        packages.add(specifier);
        continue;
      }
      if (resolved.endsWith(".json")) {
        json.add(resolved);
        continue;
      }
      queue.push(resolved);
    }
  }
  return { files, packages, json };
}
