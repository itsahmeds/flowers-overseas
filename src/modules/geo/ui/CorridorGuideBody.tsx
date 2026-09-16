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
 */
import type { ReactElement } from "react";

import { Display, Stack, Text } from "../../ui/index.ts";
import { markdownBlocks } from "../content/markdown.ts";

export interface CorridorGuideBodyProps {
  readonly body: string;
}

export function CorridorGuideBody({
  body,
}: CorridorGuideBodyProps): ReactElement {
  const blocks = markdownBlocks(body);

  return (
    <Stack as="section" gap="md" className="max-w-prose" data-fo-corridor-guide>
      {blocks.map((block, index) =>
        block.kind === "heading" ? (
          <Display key={`${String(index)}-${block.text}`} size="xl">
            {block.text}
          </Display>
        ) : (
          <Text key={`${String(index)}-p`}>
            {block.spans.map((span, spanIndex) =>
              span.bold ? (
                <strong key={`${String(spanIndex)}-b`}>{span.text}</strong>
              ) : (
                <span key={`${String(spanIndex)}-t`}>{span.text}</span>
              ),
            )}
          </Text>
        ),
      )}
    </Stack>
  );
}
