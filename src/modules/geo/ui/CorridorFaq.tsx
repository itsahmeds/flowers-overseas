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

import { Display, Label, Stack, Text } from "../../ui/index.ts";
import type { FaqItem } from "../content/schemas.ts";

export interface CorridorFaqProps {
  readonly country: string;
  readonly faq: readonly FaqItem[];
}

export function CorridorFaq({ country, faq }: CorridorFaqProps): ReactElement {
  const c = useTranslations("corridor");

  return (
    <Stack as="section" gap="md" data-fo-corridor-faq>
      <Stack gap="xs">
        <Label>{c("faq.eyebrow", { country })}</Label>
        <Display size="2xl">
          {c("faq.heading", { count: faq.length, country })}
        </Display>
      </Stack>
      <Stack gap="md" className="max-w-prose">
        {faq.map((item) => (
          <Stack gap="xs" key={item.q}>
            <Display as="h3" size="lg">
              {item.q}
            </Display>
            <Text>{item.a}</Text>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
