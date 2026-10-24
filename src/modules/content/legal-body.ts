/**
 * The legal document body, as blocks a component can render (spec 041 §2 "The content model": "The
 * body is the document; its `##` headings are the sections and become the generated table of
 * contents"; §5.3 "Legal document"; AC-10; TASK-183).
 *
 * The corridor guide's parser (`src/modules/geo/content/markdown.ts`) is the precedent: no
 * markdown library, a closed subset, and **data out, never HTML**, so no content file can inject
 * markup into a cached document (ADR-0016). The legal subset is that one plus what a contract
 * needs and nothing more:
 *
 *  - `## Heading` opens a section; `## Heading {#anchor}` names its anchor (otherwise the anchor
 *    is the heading's ASCII slug). Anchors are lowercase, hyphenated and unique per document.
 *  - `### Heading` is a subheading inside the current section.
 *  - A chunk whose every line starts with `- ` is a bulleted list.
 *  - `[[name]]` alone on its chunk is a **data block** the view model fills: the cookie register,
 *    the re-open button, the controller sentence, the imprint's facts. The set is closed.
 *  - `**bold**` inside a paragraph or a list item, and `{token}` data slots (the phone number,
 *    the company's registry facts). The set is closed, and a registry token is refused in a
 *    document that exists before the company is registered, so no page can print an empty slot.
 *
 * Anything else is a paragraph, rendered as plain text, so a construct the parser does not know
 * shows up visibly instead of being swallowed. Pure and clock-free.
 */

/** The data blocks a legal body may hold, each owned by one document (AC-13, AC-29, AC-11). */
export const LEGAL_DIRECTIVES = [
  "register",
  "reopen",
  "controller",
  "facts",
] as const;
export type LegalDirective = (typeof LEGAL_DIRECTIVES)[number];

/** Which document may hold which block: a register on the terms is a misfiled block. */
export const DIRECTIVES_BY_PAGE: Readonly<
  Record<string, readonly LegalDirective[]>
> = {
  cookies: ["register", "reopen", "controller"],
  imprint: ["facts"],
};

/** The data slots a legal body may carry. Registry slots exist only once the company does. */
export const LEGAL_TOKENS = [
  "phone",
  "tradingName",
  "legalName",
  "registryName",
  "registrationNumber",
  "address",
  "supportEmail",
] as const;
export type LegalToken = (typeof LEGAL_TOKENS)[number];

/** The slots that need a registered company with its mailbox (spec 041 §13 Q1, AC-11). */
export const REGISTRY_TOKENS: readonly LegalToken[] = [
  "legalName",
  "registryName",
  "registrationNumber",
  "address",
  "supportEmail",
];

export interface LegalSpan {
  readonly text: string;
  readonly bold: boolean;
}

export type LegalBlock =
  | { readonly kind: "paragraph"; readonly spans: readonly LegalSpan[] }
  | { readonly kind: "subheading"; readonly text: string }
  | {
      readonly kind: "list";
      readonly items: readonly (readonly LegalSpan[])[];
    }
  | { readonly kind: "directive"; readonly name: LegalDirective };

export interface LegalSection {
  readonly id: string;
  readonly heading: string;
  readonly blocks: readonly LegalBlock[];
}

export interface LegalBodyIssue {
  readonly field: string;
  readonly message: string;
}

export interface LegalBody {
  readonly sections: readonly LegalSection[];
  readonly issues: readonly LegalBodyIssue[];
}

const BOLD = /\*\*([^*]+)\*\*/gu;
const TOKEN = /\{([A-Za-z]+)\}/gu;
const ANCHOR = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const HEADING = /^##\s+(.+?)(?:\s+\{#([^}]*)\})?\s*$/u;
const SUBHEADING = /^###\s+(.+)$/u;
const DIRECTIVE = /^\[\[([a-z-]+)\]\]$/u;

/** Letters the NFKD fold leaves alone, folded by hand for the Polish and German headings. */
const FOLD: Readonly<Record<string, string>> = {
  ł: "l",
  Ł: "l",
  ß: "ss",
};

/** The anchor a heading gets when it names none: its ASCII slug. */
export function headingSlug(heading: string): string {
  return heading
    .replace(/[łŁß]/gu, (letter) => FOLD[letter] ?? letter)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function spansOf(text: string): readonly LegalSpan[] {
  const spans: LegalSpan[] = [];
  let index = 0;
  for (const match of text.matchAll(BOLD)) {
    const start = match.index;
    if (start > index)
      spans.push({ text: text.slice(index, start), bold: false });
    spans.push({ text: match[1] ?? "", bold: true });
    index = start + match[0].length;
  }
  if (index < text.length) spans.push({ text: text.slice(index), bold: false });
  return spans;
}

/** Every `{token}` in a text, in order. */
export function tokensIn(text: string): readonly string[] {
  return [...text.matchAll(TOKEN)].map((match) => match[1] ?? "");
}

/**
 * Parse a legal body. Returns the sections and, separately, every problem with a named field, so
 * the content parser can fail the file the way it fails a frontmatter field (AC-3).
 */
export function legalBody(body: string, pageId: string): LegalBody {
  const issues: LegalBodyIssue[] = [];
  const sections: { id: string; heading: string; blocks: LegalBlock[] }[] = [];
  const allowed = new Set<string>(DIRECTIVES_BY_PAGE[pageId] ?? []);
  const seen = new Set<string>();

  for (const chunk of body.split(/\n\s*\n/u)) {
    const text = chunk.trim();
    if (text === "") continue;
    const heading = HEADING.exec(text);
    if (heading !== null && !text.includes("\n")) {
      const title = heading[1]?.trim() ?? "";
      const id = heading[2] ?? headingSlug(title);
      if (!ANCHOR.test(id)) {
        issues.push({
          field: "body",
          message: `section "${title}": anchor \`${id}\` is not lowercase, ASCII and hyphenated`,
        });
      } else if (seen.has(id)) {
        issues.push({
          field: "body",
          message: `section "${title}": anchor \`${id}\` is used twice in this document`,
        });
      }
      seen.add(id);
      sections.push({ id, heading: title, blocks: [] });
      continue;
    }
    const current = sections.at(-1);
    if (current === undefined) {
      issues.push({
        field: "body",
        message:
          "the body must open with a `## ` heading: every part of a legal document is a section of its contents",
      });
      continue;
    }
    const subheading = SUBHEADING.exec(text);
    if (subheading !== null && !text.includes("\n")) {
      current.blocks.push({
        kind: "subheading",
        text: subheading[1]?.trim() ?? "",
      });
      continue;
    }
    const directive = DIRECTIVE.exec(text);
    if (directive !== null) {
      const name = directive[1] ?? "";
      if (!(LEGAL_DIRECTIVES as readonly string[]).includes(name)) {
        issues.push({
          field: "body",
          message: `\`[[${name}]]\` is not a data block (${LEGAL_DIRECTIVES.join(", ")})`,
        });
        continue;
      }
      if (!allowed.has(name)) {
        issues.push({
          field: "body",
          message: `\`[[${name}]]\` does not belong in the \`${pageId}\` document`,
        });
        continue;
      }
      current.blocks.push({ kind: "directive", name: name as LegalDirective });
      continue;
    }
    const lines = text.split("\n").map((line) => line.trim());
    if (lines.every((line) => line.startsWith("- "))) {
      current.blocks.push({
        kind: "list",
        items: lines.map((line) => spansOf(line.slice(2).trim())),
      });
      continue;
    }
    current.blocks.push({
      kind: "paragraph",
      spans: spansOf(text.replace(/\s*\n\s*/gu, " ")),
    });
  }

  for (const token of tokensIn(body)) {
    if (!(LEGAL_TOKENS as readonly string[]).includes(token)) {
      issues.push({
        field: "body",
        message: `\`{${token}}\` is not a data slot (${LEGAL_TOKENS.join(", ")})`,
      });
    }
  }
  return { sections, issues };
}

/** Every text a block carries, for the honesty gate and the tests. */
export function blockTexts(block: LegalBlock): readonly string[] {
  if (block.kind === "paragraph")
    return [block.spans.map((span) => span.text).join("")];
  if (block.kind === "subheading") return [block.text];
  if (block.kind === "list")
    return block.items.map((item) => item.map((span) => span.text).join(""));
  return [];
}
