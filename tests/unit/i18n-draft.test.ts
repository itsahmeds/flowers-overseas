/**
 * T-23 / AC-23 (TASK-038): `pnpm i18n:draft` is deterministic, network-free and never overwrites
 * reviewed copy.
 *
 * Everything runs against a **temporary copy** of the real `messages/` directory, so the
 * assertions are about the shipped catalogues without the test mutating them, and the last
 * assertion runs the real CLI in a child process to prove the script is idempotent the way a
 * human invokes it.
 *
 * The "no network" half of AC-23 is proven by the harness rather than by a bespoke assertion:
 * the `unit` project sets up MSW with `onUnhandledRequest: "error"`, so any HTTP call inside
 * `draftLocale` — including one hidden in a future provider — fails this file. The test below
 * also asserts the shipped provider is synchronous, which is what makes a hidden call
 * impossible to await.
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type DraftProvider,
  SOURCE_LOCALE,
  draftLocale,
  echoDraftProvider,
  flattenMessages,
  formatDraftReport,
  serialiseJson,
  sourceHash,
  unflattenMessages,
} from "../../scripts/i18n-draft.ts";

const repoRoot = resolve(__dirname, "../..");

let root: string;

const readMessages = (name: string): string =>
  readFileSync(join(root, "messages", name), "utf8");

const writeMessages = (name: string, value: unknown): void => {
  writeFileSync(join(root, "messages", name), serialiseJson(value), "utf8");
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "i18n-draft-"));
  cpSync(join(repoRoot, "messages"), join(root, "messages"), {
    recursive: true,
  });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("determinism (AC-23)", () => {
  it("produces byte-identical files on two consecutive runs", () => {
    const first = draftLocale({ root, locale: "pl" });
    const catalogue = readMessages("pl.json");
    const meta = readMessages("pl.meta.json");

    const second = draftLocale({ root, locale: "pl" });

    expect(second.catalogue).toBe(first.catalogue);
    expect(second.meta).toBe(first.meta);
    expect(readMessages("pl.json")).toBe(catalogue);
    expect(readMessages("pl.meta.json")).toBe(meta);
  });

  it("writes nothing when the committed catalogue is already up to date", () => {
    const report = draftLocale({ root, locale: "pl" });

    expect(report.changed).toBe(false);
    expect(report.written).toBe(false);
    expect(report.outcomes.every((outcome) => outcome.action === "kept")).toBe(
      true,
    );
  });

  it("sorts keys and prints the Prettier JSON shape, whatever order it read", () => {
    writeMessages("pl.json", { meta: {}, a11y: {} });
    writeMessages("pl.meta.json", {});

    const report = draftLocale({ root, locale: "pl" });
    const keys = Object.keys(JSON.parse(report.catalogue) as object);

    expect(keys).toEqual([...keys].sort());
    expect(report.catalogue.endsWith("}\n")).toBe(true);
    expect(report.catalogue).toContain('\n  "a11y": {\n');
    expect(Object.keys(JSON.parse(report.meta) as object)).toEqual(
      Object.keys(JSON.parse(report.meta) as object).sort(),
    );
  });

  it("re-runs the real CLI with no diff to the repository", () => {
    const before = readMessages("pl.json") + readMessages("pl.meta.json");

    const stdout = execFileSync(
      process.execPath,
      [join(repoRoot, "scripts/i18n-draft.ts"), "--locale", "pl"],
      { cwd: root, encoding: "utf8" },
    );

    expect(stdout).toContain("no change");
    expect(readMessages("pl.json") + readMessages("pl.meta.json")).toBe(before);
  });
});

describe("what a written key carries (AC-23)", () => {
  it("stamps machine, unreviewed and the `en` hash on every key it drafts", () => {
    rmSync(join(root, "messages", "pl.json"));
    rmSync(join(root, "messages", "pl.meta.json"));

    const report = draftLocale({ root, locale: "pl" });
    const en = flattenMessages(JSON.parse(readMessages("en.json")) as object);
    const meta = JSON.parse(report.meta) as Record<
      string,
      Record<string, unknown>
    >;

    expect(Object.keys(meta).sort()).toEqual(Object.keys(en).sort());
    for (const [key, record] of Object.entries(meta)) {
      expect(record, key).toEqual({
        source: "machine",
        reviewed: false,
        sourceHash: sourceHash(en[key] ?? ""),
      });
    }
    expect(
      report.outcomes.every((outcome) => outcome.action === "written"),
    ).toBe(true);
  });

  it("echoes the English value, which is the honest Phase 0 draft (§13 Q7)", () => {
    rmSync(join(root, "messages", "pl.json"));
    rmSync(join(root, "messages", "pl.meta.json"));

    const report = draftLocale({ root, locale: "pl" });
    const drafted = flattenMessages(JSON.parse(report.catalogue) as object);
    const en = flattenMessages(JSON.parse(readMessages("en.json")) as object);

    expect(drafted).toEqual(en);
  });

  it("re-drafts a stale machine key and reports it as written", () => {
    const meta = JSON.parse(readMessages("pl.meta.json")) as Record<
      string,
      Record<string, unknown>
    >;
    const key = "a11y.skipToContent";
    meta[key] = { ...meta[key], sourceHash: sourceHash("something else") };
    writeMessages("pl.meta.json", meta);
    const catalogue = JSON.parse(readMessages("pl.json")) as {
      a11y: Record<string, string>;
    };
    catalogue.a11y["skipToContent"] = "stale draft";
    writeMessages("pl.json", catalogue);

    const report = draftLocale({ root, locale: "pl" });
    const written = JSON.parse(report.catalogue) as {
      a11y: Record<string, string>;
    };

    expect(report.outcomes.find((outcome) => outcome.key === key)?.action).toBe(
      "written",
    );
    expect(written.a11y["skipToContent"]).toBe("Skip to content");
  });
});

describe("what the script may never touch (AC-23)", () => {
  const reviewKey = "a11y.localeChooser";

  const markReviewed = (): void => {
    const meta = JSON.parse(readMessages("pl.meta.json")) as Record<
      string,
      unknown
    >;
    meta[reviewKey] = {
      source: "human",
      reviewed: true,
      reviewedBy: "reviewer",
      reviewedAt: "2026-09-08T00:00:00Z",
      // Deliberately stale: the English string moved after the review.
      sourceHash: sourceHash("an older English value"),
    };
    writeMessages("pl.meta.json", meta);
    const catalogue = JSON.parse(readMessages("pl.json")) as {
      a11y: Record<string, string>;
    };
    catalogue.a11y["localeChooser"] = "Języki";
    writeMessages("pl.json", catalogue);
  };

  it("keeps a `reviewed: true` value and its record, and reports it stale", () => {
    markReviewed();

    const report = draftLocale({ root, locale: "pl" });
    const catalogue = JSON.parse(report.catalogue) as {
      a11y: Record<string, string>;
    };
    const meta = JSON.parse(report.meta) as Record<
      string,
      Record<string, unknown>
    >;

    expect(catalogue.a11y["localeChooser"]).toBe("Języki");
    expect(meta[reviewKey]?.reviewed).toBe(true);
    expect(meta[reviewKey]?.reviewedBy).toBe("reviewer");
    expect(
      report.outcomes.find((outcome) => outcome.key === reviewKey)?.action,
    ).toBe("stale");
    expect(formatDraftReport(report)).toContain(reviewKey);
  });

  it("keeps unreviewed human copy too: the plural forms survive a re-run", () => {
    const report = draftLocale({ root, locale: "pl" });
    const catalogue = JSON.parse(report.catalogue) as {
      common: Record<string, string>;
    };

    expect(catalogue.common["floristCount"]).toContain("kwiaciarnie");
    expect(
      JSON.parse(report.meta)["common.floristCount"] as Record<string, unknown>,
    ).toMatchObject({ source: "human", reviewed: false });
  });

  it("refuses the source locale and a code that is not a locale code", () => {
    expect(() => draftLocale({ root, locale: SOURCE_LOCALE })).toThrow(
      /never drafted/,
    );
    expect(() => draftLocale({ root, locale: "PL" })).toThrow(/--locale/);
    expect(() => draftLocale({ root, locale: "../etc" })).toThrow(/--locale/);
  });

  it("does not write in `--dry-run`, but still reports the change", () => {
    rmSync(join(root, "messages", "pl.json"));
    rmSync(join(root, "messages", "pl.meta.json"));

    const report = draftLocale({ root, locale: "pl", dryRun: true });

    expect(report.changed).toBe(true);
    expect(report.written).toBe(false);
    expect(() => readMessages("pl.json")).toThrow();
    expect(formatDraftReport(report)).toContain("--dry-run");
  });
});

describe("unused keys", () => {
  it("drops a key `en.json` no longer has, unless its meta says `retained`", () => {
    const catalogue = JSON.parse(readMessages("pl.json")) as Record<
      string,
      Record<string, string>
    >;
    catalogue["legacy"] = { gone: "gone", kept: "kept" };
    writeMessages("pl.json", catalogue);
    const meta = JSON.parse(readMessages("pl.meta.json")) as Record<
      string,
      unknown
    >;
    meta["legacy.gone"] = {
      source: "machine",
      reviewed: false,
      sourceHash: sourceHash("gone"),
    };
    meta["legacy.kept"] = {
      source: "machine",
      reviewed: false,
      sourceHash: sourceHash("kept"),
      retained: true,
    };
    writeMessages("pl.meta.json", meta);

    const report = draftLocale({ root, locale: "pl" });
    const written = JSON.parse(report.catalogue) as Record<
      string,
      Record<string, string> | undefined
    >;

    expect(written["legacy"]).toEqual({ kept: "kept" });
    expect(
      report.outcomes.find((outcome) => outcome.key === "legacy.gone")?.action,
    ).toBe("removed");
  });
});

describe("the provider seam (§13 Q7)", () => {
  it("ships a synchronous echo provider, so no call can be awaited inside it", () => {
    const drafted = echoDraftProvider.draft({
      key: "a11y.skipToContent",
      sourceValue: "Skip to content",
      locale: "pl",
    });

    expect(drafted).toBe("Skip to content");
    expect(drafted).not.toBeInstanceOf(Promise);
  });

  it("routes every written value through the injected provider", () => {
    rmSync(join(root, "messages", "pl.json"));
    rmSync(join(root, "messages", "pl.meta.json"));
    const seen: string[] = [];
    const upper: DraftProvider = {
      draft: ({ key, sourceValue, locale }) => {
        seen.push(`${locale}:${key}`);
        return sourceValue.toUpperCase();
      },
    };

    const report = draftLocale({ root, locale: "pl", provider: upper });
    const values = Object.values(
      flattenMessages(JSON.parse(report.catalogue) as object),
    );

    expect(seen.length).toBe(report.outcomes.length);
    expect(seen[0]?.startsWith("pl:")).toBe(true);
    for (const value of values) expect(value).toBe(value.toUpperCase());
  });
});

describe("the flatten/unflatten pair", () => {
  it("round-trips a nested catalogue and sorts on the way back", () => {
    const flat = flattenMessages({ b: { z: "1", a: "2" }, a: "3" });

    expect(flat).toEqual({ "b.z": "1", "b.a": "2", a: "3" });
    expect(JSON.stringify(unflattenMessages(flat))).toBe(
      '{"a":"3","b":{"a":"2","z":"1"}}',
    );
  });
});
