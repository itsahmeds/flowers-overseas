/**
 * T-04 (meta half) and the catalogue/manifest invariants of AC-4 and AC-23 (TASK-038).
 *
 * Three things are asserted, in order of how expensive they would be to discover later:
 *
 *  1. **`MESSAGE_META_COLUMNS` is a literal pin on spec 002 §5.1's `message_catalog` review
 *     columns.** Editing `MessageMetaSchema` or the column names alone fails here, which is the
 *     whole of AC-4's third clause: spec 012 mirrors this manifest into the table instead of
 *     translating field names.
 *  2. **The schemas reject the shapes that would otherwise fail silently** — a non-string leaf,
 *     an empty message, an unknown meta field, a non-sha256 `sourceHash`, and `reviewed: true`
 *     with no reviewer or date.
 *  3. **Every shipped manifest parses and covers every key of its own catalogue**, for all four
 *     locales including the thin `en-gb` override. A key with no review record is a key whose
 *     honesty `unreviewedShare()` (TASK-039) cannot judge, so `isLocaleIndexable()` would answer
 *     from incomplete data.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import enSource from "../../messages/en.json";
import type { Messages } from "../../src/modules/i18n";
import {
  MESSAGE_META_COLUMNS,
  MessageMetaManifestSchema,
  MessageMetaSchema,
  MessagesSchema,
  REPO_ONLY_META_FIELDS,
} from "../../src/modules/i18n/schemas.ts";

const repoRoot = resolve(__dirname, "../..");
const messagesDir = join(repoRoot, "messages");

/** The catalogues this spec ships, `en` first: everything else resolves through it. */
const LOCALES = ["en", "en-gb", "de", "pl"] as const;

const readJson = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(messagesDir, name), "utf8")) as Record<
    string,
    unknown
  >;

const flatten = (
  tree: Record<string, unknown>,
  prefix = "",
): Record<string, string> => {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") flat[path] = value;
    else if (typeof value === "object" && value !== null)
      Object.assign(flat, flatten(value as Record<string, unknown>, path));
  }
  return flat;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const enFlat = flatten(readJson("en.json"));

/** A valid machine record, for tests that break exactly one field. */
const machineMeta = {
  source: "machine",
  reviewed: false,
  sourceHash: sha256("x"),
} as const;

describe("MESSAGE_META_COLUMNS (AC-4, T-04)", () => {
  it("maps every `MessageMetaSchema` field onto spec 002 §5.1's review columns", () => {
    expect(MESSAGE_META_COLUMNS).toEqual({
      source: "source",
      reviewed: "reviewed",
      reviewedBy: "reviewed_by",
      reviewedAt: "reviewed_at",
      sourceHash: "source_hash",
    });
  });

  it("accounts for every schema field as either a column or a repo-only field", () => {
    const schemaFields = Object.keys(MessageMetaSchema.shape).sort();

    expect(schemaFields).toEqual(
      [...Object.keys(MESSAGE_META_COLUMNS), ...REPO_ONLY_META_FIELDS].sort(),
    );
  });

  it("keeps `retained` repo-only: `message_catalog` has no such column", () => {
    expect(REPO_ONLY_META_FIELDS).toEqual(["retained"]);
    expect(Object.values(MESSAGE_META_COLUMNS)).not.toContain("retained");
  });

  it("names the columns spec 002 §5.1 actually declares for `message_catalog`", () => {
    const spec = readFileSync(join(repoRoot, "specs/002-schema-v1.md"), "utf8");
    // The declaration line, not a balanced-paren match: `source CHECK IN ('human','machine')`
    // contains parentheses of its own.
    const declaration =
      spec.split("\n").find((line) => line.includes("`message_catalog(")) ?? "";

    expect(declaration).not.toBe("");
    for (const column of Object.values(MESSAGE_META_COLUMNS)) {
      expect(declaration, column).toContain(column);
    }
  });
});

describe("MessagesSchema", () => {
  it("accepts a nested catalogue of ICU strings", () => {
    expect(
      MessagesSchema.parse({
        errors: { notFound: { heading: "Page not found" } },
        common: {
          floristCount: "{count, plural, one {# florist} other {# florists}}",
        },
      }),
    ).toEqual({
      errors: { notFound: { heading: "Page not found" } },
      common: {
        floristCount: "{count, plural, one {# florist} other {# florists}}",
      },
    });
  });

  it("rejects a non-string leaf, an array and an empty message", () => {
    expect(MessagesSchema.safeParse({ meta: { count: 3 } }).success).toBe(
      false,
    );
    expect(MessagesSchema.safeParse({ meta: { list: ["a"] } }).success).toBe(
      false,
    );
    expect(MessagesSchema.safeParse({ meta: { heading: "" } }).success).toBe(
      false,
    );
  });

  it("rejects a key that is not a camelCase identifier", () => {
    expect(MessagesSchema.safeParse({ "meta.home": "x" }).success).toBe(false);
    expect(MessagesSchema.safeParse({ "not a key": "x" }).success).toBe(false);
  });
});

describe("MessageMetaSchema", () => {
  it("accepts an unreviewed machine draft with a hash and nothing else", () => {
    expect(MessageMetaSchema.parse(machineMeta)).toEqual(machineMeta);
  });

  it("accepts a reviewed human record and the `retained` escape", () => {
    const reviewed = {
      source: "human",
      reviewed: true,
      reviewedBy: "founder",
      reviewedAt: "2026-09-08T00:00:00Z",
      sourceHash: sha256("x"),
      retained: true,
    };

    expect(MessageMetaSchema.parse(reviewed)).toEqual(reviewed);
  });

  it("rejects `reviewed: true` without a reviewer and a date", () => {
    expect(
      MessageMetaSchema.safeParse({ ...machineMeta, reviewed: true }).success,
    ).toBe(false);
    expect(
      MessageMetaSchema.safeParse({
        ...machineMeta,
        reviewed: true,
        reviewedBy: "founder",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown field, an unknown source and a non-sha256 hash", () => {
    expect(
      MessageMetaSchema.safeParse({ ...machineMeta, translator: "x" }).success,
    ).toBe(false);
    expect(
      MessageMetaSchema.safeParse({ ...machineMeta, source: "llm" }).success,
    ).toBe(false);
    expect(
      MessageMetaSchema.safeParse({ ...machineMeta, sourceHash: "abc" })
        .success,
    ).toBe(false);
    expect(
      MessageMetaSchema.safeParse({
        ...machineMeta,
        sourceHash: sha256("x").toUpperCase(),
      }).success,
    ).toBe(false);
  });
});

describe("the shipped catalogues and manifests", () => {
  it("pairs every committed catalogue with exactly one manifest", () => {
    // Pseudo-locales (`en-XA`, `ar-XB`, TASK-042) are generated and git-ignored, carry no review
    // metadata by definition and are never indexable, so they are excluded by name rather than
    // by hoping nobody ran `pnpm i18n:pseudo` before `pnpm test`.
    const files = readdirSync(messagesDir).filter(
      (name) => !/-(?:XA|XB)\./.test(name),
    );
    const catalogues = files
      .filter((name) => name.endsWith(".json") && !name.endsWith(".meta.json"))
      .map((name) => name.replace(/\.json$/, ""))
      .sort();

    expect(catalogues).toEqual([...LOCALES].sort());
    for (const locale of catalogues) {
      expect(files, locale).toContain(`${locale}.meta.json`);
    }
  });

  for (const locale of LOCALES) {
    it(`parses \`${locale}.json\` as a catalogue and \`${locale}.meta.json\` as a manifest`, () => {
      expect(
        MessagesSchema.safeParse(readJson(`${locale}.json`)).success,
        locale,
      ).toBe(true);
      expect(
        MessageMetaManifestSchema.safeParse(readJson(`${locale}.meta.json`))
          .success,
        locale,
      ).toBe(true);
    });

    it(`covers every \`${locale}\` key with a review record and no orphan record`, () => {
      const keys = Object.keys(flatten(readJson(`${locale}.json`))).sort();
      const manifest = Object.keys(readJson(`${locale}.meta.json`)).sort();

      expect(manifest, locale).toEqual(keys);
    });

    it(`hashes every \`${locale}\` record against the \`en\` value it came from`, () => {
      const manifest = MessageMetaManifestSchema.parse(
        readJson(`${locale}.meta.json`),
      );

      for (const [key, meta] of Object.entries(manifest)) {
        const sourceValue = enFlat[key];
        expect(sourceValue, `${locale}/${key} exists in en.json`).toBeDefined();
        expect(meta.sourceHash, `${locale}/${key}`).toBe(
          sha256(sourceValue ?? ""),
        );
      }
    });
  }

  it("reviews the authored English and leaves the machine drafts unreviewed (§13 Q7, Q10)", () => {
    const en = MessageMetaManifestSchema.parse(readJson("en.meta.json"));
    for (const meta of Object.values(en)) {
      expect(meta.source).toBe("human");
      expect(meta.reviewed).toBe(true);
    }

    for (const locale of ["de", "pl"] as const) {
      const manifest = MessageMetaManifestSchema.parse(
        readJson(`${locale}.meta.json`),
      );
      for (const [key, meta] of Object.entries(manifest)) {
        expect(meta.reviewed, `${locale}/${key}`).toBe(false);
      }
      // The plural forms are the one piece of real `de`/`pl` copy this task authors, so they are
      // `human` and still unreviewed: a native reviewer has not seen them (`plan/13` B12).
      expect(manifest["common.floristCount"]?.source).toBe("human");
      expect(manifest["a11y.skipToContent"]?.source).toBe("machine");
    }
  });

  it("keeps `en-gb` a thin override of genuinely British wording only (§13 Q5)", () => {
    const override = flatten(readJson("en-gb.json"));
    const keys = Object.keys(override);

    expect(keys.length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(override)) {
      // A redundant override is an `i18n:check` error (TASK-040); it is also nonsense here.
      expect(value, key).not.toBe(enFlat[key]);
      expect(Object.keys(enFlat), key).toContain(key);
    }
    expect(override["errors.serverError.body"]).toContain("apologise");
    expect(enFlat["errors.serverError.body"]).toContain("apologize");
  });

  it("types `t()` from `en.json`: the new namespaces are in the augmentation", () => {
    // `global.d.ts` augments next-intl's `Messages` with `typeof en`, so the typed-key surface
    // follows the catalogue with no generation step (spec 003 §2 "typed keys"). The annotations
    // below are the assertion: renaming or dropping one of these keys fails `pnpm typecheck`,
    // and `Messages` is the same type next-intl checks `t()` against.
    const namespaces: readonly (keyof Messages)[] = [
      "meta",
      "chooser",
      "banner",
      "errors",
      "a11y",
      "common",
    ];
    const headline: Messages["banner"]["headline"] = enSource.banner.headline;
    const floristCount: Messages["common"]["floristCount"] =
      enSource.common.floristCount;
    const bannerActions: readonly string[] = [
      enSource.banner.switch,
      enSource.banner.stay,
      enSource.banner.dismiss,
    ];

    expect([...namespaces].sort()).toEqual(Object.keys(enSource).sort());
    expect(headline).toContain("{language}");
    expect(floristCount).toContain("plural");
    for (const action of bannerActions)
      expect(action.length).toBeGreaterThan(0);
  });
});
