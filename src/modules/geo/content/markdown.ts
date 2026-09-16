/**
 * The corridor guide body, as blocks a component can render (spec 007 §2 "The content model" —
 * "the markdown body is the guide (≥600 words country-specific)"; TASK-091).
 *
 * The body is the half of a corridor page that makes it worth indexing, so it has to render; what
 * it does **not** need is a markdown library. The fourteen committed guides use exactly two
 * constructs — `## ` headings and paragraphs, with a handful of `**lead-ins**` — and a parser for
 * that subset is twenty lines, has no dependency, and produces *data* rather than HTML — so no
 * corridor block ever injects raw markup into the document (ADR-0016's CSP is pinned on cached
 * HTML, and markup coming out of a content file is the one hole a corridor page could open). An author who writes a construct
 * this parser does not know gets it as plain text, visibly, rather than as swallowed markup —
 * which is the failure mode a reviewer can see.
 *
 * Emphasis is `**bold**` only, and it is parsed into spans rather than into nested inline HTML,
 * because that is all the corpus uses and an unbounded inline grammar is how a renderer grows a
 * vulnerability.
 */

/** One run of body text: bold or not. */
export interface MarkdownSpan {
  readonly text: string;
  readonly bold: boolean;
}

/** A `## ` heading, or a paragraph of spans. Nothing else exists in the corpus. */
export type MarkdownBlock =
  | { readonly kind: "heading"; readonly text: string }
  | { readonly kind: "paragraph"; readonly spans: readonly MarkdownSpan[] };

const BOLD = /\*\*([^*]+)\*\*/gu;

/** Split one paragraph into bold and plain runs, in order. */
function spansOf(text: string): readonly MarkdownSpan[] {
  const spans: MarkdownSpan[] = [];
  let index = 0;
  for (const match of text.matchAll(BOLD)) {
    const start = match.index;
    if (start > index) {
      spans.push({ text: text.slice(index, start), bold: false });
    }
    spans.push({ text: match[1] ?? "", bold: true });
    index = start + match[0].length;
  }
  if (index < text.length) {
    spans.push({ text: text.slice(index), bold: false });
  }
  return spans;
}

/**
 * The guide body as blocks, in document order. Blank lines separate paragraphs; a soft line break
 * inside a paragraph is a space, because the corpus wraps its prose at 90 columns and a reader
 * must not see the wrapping.
 */
export function markdownBlocks(body: string): readonly MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  for (const chunk of body.split(/\n\s*\n/u)) {
    const text = chunk.trim();
    if (text === "") continue;
    const heading = /^##\s+(.+)$/u.exec(text);
    if (heading !== null) {
      blocks.push({ kind: "heading", text: heading[1]?.trim() ?? "" });
      continue;
    }
    blocks.push({
      kind: "paragraph",
      spans: spansOf(text.replace(/\s*\n\s*/gu, " ")),
    });
  }
  return blocks;
}
