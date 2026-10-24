/**
 * A post's body (spec 044 §2.3, §5.3, AC-7; artboard `blog-post-desktop.dc.html` `.bp-body`;
 * TASK-322): the typed blocks of the markdown subset, rendered as `h2`, `h3`, `p`, `strong`,
 * `em`, `ul`, `ol`, `li` and `a`, and nothing else. There is no HTML string anywhere on this path,
 * so a post cannot inject markup into a cached document (ADR-0016, ADR-0020): an unknown construct
 * arrived here as its literal text. Every `a` is a resolved reference (`view.ts`); a reference
 * whose target is gone arrived as text.
 */
import type { ReactElement } from "react";

import type { BlogBlockView, BlogInlineView } from "../view.ts";

const LINK =
  "text-link decoration-[1.5px] underline underline-offset-4 hover:text-link-strong";

function Inlines({
  inlines,
}: {
  readonly inlines: readonly BlogInlineView[];
}): ReactElement {
  return (
    <>
      {inlines.map((inline, index) => {
        switch (inline.kind) {
          case "text":
            return <span key={index}>{inline.text}</span>;
          case "strong":
            return (
              <strong className="font-bold" key={index}>
                {inline.text}
              </strong>
            );
          case "em":
            return <em key={index}>{inline.text}</em>;
          case "link":
            return (
              <a className={LINK} href={inline.href} key={index}>
                {inline.text}
              </a>
            );
        }
      })}
    </>
  );
}

function Block({ block }: { readonly block: BlogBlockView }): ReactElement {
  switch (block.kind) {
    case "h2":
      return (
        <h2 className="display text-2xl-s md:text-2xl-fluid m-0 mt-[22px] leading-(--line-height-title)">
          <Inlines inlines={block.inlines} />
        </h2>
      );
    case "h3":
      return (
        <h3 className="display text-h3 m-0 mt-[8px] leading-(--line-height-title)">
          <Inlines inlines={block.inlines} />
        </h3>
      );
    case "p":
      return (
        <p className="m-0">
          <Inlines inlines={block.inlines} />
        </p>
      );
    case "ul":
    case "ol": {
      const List = block.kind;
      return (
        <List
          className={`m-0 grid gap-[6px] ps-[1.25em] ${block.kind === "ul" ? "list-disc" : "list-decimal"}`}
        >
          {block.items.map((item, index) => (
            <li key={index}>
              <Inlines inlines={item} />
            </li>
          ))}
        </List>
      );
    }
  }
}

export function BlogBody({
  blocks,
}: {
  readonly blocks: readonly BlogBlockView[];
}): ReactElement {
  return (
    <div
      className="text-body-s text-ink grid max-w-(--measure) gap-[16px] leading-(--line-height-body) md:gap-[18px] md:text-[19px]"
      data-fo-blog-body
    >
      {blocks.map((block, index) => (
        <Block block={block} key={index} />
      ))}
    </div>
  );
}
