/**
 * T-23 / AC-22 (TASK-009): `validate-hreflang`. AC-22 names
 * `tests/fixtures/seo/hreflang/bad-nonreciprocal.json` explicitly, so the case is copied in under
 * exactly that name (into a temp directory — see `support/seo-cli.ts`).
 */
import { describe, expect, it } from "vitest";

import {
  graphProblems,
  hreflangFixtureSchema,
  isAbsoluteHttpsUrl,
  isValidHreflang,
} from "../../scripts/seo/validate-hreflang";
import { runSeoCli, withEmptyDir, withFixtureDir } from "./support/seo-cli";

const CLI = "validate-hreflang.ts";

describe("validate-hreflang CLI (T-23)", () => {
  it("exits 0 with 'no fixtures' on an empty directory", () => {
    const result = withEmptyDir((dir) => runSeoCli(CLI, dir));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no fixtures");
  });

  it("exits 0 with 'no fixtures' on the committed fixture directory", () => {
    const result = runSeoCli(CLI, "tests/fixtures/seo/hreflang");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no fixtures");
  });

  it("exits 0 on a reciprocal cluster with x-default", () => {
    const result = withFixtureDir(
      { "good-hreflang.json": "home.json" },
      (dir) => runSeoCli(CLI, dir),
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1 fixture(s) ok");
  });

  it("fails on bad-nonreciprocal.json, naming the file (AC-22)", () => {
    const result = withFixtureDir(
      { "bad-nonreciprocal.json": "bad-nonreciprocal.json" },
      (dir) => runSeoCli(CLI, dir),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("bad-nonreciprocal.json");
    expect(result.stderr).toContain("is not reciprocal");
  });

  it("fails when a page has no x-default alternate", () => {
    const result = withFixtureDir(
      { "bad-missing-x-default.json": "bad-missing-x-default.json" },
      (dir) => runSeoCli(CLI, dir),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("bad-missing-x-default.json");
    expect(result.stderr).toContain("no x-default alternate");
  });

  it("fails on an hreflang value that is not BCP-47-ish", () => {
    const result = withFixtureDir(
      { "bad-hreflang-code.json": "bad-hreflang-code.json" },
      (dir) => runSeoCli(CLI, dir),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("bad-hreflang-code.json");
    expect(result.stderr).toContain("en_GB");
  });

  it("fails when the fixture is not valid JSON", () => {
    const result = withFixtureDir(
      { "bad-hreflang-malformed.json": "bad-hreflang-malformed.json" },
      (dir) => runSeoCli(CLI, dir),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("bad-hreflang-malformed.json");
    expect(result.stderr).toContain("not valid JSON");
  });

  it("fails when the fixture does not match the documented shape", () => {
    const result = withFixtureDir(
      { "bad-hreflang-shape.json": "bad-hreflang-shape.json" },
      (dir) => runSeoCli(CLI, dir),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("bad-hreflang-shape.json");
    expect(result.stderr).toContain("hreflang fixture shape");
  });
});

describe("validate-hreflang helpers", () => {
  it("accepts x-default and lang[-script][-region], rejects locale identifiers", () => {
    for (const tag of [
      "x-default",
      "en",
      "de",
      "de-AT",
      "pt-BR",
      "sr-Latn-RS",
      "es-419",
    ]) {
      expect(isValidHreflang(tag), tag).toBe(true);
    }
    for (const tag of ["en_GB", "english", "e", "de-DEU-x", ""]) {
      expect(isValidHreflang(tag), tag).toBe(false);
    }
  });

  it("requires absolute https URLs", () => {
    expect(isAbsoluteHttpsUrl("https://a.test/en/")).toBe(true);
    expect(isAbsoluteHttpsUrl("http://a.test/en/")).toBe(false);
    expect(isAbsoluteHttpsUrl("/en/")).toBe(false);
  });

  it("reports a one-way link as non-reciprocal and a missing target as unverifiable", () => {
    const oneWay = hreflangFixtureSchema.parse({
      pages: [
        {
          url: "https://a.test/en/",
          alternates: [
            { hreflang: "en", href: "https://a.test/en/" },
            { hreflang: "de", href: "https://a.test/de/" },
            { hreflang: "x-default", href: "https://a.test/en/" },
          ],
        },
        {
          url: "https://a.test/de/",
          alternates: [
            { hreflang: "de", href: "https://a.test/de/" },
            { hreflang: "x-default", href: "https://a.test/de/" },
          ],
        },
      ],
    });
    expect(graphProblems(oneWay)).toEqual([
      "https://a.test/en/: alternate de -> https://a.test/de/ is not reciprocal (https://a.test/de/ does not link back to https://a.test/en/)",
    ]);

    const dangling = hreflangFixtureSchema.parse({
      pages: [
        {
          url: "https://a.test/en/",
          alternates: [
            { hreflang: "fr", href: "https://a.test/fr/" },
            { hreflang: "x-default", href: "https://a.test/en/" },
          ],
        },
      ],
    });
    expect(graphProblems(dangling)).toEqual([
      "https://a.test/en/: alternate fr -> https://a.test/fr/ has no page entry in this fixture, so reciprocity cannot hold",
    ]);
  });

  it("reports the x-default gap once per page in the cluster", () => {
    const fixture = hreflangFixtureSchema.parse({
      pages: [
        {
          url: "https://a.test/en/",
          alternates: [{ hreflang: "en", href: "https://a.test/en/" }],
        },
      ],
    });
    expect(graphProblems(fixture)).toEqual([
      "https://a.test/en/: cluster has no x-default alternate",
    ]);
  });

  it("treats a reciprocal two-page cluster as clean", () => {
    const fixture = hreflangFixtureSchema.parse({
      pages: [
        {
          url: "https://a.test/en/",
          alternates: [
            { hreflang: "en", href: "https://a.test/en/" },
            { hreflang: "de", href: "https://a.test/de/" },
            { hreflang: "x-default", href: "https://a.test/en/" },
          ],
        },
        {
          url: "https://a.test/de/",
          alternates: [
            { hreflang: "en", href: "https://a.test/en/" },
            { hreflang: "de", href: "https://a.test/de/" },
            { hreflang: "x-default", href: "https://a.test/en/" },
          ],
        },
      ],
    });
    expect(graphProblems(fixture)).toEqual([]);
  });
});
