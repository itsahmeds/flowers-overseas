/**
 * The schema contract: what the pages publish, validated by spec 001's CLI (spec 007 §2 "Schema",
 * AC-15, AC-16; T-16 contract half; TASK-093).
 *
 * AC-15 ends with "`pnpm seo:validate` (schema) passes on fixtures for both corridor states and the
 * hub". A fixture that was typed out by hand would prove that the *validator* runs, which TASK-009
 * already proved; what has to be proven here is that **the document the route serves** passes it.
 * So the three fixtures under `tests/fixtures/seo/schema/` — where TASK-009's validator already
 * reads, extended rather than forked — are compared against the builders' own output on every run:
 * a builder change that is not reflected in the committed fixture fails this test, and the fixture
 * the CI validator reads is therefore always the page's own bytes.
 *
 * The **live** fixture is the one worth reading twice. Its view model carries what only a live
 * corridor has — a from-price and a shop entry — and its JSON-LD is byte-for-byte the guide's:
 * flipping a country live adds no `Product`, no `Offer` and no price to the structured data
 * (`plan/02` §9: "never an `Offer` for a country that is not live", and in Phase 0 no country has a
 * purchase path at all; the PDP's gated `Offer` is spec 009's, TASK-130's). A regression that let a
 * price into the corridor's markup would show up here as a fixture diff.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_DIR,
  collectTypedNodes,
  typeProblem,
} from "../../scripts/seo/validate-schema.ts";
import {
  type CorridorView,
  corridorView,
  hubView,
} from "../../src/modules/geo/index.ts";
import { loadMessages } from "../../src/modules/i18n/index.ts";
import {
  breadcrumbList,
  faqPage,
  jsonLdDocument,
} from "../../src/modules/seo/index.ts";
import { runSeoCli } from "../unit/support/seo-cli.ts";

const repoRoot = resolve(__dirname, "../..");
const BASE = { baseUrl: "https://flowersoverseas.com" } as const;
/** Fixed: the corridor's trail and Q&A do not depend on the day, and a fixture must not either. */
const FROM = "2026-09-15";
const LOCALE = "en";

const NAMESPACES = ["breadcrumb", "destinations", "common"] as const;

/** The route's label resolution, without next-intl's runtime: one catalogue, dotted keys. */
function label(key: string): string {
  const messages = loadMessages(LOCALE, [...NAMESPACES]) as Record<
    string,
    unknown
  >;
  const value = key
    .split(".")
    .reduce<unknown>(
      (scope, part) =>
        scope === undefined
          ? undefined
          : (scope as Record<string, unknown>)[part],
      messages,
    );
  if (typeof value !== "string") throw new Error(`no message for ${key}`);
  return value;
}

const guide = corridorView("PL", LOCALE, { from: FROM });
if (guide === undefined) throw new Error("the en Poland guide must exist");

/**
 * The live state as the data flip produces it (`tests/unit/corridor-page.test.tsx`'s fixture,
 * narrowed to what the JSON-LD can see): the same authored content, plus the two slots spec 005 and
 * spec 008 fill when there is a price to show and a shop to enter.
 */
const live: CorridorView = {
  ...guide,
  state: "live",
  stateKey: "destinations.state.deliveringNow",
  liveSlots: {
    fromPrice: "€45.90",
    shopEntryHref: "/en/poland",
  },
};

function corridorDocument(view: CorridorView): Record<string, unknown> {
  const document = jsonLdDocument([
    breadcrumbList(view.breadcrumb, label, BASE),
    faqPage(view.faq),
  ]);
  if (document === undefined)
    throw new Error("the corridor emitted no JSON-LD");
  return document;
}

function hubDocument(): Record<string, unknown> {
  const document = jsonLdDocument([
    breadcrumbList(hubView(LOCALE).breadcrumb, label, BASE),
  ]);
  if (document === undefined) throw new Error("the hub emitted no JSON-LD");
  return document;
}

function committed(file: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(repoRoot, DEFAULT_DIR, file), "utf8"),
  ) as Record<string, unknown>;
}

const FIXTURES = {
  "corridor-guide.json": corridorDocument(guide),
  "corridor-live.json": corridorDocument(live),
  "destinations-hub.json": hubDocument(),
} as const;

/**
 * `WRITE_SCHEMA_FIXTURES=1 pnpm test:contract` rewrites the three files from the builders — the
 * only way they are ever authored, so a fixture can never be a hand-written idea of the document.
 * Without the variable this suite only compares, which is what CI does.
 */
if (process.env["WRITE_SCHEMA_FIXTURES"] === "1") {
  for (const [file, document] of Object.entries(FIXTURES)) {
    writeFileSync(
      join(repoRoot, DEFAULT_DIR, file),
      `${JSON.stringify({ jsonld: document }, null, 2)}\n`,
    );
  }
}

describe("the committed schema fixtures are the pages' own documents (AC-15, T-16)", () => {
  for (const [file, document] of Object.entries(FIXTURES)) {
    it(`${file} equals what the builders emit today`, () => {
      expect(
        committed(file)["jsonld"],
        `${file} is stale: regenerate it with \`WRITE_SCHEMA_FIXTURES=1 pnpm test:contract\``,
      ).toStrictEqual(document);
    });
  }

  it("the live state adds no Product, no Offer and no price to the markup", () => {
    expect(FIXTURES["corridor-live.json"]).toStrictEqual(
      FIXTURES["corridor-guide.json"],
    );
    // Types, not a substring scan: "price" is a legitimate word in an authored FAQ answer, and it
    // is the *node* that would be the claim.
    const types = collectTypedNodes(FIXTURES["corridor-live.json"]).flatMap(
      (node) => node.types,
    );
    expect(types).not.toContain("Product");
    expect(types).not.toContain("Offer");
    expect(types).not.toContain("AggregateRating");
    expect(types).not.toContain("Review");
    for (const type of types) expect(typeProblem(type)).toBeNull();
    // The from-price the live view carries reaches the page, never the markup.
    expect(JSON.stringify(FIXTURES["corridor-live.json"])).not.toContain(
      "45.90",
    );
  });
});

describe("`pnpm seo:validate` (schema) over the committed directory (AC-15, T-16)", () => {
  it("passes on every fixture, the three new ones included", () => {
    // The CLI reports a count, not a file list, so the three files are asserted to be *in* the
    // directory it was pointed at — otherwise "ok" could mean "read nothing of ours".
    const committedFiles = readdirSync(join(repoRoot, DEFAULT_DIR));
    for (const file of Object.keys(FIXTURES)) {
      expect(committedFiles).toContain(file);
    }

    const result = runSeoCli("validate-schema.ts", join(repoRoot, DEFAULT_DIR));

    expect(result.stderr, result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("fixture(s) ok");
  });
});
