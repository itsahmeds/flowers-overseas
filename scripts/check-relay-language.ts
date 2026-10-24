/**
 * `pnpm check:relay-language`: the catalogue scan of spec 018 AC-38 (T-38; TASK-337), also run as
 * check 14 of `pnpm i18n:check`.
 *
 * The founder's ruling of 2026-10-14: a buyer never learns that we relay an order to a florist.
 * This scan reads the message catalogues (the source of every string that reaches a buyer, server
 * or client; never minified framework code) and, for each of `en`, `en-gb`, `de` and `pl`:
 *
 *  - every **value** in spec 018's buyer namespaces (`BUYER_NAMESPACES`) must give no match from
 *    `relayMatches` over `RELAY_PATTERNS` (`src/config/honesty.ts`; the canonical definition is
 *    spec 041 §14). `en-gb` is read as the application reads it, `en` with the `en-gb` overrides
 *    on top, and so are `de` and `pl` (an untranslated key falls back to English);
 *  - every **key name** in those namespaces, split into words (`noPartnerLine` reads
 *    "no Partner Line"), must give no match from the **context-free** patterns (a key name has no
 *    sentence, so an in-context pattern cannot apply);
 *  - none of the namespaces may be exempt: no `RELAY_EXEMPT` namespace rule covers one, and no
 *    per-key (`messageCase`) exemption sits inside one. There is no exemption mechanism of this
 *    scan's own;
 *  - **the list itself** (a self-check that nobody emptied it): each locale's pattern list is
 *    non-empty and, on its own, flags one probe sentence per term spec 018 §7 names
 *    (`SECTION_7_TERMS`). The `en` list is probed with the terms of the founder's ruling.
 *
 * Exit 0 when clean; exit 1 with one line per problem. Logs keys and pattern ids, never more of a
 * value than the sentence that matched (copy, not personal data).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  RELAY_EXEMPT,
  RELAY_PATTERNS,
  type RelayExemption,
  type RelayLocale,
  type RelayPattern,
  relayMatches,
} from "../src/config/honesty.ts";

export const CLI_NAME = "check:relay-language";

/** The locales scanned (spec 018 §7). */
export const SCAN_LOCALES = ["en", "en-gb", "de", "pl"] as const;
export type ScanLocale = (typeof SCAN_LOCALES)[number];

/**
 * Spec 018's buyer namespaces (AC-38): the launch set, and the three tasks 4 and 5 add. A namespace
 * that does not exist yet is scanned as empty, so its first key is checked the day it lands.
 */
export const BUYER_NAMESPACES = [
  "tracking",
  "trackLookup",
  "invoice",
  "emails.account",
  "confirmation.postPurchase",
  "account",
  "auth.account",
  "privacy",
] as const;

/**
 * One probe sentence per term spec 018 §7 names, per pattern list. Each must be flagged by its
 * list **alone** (the `de` and `pl` probes are read without the `en` list, which `relayMatches`
 * otherwise adds), so a term dropped from a list turns this scan red. The verbs are in-context
 * patterns, so their probes carry the florist or order word.
 */
export const SECTION_7_TERMS: Readonly<Record<RelayLocale, readonly string[]>> =
  {
    en: [
      "Your order goes to our partner florist.",
      "We are rerouting your order.",
      "We will find another florist.",
      "There is no florist in that town.",
      "We are finding a florist for you.",
      "Free to cancel until a florist accepts.",
      "Your card is held.",
      "Your payment is on hold.",
      "We authorise your card today.",
      "Our florist accepts your order.",
      "If our florist declines, we tell you.",
      "Where our florist offers a slot.",
    ],
    de: [
      "Unser Partner bindet den Strauß.",
      "Unser Florist akzeptiert die Bestellung.",
      "Der Florist kann die Bestellung ablehnen.",
      "Die Bestellung wurde vom Floristen abgelehnt.",
      "Unser Florist macht ein Angebot zur Bestellung.",
      "Wir müssen die Bestellung umleiten.",
      "Wir suchen einen anderen Floristen.",
      "Es gibt keinen Floristen in dieser Stadt.",
      "Wir müssen einen Floristen finden.",
      "Der Betrag ist reserviert.",
      "Eine Reservierung auf Ihrer Karte.",
      "Wir autorisieren Ihre Karte.",
    ],
    pl: [
      "Nasz partner przygotuje bukiet.",
      "Florysta zaakceptował zamówienie.",
      "Florysta może odrzucić zamówienie.",
      "Zamówienie zostało odrzucone przez florystę.",
      "Florysta ma ofertę na to zamówienie.",
      "Przekierujemy zamówienie.",
      "Szukamy innego florysty.",
      "Brak florysty w tym mieście.",
      "Nie udało się znaleźć florysty.",
      "Kwota jest zablokowana.",
      "Trwa autoryzacja karty.",
    ],
  };

export interface RelayProblem {
  readonly locale?: string;
  readonly key?: string;
  readonly reason: string;
}

type Catalogue = Readonly<Record<string, unknown>>;
type PatternLists = Readonly<Record<RelayLocale, readonly RelayPattern[]>>;

const LISTS: readonly RelayLocale[] = ["en", "de", "pl"];

/** `base` with `override` merged in, objects deeply, leaves replaced. */
export function mergeCatalogues(
  base: Catalogue,
  override: Catalogue,
): Catalogue {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = merged[key];
    merged[key] =
      isObject(existing) && isObject(value)
        ? mergeCatalogues(existing, value)
        : value;
  }
  return merged;
}

function isObject(value: unknown): value is Catalogue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The subtree at a dotted path, or `undefined`. */
function at(catalogue: Catalogue, path: string): unknown {
  let value: unknown = catalogue;
  for (const segment of path.split(".")) {
    if (!isObject(value)) return undefined;
    value = value[segment];
  }
  return value;
}

/** Every leaf under `value`: the dotted key, and the value when it is a string. */
function leaves(
  value: unknown,
  path: string,
): readonly { readonly key: string; readonly value: string | undefined }[] {
  if (isObject(value)) {
    return Object.entries(value).flatMap(([key, item]) =>
      leaves(item, `${path}.${key}`),
    );
  }
  return [{ key: path, value: typeof value === "string" ? value : undefined }];
}

/** A key segment as words: `noPartnerLine` → "no Partner Line", `re_route` → "re route". */
export function keyWords(segment: string): string {
  return segment
    .replaceAll(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .replaceAll(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
    .replaceAll(/[_\-.]+/gu, " ")
    .trim();
}

/** The context-free half of a set of lists, for key names. */
function contextFree(patterns: PatternLists): PatternLists {
  return {
    en: patterns.en.filter((pattern) => pattern.context === "none"),
    de: patterns.de.filter((pattern) => pattern.context === "none"),
    pl: patterns.pl.filter((pattern) => pattern.context === "none"),
  };
}

/** The self-check: no list is empty and each flags its §7 probes on its own. */
export function listProblems(
  patterns: PatternLists = RELAY_PATTERNS,
): RelayProblem[] {
  const problems: RelayProblem[] = [];
  const empty: PatternLists = { en: [], de: [], pl: [] };
  for (const list of LISTS) {
    if (patterns[list].length === 0) {
      problems.push({
        reason: `RELAY_PATTERNS.${list} is empty (spec 018 AC-38: the list must not be emptied)`,
      });
      continue;
    }
    // Only this list: `relayMatches` reads `en` beside `de` and `pl`, so the other lists are
    // blanked, and a term missing from this one cannot hide behind the English.
    const alone: PatternLists = { ...empty, [list]: patterns[list] };
    for (const probe of SECTION_7_TERMS[list]) {
      if (relayMatches(probe, list, alone).length === 0) {
        problems.push({
          reason: `RELAY_PATTERNS.${list} lacks a term spec 018 §7 names: nothing flags "${probe}"`,
        });
      }
    }
  }
  return problems;
}

/** No exemption may reach a buyer namespace of this spec. */
export function exemptionProblems(
  exempt: readonly RelayExemption[] = RELAY_EXEMPT,
): RelayProblem[] {
  const problems: RelayProblem[] = [];
  for (const namespace of BUYER_NAMESPACES) {
    const prefix = `${namespace}.`;
    for (const rule of exempt) {
      const covers =
        (rule.kind === "non-buyer-namespace" &&
          (prefix.startsWith(rule.namespace) ||
            rule.namespace.startsWith(prefix))) ||
        (rule.kind === "messageCase" && rule.key.startsWith(prefix));
      if (covers) {
        problems.push({
          key: namespace,
          reason: `is a buyer namespace of spec 018 and must not be exempt from the relay check (RELAY_EXEMPT ${rule.kind})`,
        });
      }
    }
  }
  return problems;
}

/** The catalogue half: values and key names of the buyer namespaces, per locale. */
export function catalogueProblems(
  catalogues: Readonly<Partial<Record<ScanLocale, Catalogue>>>,
  patterns: PatternLists = RELAY_PATTERNS,
): RelayProblem[] {
  const problems: RelayProblem[] = [];
  const forKeys = contextFree(patterns);
  for (const locale of SCAN_LOCALES) {
    const catalogue = catalogues[locale];
    if (catalogue === undefined) continue;
    for (const namespace of BUYER_NAMESPACES) {
      const subtree = at(catalogue, namespace);
      if (subtree === undefined) continue;
      for (const leaf of leaves(subtree, namespace)) {
        const nameSegments = leaf.key
          .split(".")
          .slice(namespace.split(".").length);
        for (const segment of nameSegments) {
          for (const match of relayMatches(
            keyWords(segment),
            locale,
            forKeys,
          )) {
            problems.push({
              locale,
              key: leaf.key,
              reason: `key name segment "${segment}" gives the relay match ${match.id} ("${match.match}")`,
            });
          }
        }
        if (leaf.value === undefined) continue;
        for (const match of relayMatches(leaf.value, locale, patterns)) {
          problems.push({
            locale,
            key: leaf.key,
            reason: `value gives the relay match ${match.id} ("${match.match}") in "${match.sentence}"`,
          });
        }
      }
    }
  }
  return problems;
}

/** Everything the scan checks, over catalogues already resolved per locale. */
export function relayLanguageProblems(
  catalogues: Readonly<Partial<Record<ScanLocale, Catalogue>>>,
  patterns: PatternLists = RELAY_PATTERNS,
  exempt: readonly RelayExemption[] = RELAY_EXEMPT,
): RelayProblem[] {
  return [
    ...listProblems(patterns),
    ...exemptionProblems(exempt),
    ...catalogueProblems(catalogues, patterns),
  ];
}

/** The four catalogues as the application resolves them: `en`, then each locale over it. */
export function readCatalogues(
  messagesDir: string,
): Partial<Record<ScanLocale, Catalogue>> {
  const read = (code: string): Catalogue | undefined => {
    try {
      const parsed: unknown = JSON.parse(
        readFileSync(resolve(messagesDir, `${code}.json`), "utf8"),
      );
      return isObject(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  };
  const en = read("en");
  if (en === undefined) return {};
  const out: Partial<Record<ScanLocale, Catalogue>> = { en };
  for (const code of SCAN_LOCALES) {
    if (code === "en") continue;
    const own = read(code);
    if (own !== undefined) out[code] = mergeCatalogues(en, own);
  }
  return out;
}

/** One line per problem. */
export function formatProblem(problem: RelayProblem): string {
  const where = [problem.locale, problem.key].filter(Boolean).join(" ");
  return `${CLI_NAME}: ${where === "" ? "" : `${where}: `}${problem.reason}`;
}

export function main(
  argv: readonly string[],
  streams: {
    readonly out: { write: (chunk: string) => unknown };
    readonly err: { write: (chunk: string) => unknown };
  } = { out: process.stdout, err: process.stderr },
): number {
  const index = argv.indexOf("--messages-dir");
  const messagesDir = resolve(
    process.cwd(),
    (index === -1 ? undefined : argv[index + 1]) ?? "messages",
  );
  const catalogues = readCatalogues(messagesDir);
  const problems: RelayProblem[] = [
    ...SCAN_LOCALES.filter((locale) => catalogues[locale] === undefined).map(
      (locale) => ({ locale, reason: "has no catalogue to scan" }),
    ),
    ...relayLanguageProblems(catalogues),
  ];
  if (problems.length > 0) {
    streams.err.write(`${problems.map(formatProblem).join("\n")}\n`);
    return 1;
  }
  streams.out.write(
    `${CLI_NAME}: ${String(SCAN_LOCALES.length)} locales, ${String(BUYER_NAMESPACES.length)} buyer namespaces, no relay language\n`,
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
