/**
 * **AC-37's phrase bullet** (spec 004 §14 A23 clause 12, open item (vii); T-47; TASK-193), written
 * once and read by the unit scan (`tests/unit/neutral-ordering-copy.test.ts`) and the served-DOM
 * scan (`tests/e2e/phrase-scan.spec.ts`).
 *
 * No `en` or `en-gb` copy may say, in any case, "still choosing", "first florist", "no florist" or
 * "choosing florists": the site may not imply we have no florists yet (founder, 2026-10-05). The
 * copy is every value in `messages/en.json` and `messages/en-gb.json`, every `en`/`en-gb` seed copy
 * record and every `content/corridors/en*` file.
 *
 * **The named exception list** is the only way a match passes. It names one catalogue key, or one
 * corridor file and FAQ entry (by its question, the entry's only stable name), and it may only
 * shrink: an entry leaves in the PR that ships its approved replacement. The unit scan asserts the
 * matches it finds equal this list exactly, so an entry that no longer matches is as red as a match
 * outside it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { splitCorridorFile } from "../../src/modules/geo/content/parse.ts";

/** The four phrases, as AC-37 lists them. */
export const FORBIDDEN_PHRASES = [
  "still choosing",
  "first florist",
  "no florist",
  "choosing florists",
] as const;

/**
 * Spec 004 §14 A23 open item (vii): the shipped, reviewed `en` copy that still matches, and nothing
 * else. Each entry waits for the founder's replacement wording (proposed in TASK-193's PR).
 */
export const PHRASE_EXCEPTIONS: readonly string[] = [
  "content/corridors/en-gb/es-guide.md › faq › Can you send flowers to Spain now?",
  "content/corridors/en-gb/fr-guide.md › faq › Can you deliver to France today?",
  "content/corridors/en-gb/pl-guide.md › faq › Can you deliver to Poland today?",
  "content/corridors/en/es-guide.md › faq › Can you send flowers to Spain now?",
  "content/corridors/en/pl-guide.md › faq › Can you deliver to Poland today?",
  "corridor.facts.orderBy.none",
];

/** One piece of copy: where it lives (a catalogue key, or a file and field) and its text. */
export interface CopyRecord {
  readonly id: string;
  readonly text: string;
}

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** Whitespace collapsed, so a phrase a YAML fold or a markdown line split breaks is still read. */
export function normaliseSpace(text: string): string {
  return text.replaceAll(/\s+/gu, " ").trim();
}

/** The forbidden phrases `text` contains, lower-cased, in list order. */
export function forbiddenPhrasesIn(text: string): readonly string[] {
  const haystack = normaliseSpace(text).toLowerCase();
  return FORBIDDEN_PHRASES.filter((phrase) => haystack.includes(phrase));
}

/** Every string leaf of a JSON-like value, with its dotted path. */
function leaves(value: unknown, path: string): readonly CopyRecord[] {
  if (typeof value === "string") return [{ id: path, text: value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leaves(item, `${path}[${index}]`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      leaves(item, path === "" ? key : `${path}.${key}`),
    );
  }
  return [];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8")) as unknown;
}

/** `messages/en.json` and `messages/en-gb.json`: one record per key, named by the key. */
export function catalogueCopy(): readonly CopyRecord[] {
  return ["en", "en-gb"].flatMap((locale) =>
    leaves(readJson(`messages/${locale}.json`), ""),
  );
}

/** Every string of every `en`/`en-gb` seed copy record, named by file, row key and field. */
export function seedCopy(): readonly CopyRecord[] {
  return ["en", "en-gb"].flatMap((locale) => {
    const dir = `seed/data/copy/${locale}`;
    return readdirSync(join(ROOT, dir))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .flatMap((name) => {
        const file = readJson(`${dir}/${name}`) as {
          readonly rows: readonly Record<string, unknown>[];
        };
        return file.rows.flatMap((row) =>
          leaves(row, "").map(({ id, text }) => ({
            id: `${dir}/${name} › ${String(row.key)} › ${id}`,
            text,
          })),
        );
      });
  });
}

/**
 * Every `content/corridors/en*` file, parsed: each frontmatter string (a FAQ entry named by its
 * question) and the markdown body. A file that does not split is read whole, so it is scanned
 * rather than skipped.
 */
export function corridorCopy(): readonly CopyRecord[] {
  const base = "content/corridors";
  return readdirSync(join(ROOT, base), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("en"))
    .map((entry) => entry.name)
    .sort()
    .flatMap((locale) =>
      readdirSync(join(ROOT, base, locale))
        .sort()
        .flatMap((name): readonly CopyRecord[] => {
          const relative = `${locale}/${name}`;
          const file = `${base}/${relative}`;
          const source = readFileSync(join(ROOT, file), "utf8");
          const split = splitCorridorFile(relative, source);
          if (!split.ok) return [{ id: file, text: source }];
          const front = split.frontmatter as Record<string, unknown>;
          const faq = Array.isArray(front.faq)
            ? (front.faq as readonly { q?: unknown; a?: unknown }[])
            : [];
          const rest = Object.fromEntries(
            Object.entries(front).filter(([key]) => key !== "faq"),
          );
          return [
            ...leaves(rest, "").map(({ id, text }) => ({
              id: `${file} › ${id}`,
              text,
            })),
            ...faq.flatMap((item) =>
              leaves(item, "").map(({ text }) => ({
                id: `${file} › faq › ${String(item.q)}`,
                text,
              })),
            ),
            { id: `${file} › body`, text: split.body },
          ];
        }),
    );
}

/** Every piece of `en`/`en-gb` copy AC-37 names. */
export function englishCopy(): readonly CopyRecord[] {
  return [...catalogueCopy(), ...seedCopy(), ...corridorCopy()];
}

/** The ids of the records that carry a forbidden phrase, sorted and de-duplicated. */
export function phraseMatches(
  records: readonly CopyRecord[],
): readonly string[] {
  return [
    ...new Set(
      records
        .filter((record) => forbiddenPhrasesIn(record.text).length > 0)
        .map((record) => record.id),
    ),
  ].sort();
}

/**
 * The texts the exception list excuses, as they render: the excepted catalogue values and FAQ
 * answers, whitespace collapsed. The served-DOM scan cuts these out before it looks, so a page may
 * print an excepted string and nothing else that matches.
 */
export function exceptionTexts(): readonly string[] {
  const excused = new Set(PHRASE_EXCEPTIONS);
  return englishCopy()
    .filter(
      (record) =>
        excused.has(record.id) && forbiddenPhrasesIn(record.text).length > 0,
    )
    .map((record) => normaliseSpace(record.text));
}
