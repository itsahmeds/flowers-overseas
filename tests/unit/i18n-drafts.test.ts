/**
 * German and Polish agent-written drafts (spec 003 §14 A15, AC-33 to AC-39, T-33 to T-39;
 * TASK-185).
 *
 * Every case reads the committed tree and then breaks one thing on a copy of it, so a case that
 * passes with its subject removed is impossible (CLAUDE.md DoD §4): the drafted value restored to
 * English, the key deleted, a hash altered, a record marked reviewed, an excluded key given a
 * machine draft, a policy entry removed, a seeded voice, freshness, home, register, brand and
 * plural fault, a seed body restored to English, a slug changed, the keep-fresh rule reverted,
 * and check 10's four sandbox faults.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DraftPolicySchema,
  type DraftPolicy,
  draftProblems,
  draftValueProblems,
  excludedSeedRowKeys,
  isExcluded,
} from "../../scripts/i18n-check-drafts.ts";
import { draftLocale } from "../../scripts/i18n-draft.ts";
import { draftCopyLocale, keepFreshRow } from "../../seed/copy-draft.ts";
import {
  copySourceHash,
  endsWithFloristSentence,
  stripFloristSentence,
} from "../../seed/copy.ts";
import {
  BANNED_VOICE_FORMS,
  BANNED_VOICE_WORDS,
  bannedVoiceWordsIn,
} from "../../src/config/voice.ts";
import { alternatesFor } from "../../src/modules/i18n/alternates.ts";
import {
  type MessageSource,
  repoMessageSource,
  resolveCatalogue,
  withMessageSource,
} from "../../src/modules/i18n/messages.ts";
import {
  localeRegistryOf,
  staticLocaleRegistry,
  withLocaleRegistry,
} from "../../src/modules/i18n/registry.ts";
import {
  isLocaleIndexable,
  localeBetaTag,
  resetReviewCache,
  unreviewedShare,
} from "../../src/modules/i18n/review.ts";
import type { MessageMetaManifest } from "../../src/modules/i18n/schemas.ts";

const repoRoot = resolve(import.meta.dirname, "../..");
const DRAFTED = ["de", "pl"] as const;
type Drafted = (typeof DRAFTED)[number];

type Tree = Record<string, unknown>;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(repoRoot, path), "utf8")) as T;
}

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const flat = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") flat.set(path, value);
    else if (typeof value === "object" && value !== null) {
      for (const [k, v] of flatten(value as Tree, path)) flat.set(k, v);
    }
  }
  return flat;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** A deep copy with one leaf set (or deleted when `value` is undefined). */
function withLeaf(tree: Tree, key: string, value: string | undefined): Tree {
  const copy = structuredClone(tree);
  const segments = key.split(".");
  let node = copy;
  for (const segment of segments.slice(0, -1)) node = node[segment] as Tree;
  const leaf = segments.at(-1) ?? "";
  if (value === undefined) delete node[leaf];
  else node[leaf] = value;
  return copy;
}

const policy: DraftPolicy = DraftPolicySchema.parse(
  readJson("content/i18n/draft-policy.json"),
);
const enTree = readJson<Tree>("messages/en.json");
const en = flatten(enTree);
const trees: Record<Drafted, Tree> = {
  de: readJson("messages/de.json"),
  pl: readJson("messages/pl.json"),
};
const metas: Record<Drafted, MessageMetaManifest> = {
  de: readJson("messages/de.meta.json"),
  pl: readJson("messages/pl.meta.json"),
};

/** A message source with the committed catalogues, `de`/`pl` overridden where given. */
function sourceWith(
  overrides: Partial<
    Record<Drafted, { tree?: Tree; meta?: MessageMetaManifest }>
  >,
): MessageSource {
  return {
    catalogue: (locale) =>
      (overrides[locale as Drafted]?.tree as never) ??
      repoMessageSource.catalogue(locale),
    meta: (locale) =>
      overrides[locale as Drafted]?.meta ?? repoMessageSource.meta(locale),
  };
}

/** Check 10 over a source, through the production `resolveCatalogue()`. */
async function check10(
  source: MessageSource,
  checkedPolicy: DraftPolicy = policy,
): Promise<ReturnType<typeof draftProblems>> {
  return withMessageSource(source, () =>
    draftProblems({
      policy: checkedPolicy,
      policyFile: "content/i18n/draft-policy.json",
      sourceFlat: en,
      locales: DRAFTED.map((code) => {
        const resolved = flatten(resolveCatalogue(code));
        const meta = source.meta(code);
        return {
          code,
          cataloguePath: `messages/${code}.json`,
          resolved: (key: string) => resolved.get(key),
          flat: flatten((source.catalogue(code) ?? {}) as Tree),
          source: (key: string) => meta?.[key]?.source,
        };
      }),
    }),
  );
}

function faultsFor(
  result: ReturnType<typeof draftProblems>,
): readonly string[] {
  return result.problems.map(
    (problem) => `${problem.file} [${problem.key ?? ""}] ${problem.reason}`,
  );
}

function runCli(
  script: string,
  ...args: readonly string[]
): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      status: failure.status ?? 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* T-33 / AC-33                                                                */
/* -------------------------------------------------------------------------- */

describe("T-33: no in-scope de/pl key resolves to its en value (AC-33)", () => {
  it("holds on the committed catalogues, with 0 in the summary's identical column", async () => {
    const result = await check10(repoMessageSource);
    expect(faultsFor(result)).toEqual([]);
    expect(Object.fromEntries(result.identicalCount)).toEqual({ de: 0, pl: 0 });

    const summary = runCli("scripts/i18n-check.ts", "--summary");
    expect(summary.status).toBe(0);
    for (const locale of DRAFTED) {
      expect(summary.stdout).toMatch(
        new RegExp(`\\| \`${locale}\` \\|(?: [^|]+ \\|){8} 0 \\|`),
      );
    }
  });

  it("goes red when one drafted value is restored to its English text", async () => {
    const key = "home.hero.heading";
    const restored = withLeaf(trees.de, key, en.get(key));
    const result = await check10(sourceWith({ de: { tree: restored } }));
    expect(faultsFor(result)).toEqual([
      expect.stringMatching(
        /^messages\/de\.json \[home\.hero\.heading\] is identical to `en` in `de`/u,
      ),
    ]);
    expect(result.identicalCount.get("de")).toBe(1);
  });

  it("goes red when the key is deleted from de.json (the fallback then supplies English)", async () => {
    const key = "nav.search.label";
    const deleted = withLeaf(trees.de, key, undefined);
    const result = await check10(sourceWith({ de: { tree: deleted } }));
    expect(faultsFor(result)).toEqual([
      expect.stringMatching(
        /^messages\/de\.json \[nav\.search\.label\] is identical to `en` in `de`/u,
      ),
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* T-34 / AC-34                                                                */
/* -------------------------------------------------------------------------- */

/** Every machine record whose value differs from `en` that is not exactly `{ machine, false, sha256(en) }`. */
function metaFaults(tree: Tree, meta: MessageMetaManifest): readonly string[] {
  const values = flatten(tree);
  const faults: string[] = [];
  for (const [key, value] of values) {
    const record = meta[key];
    const source = en.get(key);
    if (source === undefined || value === source) continue;
    if (record?.source !== "machine" && record?.reviewed !== true) continue;
    if (record.source === "human") continue;
    const expected = {
      source: "machine",
      reviewed: false,
      sourceHash: sha256(source),
    };
    if (JSON.stringify(record) !== JSON.stringify(expected)) faults.push(key);
  }
  return faults;
}

describe("T-34: every drafted record is { machine, false, sha256(en) } (AC-34)", () => {
  for (const locale of DRAFTED) {
    it(`holds for every drafted ${locale} value`, () => {
      expect(metaFaults(trees[locale], metas[locale])).toEqual([]);
    });
  }

  it("goes red on an altered sourceHash", () => {
    const meta = structuredClone(metas.pl);
    const record = meta["home.hero.heading"];
    if (record === undefined) throw new Error("no record");
    meta["home.hero.heading"] = { ...record, sourceHash: "0".repeat(64) };
    expect(metaFaults(trees.pl, meta)).toEqual(["home.hero.heading"]);
  });

  it("goes red when a drafted record claims a review", () => {
    const meta = structuredClone(metas.de);
    const record = meta["home.hero.heading"];
    if (record === undefined) throw new Error("no record");
    meta["home.hero.heading"] = {
      ...record,
      reviewed: true,
      reviewedBy: "an agent",
      reviewedAt: "2026-10-22T00:00:00Z",
    };
    expect(metaFaults(trees.de, meta)).toEqual(["home.hero.heading"]);
  });
});

/* -------------------------------------------------------------------------- */
/* T-35 / AC-35                                                                */
/* -------------------------------------------------------------------------- */

/** Excluded keys whose value differs from `en` without a `human` record: a machine draft. */
function excludedDrafts(
  locale: Drafted,
  tree: Tree,
  meta: MessageMetaManifest,
): readonly string[] {
  const values = flatten(tree);
  return [...en.keys()]
    .filter((key) => {
      if (!isExcluded(policy, key)) return false;
      const value = values.get(key) ?? en.get(key);
      return value !== en.get(key) && meta[key]?.source !== "human";
    })
    .map((key) => `${locale}:${key}`);
}

const SEGMENT_EXCLUSIONS = ["sympathy", "funeral", "allSaints"];

describe("T-35: excluded keys and the policy file (AC-35)", () => {
  it("leaves every excluded de/pl key English or human-written", () => {
    for (const locale of DRAFTED) {
      expect(excludedDrafts(locale, trees[locale], metas[locale])).toEqual([]);
    }
  });

  it("goes red when consent.headline gets a German machine draft", () => {
    const tree = withLeaf(
      trees.de,
      "consent.headline",
      "Cookies auf dieser Seite",
    );
    expect(excludedDrafts("de", tree, metas.de)).toEqual([
      "de:consent.headline",
    ]);
  });

  it("excludes legal, consent and every sympathy, funeral and All Saints' key by name", () => {
    const keys = policy.excluded.map((entry) => entry.key);
    expect(keys).toContain("infoPages.legal.*");
    expect(keys).toContain("occasions.date.allSaints.*");
    expect(keys).toContain("consent.*");
    for (const key of en.keys()) {
      if (
        key.split(".").some((segment) => SEGMENT_EXCLUSIONS.includes(segment))
      ) {
        expect(isExcluded(policy, key), key).toBe(true);
      }
    }
  });

  it("names exactly the seed rows clause 4's catalogue rule selects", () => {
    const products = readJson<{
      rows: { sku: string; productType: string; occasions: string[] }[];
    }>("seed/data/products.json").rows;
    const computed = excludedSeedRowKeys(products);
    const listed = policy.excludedSeedRows.map((row) => row.key).sort();
    expect(listed).toEqual(computed);
    expect(listed).toContain("FO-FN-001");
    expect(listed.filter((key) => key !== "FO-FN-001")).not.toEqual(computed);
  });

  it("lists seed:products and the cutoff line under reviewBeforeOrders, none of them excluded or missing", async () => {
    expect(policy.reviewBeforeOrders).toContain("seed:products");
    expect(policy.reviewBeforeOrders).toContain("nav.utility.cutoff");
    expect(faultsFor(await check10(repoMessageSource))).toEqual([]);
  });

  it("goes red when a key is in both excluded and reviewBeforeOrders, or names no key", async () => {
    const both: DraftPolicy = {
      ...policy,
      reviewBeforeOrders: [...policy.reviewBeforeOrders, "consent.headline"],
    };
    expect(faultsFor(await check10(repoMessageSource, both))).toEqual([
      expect.stringMatching(
        /^content\/i18n\/draft-policy\.json \[consent\.headline\] is under both `reviewBeforeOrders` and `excluded`/u,
      ),
    ]);
    const missing: DraftPolicy = {
      ...policy,
      reviewBeforeOrders: [...policy.reviewBeforeOrders, "faq.lasting.answer"],
    };
    expect(faultsFor(await check10(repoMessageSource, missing))).toEqual([
      expect.stringMatching(
        /^content\/i18n\/draft-policy\.json \[faq\.lasting\.answer\] is under `reviewBeforeOrders` but names no `en` key/u,
      ),
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* T-36 / AC-36                                                                */
/* -------------------------------------------------------------------------- */

describe("T-36: indexing is unchanged (AC-36)", () => {
  it("keeps de and pl non-indexable, beta-tagged, out of hreflang, at 100 % unreviewed", () => {
    resetReviewCache();
    for (const locale of DRAFTED) {
      expect(isLocaleIndexable(locale)).toBe(false);
      expect(localeBetaTag(locale)).toBe(true);
      expect(unreviewedShare(locale)).toBe(1);
    }
    const hreflangs = alternatesFor(
      { pageType: "home" },
      { baseUrl: "https://flowersoverseas.com" },
    ).flatMap((page) => page.alternates.map((alternate) => alternate.hreflang));
    expect(hreflangs.length).toBeGreaterThan(0);
    expect(hreflangs.filter((tag) => /^(de|pl)\b/u.test(tag))).toEqual([]);
  });

  it("flips de to indexable on a fixture manifest with every record reviewed (and de shown)", async () => {
    const reviewed: MessageMetaManifest = Object.fromEntries(
      Object.keys(metas.de).map((key) => [
        key,
        {
          source: "human",
          reviewed: true,
          reviewedBy: "native reviewer",
          reviewedAt: "2026-10-22T00:00:00Z",
          sourceHash: "a".repeat(64),
        },
      ]),
    );
    const registry = localeRegistryOf(
      staticLocaleRegistry
        .list()
        .map((locale) =>
          locale.code === "de" ? { ...locale, shown: true } : locale,
        ),
    );
    const answer = async (meta: MessageMetaManifest) => {
      resetReviewCache();
      try {
        return await withLocaleRegistry(registry, () =>
          withMessageSource(sourceWith({ de: { meta } }), () =>
            isLocaleIndexable("de"),
          ),
        );
      } finally {
        resetReviewCache();
      }
    };
    expect(await answer(metas.de)).toBe(false);
    expect(await answer(reviewed)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* T-37 / AC-37                                                                */
/* -------------------------------------------------------------------------- */

describe("T-37: i18n:check exits 0 and every drafted value passes the six rules (AC-37)", () => {
  it("exits 0 on the committed tree", () => {
    const result = runCli("scripts/i18n-check.ts");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("finds no fault in any drafted de/pl value", () => {
    const faults: string[] = [];
    let drafted = 0;
    for (const locale of DRAFTED) {
      for (const [key, value] of flatten(trees[locale])) {
        const source = en.get(key);
        if (source === undefined || value === source) continue;
        if (metas[locale][key]?.source !== "machine") continue;
        drafted += 1;
        for (const problem of draftValueProblems({
          locale,
          key,
          value,
          enValue: source,
        })) {
          faults.push(`${locale} ${key}: ${problem}`);
        }
      }
    }
    expect(faults).toEqual([]);
    expect(drafted).toBeGreaterThan(1000);
  });

  const fault = (
    locale: Drafted,
    key: string,
    value: string,
  ): readonly string[] =>
    draftValueProblems({ locale, key, value, enValue: en.get(key) ?? "" });

  it('goes red on "Partner" in a de value', () => {
    expect(
      fault("de", "trust.local.claim", "Unser Partner bindet ihn."),
    ).toEqual([expect.stringContaining('"partner"')]);
  });

  it('goes red on "Netzwerk" (de) and "pośrednik" (pl), only through the German and Polish forms', () => {
    const german = "Unser Netzwerk bindet den Strauß.";
    const polish = "Nasz pośrednik układa bukiet.";
    expect(bannedVoiceWordsIn(german, { terms: BANNED_VOICE_WORDS })).toEqual(
      [],
    );
    expect(bannedVoiceWordsIn(polish, { terms: BANNED_VOICE_WORDS })).toEqual(
      [],
    );
    expect(fault("de", "trust.local.claim", german)).toEqual([
      expect.stringContaining('"Netzwerk"'),
    ]);
    expect(fault("pl", "trust.local.claim", polish)).toEqual([
      expect.stringContaining('"pośrednik"'),
    ]);
  });

  it("lists the German and Polish forms A15 names, an inflected form beside its base", () => {
    for (const form of ["Netzwerk", "Drittanbieter", "Korridor", "Relais"]) {
      expect(BANNED_VOICE_FORMS.de).toContain(form);
    }
    for (const form of [
      "sieć",
      "sieci",
      "pośrednik",
      "korytarz",
      "strona trzecia",
    ]) {
      expect(BANNED_VOICE_FORMS.pl).toContain(form);
    }
    expect(
      bannedVoiceWordsIn("Nasi pośrednicy", { terms: ["pośrednik"] }),
    ).toEqual([]);
    expect(bannedVoiceWordsIn("Nasi pośrednicy")).toEqual(["pośrednic"]);
  });

  it('goes red on "7 Tage frisch" in a de value', () => {
    expect(fault("de", "trust.local.claim", "Bleibt 7 Tage frisch.")).toEqual([
      expect.stringContaining("number of days of freshness"),
      expect.stringContaining('"7"'),
    ]);
  });

  it('goes red on "inkl. MwSt." in a home value', () => {
    expect(
      fault(
        "de",
        "home.hero.proposition",
        "Unser Florist bindet ihn, inkl. MwSt.",
      ),
    ).toEqual([expect.stringContaining("on the home")]);
    expect(
      fault("de", "trust.local.claim", "Unser Florist bindet ihn, inkl. MwSt."),
    ).toEqual([]);
  });

  it('goes red on "du" in a de value and "Państwo" in a pl value', () => {
    expect(
      fault("de", "trust.local.claim", "Was du siehst, zahlst du."),
    ).toEqual([expect.stringContaining("`du`")]);
    expect(fault("pl", "trust.local.claim", "Państwo widzą cenę.")).toEqual([
      expect.stringContaining("formally"),
    ]);
  });

  it('goes red on "Flowers Overseasie" in a pl value, and on a dropped or added brand', () => {
    expect(
      fault(
        "pl",
        "meta.home.title",
        "Flowers Overseasie | Wyślij kwiaty za granicę",
      ),
    ).toEqual([expect.stringContaining("inflects")]);
    expect(fault("pl", "meta.home.title", "Wyślij kwiaty za granicę")).toEqual([
      expect.stringContaining("drops the brand"),
    ]);
    expect(
      fault("pl", "trust.local.claim", "Flowers Overseas układa bukiet."),
    ).toEqual([expect.stringContaining("adds the brand")]);
  });

  it("goes red on a Polish plural without few", () => {
    expect(
      fault(
        "pl",
        "corridor.related.heading",
        "{count, plural, one {Jeszcze jeden przewodnik} many {Jeszcze # przewodników} other {Jeszcze # przewodnika}}",
      ),
    ).toEqual([expect.stringContaining("`few`")]);
  });
});

/* -------------------------------------------------------------------------- */
/* T-38 / AC-38                                                                */
/* -------------------------------------------------------------------------- */

interface CopyRow {
  readonly key: string;
  readonly name: string;
  readonly slug: string;
  readonly descriptionMd: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly translationStatus: string;
  readonly reviewed: boolean;
  readonly sourceHash: string;
}

const enRows = readJson<{ rows: CopyRow[] }>(
  "seed/data/copy/en/products.json",
).rows;
const enRow = new Map(enRows.map((row) => [row.key, row]));
const EN_SENTENCE = en.get("catalog.floristSentence") ?? "";
const sentences: Record<Drafted, string> = {
  de: flatten(trees.de).get("catalog.floristSentence") ?? "",
  pl: flatten(trees.pl).get("catalog.floristSentence") ?? "",
};
const excludedRows = new Set(policy.excludedSeedRows.map((row) => row.key));

function seedRows(locale: Drafted): CopyRow[] {
  return readJson<{ rows: CopyRow[] }>(`seed/data/copy/${locale}/products.json`)
    .rows;
}

/** Every AC-38 fault in one locale's product rows. */
function seedFaults(
  locale: Drafted,
  rows: readonly CopyRow[],
): readonly string[] {
  const faults: string[] = [];
  for (const row of rows) {
    const source = enRow.get(row.key);
    if (source === undefined) {
      faults.push(`${row.key}: no en row`);
      continue;
    }
    if (row.name !== source.name || row.slug !== source.slug) {
      faults.push(`${row.key}: name or slug differs from en`);
    }
    const enBody = stripFloristSentence(source.descriptionMd, EN_SENTENCE);
    const body = stripFloristSentence(row.descriptionMd, sentences[locale]);
    if (!endsWithFloristSentence(row.descriptionMd, sentences[locale])) {
      faults.push(
        `${row.key}: does not end with the ${locale} floristSentence`,
      );
    }
    if (excludedRows.has(row.key)) {
      // Never machine-drafted: the echo of the English, with the locale's closing sentence.
      if (
        body !== enBody ||
        row.seoTitle !== source.seoTitle ||
        row.seoDescription !== source.seoDescription
      ) {
        faults.push(`${row.key}: excluded row carries a draft`);
      }
      continue;
    }
    if (body === enBody) faults.push(`${row.key}: body is English`);
    if (row.seoTitle === source.seoTitle)
      faults.push(`${row.key}: seoTitle is English`);
    if (row.seoDescription === source.seoDescription) {
      faults.push(`${row.key}: seoDescription is English`);
    }
    if (
      row.translationStatus !== "machine" ||
      row.reviewed ||
      row.sourceHash !== copySourceHash(source)
    ) {
      faults.push(
        `${row.key}: meta is not { machine, false, copySourceHash(en) }`,
      );
    }
    for (const [field, value, enValue] of [
      ["descriptionMd", body, enBody],
      ["seoTitle", row.seoTitle, source.seoTitle],
      ["seoDescription", row.seoDescription, source.seoDescription],
    ] as const) {
      for (const problem of draftValueProblems({
        locale,
        key: `seed:${row.key}.${field}`,
        value,
        enValue,
        icu: false,
      })) {
        faults.push(`${row.key}.${field}: ${problem}`);
      }
    }
  }
  return faults;
}

describe("T-38: the drafted seed product rows (AC-38)", () => {
  for (const locale of DRAFTED) {
    it(`holds for every ${locale} product row`, () => {
      const rows = seedRows(locale);
      expect(rows).toHaveLength(84);
      expect(rows.filter((row) => !excludedRows.has(row.key))).toHaveLength(66);
      expect(seedFaults(locale, rows)).toEqual([]);
    });
  }

  it("goes red when one body is restored to English", () => {
    const rows = seedRows("de").map((row) =>
      row.key === "FO-BQ-001"
        ? {
            ...row,
            descriptionMd: `${stripFloristSentence(enRow.get(row.key)?.descriptionMd ?? "", EN_SENTENCE)} ${sentences.de}`,
          }
        : row,
    );
    expect(seedFaults("de", rows)).toEqual(["FO-BQ-001: body is English"]);
  });

  it("goes red when one slug changes", () => {
    const rows = seedRows("pl").map((row) =>
      row.key === "FO-BQ-002" ? { ...row, slug: "wislana-czerwien" } : row,
    );
    expect(seedFaults("pl", rows)).toEqual([
      "FO-BQ-002: name or slug differs from en",
    ]);
  });

  it("goes red when FO-FN-001's de body is given a machine draft", () => {
    const rows = seedRows("de").map((row) =>
      row.key === "FO-FN-001"
        ? {
            ...row,
            descriptionMd: `Ein Kranz aus weißen Blumen. ${sentences.de}`,
          }
        : row,
    );
    expect(seedFaults("de", rows)).toEqual([
      "FO-FN-001: excluded row carries a draft",
    ]);
  });

  it("brings glossary.en.md into line with spec 004 A5 and A22", () => {
    const glossary = readFileSync(
      resolve(repoRoot, "content/i18n/glossary.en.md"),
      "utf8",
    ).toLowerCase();
    expect(glossary).not.toContain("partner florist");
    expect(glossary).not.toMatch(/"our florists"/u);
  });

  it("passes pnpm seed:check", () => {
    const result = runCli("seed/check.ts");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* T-39 / AC-39                                                                */
/* -------------------------------------------------------------------------- */

describe("T-39: re-runs keep the drafts, and check 10's four faults (AC-39)", () => {
  it("draftLocale and draftCopyLocale change nothing on the committed tree", () => {
    for (const locale of DRAFTED) {
      expect(
        draftLocale({ root: repoRoot, locale, dryRun: true }).changed,
      ).toBe(false);
      const report = draftCopyLocale({
        root: repoRoot,
        locale,
        floristSentence: sentences[locale],
        sourceFloristSentence: EN_SENTENCE,
        dryRun: true,
      });
      for (const file of report.files)
        expect(file.changed, file.path).toBe(false);
    }
  });

  function copySandbox(): string {
    const root = mkdtempSync(join(tmpdir(), "fo-drafts-copy-"));
    cpSync(join(repoRoot, "seed/data/copy"), join(root, "seed/data/copy"), {
      recursive: true,
    });
    return root;
  }

  it("keeps a fresh machine row byte for byte, and only re-flows its closing sentence", () => {
    const root = copySandbox();
    const path = join(root, "seed/data/copy/de/products.json");
    const before = JSON.parse(readFileSync(path, "utf8")) as {
      rows: CopyRow[];
    };
    const drafted = before.rows.find((row) => row.key === "FO-BQ-001");
    expect(drafted?.descriptionMd).toContain("Orange Rosen");

    draftCopyLocale({
      root,
      locale: "de",
      floristSentence: sentences.de,
      sourceFloristSentence: EN_SENTENCE,
    });
    const kept = JSON.parse(readFileSync(path, "utf8")) as { rows: CopyRow[] };
    expect(kept.rows.find((row) => row.key === "FO-BQ-001")).toEqual(drafted);

    const moved =
      "Jeder Strauß wird von Hand gebunden und persönlich übergeben.";
    draftCopyLocale({
      root,
      locale: "de",
      floristSentence: moved,
      sourceFloristSentence: EN_SENTENCE,
    });
    const reflowed = JSON.parse(readFileSync(path, "utf8")) as {
      rows: CopyRow[];
    };
    const row = reflowed.rows.find((entry) => entry.key === "FO-BQ-001");
    expect(row?.descriptionMd).toBe(
      `${stripFloristSentence(drafted?.descriptionMd ?? "", sentences.de)} ${moved}`,
    );
    expect(row?.seoTitle).toBe(drafted?.seoTitle);
  });

  it("regenerates a stale machine row with the echo", () => {
    const root = copySandbox();
    const path = join(root, "seed/data/copy/de/products.json");
    const file = JSON.parse(readFileSync(path, "utf8")) as { rows: CopyRow[] };
    file.rows = file.rows.map((row) =>
      row.key === "FO-BQ-001" ? { ...row, sourceHash: "1".repeat(64) } : row,
    );
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    draftCopyLocale({
      root,
      locale: "de",
      floristSentence: sentences.de,
      sourceFloristSentence: EN_SENTENCE,
    });
    const written = JSON.parse(readFileSync(path, "utf8")) as {
      rows: CopyRow[];
    };
    const row = written.rows.find((entry) => entry.key === "FO-BQ-001");
    expect(row?.seoTitle).toBe(enRow.get("FO-BQ-001")?.seoTitle);
    expect(row?.sourceHash).toBe(
      copySourceHash(enRow.get("FO-BQ-001") ?? enRows[0]!),
    );
  });

  it("keepFreshRow returns the same row when the sentence has not moved", () => {
    const row = seedRows("pl").find((entry) => entry.key === "FO-BQ-003");
    if (row === undefined) throw new Error("no row");
    expect(keepFreshRow(row as never, sentences.pl)).toBe(row);
  });

  /** The `clean` fixture, drafted, with its own policy: check 10 runs only under `--policy`. */
  function checkSandbox(edit: (dir: string) => void): {
    status: number;
    stderr: string;
  } {
    const dir = mkdtempSync(join(tmpdir(), "fo-check10-"));
    cpSync(join(repoRoot, "tests/fixtures/i18n/_cases/clean"), dir, {
      recursive: true,
    });
    const enValues = flatten(
      JSON.parse(readFileSync(join(dir, "en.json"), "utf8")) as Tree,
    );
    const drafts: Record<Drafted, Record<string, string>> = {
      de: {
        "banner.headline":
          "Möchten Sie diese Seite lieber auf {language} lesen?",
        "errors.notFound.heading": "Seite nicht gefunden",
        "meta.home.title": "Blumen in ganz Europa senden",
      },
      pl: {
        "banner.headline":
          "Czy wolisz przeczytać tę stronę w języku: {language}?",
        "errors.notFound.heading": "Nie znaleziono strony",
        "meta.home.title": "Wyślij kwiaty w całej Europie",
      },
    };
    for (const locale of DRAFTED) {
      let tree: Tree = JSON.parse(
        readFileSync(join(dir, "en.json"), "utf8"),
      ) as Tree;
      const meta: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(drafts[locale])) {
        tree = withLeaf(tree, key, value);
        meta[key] = {
          source: "machine",
          reviewed: false,
          sourceHash: sha256(enValues.get(key) ?? ""),
        };
      }
      writeFileSync(
        join(dir, `${locale}.json`),
        `${JSON.stringify(tree, null, 2)}\n`,
      );
      writeFileSync(
        join(dir, `${locale}.meta.json`),
        `${JSON.stringify(meta, null, 2)}\n`,
      );
    }
    writeFileSync(
      join(dir, "policy.json"),
      `${JSON.stringify({ excluded: [], excludedSeedRows: [], reviewBeforeOrders: [], identical: {} }, null, 2)}\n`,
    );
    edit(dir);
    mkdirSync(join(dir, "src"), { recursive: true });
    return runCli(
      "scripts/i18n-check.ts",
      "--messages-dir",
      dir,
      "--src",
      join(dir, "src"),
      "--policy",
      join(dir, "policy.json"),
    );
  }

  function setValue(
    dir: string,
    locale: string,
    key: string,
    value: string | undefined,
  ): void {
    const path = join(dir, `${locale}.json`);
    const tree = withLeaf(
      JSON.parse(readFileSync(path, "utf8")) as Tree,
      key,
      value,
    );
    writeFileSync(path, `${JSON.stringify(tree, null, 2)}\n`);
    if (value === undefined) {
      const metaPath = join(dir, `${locale}.meta.json`);
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as Record<
        string,
        unknown
      >;
      delete meta[key];
      writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
    }
  }

  function setPolicy(dir: string, identical: Record<string, unknown[]>): void {
    writeFileSync(
      join(dir, "policy.json"),
      `${JSON.stringify({ excluded: [], excludedSeedRows: [], reviewBeforeOrders: [], identical }, null, 2)}\n`,
    );
  }

  it("exits 0 on the drafted sandbox", () => {
    const result = checkSandbox(() => undefined);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("fails an en key with no de draft, echoed or absent, naming file and key", () => {
    const echoed = checkSandbox((dir) =>
      setValue(dir, "de", "errors.notFound.heading", "Page not found"),
    );
    expect(echoed.status).not.toBe(0);
    expect(echoed.stderr).toMatch(
      /de\.json \[errors\.notFound\.heading\]: is identical to `en` in `de`/u,
    );
    const absent = checkSandbox((dir) =>
      setValue(dir, "de", "errors.notFound.heading", undefined),
    );
    expect(absent.status).not.toBe(0);
    expect(absent.stderr).toMatch(
      /de\.json \[errors\.notFound\.heading\]: is identical to `en` in `de`/u,
    );
  });

  it("fails an identical entry whose value no longer equals en's", () => {
    const result = checkSandbox((dir) =>
      setPolicy(dir, { de: [{ key: "meta.home.title", reason: "same-word" }] }),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(
      /policy\.json \[meta\.home\.title\]: is a stale `identical\.de` entry \(same-word\): its `de` value no longer equals `en`'s/u,
    );
  });

  it("fails an identical entry whose key no longer exists", () => {
    const result = checkSandbox((dir) =>
      setPolicy(dir, { pl: [{ key: "meta.gone.title", reason: "name" }] }),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(
      /policy\.json \[meta\.gone\.title\]: is a stale `identical\.pl` entry: `en` has no such key/u,
    );
  });

  it("fails an identical entry with a reason outside the closed set", () => {
    const result = checkSandbox((dir) => {
      setValue(dir, "de", "errors.notFound.heading", "Page not found");
      setPolicy(dir, {
        de: [{ key: "errors.notFound.heading", reason: "looks-fine" }],
      });
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(
      /policy\.json \[errors\.notFound\.heading\]: is not a valid draft policy entry at `identical\.de\.0\.reason`/u,
    );
  });

  it("exits 0 once the key is listed with a valid reason", () => {
    const result = checkSandbox((dir) => {
      setValue(dir, "de", "errors.notFound.heading", "Page not found");
      setPolicy(dir, {
        de: [{ key: "errors.notFound.heading", reason: "same-word" }],
      });
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("documents agent drafts, the policy file, check 10 and the gate", () => {
    const runbook = readFileSync(
      resolve(repoRoot, "docs/runbooks/i18n-translations.md"),
      "utf8",
    );
    const section = (number: number): string => {
      const start = runbook.indexOf(`\n## ${String(number)}. `);
      const end = runbook.indexOf("\n## ", start + 1);
      return runbook.slice(start, end);
    };
    for (const number of [2, 3]) {
      expect(section(number), `§${String(number)}`).toContain("check 10");
    }
    expect(section(2)).toContain("content/i18n/draft-policy.json");
    expect(section(2)).toContain("agent-written drafts");
    const gate = section(10);
    expect(gate).toContain("reviewBeforeOrders");
    expect(gate).toContain("content/i18n/draft-policy.json");
    expect(gate).toMatch(/1\. the locale becomes indexable/u);
    expect(gate).toMatch(/2\. `\/de` or `\/pl` can take an order/u);
    expect(gate).toMatch(/3\. any consent-gated tag is switched on/u);
    for (const locale of DRAFTED) {
      const glossary = readFileSync(
        resolve(repoRoot, `content/i18n/glossary.${locale}.md`),
        "utf8",
      );
      const status = glossary.slice(
        glossary.indexOf("**Status:"),
        glossary.indexOf("\n\n", glossary.indexOf("**Status:")),
      );
      expect(status).toContain("agent-written draft");
      expect(status).toContain("content/i18n/draft-policy.json");
      expect(status).toContain("check 10");
    }
  });
});
