/**
 * `pnpm i18n:draft --locale <code> [--dry-run]` (spec 003 §2 "Messages", §13 Q7, AC-23; TASK-038).
 *
 * Fills a target catalogue from `messages/en.json` and records what it did in
 * `messages/{locale}.meta.json`. The Phase 0 provider is `echoDraftProvider`, which copies the
 * English value verbatim: no LLM, no API key, **no network**, no clock, no randomness — so `de`
 * and `pl` ship as honest unreviewed echoes that `isLocaleIndexable()` (TASK-039) keeps out of
 * the index, and CI can assert byte-identical output (§13 Q7, Q10). Replacing the provider is
 * the only change a real translation backend needs; it is a separate task with a `plan/07`
 * processor note, per §3.
 *
 * Four rules make the output deterministic and safe to re-run (AC-23):
 *
 *  1. **Sorted keys, fixed formatting.** Both files are rebuilt from the flattened key set in
 *     `sort()` order, printed with two-space indent and one trailing newline — the Prettier
 *     shape, so `pnpm format:check` stays green and a re-run produces no diff.
 *  2. **`sourceHash` is the drift record.** Every written key stores sha256 of the `en` value it
 *     was drafted from. A key whose stored hash still matches is left exactly as it is; a key
 *     whose hash differs is *stale* (§7) and only re-drafted if rule 3 allows.
 *  3. **Human and reviewed copy is never overwritten.** `reviewed: true` is untouched by
 *     definition (AC-23), and so is `source: "human"`: the German plural forms and the founder's
 *     `en-gb` wording are reviewer work (`plan/13` B12), not something a stub may replace. Stale
 *     protected keys are reported, which is what feeds `i18n:check`'s stale queue (TASK-040).
 *  4. **Keys `en.json` dropped are removed**, unless their meta says `retained: true` — the same
 *     escape `i18n:check` uses for an unused key.
 *
 * The script writes files and prints a report; it never exits non-zero for a stale key, because
 * "this locale owes translations" is `i18n:check`'s verdict to give, not this script's.
 *
 * **The catalogue dataset is drafted by the same command** (spec 006 §7, AC-5; TASK-073). After
 * the message catalogue is written, `--locale de` and `--locale pl` also fill
 * `seed/data/copy/{locale}/{entity}.json` from `seed/data/copy/en/`, through
 * `seed/copy-draft.ts`, with `translationStatus: "machine"`, `reviewed: false` and the `en` row's
 * `sourceHash` — the state that keeps German and Polish product pages non-indexable until a
 * native reviewer approves them (`plan/03` §6 gate 4). `en` is authored and `en-gb` is a *thin
 * override* set, so neither is ever drafted: drafting `en-gb` would manufacture 139 rows that
 * differ from their source in nothing at all. The closing local-florist sentence of every drafted
 * description is taken from the target locale's `catalog.floristSentence` key, which is why a rewording is one
 * catalogue edit rather than 84.
 *
 * **Both outputs are validated with their own schema before a byte is written** (`MessagesSchema`
 * and `MessageMetaManifestSchema`, TASK-040's carry-forward from `/review 20`). A generator that
 * writes a file another tool then parses with zod should not be the one place the boundary is
 * skipped: an `en.json` leaf that is not a string, or a `retained` key kept from a hand-edited
 * manifest with a field the schema does not know, would otherwise be copied into the target and
 * only surface when `loadMessages()` or `i18n:check` refused to parse it. Failing here names the
 * offending path and leaves the previous files untouched.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ZodError } from "zod";

import {
  COPY_DRAFT_LOCALES,
  type CopyDraftReport,
  draftCopyLocale,
  formatCopyDraftReport,
  syncCopyLocale,
} from "../seed/copy-draft.ts";
import { FLORIST_SENTENCE_KEY } from "../seed/copy.ts";
import { LOCALES, isPseudoLocaleCode } from "../src/config/locales.ts";
import { fallbackChain } from "../src/modules/i18n/messages.ts";
import {
  MessageMetaManifestSchema,
  MessagesSchema,
} from "../src/modules/i18n/schemas.ts";

/** The locale every other catalogue is drafted from; it is authored, never drafted. */
export const SOURCE_LOCALE = "en";

/** Two-space indent, one trailing newline: what Prettier prints for a JSON file. */
export function serialiseJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** sha256 hex of an English source value (spec 003 §7 "Drift control is `sourceHash`"). */
export function sourceHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** `{ a: { b: "x" } }` -> `{ "a.b": "x" }`. Non-string leaves are a schema error, not a value. */
export function flattenMessages(
  tree: unknown,
  prefix = "",
): Record<string, string> {
  const flat: Record<string, string> = {};
  if (typeof tree !== "object" || tree === null) return flat;
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") {
      flat[path] = value;
    } else {
      Object.assign(flat, flattenMessages(value, path));
    }
  }
  return flat;
}

/** `{ "a.b": "x" }` -> `{ a: { b: "x" } }`, every level in `sort()` order (rule 1). */
export function unflattenMessages(
  flat: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const tree: Record<string, unknown> = {};
  for (const path of Object.keys(flat).sort()) {
    const segments = path.split(".");
    const leaf = segments.pop();
    if (leaf === undefined) continue;
    let node = tree;
    for (const segment of segments) {
      const existing = node[segment];
      if (typeof existing !== "object" || existing === null) {
        node[segment] = {};
      }
      node = node[segment] as Record<string, unknown>;
    }
    node[leaf] = flat[path];
  }
  return sortObject(tree);
}

function sortObject(value: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    sorted[key] =
      typeof child === "object" && child !== null
        ? sortObject(child as Record<string, unknown>)
        : child;
  }
  return sorted;
}

/** What a provider is asked for: one key, its English value, and the locale it is wanted in. */
export interface DraftRequest {
  readonly key: string;
  readonly sourceValue: string;
  readonly locale: string;
}

/**
 * The seam a real translation backend plugs into (§3 "An LLM-backed `i18n:draft`"). Synchronous
 * on purpose: a synchronous provider cannot hide a network call, which is half of AC-23's
 * proof, and the deterministic stub needs nothing more.
 */
export interface DraftProvider {
  draft(request: DraftRequest): string;
}

/** Phase 0: the English value, unchanged. Deterministic, offline, honest (§13 Q7). */
export const echoDraftProvider: DraftProvider = {
  draft: ({ sourceValue }) => sourceValue,
};

/** Per-key outcome of a run. `stale` is the only one that needs a human. */
export type DraftAction = "written" | "kept" | "stale" | "removed";

export interface DraftOutcome {
  readonly key: string;
  readonly action: DraftAction;
}

export interface DraftReport {
  readonly locale: string;
  readonly outcomes: readonly DraftOutcome[];
  /** The exact bytes of `messages/{locale}.json` this run produced. */
  readonly catalogue: string;
  /** The exact bytes of `messages/{locale}.meta.json` this run produced. */
  readonly meta: string;
  /** False when both files already held those bytes: a re-run is a no-op (AC-23). */
  readonly changed: boolean;
  /** False for `--dry-run`. */
  readonly written: boolean;
}

export interface DraftOptions {
  readonly root: string;
  readonly locale: string;
  readonly provider?: DraftProvider;
  readonly dryRun?: boolean;
}

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

interface StoredMeta {
  source?: unknown;
  reviewed?: unknown;
  reviewedBy?: unknown;
  reviewedAt?: unknown;
  sourceHash?: unknown;
  retained?: unknown;
}

/** Read defensively: this runs *before* the schema, on a file a human may have hand-edited. */
function storedMeta(
  manifest: Record<string, unknown>,
  key: string,
): StoredMeta | undefined {
  const value = manifest[key];
  return typeof value === "object" && value !== null
    ? (value as StoredMeta)
    : undefined;
}

/** A zod issue list as one line, naming the failing path — the message a human has to act on. */
function formatIssues(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.map((part) => String(part)).join(".");
      return path === "" ? issue.message : `${path}: ${issue.message}`;
    })
    .join("; ");
}

const LOCALE_CODE_PATTERN = /^[a-z]{2,3}(?:-[a-z]{2})?$/;

export function draftLocale(options: DraftOptions): DraftReport {
  const { root, locale } = options;
  const provider = options.provider ?? echoDraftProvider;
  const dryRun = options.dryRun ?? false;

  // A pseudo-locale is *generated*, not translated (TASK-042): its values are a deterministic
  // transform of `en` and its files are git-ignored, so drafting one would write a catalogue
  // `pnpm i18n:pseudo` immediately contradicts and `pnpm i18n:check` then reports (its check 9).
  // The uppercase region subtag already fails the pattern below; this names the reason.
  if (isPseudoLocaleCode(locale)) {
    throw new Error(
      `\`${locale}\` is a generated pseudo-locale: run \`pnpm i18n:pseudo\` instead (spec 003 §2)`,
    );
  }
  if (!LOCALE_CODE_PATTERN.test(locale)) {
    throw new Error(
      `--locale must be a lowercase locale code such as \`pl\` or \`en-gb\`, not \`${locale}\``,
    );
  }
  if (locale === SOURCE_LOCALE) {
    throw new Error(
      `\`${SOURCE_LOCALE}\` is the authored source of truth and is never drafted (spec 003 §2)`,
    );
  }

  const messagesDir = join(root, "messages");
  const cataloguePath = join(messagesDir, `${locale}.json`);
  const metaPath = join(messagesDir, `${locale}.meta.json`);

  const source = flattenMessages(readJson(join(messagesDir, "en.json")));
  const existing = flattenMessages(readJson(cataloguePath));
  const existingMeta = readJson(metaPath);

  const values: Record<string, string> = {};
  const meta: Record<string, unknown> = {};
  const outcomes: DraftOutcome[] = [];

  for (const key of Object.keys(source).sort()) {
    const sourceValue = source[key] ?? "";
    const hash = sourceHash(sourceValue);
    const current = existing[key];
    const currentMeta = storedMeta(existingMeta, key);
    const protectedKey =
      currentMeta?.reviewed === true || currentMeta?.source === "human";
    const fresh = currentMeta?.sourceHash === hash;

    if (
      current !== undefined &&
      currentMeta !== undefined &&
      (fresh || protectedKey)
    ) {
      values[key] = current;
      meta[key] = currentMeta;
      outcomes.push({ key, action: fresh ? "kept" : "stale" });
      continue;
    }

    values[key] = provider.draft({ key, sourceValue, locale });
    meta[key] = { source: "machine", reviewed: false, sourceHash: hash };
    outcomes.push({ key, action: "written" });
  }

  for (const key of Object.keys(existing).sort()) {
    if (key in source) continue;
    const currentMeta = storedMeta(existingMeta, key);
    if (currentMeta?.retained === true) {
      values[key] = existing[key] ?? "";
      meta[key] = currentMeta;
      outcomes.push({ key, action: "kept" });
      continue;
    }
    outcomes.push({ key, action: "removed" });
  }

  const catalogueTree = unflattenMessages(values);
  const metaManifest = Object.fromEntries(
    Object.keys(meta)
      .sort()
      .map((key) => [key, meta[key]]),
  );

  // The write boundary (see the header): both files are parsed by their own schema first.
  const parsedCatalogue = MessagesSchema.safeParse(catalogueTree);
  if (!parsedCatalogue.success) {
    throw new Error(
      `refusing to write messages/${locale}.json: ${formatIssues(parsedCatalogue.error)}`,
    );
  }
  const parsedMeta = MessageMetaManifestSchema.safeParse(metaManifest);
  if (!parsedMeta.success) {
    throw new Error(
      `refusing to write messages/${locale}.meta.json: ${formatIssues(parsedMeta.error)}`,
    );
  }

  const catalogue = serialiseJson(catalogueTree);
  const metaJson = serialiseJson(metaManifest);

  const changed =
    !existsSync(cataloguePath) ||
    !existsSync(metaPath) ||
    readFileSync(cataloguePath, "utf8") !== catalogue ||
    readFileSync(metaPath, "utf8") !== metaJson;

  if (!dryRun && changed) {
    writeFileSync(cataloguePath, catalogue, "utf8");
    writeFileSync(metaPath, metaJson, "utf8");
  }

  return {
    locale,
    outcomes,
    catalogue,
    meta: metaJson,
    changed,
    written: !dryRun && changed,
  };
}

/**
 * The locale's `catalog.floristSentence`, resolved through the same fallback chain the
 * application uses (`fallbackChain()`), because `en-gb` carries only the keys whose British
 * wording differs and this is not one of them.
 */
export function floristSentenceFor(
  root: string,
  locale: string,
  catalogue?: string,
): string {
  for (const code of fallbackChain(locale)) {
    const path = join(root, "messages", `${code}.json`);
    const source =
      code === locale && catalogue !== undefined
        ? catalogue
        : existsSync(path)
          ? readFileSync(path, "utf8")
          : undefined;
    if (source === undefined) continue;
    const value = flattenMessages(
      JSON.parse(source) as Record<string, unknown>,
    )[FLORIST_SENTENCE_KEY];
    if (value !== undefined) return value;
  }
  throw new Error(
    `no \`${FLORIST_SENTENCE_KEY}\` for \`${locale}\`: the catalogue copy's closing sentence has nowhere to come from (spec 006 §7)`,
  );
}

/**
 * The catalogue half of a run (spec 006 §7). Reads the locale's closing sentence out of the
 * catalogue this run just produced — not off disk — so a locale whose message draft and whose
 * copy draft disagree about that sentence is not a reachable state.
 *
 * Returns `undefined` for a locale that is not machine-drafted (`en`, `en-gb`): those are
 * authored, and `--sync-copy` is the only thing that touches them.
 */
export function draftCatalogueCopy(options: {
  readonly root: string;
  readonly locale: string;
  readonly catalogue: string;
  readonly dryRun?: boolean;
}): CopyDraftReport | undefined {
  const { root, locale, catalogue } = options;
  if (
    !COPY_DRAFT_LOCALES.includes(locale as (typeof COPY_DRAFT_LOCALES)[number])
  ) {
    return undefined;
  }
  return draftCopyLocale({
    root,
    locale,
    floristSentence: floristSentenceFor(root, locale, catalogue),
    sourceFloristSentence: floristSentenceFor(root, SOURCE_LOCALE),
    dryRun: options.dryRun ?? false,
  });
}

/**
 * `pnpm i18n:draft --sync-copy` — rewrite the closing local-florist sentence of every catalogue
 * description in **every** locale from that locale's `catalog.floristSentence`, and change
 * nothing else. One edit to the message key, one command, four locales (spec 006 §7).
 */
export function syncCatalogueCopy(options: {
  readonly root: string;
  readonly locales: readonly string[];
  readonly dryRun?: boolean;
}): readonly CopyDraftReport[] {
  return options.locales.map((locale) =>
    syncCopyLocale({
      root: options.root,
      locale,
      floristSentence: floristSentenceFor(options.root, locale),
      dryRun: options.dryRun ?? false,
    }),
  );
}

/** The per-locale report of §2, one line per action plus the stale keys by name. */
export function formatDraftReport(report: DraftReport): string {
  const count = (action: DraftAction): number =>
    report.outcomes.filter((outcome) => outcome.action === action).length;
  const stale = report.outcomes
    .filter((outcome) => outcome.action === "stale")
    .map((outcome) => outcome.key);

  const lines = [
    `i18n:draft ${report.locale}: ${String(count("written"))} drafted, ${String(
      count("kept"),
    )} up to date, ${String(stale.length)} stale, ${String(count("removed"))} removed`,
    report.written
      ? `wrote messages/${report.locale}.json and messages/${report.locale}.meta.json`
      : report.changed
        ? `--dry-run: messages/${report.locale}.json and messages/${report.locale}.meta.json would change`
        : `no change: messages/${report.locale}.json is already up to date`,
  ];
  if (stale.length > 0) {
    lines.push(
      `stale (reviewed or human copy kept; the \`en\` value moved): ${stale.join(", ")}`,
    );
  }
  return lines.join("\n");
}

function localeArg(argv: readonly string[]): string {
  const index = argv.indexOf("--locale");
  const value = index === -1 ? undefined : argv[index + 1];
  if (value === undefined) {
    throw new Error("usage: pnpm i18n:draft --locale <code> [--dry-run]");
  }
  return value;
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const argv = process.argv.slice(2);
  try {
    if (argv.includes("--sync-copy")) {
      // The rewording path: no locale is drafted, every locale's catalogue copy is re-flowed from
      // its own `catalog.floristSentence` (spec 006 §7).
      const reports = syncCatalogueCopy({
        root: process.cwd(),
        locales: LOCALES.filter(
          (locale) => !isPseudoLocaleCode(locale.code),
        ).map((locale) => locale.code),
        dryRun: argv.includes("--dry-run"),
      });
      for (const report of reports) {
        process.stdout.write(`${formatCopyDraftReport(report)}\n`);
      }
      process.exit(0);
    }
    const report = draftLocale({
      root: process.cwd(),
      locale: localeArg(argv),
      dryRun: argv.includes("--dry-run"),
    });
    process.stdout.write(`${formatDraftReport(report)}\n`);
    const copy = draftCatalogueCopy({
      root: process.cwd(),
      locale: report.locale,
      catalogue: report.catalogue,
      dryRun: argv.includes("--dry-run"),
    });
    if (copy !== undefined) {
      process.stdout.write(`${formatCopyDraftReport(copy)}\n`);
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}
