/**
 * The region-specific FAQ (spec 007 §5.3 "FAQ block", AC-19, AC-24;
 * `docs/design/system/components.dc.html` "FAQ list"; TASK-091).
 *
 * Eight to twelve authored questions, each a real `<h3>` in document order with its answer as
 * visible text under it. **No accordion, no `<details>`, no JavaScript, nothing hidden behind a
 * click** — the artboard says it three times, and it is what AC-24 measures: this block renders
 * identically with JavaScript disabled because there is none.
 *
 * The count is not defended here: 8–12 is `pnpm corridor:check`'s (AC-2), so a file outside the
 * band fails the build and there is no visual state for "too few questions".
 *
 * TASK-093's `FAQPage` JSON-LD is built from this same `faq` array, character for character, so
 * structured data cannot describe an answer the page does not show (AC-15).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { FaqItem } from "../content/schemas.ts";

import { CorridorSection } from "./CorridorSection.tsx";

export interface CorridorFaqProps {
  readonly country: string;
  readonly faq: readonly FaqItem[];
}

export function CorridorFaq({ country, faq }: CorridorFaqProps): ReactElement {
  const c = useTranslations("corridor");

  return (
    <CorridorSection
      eyebrow={c("faq.eyebrow", { country })}
      heading={c("faq.heading", { count: faq.length, country })}
      id="corridor-faq"
      marker="data-fo-corridor-faq"
    >
      {/* Visible questions and answers, never an accordion: spec 007 §2 and §5.3 ("server-rendered
          `<h3>`+`<p>`, no accordion, no JS, never hidden") outrank the v2 artboard's
          `<details>`, which the artboard's own rule — the spec wins on behaviour — sets aside.
          The look is the artboard's: hairline-ruled items, the question in the display voice. */}
      <div className="border-rule border-t">
        {faq.map((item) => (
          <div className="border-rule border-b py-[18px]" key={item.q}>
            <h3 className="display text-h3-s md:text-h3 m-0 font-normal">
              {item.q}
            </h3>
            <p className="text-ink-muted m-0 mt-[10px] max-w-[64ch]">
              {item.a}
            </p>
          </div>
        ))}
      </div>
    </CorridorSection>
  );
}
