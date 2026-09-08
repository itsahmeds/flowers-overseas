/**
 * `pnpm i18n:pseudo [--check] [--messages-dir messages]` (spec 003 §2 "Pseudo-locales", AC-29;
 * TASK-042).
 *
 * Writes the two generated catalogues, `messages/en-XA.json` (accented, expanded, bracketed) and
 * `messages/ar-XB.json` (RTL mirror), from `messages/en.json` through
 * `src/modules/i18n/pseudo.ts`. Both outputs are **git-ignored**: they are derived data, and the
 * routes derive the same values in memory from the same function, so a stale file cannot reach a
 * document (see the header of `src/modules/i18n/messages.ts`). What the files are for is a human
 * reading a diff, a translator eyeballing expansion, and the determinism clause below.
 *
 * `--check` writes nothing and exits non-zero when a file on disk differs from what this run
 * would produce — the same comparison `pnpm i18n:check` makes through `pseudoFileProblems()`, so
 * "regenerating the pseudo-locales produces no diff" (§2, AC-29) is one implementation used from
 * two places. A missing file is *not* a fault for `i18n:check` (the files are git-ignored, so a
 * fresh clone has none) but it **is** one for `--check`, which is the explicit "are my generated
 * files current" question.
 *
 * Deterministic by construction: no clock, no randomness, no network, sorted keys at every level,
 * two-space indent and one trailing newline (the Prettier shape, as `i18n:draft` writes too).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PSEUDO_LOCALE_CODES } from "../src/config/locales.ts";
import { generatePseudoCatalogues } from "../src/modules/i18n/pseudo.ts";
import { MessagesSchema } from "../src/modules/i18n/schemas.ts";

export const CLI_NAME = "i18n:pseudo";
export const DEFAULT_MESSAGES_DIR = "messages";
/** The authored catalogue every pseudo-locale is generated from. */
export const SOURCE_LOCALE = "en";

/** One generated file: where it goes and the exact bytes it must contain. */
export interface PseudoFile {
  readonly locale: string;
  /** Absolute path. */
  readonly path: string;
  readonly contents: string;
}

/** Two-space indent, one trailing newline: what Prettier prints for a JSON file. */
function serialise(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * The bytes both pseudo catalogues should have, given the English catalogue in `messagesDir`.
 * `messages/en.json` is parsed with `MessagesSchema` first: it is a boundary, and generating from
 * a malformed source would write two malformed files rather than name the offending path.
 */
export function renderPseudoFiles(messagesDir: string): readonly PseudoFile[] {
  const sourcePath = join(messagesDir, `${SOURCE_LOCALE}.json`);
  const parsed = MessagesSchema.safeParse(
    JSON.parse(readFileSync(sourcePath, "utf8")),
  );
  if (!parsed.success) {
    throw new Error(
      `${sourcePath} is not a valid message catalogue: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  const catalogues = generatePseudoCatalogues(parsed.data);
  return PSEUDO_LOCALE_CODES.map((locale) => ({
    locale,
    path: join(messagesDir, `${locale}.json`),
    contents: serialise(catalogues[locale]),
  }));
}

export interface PseudoFileProblem {
  readonly file: string;
  readonly reason: string;
}

/**
 * Compare what is on disk with what this generator produces.
 *
 * `requirePresent: false` (what `pnpm i18n:check` passes) skips a file that does not exist,
 * because the outputs are git-ignored and a clean clone legitimately has none; `true` (what
 * `--check` passes) reports it, because the question asked was whether the files are current.
 */
export function pseudoFileProblems(
  messagesDir: string,
  options: { readonly root: string; readonly requirePresent?: boolean },
): readonly PseudoFileProblem[] {
  const problems: PseudoFileProblem[] = [];
  for (const file of renderPseudoFiles(messagesDir)) {
    const display = relative(options.root, file.path) || file.path;
    if (!existsSync(file.path)) {
      if (options.requirePresent === true) {
        problems.push({
          file: display,
          reason: `is missing; run \`pnpm ${CLI_NAME}\``,
        });
      }
      continue;
    }
    if (readFileSync(file.path, "utf8") !== file.contents) {
      problems.push({
        file: display,
        reason: `differs from the deterministic output of \`pnpm ${CLI_NAME}\` (spec 003 §2, AC-29); regenerate it and do not hand-edit a generated catalogue`,
      });
    }
  }
  return problems;
}

/** Write both files. Returns the files whose bytes changed, so a re-run reports "no change". */
export function writePseudoFiles(messagesDir: string): readonly PseudoFile[] {
  const changed: PseudoFile[] = [];
  for (const file of renderPseudoFiles(messagesDir)) {
    const current = existsSync(file.path)
      ? readFileSync(file.path, "utf8")
      : undefined;
    if (current === file.contents) continue;
    writeFileSync(file.path, file.contents, "utf8");
    changed.push(file);
  }
  return changed;
}

export interface CliStreams {
  readonly out: { write: (chunk: string) => unknown };
  readonly err: { write: (chunk: string) => unknown };
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  const value = index === -1 ? undefined : argv[index + 1];
  return value === undefined || value === "" ? undefined : value;
}

export function main(
  argv: readonly string[],
  streams: CliStreams = { out: process.stdout, err: process.stderr },
): number {
  const root = process.cwd();
  const messagesDir = resolve(
    root,
    argValue(argv, "--messages-dir") ?? DEFAULT_MESSAGES_DIR,
  );

  if (argv.includes("--check")) {
    const problems = pseudoFileProblems(messagesDir, {
      root,
      requirePresent: true,
    });
    if (problems.length > 0) {
      streams.err.write(
        [
          `${CLI_NAME} --check failed with ${String(problems.length)} problem(s):`,
          ...problems.map(
            (problem) => `  - ${problem.file}: ${problem.reason}`,
          ),
        ].join("\n") + "\n",
      );
      return 1;
    }
    streams.out.write(
      `${CLI_NAME} --check: ${String(PSEUDO_LOCALE_CODES.length)} generated catalogue(s) match the source\n`,
    );
    return 0;
  }

  const changed = writePseudoFiles(messagesDir);
  const names = PSEUDO_LOCALE_CODES.map((locale) => `${locale}.json`).join(
    " and ",
  );
  streams.out.write(
    changed.length === 0
      ? `${CLI_NAME}: no change; ${names} are already generated from ${SOURCE_LOCALE}.json\n`
      : `${CLI_NAME}: wrote ${changed
          .map((file) => relative(root, file.path) || file.path)
          .join(" and ")} from ${SOURCE_LOCALE}.json\n`,
  );
  return 0;
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const code = main(process.argv.slice(2));
  if (code !== 0) process.exit(code);
}
