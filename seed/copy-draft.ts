/**
 * `seed/copy-draft.ts` — `pnpm i18n:draft`, extended from the message catalogues to the catalogue
 * **dataset** (spec 006 §7 "Machine drafts and the `noindex` gate", AC-5; TASK-073).
 *
 * `scripts/i18n-draft.ts` fills `messages/{locale}.json` from `messages/en.json`; this fills
 * `seed/data/copy/{locale}/{entity}.json` from `seed/data/copy/en/{entity}.json`, with the same
 * provider seam (`DraftProvider`), the same determinism rules and the same review triple. One
 * command, two catalogues, one definition of "unreviewed" — which is the whole point of spec 006
 * §5.2 giving `SeedCopySchema` the review triple `messages/*.meta.json` already had.
 *
 * What a run guarantees (AC-5, and each is a test in `tests/unit/seed-copy.test.ts`):
 *
 *  - every drafted row carries `translationStatus: "machine"`, `reviewed: false` and the
 *    `sourceHash` of the **English** row it came from, so a German page can never be *present,
 *    unreviewed and unflagged*, and an English edit flips its dependants stale (`plan/03` §6
 *    step 5);
 *  - a row a human has touched is never overwritten — `translationStatus: "human"` and
 *    `reviewed: true` are both protected, exactly as the message drafter protects them, because
 *    the German and Polish descriptions are the native reviewer's work (`plan/13` B12) and a
 *    stub may not replace them. A protected row whose English source has moved is reported as
 *    stale rather than silently re-drafted;
 *  - **names and slugs are not drafted**. `plan/10` §2.2 and §13 Q2 keep the evocative name in
 *    every locale and localise the *descriptor* through `catalog.descriptor.*` at render, and
 *    `plan/03` §5 forbids a machine-written slug outright. So a drafted row carries the English
 *    name and the English slug, and the hreflang cluster stays one product with one stable URL
 *    per locale;
 *  - the closing local-florist sentence of a drafted row comes from the target locale's
 *    `catalog.floristSentence`, and `syncCopyLocale()` (`pnpm i18n:draft --sync-copy`) rewrites
 *    it in the authored locales too. That is what makes "one catalogue edit in four locales
 *    rather than 84 description edits" (spec 006 §7) a mechanical fact rather than an aspiration;
 *  - the output is byte-deterministic: no clock, no randomness, no network, row order taken from
 *    the English file, and Prettier's JSON shape (two spaces, one trailing newline), so a re-run
 *    produces no diff and CI can assert it.
 *
 * No database and no network: `pnpm check:no-db` covers this file (spec 006 AC-1).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  COPY_DRAFT_LOCALES,
  COPY_SOURCE_LOCALE,
  FLORIST_SENTENCE_KEY,
  SEED_COPY_ENTITIES,
  type SeedCopyFileEntity,
  copySourceHash,
  endsWithFloristSentence,
  replaceTrailingSentence,
  seedCopyPath,
  stripFloristSentence,
  withFloristSentence,
} from "./copy.ts";
import { SEED_DATA_DIR, copyFileSchema } from "./schema/files.ts";
import { type SeedCopy } from "./schema/copy.ts";

export { COPY_DRAFT_LOCALES };

/** The provider seam of spec 003 §2, re-declared structurally so this module imports no script. */
export interface CopyDraftRequest {
  readonly key: string;
  readonly field: "descriptionMd" | "seoTitle" | "seoDescription";
  readonly sourceValue: string;
  readonly locale: string;
}

export interface CopyDraftProvider {
  draft(request: CopyDraftRequest): string;
}

/** Phase 0: the English value, unchanged — deterministic, offline, honest (spec 003 §13 Q7). */
export const echoCopyDraftProvider: CopyDraftProvider = {
  draft: ({ sourceValue }) => sourceValue,
};

/** Per-row outcome. `stale` is the only one that needs a human. */
export type CopyDraftAction = "written" | "kept" | "stale" | "removed";

export interface CopyDraftOutcome {
  readonly key: string;
  readonly action: CopyDraftAction;
}

export interface CopyDraftFileReport {
  /** `copy/de/products.json`, relative to `seed/data`. */
  readonly path: string;
  readonly outcomes: readonly CopyDraftOutcome[];
  /** The exact bytes this run produced. */
  readonly contents: string;
  /** False when the file already held those bytes: a re-run is a no-op. */
  readonly changed: boolean;
  readonly written: boolean;
}

export interface CopyDraftReport {
  /** `draft` filled a machine-drafted locale; `sync` only re-flowed the closing sentence. */
  readonly mode: "draft" | "sync";
  readonly locale: string;
  readonly files: readonly CopyDraftFileReport[];
}

export interface CopyDraftOptions {
  readonly root: string;
  readonly locale: string;
  readonly provider?: CopyDraftProvider;
  readonly dryRun?: boolean;
  /**
   * The target locale's `catalog.floristSentence`. Passed in rather than read here, because the
   * message catalogues are `scripts/i18n-draft.ts`'s to load and this module must stay a pure
   * function of its inputs plus the copy files.
   */
  readonly floristSentence: string;
  /**
   * The **source** locale's `catalog.floristSentence`, so the drafter can strip the English
   * closing sentence off the English description before handing the body to the provider and put
   * the target locale's sentence back on. Without it a draft would carry two closing sentences
   * the first time the wording is changed — the bug `tests/unit/seed-copy.test.ts`'s
   * re-synchronisation case exists to prevent.
   */
  readonly sourceFloristSentence: string;
}

/** Two-space indent and one trailing newline: what Prettier prints for a JSON file. */
function serialise(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function copyFilePath(
  root: string,
  locale: string,
  entity: SeedCopyFileEntity,
): string {
  return join(root, SEED_DATA_DIR, seedCopyPath(locale, entity));
}

/** Parse one copy file, or `undefined` when it is not on disk. */
export function readCopyFile(
  root: string,
  locale: string,
  entity: SeedCopyFileEntity,
): readonly SeedCopy[] | undefined {
  const path = copyFilePath(root, locale, entity);
  if (!existsSync(path)) return undefined;
  const parsed = copyFileSchema(entity).safeParse(
    JSON.parse(readFileSync(path, "utf8")),
  );
  if (!parsed.success) {
    throw new Error(
      `refusing to read ${seedCopyPath(locale, entity)}: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data.rows;
}

/**
 * Is this row a human's work? `translationStatus: "human"` or `reviewed: true` — the same two
 * conditions `draftLocale()` protects in a message manifest.
 */
function protectedRow(row: SeedCopy): boolean {
  return row.translationStatus === "human" || row.reviewed;
}

/**
 * Draft one locale's copy files from `en`. Returns a report per file and writes nothing when
 * `dryRun` is set.
 */
export function draftCopyLocale(options: CopyDraftOptions): CopyDraftReport {
  const { root, locale, floristSentence, sourceFloristSentence } = options;
  const provider = options.provider ?? echoCopyDraftProvider;
  const dryRun = options.dryRun ?? false;

  if (locale === COPY_SOURCE_LOCALE) {
    throw new Error(
      `\`${COPY_SOURCE_LOCALE}\` catalogue copy is authored, never drafted (spec 006 §2.2)`,
    );
  }

  const files: CopyDraftFileReport[] = [];

  for (const entity of SEED_COPY_ENTITIES) {
    const source = readCopyFile(root, COPY_SOURCE_LOCALE, entity);
    if (source === undefined) continue;
    const existing = readCopyFile(root, locale, entity) ?? [];
    const byKey = new Map(existing.map((row) => [row.key, row]));

    const outcomes: CopyDraftOutcome[] = [];
    const rows: SeedCopy[] = [];

    for (const sourceRow of source) {
      const hash = copySourceHash(sourceRow);
      const current = byKey.get(sourceRow.key);
      byKey.delete(sourceRow.key);

      if (current !== undefined && protectedRow(current)) {
        // A reviewer's row. It is never rewritten — not its text and not its closing sentence
        // (`plan/13` B12). It is *reported* when the English source has moved or when the
        // sentence it ends with is no longer the one the message catalogue holds, because both
        // mean a human has to look at it again.
        rows.push(current);
        const stale =
          current.sourceHash !== hash ||
          (current.descriptionMd !== undefined &&
            !endsWithFloristSentence(current.descriptionMd, floristSentence));
        outcomes.push({ key: sourceRow.key, action: stale ? "stale" : "kept" });
        continue;
      }

      // A machine draft is *regenerated* rather than patched: the provider is deterministic, so
      // "kept" and "written" differ only in what is reported, and regenerating is the only way a
      // reworded closing sentence or a moved English source reaches every row exactly once.
      const drafted = draftRow({
        sourceRow,
        locale,
        provider,
        hash,
        floristSentence,
        sourceFloristSentence,
      });
      rows.push(drafted);
      outcomes.push({
        key: sourceRow.key,
        action:
          current !== undefined &&
          JSON.stringify(current) === JSON.stringify(drafted)
            ? "kept"
            : "written",
      });
    }

    // A row the English file no longer has is dropped: there is no `retained` escape in the
    // catalogue, because a translation of a deleted product is not copy anybody can read.
    for (const key of byKey.keys()) {
      outcomes.push({ key, action: "removed" });
    }

    files.push(writeCopyFile({ root, locale, entity, rows, outcomes, dryRun }));
  }

  return { mode: "draft", locale, files };
}

/**
 * Serialise, validate and (unless `dryRun`) write one copy file. The schema runs on the bytes
 * about to be written rather than on the object graph, which is the same write boundary
 * `scripts/i18n-draft.ts` keeps for the message catalogues.
 */
function writeCopyFile({
  root,
  locale,
  entity,
  rows,
  outcomes,
  dryRun,
}: {
  readonly root: string;
  readonly locale: string;
  readonly entity: SeedCopyFileEntity;
  readonly rows: readonly SeedCopy[];
  readonly outcomes: readonly CopyDraftOutcome[];
  readonly dryRun: boolean;
}): CopyDraftFileReport {
  const contents = serialise({
    version: 1,
    source: "seed",
    entity: `copy_${entity}`,
    origin: "authored",
    locale,
    rows,
  });

  const parsed = copyFileSchema(entity).safeParse(JSON.parse(contents));
  if (!parsed.success) {
    throw new Error(
      `refusing to write ${seedCopyPath(locale, entity)}: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  const path = copyFilePath(root, locale, entity);
  const changed = !existsSync(path) || readFileSync(path, "utf8") !== contents;
  if (!dryRun && changed) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, "utf8");
  }

  return {
    path: seedCopyPath(locale, entity),
    outcomes,
    contents,
    changed,
    written: !dryRun && changed,
  };
}

/**
 * `pnpm i18n:draft --sync-copy` for one locale: rewrite the **closing sentence** of every
 * description in that locale's copy files from its `catalog.floristSentence`, and change nothing
 * else (spec 006 §7).
 *
 * This is what discharges "a rewording is one catalogue edit in four locales rather than 84
 * description edits" for the *authored* locales, where there is no draft to regenerate: edit the
 * message key, run the command, and `en`, `en-gb`, `de` and `pl` all end with the new wording.
 * Deliberately narrow — it replaces the last sentence and touches nothing before it — so a
 * reviewer's German prose survives a rewording of the one sentence they share.
 */
export function syncCopyLocale(options: {
  readonly root: string;
  readonly locale: string;
  readonly floristSentence: string;
  readonly dryRun?: boolean;
}): CopyDraftReport {
  const { root, locale, floristSentence } = options;
  const dryRun = options.dryRun ?? false;
  const files: CopyDraftFileReport[] = [];

  for (const entity of SEED_COPY_ENTITIES) {
    const existing = readCopyFile(root, locale, entity);
    if (existing === undefined) continue;

    const outcomes: CopyDraftOutcome[] = [];
    const rows = existing.map((row) => {
      if (
        row.descriptionMd === undefined ||
        endsWithFloristSentence(row.descriptionMd, floristSentence)
      ) {
        outcomes.push({ key: row.key, action: "kept" });
        return row;
      }
      outcomes.push({ key: row.key, action: "written" });
      return {
        ...row,
        descriptionMd: replaceTrailingSentence(
          row.descriptionMd,
          floristSentence,
        ),
      };
    });

    files.push(writeCopyFile({ root, locale, entity, rows, outcomes, dryRun }));
  }

  return { mode: "sync", locale, files };
}

function draftRow({
  sourceRow,
  locale,
  provider,
  hash,
  floristSentence,
  sourceFloristSentence,
}: {
  readonly sourceRow: SeedCopy;
  readonly locale: string;
  readonly provider: CopyDraftProvider;
  readonly hash: string;
  readonly floristSentence: string;
  readonly sourceFloristSentence: string;
}): SeedCopy {
  const draft = (
    field: CopyDraftRequest["field"],
    sourceValue: string | undefined,
  ): string | undefined =>
    sourceValue === undefined
      ? undefined
      : provider.draft({ key: sourceRow.key, field, sourceValue, locale });

  // The English closing sentence comes off before the provider sees the body and the target
  // locale's goes back on after: the sentence is translated once, in the message catalogue.
  const description = draft(
    "descriptionMd",
    sourceRow.descriptionMd === undefined
      ? undefined
      : stripFloristSentence(sourceRow.descriptionMd, sourceFloristSentence),
  );

  return {
    entity: sourceRow.entity,
    key: sourceRow.key,
    locale,
    // The evocative name and its slug are the English ones by design (§13 Q2, `plan/03` §5).
    name: sourceRow.name,
    slug: sourceRow.slug,
    ...(description === undefined
      ? {}
      : {
          descriptionMd: withFloristSentence(description, floristSentence),
        }),
    ...withOptional("seoTitle", draft("seoTitle", sourceRow.seoTitle)),
    ...withOptional(
      "seoDescription",
      draft("seoDescription", sourceRow.seoDescription),
    ),
    translationStatus: "machine",
    reviewed: false,
    sourceHash: hash,
  };
}

function withOptional(
  field: "seoTitle" | "seoDescription",
  value: string | undefined,
): Record<string, string> {
  return value === undefined ? {} : { [field]: value };
}

/** The report `pnpm i18n:draft` prints for the catalogue half, one line per file. */
export function formatCopyDraftReport(report: CopyDraftReport): string {
  if (report.files.length === 0) {
    return `i18n:draft ${report.locale}: no catalogue copy in seed/data/${seedCopyPath(COPY_SOURCE_LOCALE, "product")}`;
  }
  const lines = report.files.map((file) => {
    const count = (action: CopyDraftAction): number =>
      file.outcomes.filter((outcome) => outcome.action === action).length;
    const state = file.written
      ? "written"
      : file.changed
        ? "would change"
        : "up to date";
    return `${file.path}: ${String(count("written"))} drafted, ${String(count("kept"))} up to date, ${String(count("stale"))} stale, ${String(count("removed"))} removed — ${state}`;
  });
  const stale = report.files.flatMap((file) =>
    file.outcomes
      .filter((outcome) => outcome.action === "stale")
      .map((outcome) => `${file.path}#${outcome.key}`),
  );
  if (stale.length > 0) {
    lines.push(
      `stale (human copy kept; the \`en\` row moved, re-review): ${stale.join(", ")}`,
    );
  }
  lines.push(
    report.mode === "draft"
      ? `every drafted row is \`translationStatus: "machine", reviewed: false\` — ${report.locale} product pages stay non-indexable until a native reviewer approves them (spec 006 AC-5); the closing sentence comes from \`${FLORIST_SENTENCE_KEY}\``
      : `${report.locale}: closing sentence re-flowed from \`${FLORIST_SENTENCE_KEY}\`; nothing else in a description was touched (spec 006 §7)`,
  );
  return lines.join("\n");
}
