/**
 * T-07, unit half (spec 044 §2.3, AC-7; TASK-321): the markdown subset as typed blocks.
 *
 * The fixture body maps to exactly the expected blocks; `<script>`, an HTML tag, an image, a
 * table and a link to a URL come back as literal text with a warning naming the line; a reference
 * resolves to `{ href }` only when its target exists, and to `{ text }` (no `<a>`) otherwise.
 * The built-HTML half (element allow-list inside the article) is the public page's, TASK-322.
 */
import { describe, expect, it } from "vitest";

import {
  type BlogLinkTargets,
  blogMarkdownBlocks,
  blogMarkdownWarnings,
  resolveBlogLink,
} from "../../src/modules/content/blog/markdown.ts";
import { BlogLinkRefSchema } from "../../src/modules/content/blog/schemas.ts";

const FIXTURE = [
  "## Before you choose",
  "",
  "Name days matter in **Poland**, and *every* calendar lists them.",
  "Read [our guide to Poland](fo:corridor/PL) first.",
  "",
  "### Three questions",
  "",
  "- Who is it for?",
  "- What is the moment?",
  "",
  "1. Pick the flowers.",
  "2. Write the card",
  "   in your own words.",
].join("\n");

describe("blogMarkdownBlocks (T-07)", () => {
  it("maps the fixture body to exactly these blocks", () => {
    expect(blogMarkdownBlocks(FIXTURE)).toEqual([
      { kind: "h2", inlines: [{ kind: "text", text: "Before you choose" }] },
      {
        kind: "p",
        inlines: [
          { kind: "text", text: "Name days matter in " },
          { kind: "strong", text: "Poland" },
          { kind: "text", text: ", and " },
          { kind: "em", text: "every" },
          { kind: "text", text: " calendar lists them. Read " },
          {
            kind: "link",
            ref: { kind: "corridor", id: "PL" },
            anchor: "our guide to Poland",
          },
          { kind: "text", text: " first." },
        ],
      },
      { kind: "h3", inlines: [{ kind: "text", text: "Three questions" }] },
      {
        kind: "ul",
        items: [
          [{ kind: "text", text: "Who is it for?" }],
          [{ kind: "text", text: "What is the moment?" }],
        ],
      },
      {
        kind: "ol",
        items: [
          [{ kind: "text", text: "Pick the flowers." }],
          [{ kind: "text", text: "Write the card in your own words." }],
        ],
      },
    ]);
    expect(blogMarkdownWarnings(FIXTURE)).toEqual([]);
  });

  const LITERAL: readonly [string, string, string][] = [
    ["script", "<script>alert(1)</script>", "html"],
    ["an HTML tag", 'Some <b onclick="x()">bold</b> text.', "html"],
    ["an image", "![a bouquet](https://example.org/a.jpg)", "image"],
    ["a table", "| a | b |", "table"],
    ["a link to a URL", "[a page](https://example.org)", "link-target"],
    ["a top-level heading", "# Another title", "h1"],
  ];
  for (const [name, line, construct] of LITERAL) {
    it(`${name} is one paragraph of its literal text, with a warning naming line 3`, () => {
      const body = `Intro line.\n\n${line}`;
      const blocks = blogMarkdownBlocks(body);
      expect(blocks[1]).toEqual({ kind: "p", inlines: [{ kind: "text", text: line }] });
      expect(blogMarkdownWarnings(body)).toContainEqual({ line: 3, construct });
    });
  }

  it("only text, strong, em and link inlines exist, and a link is always a parsed reference", () => {
    const kinds = new Set<string>();
    const blocks = blogMarkdownBlocks(
      `${FIXTURE}\n\n<em>x</em> ![i](a.png) [u](javascript:alert(1)) [ok two](fo:info/help)`,
    );
    for (const block of blocks) {
      const runs = block.kind === "ul" || block.kind === "ol" ? block.items.flat() : block.inlines;
      for (const run of runs) {
        kinds.add(run.kind);
        if (run.kind === "link") expect(BlogLinkRefSchema.safeParse(`fo:${run.ref.kind}/${run.ref.id}`).success).toBe(true);
      }
    }
    expect([...kinds].sort()).toEqual(["em", "link", "strong", "text"]);
  });

  it("refuses references of an unknown kind or shape", () => {
    for (const target of ["fo:product/abc", "fo:corridor/pl", "fo:post/not-a-uuid", "fo:info/nope"]) {
      expect(BlogLinkRefSchema.safeParse(target).success, target).toBe(false);
    }
  });
});

describe("resolveBlogLink (T-07)", () => {
  const targets: BlogLinkTargets = {
    pathOf: (ref) => Promise.resolve(ref.kind === "corridor" && ref.id === "PL" ? "/en/destinations/poland" : null),
  };

  it("an existing target is an href; a missing one is its anchor as text, with no link", async () => {
    await expect(
      resolveBlogLink({ kind: "corridor", id: "PL" }, "our guide", "en", targets),
    ).resolves.toEqual({ href: "/en/destinations/poland" });
    await expect(
      resolveBlogLink({ kind: "corridor", id: "DE" }, "our German guide", "en", targets),
    ).resolves.toEqual({ text: "our German guide" });
  });
});
