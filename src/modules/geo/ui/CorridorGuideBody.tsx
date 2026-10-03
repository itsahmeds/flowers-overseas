/**
 * The authored guide body (spec 007 §2 "The content model" — "the markdown body is the guide
 * (≥600 words country-specific, `plan/02` §5.1)"; TASK-091).
 *
 * This is the half of the page the existence rule exists to protect: a corridor URL is created
 * because somebody wrote six hundred words about that country, and those words have to be on the
 * page or the rule guards nothing. The artboards draw the blocks *around* it — facts, calendar,
 * flowers, FAQ — and none of them is the guide itself, so the body renders here between "how we
 * work" and the calendar, keeping the artboards' order intact.
 *
 * It renders from `markdownBlocks()`: parsed data and `<h2>`/`<p>`/`<strong>` elements, with no
 * raw-HTML injection of any kind — the application still has exactly one inline script and no
 * second source of un-escaped markup, which is what keeps the hash-based `script-src` of ADR-0016
 * true on a cached document.
 *
 * **v2 (TASK-179):** each `##` heading opens its own section in the guide's 4∶7 pair — the heading
 * on the left, its paragraphs on the right — as `corridor-country-desktop.dc.html` draws "Why we
 * started here", "What flowers mean there" and the rest. Paragraphs before the first heading (none
 * in the committed corpus) form a section of their own with no heading column text.
 */
import type { ReactElement } from "react";

import { markdownBlocks } from "../content/markdown.ts";
import type { MarkdownBlock } from "../content/markdown.ts";

import { CORRIDOR_PROSE, CorridorSection } from "./CorridorSection.tsx";

export interface CorridorGuideBodyProps {
  readonly body: string;
}

type Paragraph = Extract<MarkdownBlock, { kind: "paragraph" }>;

interface GuideSection {
  readonly heading: string;
  readonly paragraphs: Paragraph[];
}

/** The blocks, grouped under the heading that opens each section. */
export function guideSections(body: string): readonly GuideSection[] {
  const sections: { heading: string; paragraphs: Paragraph[] }[] = [];
  for (const block of markdownBlocks(body)) {
    if (block.kind === "heading") {
      sections.push({ heading: block.text, paragraphs: [] });
      continue;
    }
    const current = sections.at(-1);
    if (current === undefined)
      sections.push({ heading: "", paragraphs: [block] });
    else current.paragraphs.push(block);
  }
  return sections;
}

export function CorridorGuideBody({
  body,
}: CorridorGuideBodyProps): ReactElement {
  return (
    <div data-fo-corridor-guide>
      {guideSections(body).map((section, index) => (
        <CorridorSection
          heading={section.heading}
          id={`corridor-guide-${String(index)}`}
          key={`${String(index)}-${section.heading}`}
          marker="data-fo-corridor-guide-section"
        >
          <div className={CORRIDOR_PROSE}>
            {section.paragraphs.map((paragraph, paragraphIndex) => (
              <p className="m-0" key={`${String(paragraphIndex)}-p`}>
                {paragraph.spans.map((span, spanIndex) =>
                  span.bold ? (
                    <strong key={`${String(spanIndex)}-b`}>{span.text}</strong>
                  ) : (
                    <span key={`${String(spanIndex)}-t`}>{span.text}</span>
                  ),
                )}
              </p>
            ))}
          </div>
        </CorridorSection>
      ))}
    </div>
  );
}
