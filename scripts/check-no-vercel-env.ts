/**
 * @purpose Host-agnostic env gate (spec 040 AC-2)
 *
 * `pnpm check:no-vercel-env` (spec 040 §5.2 "The grep gate", AC-2 / T-02; TASK-097).
 *
 * The mechanism that turns "the `APP_ENV` abstraction is complete" into a check rather than a
 * claim. It fails when `VERCEL_ENV`, `NEXT_PUBLIC_VERCEL_ENV` or `VERCEL_GIT_COMMIT_SHA` is
 * **read** anywhere under `src/`, `scripts/` or `tests/` except the two modules spec 040 exempts:
 *
 *  - `src/lib/env.schema.ts` — `appEnvironment()`'s compatibility fallback and `commitSha()`;
 *  - `src/lib/sentry.ts` — the release, which needs the `NEXT_PUBLIC_` mirror a browser can read.
 *
 * Keeping the reads in those two files is what makes the eventual Vercel unlink (§13 Q5) a
 * two-file diff instead of an archaeology exercise.
 *
 * ## What counts as a read
 *
 * A **member or index access** of one of the keys: a dotted `process.env` read, a bracketed
 * `source[…]` read, a field read off a parsed env object — and, since `/review 68`, the two
 * idiomatic spellings of the same read that a line-by-line member-access regex misses: a
 * **destructuring** read (the key standing bare, or renamed with a colon, inside a `{ … }` pattern
 * on the left of an assignment, however deeply nested) and a **wrapped member chain**, where the
 * formatter has put the final `.KEY` or `["KEY"]` step on its own continuation line. A destructured
 * read is a read; leaving it out left the gate with a door in it.
 *
 * That is the precise thing the spec
 * bans — this file scans itself, so the forms are described rather than written — and the
 * precision matters
 * because the tests for the abstraction have to *write* those keys to exercise the fallback path
 * (`appEnvironment({ VERCEL_ENV: "preview" })` is T-01's second row) and to populate the
 * `.env` fixtures. An object-literal key, an array of key names and a string in a comment are all
 * left alone: none of them makes application behaviour depend on the platform.
 *
 * Modelled on `scripts/check-no-db-imports.ts` (`pnpm check:no-db`), which sits beside it in the
 * `lint` job: same walk, same "extend the constant, not the caller" shape, same exit contract —
 * a line per hit on stderr and a non-zero status, or one line on stdout.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The trees the gate walks. Directories, walked recursively. */
export const SCANNED_PATHS = ["src", "scripts", "tests"] as const;

/**
 * The two modules allowed to read the keys, by repository-relative path (spec 040 §5.2). Adding a
 * third is a spec change, not a script change: the whole value of the gate is that the list is
 * short enough to read.
 */
export const ALLOWED_FILES = [
  "src/lib/env.schema.ts",
  "src/lib/sentry.ts",
] as const;

/** The keys no other file may read (spec 040 §5.2, AC-2). */
export const BANNED_KEYS = [
  "VERCEL_ENV",
  "NEXT_PUBLIC_VERCEL_ENV",
  "VERCEL_GIT_COMMIT_SHA",
] as const;

const SCANNED_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"];

/**
 * The four shapes of a read of `KEY`, in the order they are listed here:
 *
 * 1. a dotted member access, `<expression>.KEY`;
 * 2. an index access, `<expression>["KEY"]` / `<expression>['KEY']`;
 * 3. a **wrapped member chain**: the same two steps when the formatter has broken the chain and
 *    the line carries only the final `.KEY` or `["KEY"]` step. Anchored at the start of the line
 *    (whitespace only before it), which is the one position where a leading `.` cannot be anything
 *    but a continuation;
 * 4. a **destructuring** read: the key inside a `{ … }` pattern that an `=` immediately follows —
 *    `{ KEY }`, the renamed `{ KEY: local }`, and either of those nested inside a larger pattern.
 *    The trailing `=` is the whole discrimination: an object *literal* holding the key is followed
 *    by `;`, `,` or `)`, never by `=`, so T-01's `appEnvironment({ VERCEL_ENV: "preview" })` stays
 *    out of the hit set while `const { … } = process.env` does not. `[^;\n]` bounds the pattern to
 *    one statement on one line so a later statement's `=` cannot reach back over a `;`, and
 *    `(?!=)` keeps `===` from counting as an assignment.
 *
 * The leading `[\w$)\]]` of 1 and 2 is what keeps an object-literal key and a bare string in a list
 * (`"VERCEL_GIT_COMMIT_SHA",`) out of the hit set: both are writes or data, and T-01 needs to write
 * every one of these keys.
 *
 * `NEXT_PUBLIC_VERCEL_ENV` is checked before `VERCEL_ENV` by `readsOf()` so the longer key is
 * reported under its own name rather than as a suffix match.
 */
function readPatterns(key: string): readonly RegExp[] {
  return [
    new RegExp(`[\\w$)\\]]\\s*\\.\\s*${key}\\b`),
    new RegExp(`[\\w$)\\]]\\s*\\[\\s*["']${key}["']\\s*\\]`),
    new RegExp(`^\\s*(?:\\.\\s*${key}\\b|\\[\\s*["']${key}["']\\s*\\])`),
    new RegExp(`\\{[^;\\n]*\\b${key}\\b[^;\\n]*\\}\\s*=(?!=)`),
  ];
}

export interface Hit {
  file: string;
  line: number;
  key: string;
  text: string;
}

function walk(dir: string): string[] {
  const files: string[] = [];
  const stat = statSync(dir, { throwIfNoEntry: false });
  if (stat?.isDirectory() !== true) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
      continue;
    }
    if (SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

/** The banned key a line reads, longest key first, or `undefined`. */
function readsOf(text: string): string | undefined {
  const byLength = [...BANNED_KEYS].sort((a, b) => b.length - a.length);
  return byLength.find((key) =>
    readPatterns(key).some((pattern) => pattern.test(text)),
  );
}

export function findVercelEnvReads(
  root: string,
  paths: readonly string[] = SCANNED_PATHS,
  allowed: readonly string[] = ALLOWED_FILES,
): Hit[] {
  const allowedSet = new Set(allowed);
  const hits: Hit[] = [];
  for (const path of paths) {
    for (const file of walk(join(root, path))) {
      const relativePath = relative(root, file).split("\\").join("/");
      if (allowedSet.has(relativePath)) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((text, index) => {
          const key = readsOf(text);
          if (key === undefined) return;
          hits.push({
            file: relativePath,
            line: index + 1,
            key,
            text: text.trim(),
          });
        });
    }
  }
  return hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const root = resolve(process.argv[2] ?? process.cwd());
  const hits = findVercelEnvReads(root);
  if (hits.length > 0) {
    for (const hit of hits) {
      process.stderr.write(
        `${hit.file}:${String(hit.line)}: reads ${hit.key}: ${hit.text}\n`,
      );
    }
    process.stderr.write(
      `${String(hits.length)} platform-specific env read(s) outside ${ALLOWED_FILES.join(" and ")} (spec 040 AC-2 allows none). Use \`appEnvironment()\`, \`hostPlatform()\` or \`commitSha()\` from src/lib/env.schema.ts.\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `no read of ${BANNED_KEYS.join(", ")} under ${SCANNED_PATHS.join(", ")} outside ${ALLOWED_FILES.join(" and ")} (spec 040 AC-2)\n`,
  );
}
