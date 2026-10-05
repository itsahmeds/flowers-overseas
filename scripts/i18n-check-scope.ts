/**
 * `pnpm i18n:check` check 11, "scope" (spec 003 §14 A17 clause 2, AC-41; TASK-224).
 *
 * The scope registry (`src/modules/i18n/review-scope.ts`) says which keys the 5 % unreviewed share
 * does not count: the keys only a page that is never indexed, or no page at all, renders. The
 * registry cannot prove that on its own, so this check holds every entry to its claim. It is an
 * error (a non-zero exit), like check 10, and it names the entry and, where there is one, the
 * file. It reports:
 *
 *  - an entry whose `match` reaches no `en` key (a typo, or an entry declared before its keys);
 *  - a malformed entry: a `match` that is not a namespace or a `prefix.*`, a `surface` outside the
 *    closed set, `paths` that are not a non-empty list of globs;
 *  - a matched key that check 2's usage scan reaches from a file outside the entry's `paths`;
 *  - a `paths` glob that matches a shared file (`SHARED_DIRECTORIES`, `SHARED_FILES`): a glob that
 *    covers a file every page uses would let the whole site count as one surface;
 *  - **the import rule**: a file under any entry's `paths` that a shared file, or a file under
 *    `src/app/[locale]/` outside every entry's `paths`, imports, directly or through other files.
 *    Without it a checkout component placed on a product page shows `checkout.*` copy on an
 *    indexable page while the key is named only inside a checkout file. The graph is the static
 *    `import`, `export ... from` and `import()` with a literal path of `src/`, read by
 *    TypeScript's own import scanner; `@/` resolves into the scanned `src/`. Keys built at run
 *    time are invisible here; spec 007's built-HTML marker check (A17 clause 4) owns them.
 *
 * Globs are relative to the directory that holds `src/` and use `**` (any depth) and `*` (within a
 * segment); every other character, `[locale]` and `(checkout)` included, is literal.
 */
import { dirname, join, relative, resolve, sep } from "node:path";

import ts from "typescript";

import {
  SCOPE_SURFACES,
  ScopeEntrySchema,
  matchReaches,
  type ScopeEntry,
} from "../src/modules/i18n/review-scope.ts";

export interface ScopeProblem {
  readonly file: string;
  readonly key?: string;
  readonly reason: string;
}

/** Directories every page type may render from. The task may add to this list; removing needs an amendment. */
export const SHARED_DIRECTORIES: readonly string[] = [
  "src/modules/ui/",
  "src/modules/seo/",
  "src/modules/catalog/",
  "src/modules/i18n/",
];
/** The localised shell and the document that serves every unmatched path. */
export const SHARED_FILES: readonly string[] = [
  "src/app/[locale]/layout.tsx",
  "src/app/[locale]/page.tsx",
  "src/app/not-found.tsx",
];
/** Pages under here are indexable unless an entry's `paths` covers them. */
const LOCALISED_APP = "src/app/[locale]/";

const SOURCE_EXTENSIONS = [".ts", ".tsx"];

/** `src/app/[locale]/(checkout)/**` -> a RegExp; only `**` and `*` are special. */
export function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob.charAt(index);
    if (char === "*" && glob.charAt(index + 1) === "*") {
      const slash = glob.charAt(index + 2) === "/";
      source += slash ? "(?:.*/)?" : ".*";
      index += slash ? 2 : 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else {
      source += char.replace(/[.+?^${}()|[\]\\/]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

function posixRelative(from: string, to: string): string {
  return relative(from, to).split(sep).join("/");
}

function isShared(path: string): boolean {
  return (
    SHARED_FILES.includes(path) ||
    SHARED_DIRECTORIES.some((directory) => path.startsWith(directory))
  );
}

function label(index: number, raw: unknown): string {
  const record =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const match = typeof record["match"] === "string" ? record["match"] : "?";
  const surface =
    typeof record["surface"] === "string" ? record["surface"] : "?";
  return `scope entry ${String(index + 1)} (match ${JSON.stringify(match)}, surface ${JSON.stringify(surface)})`;
}

/** The entries `ScopeEntrySchema` accepts: what check 11 injects and measures; the rest it reports. */
export function validScopeEntries(raw: readonly unknown[]): ScopeEntry[] {
  return raw.flatMap((entry) => {
    const parsed = ScopeEntrySchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export interface ScopeCheckInput {
  /** Directory that holds `src/`; globs are relative to it. */
  readonly base: string;
  /** Absolute `src` directory scanned. */
  readonly srcDir: string;
  /** How a source file is named in a problem (repo-relative, so the CI log is actionable). */
  readonly display: (absolute: string) => string;
  /** Display path of the file the entries came from, named in entry-level problems. */
  readonly scopeFile: string;
  /** The registry as written, before zod. */
  readonly raw: readonly unknown[];
  /** Every `en` key. */
  readonly sourceKeys: readonly string[];
  /** Absolute path -> text, for every scanned source file. */
  readonly files: ReadonlyMap<string, string>;
  /** Absolute path -> the keys check 2's scan reaches from that file, for the matched keys. */
  readonly usageByFile: ReadonlyMap<string, ReadonlySet<string>>;
}

/** Why a raw entry is not valid, in words; `undefined` when it is. */
function malformedReason(raw: unknown): string | undefined {
  if (ScopeEntrySchema.safeParse(raw).success) return undefined;
  const record =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : undefined;
  if (record === undefined) return "is not an object";
  const reasons: string[] = [];
  const surface = record["surface"];
  if (
    typeof surface !== "string" ||
    !(SCOPE_SURFACES as readonly string[]).includes(surface)
  ) {
    reasons.push(
      `surface ${JSON.stringify(surface)} is outside the closed set (${SCOPE_SURFACES.join(", ")})`,
    );
  }
  const parsed = ScopeEntrySchema.pick({ match: true }).safeParse(record);
  if (!parsed.success) {
    reasons.push(
      `match ${JSON.stringify(record["match"])} is not a top-level namespace or a dot prefix ending in \`.*\``,
    );
  }
  const paths = record["paths"];
  if (
    !Array.isArray(paths) ||
    paths.length === 0 ||
    paths.some((glob) => typeof glob !== "string" || glob === "")
  ) {
    reasons.push("paths must be a non-empty list of source globs");
  }
  const unknown = Object.keys(record).filter(
    (key) => !["match", "surface", "paths"].includes(key),
  );
  if (unknown.length > 0) {
    reasons.push(`has unknown field(s) ${unknown.join(", ")}`);
  }
  return reasons.join("; ");
}

function importsOf(content: string): string[] {
  return ts
    .preProcessFile(content, true, true)
    .importedFiles.map((entry) => entry.fileName);
}

function resolveImport(
  specifier: string,
  from: string,
  srcDir: string,
  known: ReadonlySet<string>,
): string | undefined {
  let target: string;
  if (specifier.startsWith("@/")) target = join(srcDir, specifier.slice(2));
  else if (specifier.startsWith("."))
    target = resolve(dirname(from), specifier);
  else return undefined;
  const stem = target.replace(/\.(?:m?js|tsx?)$/, "");
  const candidates = [
    target,
    ...SOURCE_EXTENSIONS.map((extension) => `${target}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => `${stem}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(target, `index${extension}`)),
  ];
  return candidates.find((candidate) => known.has(candidate));
}

export function scopeProblems(input: ScopeCheckInput): ScopeProblem[] {
  const problems: ScopeProblem[] = [];
  const { base, srcDir, scopeFile, display } = input;
  const rel = (path: string): string => posixRelative(base, path);
  const allFiles = [...input.files.keys()];

  // The shared files: the ones that exist, plus a probe in every shared directory and the named
  // files themselves, so a glob that would cover a shared file is refused even where the tree
  // under test has none yet.
  const sharedPaths = new Set<string>([
    ...allFiles.map(rel).filter(isShared),
    ...SHARED_FILES,
    ...SHARED_DIRECTORIES.flatMap((directory) => [
      `${directory}__probe.ts`,
      `${directory}__probe/__deep.tsx`,
    ]),
  ]);

  const valid: { entry: ScopeEntry; name: string; globs: RegExp[] }[] = [];
  input.raw.forEach((raw, index) => {
    const name = label(index, raw);
    const malformed = malformedReason(raw);
    if (malformed !== undefined) {
      problems.push({ file: scopeFile, reason: `${name} ${malformed}` });
      return;
    }
    const entry = ScopeEntrySchema.parse(raw);

    if (!input.sourceKeys.some((key) => matchReaches(entry.match, key))) {
      problems.push({
        file: scopeFile,
        reason: `${name} matches no \`en\` key: a typo, or an entry declared before its keys exist (an unmatched key counts, so it would change nothing)`,
      });
    }

    const globs = entry.paths.map(globToRegExp);
    entry.paths.forEach((glob, globIndex) => {
      const hit = [...sharedPaths].find((path) => globs[globIndex]?.test(path));
      if (hit !== undefined) {
        problems.push({
          file: scopeFile,
          reason: `${name}: paths glob ${JSON.stringify(glob)} matches the shared file \`${hit}\`. Every page type renders shared files (ui, seo, catalog, i18n, the localised shell), so no entry may claim them`,
        });
      }
    });
    valid.push({ entry, name, globs });
  });

  const inPaths = (path: string, entryIndex: number): boolean =>
    valid[entryIndex]?.globs.some((glob) => glob.test(path)) === true;
  const inAnyPaths = (path: string): boolean =>
    valid.some((_, entryIndex) => inPaths(path, entryIndex));

  // A matched key read from outside the entry's paths.
  valid.forEach(({ entry, name }, entryIndex) => {
    for (const [file, used] of input.usageByFile) {
      const path = rel(file);
      if (inPaths(path, entryIndex)) continue;
      const key = [...used].find((candidate) =>
        matchReaches(entry.match, candidate),
      );
      if (key === undefined) continue;
      problems.push({
        file: display(file),
        key,
        reason: `is read from outside the \`paths\` of ${name}: that file can render on a page the entry does not cover. Move the key to a counted namespace, or the reader into the entry's paths`,
      });
    }
  });

  // The import rule.
  if (valid.length > 0) {
    const known = new Set(allFiles);
    const parent = new Map<string, string>();
    const queue: string[] = allFiles.filter((file) => {
      const path = rel(file);
      return (
        isShared(path) || (path.startsWith(LOCALISED_APP) && !inAnyPaths(path))
      );
    });
    const seen = new Set(queue);
    const reached: string[] = [];
    for (let head = 0; head < queue.length; head += 1) {
      const file = queue[head];
      if (file === undefined) continue;
      const content = input.files.get(file) ?? "";
      for (const specifier of importsOf(content)) {
        const target = resolveImport(specifier, file, srcDir, known);
        if (target === undefined || seen.has(target)) continue;
        seen.add(target);
        parent.set(target, file);
        queue.push(target);
        reached.push(target);
      }
    }
    for (const file of reached) {
      const path = rel(file);
      const owner = valid.findIndex((_, entryIndex) =>
        inPaths(path, entryIndex),
      );
      if (owner === -1) continue;
      const chain: string[] = [path];
      for (
        let step = parent.get(file);
        step !== undefined;
        step = parent.get(step)
      ) {
        chain.unshift(rel(step));
      }
      problems.push({
        file: display(file),
        reason: `is under the \`paths\` of ${valid[owner]?.name ?? "a scope entry"} and an indexable page imports it (${chain.join(" -> ")}). Its keys would render on an indexable page: move the piece out of the entry's paths, and its keys then count`,
      });
    }
  }

  return problems;
}
