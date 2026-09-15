/**
 * The corridor content loader (spec 007 §2 "The content model", §5.2, AC-1; TASK-087).
 *
 * Pure, synchronous, network-free and clock-free: a path and a string in, a parsed record or a
 * named failure out. All the I/O is `corpus.ts`'s, which is what lets every rule of
 * `pnpm corridor:check` and every test drive the parser from a literal.
 *
 * **A malformed file fails the build, naming the file and the field** (AC-1). That is the whole
 * point of parsing at build time rather than at request time: `plan/02` §5.2's minimum-unique-data
 * rule is only real if a half-authored guide cannot render, and a page that 500s at request time
 * has already been crawled.
 *
 * The path is part of the record. `content/corridors/en/pl-guide.md` means locale `en`, country
 * `PL`, state `guide`; the frontmatter carries none of the three, so a copy/paste cannot leave a
 * file claiming to be a country it is not filed under.
 */
import { parse as parseYaml } from "yaml";
import type { z } from "zod";

import {
  CountryLocaleContentBaseSchema,
  CountryLocaleContentSchema,
  type CountryLocaleContent,
  type CountryLocaleContentBase,
  corridorStates,
} from "./schemas.ts";

/** Where authored corridor copy lives, repo-relative and POSIX-separated. */
export const CORRIDOR_CONTENT_DIR = "content/corridors";

/** `{locale}/{iso2}-{state}.md`, with the ISO code lowercased in the file name. */
const FILE_NAME_PATTERN = new RegExp(
  `^([a-z]{2}(?:-[a-z]{2})?)/([a-z]{2})-(${corridorStates.join("|")})\\.md$`,
  "u",
);

/** `---\n…\n---\n` at the very top of the file, then the body. Nothing else is a corridor file. */
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u;

/** One parse failure: the file to open, the field to look at, and what is wrong with it. */
export interface ContentParseIssue {
  /** Repo-relative path, so a CI log line can be pasted into an editor. */
  readonly file: string;
  /** The frontmatter field, or `-` for a whole-file fault (no frontmatter, bad YAML, bad name). */
  readonly field: string;
  readonly message: string;
}

export interface ContentParseFailure {
  readonly ok: false;
  readonly issues: readonly ContentParseIssue[];
}

export interface ContentParseSuccess<T> {
  readonly ok: true;
  readonly content: T;
}

export type ContentParseResult<T> =
  ContentParseSuccess<T> | ContentParseFailure;

/** The three facts a corridor file's path carries. */
export interface CorridorPathFacts {
  readonly locale: string;
  readonly iso2: string;
  readonly state: string;
}

/**
 * Split `content/corridors/en/pl-guide.md` into its three facts. The argument is the path
 * *relative to `content/corridors/`* — the caller owns the root, so a test needs no repository.
 */
export function corridorPathFacts(
  relativePath: string,
): CorridorPathFacts | undefined {
  const match = FILE_NAME_PATTERN.exec(relativePath.replaceAll("\\", "/"));
  if (match === null) return undefined;
  const [, locale, iso2, state] = match;
  if (locale === undefined || iso2 === undefined || state === undefined) {
    return undefined;
  }
  return { locale, iso2: iso2.toUpperCase(), state };
}

/** The repo-relative path of a corridor file, from its three facts. The only path builder. */
export function corridorContentPath(facts: CorridorPathFacts): string {
  return `${CORRIDOR_CONTENT_DIR}/${facts.locale}/${facts.iso2.toLowerCase()}-${facts.state}.md`;
}

/**
 * The raw halves of a corridor file: the frontmatter as YAML parsed into a plain value, and the
 * markdown body. Exposed because the gate reports a YAML fault and a *schema* fault as different
 * rules, and because a rule that greps the body must see it before any schema has run.
 */
export function splitCorridorFile(
  relativePath: string,
  source: string,
):
  | { readonly ok: true; readonly frontmatter: unknown; readonly body: string }
  | ContentParseFailure {
  const file = `${CORRIDOR_CONTENT_DIR}/${relativePath}`;
  const facts = corridorPathFacts(relativePath);
  if (facts === undefined) {
    return {
      ok: false,
      issues: [
        {
          file,
          field: "-",
          message:
            "file name is not `{locale}/{iso2}-{guide|live}.md` (spec 007 §5.2)",
        },
      ],
    };
  }
  const match = FRONTMATTER_PATTERN.exec(source);
  if (match === null) {
    return {
      ok: false,
      issues: [
        {
          file,
          field: "-",
          message: "file has no `---` YAML frontmatter block at its top",
        },
      ],
    };
  }
  const [, yamlText = "", body = ""] = match;
  let frontmatter: unknown;
  try {
    frontmatter = parseYaml(yamlText) as unknown;
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          file,
          field: "-",
          message: `frontmatter is not valid YAML: ${error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error)}`,
        },
      ],
    };
  }
  if (
    typeof frontmatter !== "object" ||
    frontmatter === null ||
    Array.isArray(frontmatter)
  ) {
    return {
      ok: false,
      issues: [
        { file, field: "-", message: "frontmatter is not a YAML mapping" },
      ],
    };
  }
  return { ok: true, frontmatter, body };
}

function parseWith<T>(
  safeParse: (value: unknown) => z.ZodSafeParseResult<T>,
  relativePath: string,
  source: string,
): ContentParseResult<T> {
  const file = `${CORRIDOR_CONTENT_DIR}/${relativePath}`;
  const split = splitCorridorFile(relativePath, source);
  if (!split.ok) return split;
  const facts = corridorPathFacts(relativePath);
  /* c8 ignore next -- `splitCorridorFile` has already refused an unparseable path. */
  if (facts === undefined) return { ok: false, issues: [] };

  const result = safeParse({
    ...(split.frontmatter as Record<string, unknown>),
    ...facts,
    body: split.body,
  });
  if (result.success) return { ok: true, content: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      file,
      field: issue.path.length === 0 ? "-" : issue.path.map(String).join("."),
      message: issue.message,
    })),
  };
}

/** Parse one corridor file under the full schema — the shape a page may render (AC-1). */
export function parseCorridorContent(
  relativePath: string,
  source: string,
): ContentParseResult<CountryLocaleContent> {
  return parseWith<CountryLocaleContent>(
    (value) => CountryLocaleContentSchema.safeParse(value),
    relativePath,
    source,
  );
}

/**
 * Parse one corridor file under the *shape only* — no editorial refinement. `pnpm corridor:check`
 * reads this so that "your FAQ has seven items" is reported as its own rule rather than as a
 * parse failure (spec 007 AC-2's rule list is eighteen distinct lines).
 */
export function parseCorridorContentShape(
  relativePath: string,
  source: string,
): ContentParseResult<CountryLocaleContentBase> {
  return parseWith<CountryLocaleContentBase>(
    (value) => CountryLocaleContentBaseSchema.safeParse(value),
    relativePath,
    source,
  );
}

/** One line per issue: `file: field — message`. The format the build error and the gate share. */
export function formatContentIssues(
  issues: readonly ContentParseIssue[],
): string {
  return issues
    .map((issue) => `${issue.file}: \`${issue.field}\` ${issue.message}`)
    .join("\n");
}

/**
 * Parse or throw, naming the file and the field (AC-1). This is what the build calls: a corridor
 * file that does not parse must stop `pnpm build`, not degrade a page.
 */
export function parseCorridorContentOrThrow(
  relativePath: string,
  source: string,
): CountryLocaleContent {
  const result = parseCorridorContent(relativePath, source);
  if (result.ok) return result.content;
  throw new Error(
    `corridor content is invalid:\n${formatContentIssues(result.issues)}`,
  );
}
