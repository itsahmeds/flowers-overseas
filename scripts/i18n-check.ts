/**
 * `pnpm i18n:check` (spec 003 §2 "Lint, checks, CI", §6 "URL pattern", §11, AC-13, AC-22;
 * TASK-040).
 *
 * The gate on translation debt. Everything it checks is a **cross-file** property that no
 * per-file schema can see — `MessagesSchema` validates one catalogue's shape, this validates the
 * catalogues, their review manifests, the code that consumes them and the URL data against each
 * other — and every fault it reports names the file and the key, so a red CI log is actionable
 * without opening an editor (AC-22).
 *
 * ```
 * pnpm i18n:check [--messages-dir messages] [--src src] [--registry <file.json>] [--summary]
 * ```
 *
 * Exit 0 when the tree is clean; exit 1 with one line per problem otherwise. The flags exist so
 * the unit suite can point the checks at a fixture tree in a child process (the spec 001 validator
 * style, `tests/fixtures/i18n/_cases/`) instead of mutating the committed catalogues.
 *
 * ## The eight checks
 *
 * 1. **Key sets agree after fallback resolution** — every `en` key must resolve to a string for
 *    every registry locale, and no locale may define a key `en` does not have. Resolution is
 *    `resolveCatalogue()` itself, injected with a disk-backed `MessageSource`, so the check
 *    measures the merge the application performs and not a second implementation of it. The fault
 *    this catches in practice is a **shadowed branch**: `de.json` giving `errors.notFound` a
 *    string where `en.json` has an object silently deletes `errors.notFound.heading` for German
 *    readers, and nothing else in the pipeline notices.
 * 2. **Unused keys** — an `en` key that no code reads is dead weight in the payload budget (§6)
 *    and a translation somebody will pay for. `meta.retained: true` in `messages/en.meta.json` is
 *    the only escape (`plan/03` §5). See "the usage heuristic" below.
 * 3. **ICU syntax** — every value in every catalogue is parsed with
 *    `@formatjs/icu-messageformat-parser`, the parser `next-intl` formats with, so a message that
 *    parses here cannot throw at render time. `requiresOtherClause` is on: a plural or select with
 *    no `other` branch is a runtime error, not a style choice.
 * 4. **Argument sets agree** — a translation must take the same arguments as its `en` source,
 *    each of the same kind. A `de` value that drops `{language}`, renames it, or replaces a
 *    `plural` argument with a bare placeholder renders wrongly or throws; both are caught here
 *    rather than by a buyer.
 * 5. **Redundant overrides** — `en-gb` is a *thin* override (§13 Q5): a key whose value is
 *    byte-identical to the value it would inherit is noise that hides the real diff. Only locales
 *    that share their fallback's primary language are subject to it: `de` echoing English is
 *    honest machine-draft debt, counted by `unreviewedShare()`, not redundancy.
 * 6. **Meta-manifest completeness** — a catalogue file implies a manifest file; every key in a
 *    catalogue has a review record; no record describes a key that is not there.
 * 7. **Stale `sourceHash`** — every record's `sourceHash` must equal sha256 of the current `en`
 *    value for that key. Stale is an **error**, in both directions: a `reviewed: true` record
 *    whose English source has since changed is a translation of copy that no longer exists (the
 *    reader is shown a stale sentence, and `unreviewedShare()` counts it as reviewed, so the
 *    indexability gate would be told a lie); an unreviewed record with a stale hash means
 *    `pnpm i18n:draft --locale <code>` was not re-run after the `en` edit. Both need a human
 *    before the branch merges, which is what a non-zero exit is for.
 * 8. **`pathSegments`** — the URL data of §6/AC-13: every localised segment is lowercase ASCII
 *    with single hyphens and no slash, and no two page types share a segment inside one locale.
 *    It runs over `src/config/locales.ts` by default and over a `--registry` fixture on demand,
 *    which is how AC-13's four malformed registries are exercised without shipping a broken
 *    registry.
 *
 * 9. **Pseudo-locale regeneration is deterministic** (§2, AC-29; TASK-042) — when
 *    `messages/en-XA.json` or `messages/ar-XB.json` is present, its bytes must equal what
 *    `pnpm i18n:pseudo` produces from the current `messages/en.json`. The files are git-ignored,
 *    so a fresh clone has none and the clause is silent; a stale or hand-edited one is a fault,
 *    because a human reading `/en-XA` in a diff would be reading copy the routes do not render.
 *    The pseudo-locales themselves take no part in checks 1–7: they have no authored catalogue
 *    and no review manifest to be complete, missing or stale against.
 *
 * ## The usage heuristic (check 2) and its limits
 *
 * Deliberately a text scan of `--src` rather than a type-aware pass. next-intl's key access is
 * `t("key")` on a translator bound to a namespace, so the flattened key exists nowhere in the
 * source as one string, and a full solution would need type information the check cannot afford
 * to depend on. Two rules, either of which marks a key used:
 *
 *  - **namespace-aware**: a file that binds a namespace (`useTranslations("common")`,
 *    `getTranslations({ namespace: "meta" })`, `getTranslations("meta")`) marks `<namespace>.<L>`
 *    used for every key-shaped string literal `L` in that same file;
 *  - **fully-qualified**: the whole dotted path appearing anywhere in the scanned tree, as a
 *    string literal (`t("meta.home.title")`) or as a property chain
 *    (`messages.errors.serverError.retry` in `src/app/global-error.tsx`, which reads the
 *    catalogue as data), marks the key used.
 *
 * Both rules are **inclusive**: they can call a key used when it is not (a file that binds
 * `common` and happens to contain the literal `"beta"` for another reason), never the reverse.
 * That is the correct direction for a gate whose failure blocks a merge — it under-reports dead
 * keys and never accuses a live one. Only `--src` is scanned, so a key that exists solely for a
 * test (`common.floristCount`, which proves AC-20's Polish plurals) is `retained`, on purpose:
 * a key kept alive by its own test would make the check unfalsifiable.
 */
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TYPE, parse } from "@formatjs/icu-messageformat-parser";
import { z } from "zod";

import {
  LOCALES,
  LocaleRegistrySchema,
  type LocaleConfig,
} from "../src/config/locales.ts";
import {
  SOURCE_LOCALE as PSEUDO_SOURCE_LOCALE,
  pseudoFileProblems,
} from "./i18n-pseudo.ts";
import {
  type MessageSource,
  fallbackChain,
  resolveCatalogue,
  withMessageSource,
} from "../src/modules/i18n/messages.ts";
import {
  localeRegistryOf,
  withLocaleRegistry,
} from "../src/modules/i18n/registry.ts";
import {
  isLocaleIndexable,
  resetReviewCache,
  unreviewedShare,
} from "../src/modules/i18n/review.ts";
import {
  type MessageMetaManifest,
  MessageMetaManifestSchema,
  MessagesSchema,
} from "../src/modules/i18n/schemas.ts";

export const CLI_NAME = "i18n:check";
export const DEFAULT_MESSAGES_DIR = "messages";
export const DEFAULT_SRC_DIR = "src";
/** The locale every other catalogue is a translation of; also `i18n:draft`'s source. */
export const SOURCE_LOCALE = "en";

/** One fault. `key` is absent only for problems that are not about a single message. */
export interface Problem {
  /** Repo-relative path of the offending file, so the CI log names it (AC-22). */
  readonly file: string;
  readonly key?: string;
  readonly reason: string;
}

export interface LocaleSummaryRow {
  readonly locale: string;
  readonly keys: number;
  readonly missing: number;
  readonly unreviewed: number;
  readonly share: number;
  readonly stale: number;
  readonly indexable: boolean;
}

export interface CheckResult {
  readonly problems: readonly Problem[];
  readonly rows: readonly LocaleSummaryRow[];
}

export interface CheckOptions {
  readonly root: string;
  readonly messagesDir?: string;
  readonly srcDir?: string;
  readonly registryFile?: string;
}

// ---------------------------------------------------------------------------------------------
// small shared helpers
// ---------------------------------------------------------------------------------------------

function displayPath(path: string, root: string): string {
  const rel = relative(root, path);
  return rel === "" || rel.startsWith("..") ? path : rel;
}

/** sha256 hex of an `en` source value — the same function `i18n:draft` stamps with. */
function hashOf(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `{ a: { b: "x" } }` -> `{ "a.b": "x" }`; the dot paths the manifests are keyed by. */
export function flatten(
  tree: Record<string, unknown>,
  prefix = "",
): Map<string, string> {
  const flat = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") {
      flat.set(path, value);
    } else if (isRecord(value)) {
      for (const [nested, leaf] of flatten(value, path)) flat.set(nested, leaf);
    }
  }
  return flat;
}

/** The string at a dot path, or `undefined` when the path is absent or shadowed by an object. */
function valueAt(
  tree: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  let value: unknown = tree;
  for (const segment of key.split(".")) {
    if (!isRecord(value)) return undefined;
    value = value[segment];
  }
  return typeof value === "string" ? value : undefined;
}

function formatZodIssues(error: z.ZodError): string {
  return formatIssues(error.issues);
}

function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.map((part) => String(part)).join(".");
      return path === "" ? issue.message : `${path}: ${issue.message}`;
    })
    .join("; ");
}

// ---------------------------------------------------------------------------------------------
// loading
// ---------------------------------------------------------------------------------------------

interface LoadedLocale {
  readonly code: string;
  readonly cataloguePath: string;
  readonly metaPath: string;
  /** `undefined` when the locale ships no catalogue file (a legitimate state — AC-31). */
  readonly catalogue: Record<string, unknown> | undefined;
  readonly meta: MessageMetaManifest | undefined;
  readonly flat: Map<string, string>;
}

interface LoadResult {
  readonly locales: readonly LoadedLocale[];
  readonly problems: readonly Problem[];
  /** False when a file is unreadable or malformed: the cross-file checks cannot run on it. */
  readonly usable: boolean;
}

/**
 * Read and parse `<dir>/{code}.json` and `<dir>/{code}.meta.json` for each code. Both files are a
 * boundary (`CLAUDE.md`: zod at every boundary) and both are hand-editable, so a malformed one is
 * reported here and stops the cross-file checks rather than throwing halfway through them.
 */
function loadLocales(
  dir: string,
  codes: readonly string[],
  root: string,
): LoadResult {
  const problems: Problem[] = [];
  const locales: LoadedLocale[] = [];
  let usable = true;

  for (const code of codes) {
    const cataloguePath = join(dir, `${code}.json`);
    const metaPath = join(dir, `${code}.meta.json`);
    const catalogueFile = displayPath(cataloguePath, root);
    const metaFile = displayPath(metaPath, root);

    let catalogue: Record<string, unknown> | undefined;
    if (existsSync(cataloguePath)) {
      const raw = readJson(cataloguePath, catalogueFile, problems);
      if (raw === undefined) {
        usable = false;
      } else {
        const parsed = MessagesSchema.safeParse(raw);
        if (!parsed.success) {
          problems.push({
            file: catalogueFile,
            reason: `is not a valid message catalogue (${formatZodIssues(parsed.error)})`,
          });
          usable = false;
        } else {
          catalogue = parsed.data as Record<string, unknown>;
        }
      }
    }

    let meta: MessageMetaManifest | undefined;
    if (existsSync(metaPath)) {
      const raw = readJson(metaPath, metaFile, problems);
      if (raw === undefined) {
        usable = false;
      } else {
        const parsed = MessageMetaManifestSchema.safeParse(raw);
        if (!parsed.success) {
          problems.push({
            file: metaFile,
            reason: `is not a valid review manifest (${formatZodIssues(parsed.error)})`,
          });
          usable = false;
        } else {
          meta = parsed.data;
        }
      }
    }

    locales.push({
      code,
      cataloguePath: catalogueFile,
      metaPath: metaFile,
      catalogue,
      meta,
      flat: catalogue === undefined ? new Map() : flatten(catalogue),
    });
  }

  return { locales, problems, usable };
}

function readJson(
  path: string,
  file: string,
  problems: Problem[],
): unknown | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    problems.push({
      file,
      reason: `is not valid JSON (${error instanceof Error ? error.message : String(error)})`,
    });
    return undefined;
  }
}

// ---------------------------------------------------------------------------------------------
// check 3 + 4: ICU syntax and argument sets
// ---------------------------------------------------------------------------------------------

const ARGUMENT_KINDS: Readonly<Record<number, string>> = {
  [TYPE.argument]: "argument",
  [TYPE.number]: "number",
  [TYPE.date]: "date",
  [TYPE.time]: "time",
  [TYPE.select]: "select",
  [TYPE.plural]: "plural",
  [TYPE.tag]: "tag",
};

/**
 * The arguments a message takes, as `name:kind` strings — `language:argument`,
 * `count:plural`. Plural and select **categories** are deliberately not part of the signature:
 * CLDR gives Polish `one/few/many/other` where English has `one/other`, so comparing branch names
 * across locales would fail every correctly translated plural.
 */
export function argumentSignature(message: string): ReadonlySet<string> {
  const found = new Set<string>();
  const walk = (elements: readonly unknown[]): void => {
    for (const element of elements) {
      if (!isRecord(element)) continue;
      const type = element["type"];
      if (typeof type !== "number") continue;
      const kind = ARGUMENT_KINDS[type];
      const name = element["value"];
      if (kind !== undefined && typeof name === "string") {
        found.add(`${name}:${kind}`);
      }
      const options = element["options"];
      if (isRecord(options)) {
        for (const option of Object.values(options)) {
          if (isRecord(option) && Array.isArray(option["value"])) {
            walk(option["value"] as readonly unknown[]);
          }
        }
      }
      // A tag element's children are the message inside `<b>…</b>`.
      if (Array.isArray(element["children"])) {
        walk(element["children"] as readonly unknown[]);
      }
    }
  };
  walk(parse(message, { requiresOtherClause: true }));
  return found;
}

/** The parser's own message for an unparseable value, with its 1-based position. */
function icuError(message: string, error: unknown): string {
  const location = isRecord(error) ? error["location"] : undefined;
  const start = isRecord(location) ? location["start"] : undefined;
  const column = isRecord(start) ? start["column"] : undefined;
  const reason =
    error instanceof Error ? error.message.split("\n")[0] : String(error);
  const where =
    typeof column === "number" ? ` at column ${String(column)}` : "";
  return `is not valid ICU MessageFormat${where}: ${String(reason)} (${JSON.stringify(message)})`;
}

// ---------------------------------------------------------------------------------------------
// check 2: the usage scan
// ---------------------------------------------------------------------------------------------

const SCANNED_EXTENSIONS = [".ts", ".tsx"];
const NAMESPACE_PATTERNS = [
  /useTranslations\(\s*["'`]([A-Za-z][A-Za-z0-9.]*)["'`]/g,
  /getTranslations\(\s*["'`]([A-Za-z][A-Za-z0-9.]*)["'`]/g,
  /namespace:\s*["'`]([A-Za-z][A-Za-z0-9.]*)["'`]/g,
];
/** Key-shaped string literals: `"home.title"`, `"beta"`. */
const KEY_LITERAL =
  /["'`]([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*)["'`]/g;

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (
      entry.isFile() &&
      SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
    ) {
      files.push(path);
    }
  }
  return files.sort();
}

/** The two-rule heuristic of the header, applied to a whole tree. */
export function usedKeys(
  dir: string,
  keys: readonly string[],
): ReadonlySet<string> {
  const used = new Set<string>();
  const contents = sourceFiles(dir).map((path) => readFileSync(path, "utf8"));

  for (const content of contents) {
    const namespaces = new Set<string>();
    for (const pattern of NAMESPACE_PATTERNS) {
      for (const match of content.matchAll(pattern)) {
        if (match[1] !== undefined) namespaces.add(match[1]);
      }
    }
    if (namespaces.size === 0) continue;
    const literals = new Set(
      [...content.matchAll(KEY_LITERAL)].flatMap((match) =>
        match[1] === undefined ? [] : [match[1]],
      ),
    );
    for (const namespace of namespaces) {
      for (const literal of literals) used.add(`${namespace}.${literal}`);
    }
  }

  for (const key of keys) {
    if (used.has(key)) continue;
    const pattern = new RegExp(
      `(?<![A-Za-z0-9_])${key.replace(/\./g, "\\.")}(?![A-Za-z0-9_])`,
    );
    if (contents.some((content) => pattern.test(content))) used.add(key);
  }

  return used;
}

// ---------------------------------------------------------------------------------------------
// check 8: pathSegments (AC-13)
// ---------------------------------------------------------------------------------------------

/** `plan/02` §4: lowercase ASCII, single hyphens, no slash, no trailing separator. */
const PATH_SEGMENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Locales as `--registry` may hand them over: the two fields this check reads, nothing else, so a
 * fixture registry that is deliberately malformed elsewhere still reaches the segment rules.
 */
const RawRegistrySchema = z
  .array(
    z
      .object({
        code: z.string().min(1),
        pathSegments: z.record(z.string(), z.unknown()),
      })
      .loose(),
  )
  .min(1);

export interface SegmentSource {
  readonly code: string;
  readonly pathSegments: Readonly<Record<string, unknown>>;
}

export function pathSegmentProblems(
  locales: readonly SegmentSource[],
  file: string,
): readonly Problem[] {
  const problems: Problem[] = [];
  for (const locale of locales) {
    const owner = new Map<string, string>();
    for (const [pageType, segment] of Object.entries(locale.pathSegments)) {
      const key = `${locale.code}.pathSegments.${pageType}`;
      if (typeof segment !== "string") {
        problems.push({
          file,
          key,
          reason: `path segment must be a string, not ${typeof segment}`,
        });
        continue;
      }
      if (!PATH_SEGMENT_PATTERN.test(segment)) {
        problems.push({
          file,
          key,
          reason: `path segment ${JSON.stringify(segment)} must be lowercase ASCII, hyphen-separated, with no slash and no trailing separator (plan/02 §4)`,
        });
      }
      const existing = owner.get(segment);
      if (existing !== undefined) {
        problems.push({
          file,
          key,
          reason: `path segment ${JSON.stringify(segment)} is already used by \`${existing}\` in locale \`${locale.code}\`: two page types would share one URL`,
        });
      }
      owner.set(segment, pageType);
    }
  }
  return problems;
}

/**
 * The registry half of the run: the live `src/config/locales.ts` by default, a fixture file when
 * `--registry` is given. Returns the parsed registry when it is well formed enough to resolve
 * fallback chains with, so the catalogue checks can run under it.
 */
function checkRegistry(
  options: CheckOptions,
  problems: Problem[],
): readonly LocaleConfig[] | undefined {
  if (options.registryFile === undefined) {
    problems.push(...pathSegmentProblems(LOCALES, "src/config/locales.ts"));
    return LOCALES;
  }

  const path = resolve(options.root, options.registryFile);
  const file = displayPath(path, options.root);
  const raw = readJson(path, file, problems);
  if (raw === undefined) return undefined;

  const loose = RawRegistrySchema.safeParse(raw);
  if (!loose.success) {
    problems.push({
      file,
      reason: `is not a locale registry (${formatZodIssues(loose.error)})`,
    });
    return undefined;
  }
  const segmentProblems = pathSegmentProblems(loose.data, file);
  problems.push(...segmentProblems);

  const parsed = LocaleRegistrySchema.safeParse(raw);
  if (!parsed.success) {
    // Segment faults are already reported above in this check's own words; anything else the
    // registry schema objects to is reported here, so a fixture can never fail for a hidden
    // reason (and a malformed-segment fixture is not reported twice).
    const others = parsed.error.issues.filter(
      (issue) => !issue.path.includes("pathSegments"),
    );
    if (others.length > 0 || segmentProblems.length === 0) {
      problems.push({
        file,
        reason: `does not parse as a locale registry (${formatIssues(others.length > 0 ? others : parsed.error.issues)})`,
      });
    }
    return undefined;
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------------------------
// the catalogue checks
// ---------------------------------------------------------------------------------------------

/** Primary language subtag, by string: `en-gb` -> `en` (the `review.ts` rule, same wording). */
function primaryLanguage(code: string): string {
  return (code.split("-")[0] ?? code).toLowerCase();
}

interface CatalogueCheckInput {
  readonly locales: readonly LoadedLocale[];
  readonly srcDir: string;
  readonly srcFile: string;
}

function catalogueChecks(input: CatalogueCheckInput): CheckResult {
  const problems: Problem[] = [];
  const rows: LocaleSummaryRow[] = [];
  const byCode = new Map(input.locales.map((locale) => [locale.code, locale]));
  const source = byCode.get(SOURCE_LOCALE);

  if (source?.catalogue === undefined) {
    problems.push({
      file: source?.cataloguePath ?? `${SOURCE_LOCALE}.json`,
      reason: `the source catalogue \`${SOURCE_LOCALE}\` is missing: every other locale is a translation of it (spec 003 §2)`,
    });
    return { problems, rows };
  }
  const sourceFlat = source.flat;

  // 3 + 4: ICU syntax everywhere, argument sets against `en`.
  const sourceSignatures = new Map<string, ReadonlySet<string>>();
  for (const locale of input.locales) {
    for (const [key, value] of locale.flat) {
      let signature: ReadonlySet<string>;
      try {
        signature = argumentSignature(value);
      } catch (error) {
        problems.push({
          file: locale.cataloguePath,
          key,
          reason: icuError(value, error),
        });
        continue;
      }
      if (locale.code === SOURCE_LOCALE) {
        sourceSignatures.set(key, signature);
        continue;
      }
      const expected = sourceSignatures.get(key);
      if (expected === undefined) continue;
      const missing = [...expected].filter((entry) => !signature.has(entry));
      const extra = [...signature].filter((entry) => !expected.has(entry));
      if (missing.length > 0 || extra.length > 0) {
        problems.push({
          file: locale.cataloguePath,
          key,
          reason: `argument set differs from \`${SOURCE_LOCALE}\`: expected {${[...expected].sort().join(", ")}}, found {${[...signature].sort().join(", ")}}`,
        });
      }
    }
  }

  // 1: key sets after fallback resolution, and 5: redundant overrides.
  for (const locale of input.locales) {
    const chain = fallbackChain(locale.code);
    const resolved = resolveCatalogue(locale.code);

    for (const key of sourceFlat.keys()) {
      if (valueAt(resolved, key) === undefined) {
        problems.push({
          file: locale.cataloguePath,
          key,
          reason: `is missing after fallback resolution (chain ${chain.join(" -> ")}): \`${SOURCE_LOCALE}\` defines it but \`${locale.code}\` resolves it to nothing — a key shadowed by a string where \`${SOURCE_LOCALE}\` has a branch does this`,
        });
      }
    }

    if (locale.catalogue === undefined) continue;

    for (const key of locale.flat.keys()) {
      if (!sourceFlat.has(key)) {
        problems.push({
          file: locale.cataloguePath,
          key,
          reason: `is not a key of \`${SOURCE_LOCALE}\`: a translation of a message that does not exist is never rendered (\`pnpm i18n:draft --locale ${locale.code}\` removes it)`,
        });
      }
    }

    // 5: only where the fallback speaks the same language (see the header).
    const inherited = chain
      .slice(1)
      .map((code) => byCode.get(code))
      .find(
        (candidate) =>
          candidate !== undefined &&
          primaryLanguage(candidate.code) === primaryLanguage(locale.code),
      );
    if (inherited === undefined) continue;
    for (const [key, value] of locale.flat) {
      if (inherited.flat.get(key) === value) {
        problems.push({
          file: locale.cataloguePath,
          key,
          reason: `is a redundant override: identical to \`${inherited.code}\`, and \`${locale.code}\` is a thin override that should carry only the wording that differs (spec 003 §2, §13 Q5)`,
        });
      }
    }
  }

  // 6 + 7: manifest completeness and `sourceHash` freshness.
  for (const locale of input.locales) {
    if (locale.catalogue === undefined) continue;
    if (locale.meta === undefined) {
      problems.push({
        file: locale.metaPath,
        reason: `is missing: a catalogue file needs its review manifest (spec 003 §2 "Messages", ${String(locale.flat.size)} key(s) unaccounted for)`,
      });
      continue;
    }
    for (const key of locale.flat.keys()) {
      if (locale.meta[key] === undefined) {
        problems.push({
          file: locale.metaPath,
          key,
          reason: `has no review record, so nothing says who wrote it or whether it was reviewed (spec 003 §2 "Messages")`,
        });
      }
    }
    for (const key of Object.keys(locale.meta)) {
      if (!locale.flat.has(key)) {
        problems.push({
          file: locale.metaPath,
          key,
          reason: `is an orphan review record: \`${locale.cataloguePath}\` has no such message`,
        });
      }
    }
    for (const [key, record] of Object.entries(locale.meta)) {
      const sourceValue = sourceFlat.get(key);
      if (sourceValue === undefined) continue;
      const expected = hashOf(sourceValue);
      if (record.sourceHash !== expected) {
        problems.push({
          file: locale.metaPath,
          key,
          reason: record.reviewed
            ? `has a stale sourceHash: the \`${SOURCE_LOCALE}\` value changed after this translation was reviewed, so \`${locale.code}\` renders copy that no longer exists (expected ${expected}, found ${record.sourceHash}) — re-review it`
            : `has a stale sourceHash: the \`${SOURCE_LOCALE}\` value changed since it was drafted (expected ${expected}, found ${record.sourceHash}) — re-run \`pnpm i18n:draft --locale ${locale.code}\``,
        });
      }
    }
  }

  // 2: unused `en` keys.
  const used = usedKeys(input.srcDir, [...sourceFlat.keys()]);
  for (const key of sourceFlat.keys()) {
    if (used.has(key)) continue;
    if (source.meta?.[key]?.retained === true) continue;
    problems.push({
      file: source.cataloguePath,
      key,
      reason: `is unused: no \`t()\` call or catalogue read in \`${input.srcFile}\` reaches it. Delete it, or set \`retained: true\` on its record in \`${source.metaPath}\` when a shipped consumer is still coming`,
    });
  }

  // §11: the per-locale table, from the same functions `isLocaleIndexable()` uses.
  for (const locale of input.locales) {
    const resolved = resolveCatalogue(locale.code);
    const keys = flatten(resolved).size;
    const share = unreviewedShare(locale.code);
    const missing = [...sourceFlat.keys()].filter(
      (key) => valueAt(resolved, key) === undefined,
    ).length;
    const stale =
      locale.meta === undefined
        ? 0
        : Object.entries(locale.meta).filter(([key, record]) => {
            const sourceValue = sourceFlat.get(key);
            return (
              sourceValue !== undefined &&
              record.sourceHash !== hashOf(sourceValue)
            );
          }).length;
    rows.push({
      locale: locale.code,
      keys,
      missing,
      // The module exposes the share, not the count; the count is the share of the resolved
      // catalogue, which is exactly how `unreviewedShare()` computes it.
      unreviewed: Math.round(share * keys),
      share,
      stale,
      indexable: isLocaleIndexable(locale.code),
    });
  }

  return { problems, rows };
}

// ---------------------------------------------------------------------------------------------
// orchestration
// ---------------------------------------------------------------------------------------------

/**
 * Run every check. The catalogue half runs **inside** `withLocaleRegistry` and
 * `withMessageSource` so `resolveCatalogue()`, `fallbackChain()`, `unreviewedShare()` and
 * `isLocaleIndexable()` — the production implementations — answer about the tree under test
 * rather than about the statically imported one. That is what §11 means by "the same number
 * `isLocaleIndexable()` uses": there is no second copy of the rule here to drift from it.
 */
export async function runCheck(options: CheckOptions): Promise<CheckResult> {
  const problems: Problem[] = [];
  const registry = checkRegistry(options, problems);
  if (registry === undefined) return { problems, rows: [] };

  const messagesDir = resolve(
    options.root,
    options.messagesDir ?? DEFAULT_MESSAGES_DIR,
  );
  const srcDir = resolve(options.root, options.srcDir ?? DEFAULT_SRC_DIR);
  // Checks 1–7 are about authored catalogues; the pseudo-locales have none (check 9 covers them,
  // and `src/modules/i18n/pseudo.ts` derives their values from `en`). Dropping them from the
  // injected registry too keeps `fallbackChain()`, `unreviewedShare()` and the summary table
  // describing translation debt only.
  const authored = registry.filter((locale) => !locale.isPseudo);
  const codes = authored.map((locale) => locale.code);
  const loaded = loadLocales(messagesDir, codes, options.root);
  problems.push(...loaded.problems);
  if (!loaded.usable) return { problems, rows: [] };

  // Check 9: the generated pseudo catalogues, when present, are current (§2, AC-29).
  if (existsSync(join(messagesDir, `${PSEUDO_SOURCE_LOCALE}.json`))) {
    problems.push(
      ...pseudoFileProblems(messagesDir, { root: options.root }).map(
        (problem) => ({ file: problem.file, reason: problem.reason }),
      ),
    );
  }

  const diskSource: MessageSource = {
    catalogue: (locale) =>
      loaded.locales.find((entry) => entry.code === locale)?.catalogue,
    meta: (locale) =>
      loaded.locales.find((entry) => entry.code === locale)?.meta,
  };

  const result = await withLocaleRegistry(localeRegistryOf(authored), () =>
    withMessageSource(diskSource, () => {
      resetReviewCache();
      try {
        return catalogueChecks({
          locales: loaded.locales,
          srcDir,
          srcFile: displayPath(srcDir, options.root),
        });
      } finally {
        resetReviewCache();
      }
    }),
  );

  return { problems: [...problems, ...result.problems], rows: result.rows };
}

export function formatProblems(problems: readonly Problem[]): string {
  return [
    `${CLI_NAME} failed with ${String(problems.length)} problem(s):`,
    ...problems.map(
      (problem) =>
        `  - ${problem.file}${problem.key === undefined ? "" : ` [${problem.key}]`}: ${problem.reason}`,
    ),
  ].join("\n");
}

/** A share as a percentage with one decimal: `0.05` -> `5.0%`. */
export function formatShare(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

/**
 * The §11 step-summary table: per locale the total keys it renders, how many are missing after
 * fallback, the unreviewed count and share, the stale count, and whether it is indexable.
 */
export function formatSummary(rows: readonly LocaleSummaryRow[]): string {
  const lines = [
    `### ${CLI_NAME}`,
    "",
    "| locale | keys | missing after fallback | unreviewed | unreviewed share | stale | indexable |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const row of rows) {
    lines.push(
      `| \`${row.locale}\` | ${String(row.keys)} | ${String(row.missing)} | ${String(row.unreviewed)} | ${formatShare(row.share)} | ${String(row.stale)} | ${row.indexable ? "yes" : "no"} |`,
    );
  }
  lines.push(
    "",
    "`indexable` is `isLocaleIndexable()` itself (`src/modules/i18n/review.ts`): a launch locale",
    "whose unreviewed share is at or below 5 % (`plan/03` §6). A locale that reads `no` here is",
    "excluded from hreflang, sitemaps and robots-meta lifting by spec 007, which is the correct",
    "answer while `de` and `pl` are machine-drafted echoes of English.",
  );
  return lines.join("\n");
}

export interface CliStreams {
  readonly out: { write: (chunk: string) => unknown };
  readonly err: { write: (chunk: string) => unknown };
  readonly appendSummary?: (body: string) => void;
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  const value = index === -1 ? undefined : argv[index + 1];
  return value === undefined || value === "" ? undefined : value;
}

export async function main(
  argv: readonly string[],
  streams: CliStreams = { out: process.stdout, err: process.stderr },
): Promise<number> {
  const messagesDir = argValue(argv, "--messages-dir");
  const srcDir = argValue(argv, "--src");
  const registryFile = argValue(argv, "--registry");
  const options: CheckOptions = {
    root: process.cwd(),
    ...(messagesDir === undefined ? {} : { messagesDir }),
    ...(srcDir === undefined ? {} : { srcDir }),
    ...(registryFile === undefined ? {} : { registryFile }),
  };

  const { problems, rows } = await runCheck(options);

  if (argv.includes("--summary") && rows.length > 0) {
    const summary = formatSummary(rows);
    streams.out.write(`${summary}\n`);
    streams.appendSummary?.(summary);
  }

  if (problems.length > 0) {
    streams.err.write(`${formatProblems(problems)}\n`);
    return 1;
  }
  streams.out.write(
    `${CLI_NAME}: ${String(rows.length)} locale(s) ok, no missing, unused, stale or malformed key\n`,
  );
  return 0;
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const summaryFile = process.env["GITHUB_STEP_SUMMARY"];
  const code = await main(process.argv.slice(2), {
    out: process.stdout,
    err: process.stderr,
    ...(summaryFile === undefined || summaryFile === ""
      ? {}
      : {
          appendSummary: (body: string) => {
            appendFileSync(summaryFile, `${body}\n`, "utf8");
          },
        }),
  });
  if (code !== 0) process.exit(code);
}
