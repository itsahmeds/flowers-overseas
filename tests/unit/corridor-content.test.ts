/**
 * T-01 / AC-1 (spec 007 §9, §10; TASK-087): the corridor content model parses, and a file that is
 * missing a required field, claims a review it cannot evidence or carries the wrong number of FAQ
 * items fails **naming the field**.
 *
 * The order is the acceptance criterion's: every committed file first (the corpus is the real
 * assertion — a fixture that parses proves nothing about the guide that ships), then the three
 * failure cases T-01 names, then the path contract and the two whole-file faults an author hits
 * before they ever reach the schema.
 *
 * Nothing here touches a database, a network or a clock (AC-1): the parser is a pure function of
 * a path and a string, and the corpus reader is the only thing in the module that opens a file.
 */
import { describe, expect, it } from "vitest";

import {
  readCorridorCorpus,
  type CorridorSourceFile,
} from "../../src/modules/geo/content/corpus.ts";
import {
  corridorContentPath,
  corridorPathFacts,
  parseCorridorContent,
  parseCorridorContentOrThrow,
  splitCorridorFile,
} from "../../src/modules/geo/content/parse.ts";
import { renderCorridorFile } from "../../scripts/corridor-check-cases.ts";

const corpus = readCorridorCorpus();

/** The committed Poland guide, which every fixture below is a one-field mutation of. */
function polandGuide(): CorridorSourceFile {
  const file = corpus.find((entry) => entry.path === "en/pl-guide.md");
  if (file === undefined)
    throw new Error("the committed Poland guide is missing");
  return file;
}

/** The committed guide with one frontmatter field changed or removed. */
function withField(field: string, value: unknown): string {
  return withFields({ [field]: value });
}

/** Several front-matter edits at once; `undefined` deletes the key. */
function withFields(fields: Record<string, unknown>): string {
  const base = polandGuide();
  const split = splitCorridorFile(base.path, base.source);
  if (!split.ok) throw new Error("the committed Poland guide does not split");
  const frontmatter = { ...(split.frontmatter as Record<string, unknown>) };
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined) delete frontmatter[field];
    else frontmatter[field] = value;
  }
  return renderCorridorFile(frontmatter, split.body);
}

describe("every committed corridor file parses (AC-1)", () => {
  it("finds a corpus at all — an empty one would make this suite vacuous", () => {
    expect(corpus.length).toBeGreaterThan(0);
    expect(corpus.map((file) => file.path)).toContain("en/pl-guide.md");
  });

  it.each(corpus.map((file) => file.path))("%s parses", (path) => {
    const file = corpus.find((entry) => entry.path === path);
    const result = parseCorridorContent(path, file?.source ?? "");
    expect(
      result.ok
        ? []
        : result.issues.map((issue) => `${issue.field}: ${issue.message}`),
    ).toStrictEqual([]);
  });

  it("derives locale, country and state from the path, never from the frontmatter", () => {
    const content = parseCorridorContentOrThrow(
      "en/pl-guide.md",
      polandGuide().source,
    );
    expect(content.locale).toBe("en");
    expect(content.iso2).toBe("PL");
    expect(content.state).toBe("guide");
    expect(corridorContentPath(content)).toBe(
      "content/corridors/en/pl-guide.md",
    );
  });
});

describe("a malformed file fails, naming the field (AC-1, T-01)", () => {
  it("names `seoTitle` when it is missing", () => {
    const result = parseCorridorContent(
      "en/pl-guide.md",
      withField("seoTitle", undefined),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.field)).toContain("seoTitle");
    expect(result.issues[0]?.file).toBe("content/corridors/en/pl-guide.md");
  });

  it("names `reviewedBy` when `reviewed: true` carries no reviewer", () => {
    // The committed guide has been reviewed since 2026-09-16, so strip the reviewer fields to
    // reproduce the malformed shape the rule exists for.
    const result = parseCorridorContent(
      "en/pl-guide.md",
      withFields({
        reviewed: true,
        reviewedBy: undefined,
        reviewedAt: undefined,
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.field)).toContain("reviewedBy");
    expect(result.issues.map((issue) => issue.field)).toContain("reviewedAt");
    expect(
      result.issues.find((issue) => issue.field === "reviewedBy")?.message,
    ).toContain("requires reviewedBy");
  });

  it("names `faq` when there are seven items", () => {
    const base = polandGuide();
    const split = splitCorridorFile(base.path, base.source);
    if (!split.ok) throw new Error("the committed Poland guide does not split");
    const frontmatter = split.frontmatter as Record<string, unknown>;
    const faq = (frontmatter["faq"] as unknown[]).slice(0, 7);
    const result = parseCorridorContent(
      "en/pl-guide.md",
      withField("faq", faq),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const issue = result.issues.find((entry) => entry.field === "faq");
    expect(issue?.message).toContain("8–12 are required");
  });

  it("refuses `source: machine` (plan/02 §12)", () => {
    const result = parseCorridorContent(
      "en/pl-guide.md",
      withField("source", "machine"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.field)).toContain("source");
  });

  it("refuses a `relatedIso2` that names the file's own country", () => {
    const result = parseCorridorContent(
      "en/pl-guide.md",
      withField("relatedIso2", ["PL", "DE", "RO"]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.issues.find((issue) => issue.field === "relatedIso2")?.message,
    ).toContain("own country");
  });

  it("refuses an unknown frontmatter field rather than ignoring it", () => {
    const result = parseCorridorContent(
      "en/pl-guide.md",
      withField("cutoff", "14:00"),
    );
    expect(result.ok).toBe(false);
  });

  it("throws, naming file and field, when the build parses a broken file", () => {
    expect(() =>
      parseCorridorContentOrThrow(
        "en/pl-guide.md",
        withField("seoTitle", undefined),
      ),
    ).toThrow(/content\/corridors\/en\/pl-guide\.md: `seoTitle`/u);
  });
});

describe("whole-file faults are reported before any schema runs", () => {
  it("refuses a file whose name is not `{locale}/{iso2}-{state}.md`", () => {
    const result = parseCorridorContent("en/poland.md", polandGuide().source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toContain(
      "{locale}/{iso2}-{guide|live}.md",
    );
  });

  it("refuses a file with no frontmatter block", () => {
    const result = parseCorridorContent(
      "en/pl-guide.md",
      "# Poland\n\nProse.\n",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toContain("no `---` YAML frontmatter");
  });

  it("refuses frontmatter that is not valid YAML", () => {
    const result = parseCorridorContent(
      "en/pl-guide.md",
      "---\nseoTitle: [unclosed\n---\nbody\n",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toContain("not valid YAML");
  });

  it("refuses frontmatter that is not a mapping", () => {
    const result = parseCorridorContent(
      "en/pl-guide.md",
      "---\n- one\n- two\n---\nbody\n",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toContain("not a YAML mapping");
  });

  it("reads an unknown path as no corridor file at all", () => {
    expect(corridorPathFacts("en/pl-draft.md")).toBeUndefined();
    expect(corridorPathFacts("pl-guide.md")).toBeUndefined();
    expect(corridorPathFacts("en/PL-guide.md")).toBeUndefined();
  });
});
