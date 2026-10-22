/**
 * Small readers of a florists page's content (spec 011 §2; TASK-210): the one emphasised phrase of
 * a heading, the intro split into its lede and the rest, and a section by its authored id.
 */
import type { ReactElement } from "react";

import type { InfoPageView, InfoSectionView } from "@/modules/content";

/**
 * `Orders from abroad, *made by you*` → the text with the starred phrase in `<em>`, the artboards'
 * italic (Fraunces 300, sunflower on the ink band). The words stay one authored string.
 */
export function Emphasised({ text }: { readonly text: string }): ReactElement {
  const parts = text.split(/\*([^*]+)\*/u);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <em data-fo-em="" key={`${part}-${String(index)}`}>
            {part}
          </em>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * The intro's first sentence (the lede under the `<h1>`) and the rest (which opens "what we do,
 * what you do"), word for word: the landing artboard's split. A one-sentence intro has no rest.
 */
export function introParts(
  intro: string | undefined,
): readonly [string | undefined, string | undefined] {
  if (intro === undefined) return [undefined, undefined];
  const match = /^(.+?[.!?])\s+(\S[\s\S]*)$/u.exec(intro);
  if (match === null) return [intro, undefined];
  return [match[1], match[2]];
}

/** One section by its id; the content gate guarantees the landing's (`florist-landing-blocks`). */
export function sectionById(view: InfoPageView, id: string): InfoSectionView {
  const section = view.sections.find((candidate) => candidate.id === id);
  if (section === undefined) {
    throw new Error(
      `\`${view.pageId}\` (${view.locale}) has no section \`${id}\``,
    );
  }
  return section;
}
