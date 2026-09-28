/**
 * `pnpm check:no-literal-disable` (spec 001 §14 A20, AC-51 / T-55, TASK-158; AC-6 / T-07,
 * TASK-003, is now a subset of it).
 *
 * The lock that `eslint.config.mjs` cannot switch off. AC-50 makes every inline ESLint comment
 * powerless with `linterOptions.noInlineConfig`, but that is itself one line of the config; this
 * scan does not read the config, so if that line is deleted the comments that matter still go
 * red here (and `tests/unit/lint-coverage.test.ts` goes red as well). It exits 1 and prints
 * `file:line: <comment>` with the reason for:
 *
 * - (a) an `eslint-disable`, `eslint-disable-line`, `eslint-disable-next-line` or `eslint-enable`
 *   directive that names no rule — the audit's bare `/* eslint-disable *\/`, which switches every
 *   rule off (text after ` -- ` is a description, not a rule);
 * - (b) any of those, or an `eslint` config comment, that names a rule starting `fo/`, so every
 *   rule of the local plugin, including any added later;
 * - (c) a `stylelint-disable` (or `-line`, `-next-line`, `stylelint-enable`) comment in a `.css`
 *   file under `src/` (§13 Q18; Stylelint's own `ignoreDisables: true` is the other half).
 *
 * It reads **comments only**: TypeScript's parser finds them (so directive text inside a string,
 * a template or JSX text never counts), and ESLint's own grammar decides what is a directive (the
 * comment text, trimmed, starts with the directive's name), so prose that mentions a directive is
 * left alone. A named disable of a rule that is not ours passes here; AC-50 makes it powerless
 * and `--max-warnings 0` fails the run on ESLint's "has no effect" warning.
 *
 * It covers every file `eslint .` lints — `src/`, `scripts/`, `seed/`, `db/`, `eslint/`, `types/`,
 * `tests/` except `tests/fixtures/` (whose files break the rules on purpose), and the root config
 * files — which `tests/unit/no-literal-disable.test.ts` checks against ESLint's own answer.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/** The folders `eslint .` lints, beside the root config files. */
export const SCAN_ROOTS = [
  "src",
  "scripts",
  "seed",
  "db",
  "eslint",
  "types",
  "tests",
] as const;

/** Never scanned: fixtures violate the rules on purpose, exactly as `globalIgnores` says. */
export const EXCLUDED_PATHS = ["tests/fixtures"] as const;

/** Only `src/` holds the CSS Stylelint lints (`lint:css` globs `src/**\/*.css`). */
const CSS_ROOT = "src";

const SCRIPT_KINDS: Readonly<Record<string, ts.ScriptKind>> = {
  ".ts": ts.ScriptKind.TS,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".js": ts.ScriptKind.JS,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
};

export type LockedCommentReason =
  "bare-directive" | "fo-rule" | "stylelint-disable";

export const REASONS: Readonly<Record<LockedCommentReason, string>> = {
  "bare-directive":
    "names no rule, so it switches every rule off (spec 001 AC-51 (a))",
  "fo-rule": "names an fo/ rule (spec 001 AC-51 (b))",
  "stylelint-disable":
    "switches Stylelint off in CSS (spec 001 AC-51 (c), §13 Q18)",
};

export interface LockedComment {
  /** Repository-relative, `/`-separated. */
  file: string;
  /** 1-based line the comment starts on. */
  line: number;
  /** The comment, whitespace collapsed. */
  text: string;
  reason: LockedCommentReason;
}

/** ESLint's disable/enable directives (`@eslint/plugin-kit` `ConfigCommentParser`). */
const DISABLE_LABEL =
  /^(eslint-disable(?:-next-line|-line)?|eslint-enable)(?:\s|$)/;
/** ESLint's rule-config comment, `/* eslint rule: off *\/`. */
const CONFIG_LABEL = /^eslint(?:\s|$)/;
/** A rule name starting `fo/`, bare or quoted, in a list or an object literal. */
const FO_RULE = /(?:^|[\s,{"'])fo\//;
const STYLELINT_LABEL =
  /^stylelint-(?:disable|enable)(?:-next-line|-line)?(?:\s|$)/;

function extension(file: string): string {
  const dot = file.lastIndexOf(".");
  return dot === -1 ? "" : file.slice(dot);
}

/**
 * Classifies one ESLint comment by its value (the text between the delimiters), the way ESLint
 * parses it: split off a ` -- ` justification, trim, and read the label.
 */
export function classifyEslintComment(
  value: string,
): LockedCommentReason | undefined {
  const justification = /\s-{2,}\s/.exec(value);
  const directive = (
    justification === null ? value : value.slice(0, justification.index)
  ).trim();
  const disable = DISABLE_LABEL.exec(directive);
  if (disable !== null) {
    const rules = directive.slice(disable[1]?.length ?? 0).trim();
    if (rules === "") return "bare-directive";
    return FO_RULE.test(rules) ? "fo-rule" : undefined;
  }
  if (CONFIG_LABEL.test(directive)) {
    return FO_RULE.test(directive.slice("eslint".length).trim())
      ? "fo-rule"
      : undefined;
  }
  return undefined;
}

/** Every comment in a script file, found through the parse tree rather than a text search. */
function scriptComments(
  file: string,
  text: string,
  kind: ts.ScriptKind,
): { pos: number; text: string; line: number; value: string }[] {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    false,
    kind,
  );
  const ranges = new Map<number, ts.CommentRange>();
  const jsxText: [number, number][] = [];
  const add = (found: ts.CommentRange[] | undefined): void => {
    for (const range of found ?? []) ranges.set(range.pos, range);
  };
  const visit = (node: ts.Node): void => {
    // JSX text is not trivia: `<p>// hi</p>` holds no comment. JSDoc nodes sit inside a comment.
    if (node.kind === ts.SyntaxKind.JsxText) {
      jsxText.push([node.pos, node.end]);
      return;
    }
    if (
      node.kind >= ts.SyntaxKind.FirstJSDocNode &&
      node.kind <= ts.SyntaxKind.LastJSDocNode
    ) {
      return;
    }
    add(ts.getLeadingCommentRanges(text, node.pos));
    add(ts.getTrailingCommentRanges(text, node.end));
    for (const child of node.getChildren(source)) visit(child);
  };
  visit(source);
  return [...ranges.values()]
    .filter(
      (range) =>
        !jsxText.some(([start, end]) => range.pos >= start && range.pos < end),
    )
    .sort((a, b) => a.pos - b.pos)
    .map((range) => {
      const raw = text.slice(range.pos, range.end);
      const value =
        range.kind === ts.SyntaxKind.SingleLineCommentTrivia
          ? raw.slice(2)
          : raw.slice(2, raw.endsWith("*/") ? -2 : undefined);
      return {
        pos: range.pos,
        text: raw,
        value,
        line: source.getLineAndCharacterOfPosition(range.pos).line + 1,
      };
    });
}

/** Every `/* … *\/` comment in a CSS file, skipping quoted strings. */
function cssComments(
  text: string,
): { text: string; line: number; value: string }[] {
  const found: { text: string; line: number; value: string }[] = [];
  let line = 1;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '"' || char === "'") {
      index += 1;
      while (index < text.length && text[index] !== char) {
        if (text[index] === "\\") index += 1;
        if (text[index] === "\n") line += 1;
        index += 1;
      }
      index += 1;
      continue;
    }
    if (char === "/" && text[index + 1] === "*") {
      const close = text.indexOf("*/", index + 2);
      const stop = close === -1 ? text.length : close + 2;
      const raw = text.slice(index, stop);
      found.push({
        text: raw,
        line,
        value: raw.slice(2, close === -1 ? undefined : -2),
      });
      line += raw.split("\n").length - 1;
      index = stop;
      continue;
    }
    if (char === "\n") line += 1;
    index += 1;
  }
  return found;
}

const collapse = (text: string): string => text.replace(/\s+/g, " ").trim();

/** The locked comments in one file's text; `file` is only used for its extension and the hit. */
export function findLockedCommentsInSource(
  file: string,
  text: string,
): LockedComment[] {
  const ext = extension(file);
  if (ext === ".css") {
    return cssComments(text).flatMap((comment) =>
      STYLELINT_LABEL.test(comment.value.trim())
        ? [
            {
              file,
              line: comment.line,
              text: collapse(comment.text),
              reason: "stylelint-disable" as const,
            },
          ]
        : [],
    );
  }
  const kind = SCRIPT_KINDS[ext];
  if (kind === undefined) return [];
  return scriptComments(file, text, kind).flatMap((comment) => {
    const reason = classifyEslintComment(comment.value);
    return reason === undefined
      ? []
      : [{ file, line: comment.line, text: collapse(comment.text), reason }];
  });
}

function walk(root: string, dir: string, css: boolean, into: string[]): void {
  let entries;
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      if (EXCLUDED_PATHS.some((excluded) => path === excluded)) continue;
      walk(root, path, css, into);
      continue;
    }
    const ext = extension(entry.name);
    if (SCRIPT_KINDS[ext] !== undefined || (css && ext === ".css"))
      into.push(path);
  }
}

/** Every file the scan reads, repository-relative and sorted. */
export function scannedFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && SCRIPT_KINDS[extension(entry.name)] !== undefined)
      files.push(entry.name);
  }
  for (const dir of SCAN_ROOTS) walk(root, dir, dir === CSS_ROOT, files);
  return files.sort();
}

export function findLockedComments(root: string): LockedComment[] {
  return scannedFiles(root).flatMap((file) =>
    findLockedCommentsInSource(file, readFileSync(join(root, file), "utf8")),
  );
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const root = resolve(process.argv[2] ?? process.cwd());
  const files = scannedFiles(root);
  const hits = files.flatMap((file) =>
    findLockedCommentsInSource(file, readFileSync(join(root, file), "utf8")),
  );
  if (hits.length > 0) {
    for (const hit of hits) {
      process.stderr.write(
        `${hit.file}:${String(hit.line)}: ${hit.text} — ${REASONS[hit.reason]}\n`,
      );
    }
    process.stderr.write(
      `check:no-literal-disable: ${String(hits.length)} locked comment(s) in ${String(files.length)} files; no comment may switch a lint rule off (spec 001 AC-51, §13 Q17/Q18)\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `check:no-literal-disable: ${String(files.length)} files, no bare or fo/ eslint directive and no stylelint-disable comment (spec 001 AC-51)\n`,
  );
}
