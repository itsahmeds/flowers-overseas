/**
 * The blog's markdown subset, parsed into typed blocks (spec 044 §2.3, §5.2, AC-7; TASK-321).
 *
 * The corridor body's precedent (`src/modules/geo/content/markdown.ts`): the body becomes *data*,
 * never an HTML string, so no post can put markup into a cached document (ADR-0016, ADR-0020).
 * The subset: `##` and `###` headings, paragraphs, `**bold**`, `*italic*`, bullet lists (`- `),
 * numbered lists (`1. `), and links whose target is an internal reference `fo:<kind>/<id>`.
 *
 * Anything else — a `#` heading, an HTML tag, `<script>`, an image, a table, a quote, a code
 * fence, a rule, a link to a URL — renders as its literal text, and `blogMarkdownWarnings` names
 * its line so the editor can say what was not understood. Inline runs do not nest: a `**` inside
 * a link anchor is part of the anchor's text, which is the failure a reader can see.
 */
import { BlogLinkRefSchema, type BlogLinkRef } from "./schemas.ts";

/** One inline run. A `link` is a reference, resolved per locale at render (`resolveBlogLink`). */
export type BlogInline =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "strong"; readonly text: string }
  | { readonly kind: "em"; readonly text: string }
  | {
      readonly kind: "link";
      readonly ref: BlogLinkRef;
      readonly anchor: string;
    };

/** One block of the body, in document order. */
export type BlogBlock =
  | { readonly kind: "h2"; readonly inlines: readonly BlogInline[] }
  | { readonly kind: "h3"; readonly inlines: readonly BlogInline[] }
  | { readonly kind: "p"; readonly inlines: readonly BlogInline[] }
  | { readonly kind: "ul"; readonly items: readonly (readonly BlogInline[])[] }
  | { readonly kind: "ol"; readonly items: readonly (readonly BlogInline[])[] };

/** A construct the subset does not know, rendered as text, with its 1-based body line. */
export interface BlogMarkdownWarning {
  readonly line: number;
  readonly construct:
    | "h1"
    | "deep-heading"
    | "html"
    | "image"
    | "table"
    | "quote"
    | "code"
    | "rule"
    | "link-target";
}

const INLINE =
  /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/gu;

/** The inline runs of one line of text, in order. Adjacent text runs are merged. */
export function blogInlines(text: string): readonly BlogInline[] {
  const runs: BlogInline[] = [];
  const pushText = (value: string): void => {
    if (value === "") return;
    const last = runs.at(-1);
    if (last?.kind === "text") {
      runs[runs.length - 1] = { kind: "text", text: last.text + value };
    } else {
      runs.push({ kind: "text", text: value });
    }
  };
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    pushText(text.slice(index, match.index));
    index = match.index + match[0].length;
    const [whole, anchor, target, strong, em] = match;
    if (anchor !== undefined && target !== undefined) {
      const ref = BlogLinkRefSchema.safeParse(target);
      if (ref.success) {
        runs.push({ kind: "link", ref: ref.data, anchor: anchor.trim() });
      } else {
        pushText(whole);
      }
    } else if (strong !== undefined) {
      runs.push({ kind: "strong", text: strong });
    } else if (em !== undefined) {
      runs.push({ kind: "em", text: em });
    }
  }
  pushText(text.slice(index));
  return runs;
}

const BULLET = /^- (.*)$/u;
const NUMBERED = /^\d+\. (.*)$/u;

interface Chunk {
  readonly line: number;
  readonly lines: readonly string[];
}

/** Blank-line-separated chunks, each with the 1-based line it starts on. */
function chunksOf(body: string): readonly Chunk[] {
  const chunks: Chunk[] = [];
  let current: string[] = [];
  let start = 0;
  body
    .replaceAll("\r\n", "\n")
    .split("\n")
    .forEach((raw, index) => {
      const line = raw.trim();
      if (line === "") {
        if (current.length > 0) chunks.push({ line: start, lines: current });
        current = [];
        return;
      }
      if (current.length === 0) start = index + 1;
      current.push(line);
    });
  if (current.length > 0) chunks.push({ line: start, lines: current });
  return chunks;
}

/** List items: each marker line starts an item, a following unmarked line continues it. */
function listItems(lines: readonly string[], marker: RegExp): string[] {
  const items: string[] = [];
  for (const line of lines) {
    const item = marker.exec(line);
    if (item !== null) items.push(item[1] ?? "");
    else items[items.length - 1] = `${items.at(-1) ?? ""} ${line}`;
  }
  return items;
}

/** The body as typed blocks, in document order (AC-7). */
export function blogMarkdownBlocks(body: string): readonly BlogBlock[] {
  return chunksOf(body).map(({ lines }): BlogBlock => {
    const first = lines[0] ?? "";
    if (lines.length === 1) {
      const h3 = /^###\s+(.+)$/u.exec(first);
      if (h3 !== null) return { kind: "h3", inlines: blogInlines(h3[1] ?? "") };
      const h2 = /^##\s+(.+)$/u.exec(first);
      if (h2 !== null) return { kind: "h2", inlines: blogInlines(h2[1] ?? "") };
    }
    if (BULLET.test(first)) {
      return {
        kind: "ul",
        items: listItems(lines, BULLET).map((item) => blogInlines(item)),
      };
    }
    if (NUMBERED.test(first)) {
      return {
        kind: "ol",
        items: listItems(lines, NUMBERED).map((item) => blogInlines(item)),
      };
    }
    return { kind: "p", inlines: blogInlines(lines.join(" ")) };
  });
}

const LINE_CONSTRUCTS: readonly {
  readonly construct: BlogMarkdownWarning["construct"];
  readonly pattern: RegExp;
}[] = [
  { construct: "h1", pattern: /^#(?!#)\s*\S/u },
  { construct: "deep-heading", pattern: /^#{4,}/u },
  { construct: "quote", pattern: /^>/u },
  { construct: "table", pattern: /^\|.*\|\s*$/u },
  { construct: "code", pattern: /^(?:```|~~~)/u },
  { construct: "rule", pattern: /^(?:-{3,}|\*{3,}|_{3,})\s*$/u },
];

/**
 * Every line holding a construct the subset renders as text (§2.3 "an unknown construct renders as
 * its literal text and the editor shows a warning naming the line"). `h1` is also a hard rule
 * (`blog/h1-in-body`): the title is the only `<h1>`.
 */
export function blogMarkdownWarnings(
  body: string,
): readonly BlogMarkdownWarning[] {
  const warnings: BlogMarkdownWarning[] = [];
  body
    .replaceAll("\r\n", "\n")
    .split("\n")
    .forEach((raw, index) => {
      const line = raw.trim();
      const number = index + 1;
      for (const { construct, pattern } of LINE_CONSTRUCTS) {
        if (pattern.test(line)) warnings.push({ line: number, construct });
      }
      if (/<\/?[a-z!][^<>]*>/iu.test(line)) {
        warnings.push({ line: number, construct: "html" });
      }
      if (/!\[[^\]]*\]\([^)]*\)/u.test(line)) {
        warnings.push({ line: number, construct: "image" });
      }
      for (const match of line.matchAll(/(?<!!)\[[^\]\n]+\]\(([^)\s]+)\)/gu)) {
        if (!BlogLinkRefSchema.safeParse(match[1]).success) {
          warnings.push({ line: number, construct: "link-target" });
        }
      }
    });
  return warnings;
}

/** Every reference the body links to, in order (the rules and the link picker read it). */
export function blogLinksOf(
  blocks: readonly BlogBlock[],
): readonly { readonly ref: BlogLinkRef; readonly anchor: string }[] {
  const inlines = blocks.flatMap((block) =>
    block.kind === "ul" || block.kind === "ol"
      ? block.items.flat()
      : [...block.inlines],
  );
  return inlines.flatMap((inline) =>
    inline.kind === "link" ? [{ ref: inline.ref, anchor: inline.anchor }] : [],
  );
}

/** The body's reading text: block by block, a link as its anchor, a paragraph break between. */
export function blogPlainText(blocks: readonly BlogBlock[]): string {
  const textOf = (inlines: readonly BlogInline[]): string =>
    inlines
      .map((inline) => (inline.kind === "link" ? inline.anchor : inline.text))
      .join("");
  return blocks
    .flatMap((block) =>
      block.kind === "ul" || block.kind === "ol"
        ? block.items.map(textOf)
        : [textOf(block.inlines)],
    )
    .join("\n\n");
}

/** Where a reference resolves in one locale: its canonical path, or nothing (the anchor as text). */
export interface BlogLinkTargets {
  /** The target's path in `locale`, or `null` when that page does not exist there now. */
  pathOf(ref: BlogLinkRef, locale: string): Promise<string | null>;
}

/**
 * One reference in one locale (§2.3): `{ href }` when its target exists, otherwise `{ text }`,
 * so a vanished target renders its anchor as plain text with no `<a>` (AC-7).
 */
export async function resolveBlogLink(
  ref: BlogLinkRef,
  anchor: string,
  locale: string,
  targets: BlogLinkTargets,
): Promise<{ readonly href: string } | { readonly text: string }> {
  const path = await targets.pathOf(ref, locale);
  return path === null ? { text: anchor } : { href: path };
}
