/**
 * Spec 011 AC-6 / T-06 (TASK-210): `pnpm seo:validate` gains generated fixtures for the florists'
 * landing and walkthrough (and the apply page's trail). Each fixture is the page's own document,
 * built by the functions the routes call; `WRITE_SCHEMA_FIXTURES=1 pnpm test:contract` rewrites
 * them, and without the variable this suite only compares, which is what CI does.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_DIR,
  collectTypedNodes,
  typeProblem,
} from "../../scripts/seo/validate-schema.ts";
import { loadMessages } from "../../src/modules/i18n/index.ts";
import { floristApplyJsonLd } from "../../src/modules/partners/ui/apply/route.tsx";
import { infoPageJsonLd, jsonLdDocument } from "../../src/modules/seo/index.ts";
import { runSeoCli } from "../unit/support/seo-cli.ts";

const repoRoot = resolve(__dirname, "../..");
const ORIGIN = "https://flowersoverseas.com";
const DEPLOYMENT = { environment: "production", siteUrl: ORIGIN } as const;

function label(key: string, values?: Readonly<Record<string, string>>): string {
  const messages = loadMessages("en", [
    "common",
    "nav",
    "breadcrumb",
    "forFlorists",
  ]) as Record<string, unknown>;
  const value = key
    .split(".")
    .reduce<unknown>(
      (scope, part) => (scope as Record<string, unknown> | undefined)?.[part],
      messages,
    );
  if (typeof value !== "string") throw new Error(`no message for ${key}`);
  return value.replace("{name}", values?.["name"] ?? "");
}

function document(nodes: readonly Record<string, unknown>[]) {
  const built = jsonLdDocument(nodes);
  if (built === undefined) throw new Error("no JSON-LD");
  return built;
}

const FIXTURES = {
  "for-florists.json": document(
    infoPageJsonLd("for-florists", "en", DEPLOYMENT, label),
  ),
  "how-orders-work.json": document(
    infoPageJsonLd("how-orders-work", "en", DEPLOYMENT, label),
  ),
  "florist-apply.json": document(
    floristApplyJsonLd("en", label, { baseUrl: ORIGIN }),
  ),
} as const;

if (process.env["WRITE_SCHEMA_FIXTURES"] === "1") {
  for (const [file, built] of Object.entries(FIXTURES)) {
    writeFileSync(
      join(repoRoot, DEFAULT_DIR, file),
      `${JSON.stringify({ jsonld: built }, null, 2)}\n`,
    );
  }
}

describe("the florists' schema fixtures are the pages' own documents (spec 011 AC-6)", () => {
  for (const [file, built] of Object.entries(FIXTURES)) {
    it(`${file} equals what the builders emit today`, () => {
      const committed = JSON.parse(
        readFileSync(join(repoRoot, DEFAULT_DIR, file), "utf8"),
      ) as Record<string, unknown>;
      expect(committed["jsonld"]).toStrictEqual(built);
    });

    it(`${file} carries only allowed types, none of the eight AC-6 forbids`, () => {
      const types = collectTypedNodes(built).flatMap((node) => node.types);
      for (const type of types) expect(typeProblem(type)).toBeNull();
      for (const type of [
        "JobPosting",
        "LocalBusiness",
        "FloristShop",
        "Offer",
        "Product",
        "AggregateRating",
        "Review",
        "HowTo",
      ]) {
        expect(types).not.toContain(type);
      }
    });
  }

  it("seo:validate passes on the directory that holds them", () => {
    const result = runSeoCli("validate-schema.ts", join(repoRoot, DEFAULT_DIR));
    expect(result.stderr, result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
