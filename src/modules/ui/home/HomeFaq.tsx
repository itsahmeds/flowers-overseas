/**
 * `HomeFaq` — the artboards' "Questions people ask first" section (design round 6, spec 004 §13's
 * 2026-09-08 resolution note, **AC-16**; TASK-053).
 *
 * Five questions in native `<details>`/`<summary>` elements: open, close, keyboard operation and
 * the disclosure semantics are the platform's, so this section adds **zero bytes of client
 * JavaScript** — which is why it is `<details>` and not an accordion component, on a document
 * that sits 8 712 B under §14 A1's 131 072 B budget with nothing left to spare for a widget the
 * browser already ships.
 *
 * **No `FAQPage` JSON-LD, deliberately** (AC-16): spec 007 owns every piece of structured data on
 * this site, and a rich result pointing at a `noindex` page would be nonsense anyway. When 007
 * lifts the `noindex` it can add the schema from these same keys.
 *
 * **"All help topics" is text, not a link** — `/{locale}/help` is a `site-links.ts` row spec 007
 * publishes, and the artboards' underlined control renders as its label plus the line saying what
 * to do today (AC-14: never a dead link).
 *
 * The five answers are the artboards' own, in the first person (§14 A5). Two of them state
 * delivery timing — the redelivery window and the Warsaw cutoff — which the home page already
 * states above them in `finder.cutoff` and `nav.utility.cutoff`; they are recorded in the PR body
 * for the reviewer, because spec 006 §14 A4 bans that class of phrase from **catalogue copy** and
 * the boundary between the two is a judgement a reviewer should re-make rather than inherit.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { Grid, Stack } from "../primitives/layout.tsx";
import { Display, Label, Text } from "../primitives/typography.tsx";

import { HOME_BLEED } from "./HomeHero.tsx";

/**
 * The five questions, in the artboards' order. Both keys are written out per question rather than
 * built from `id`, for the reason `ProofRow` records: `pnpm i18n:check`'s usage scan is a text
 * scan, and a key assembled at runtime reads to it as an unused key.
 */
export const FAQ_ENTRIES = [
  { id: "photo", questionKey: "photo.question", answerKey: "photo.answer" },
  {
    id: "nobodyHome",
    questionKey: "nobodyHome.question",
    answerKey: "nobodyHome.answer",
  },
  { id: "price", questionKey: "price.question", answerKey: "price.answer" },
  {
    id: "whoDelivers",
    questionKey: "whoDelivers.question",
    answerKey: "whoDelivers.answer",
  },
  {
    id: "lasting",
    questionKey: "lasting.question",
    answerKey: "lasting.answer",
  },
] as const satisfies readonly {
  id: string;
  questionKey: string;
  answerKey: string;
}[];

const HEADING_ID = "faq-heading";

export interface HomeFaqProps {
  /** `h2` on the locale home; `h3` in `/dev/components`, where the section is nested. */
  readonly headingLevel?: "h2" | "h3";
}

export function HomeFaq({
  headingLevel = "h2",
}: HomeFaqProps = {}): ReactElement {
  const t = useTranslations("faq");

  return (
    <Grid
      as="section"
      columns="1-3"
      gap="2xl"
      className={`py-3xl items-start ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-faq
    >
      <Stack gap="sm">
        <Label>{t("eyebrow")}</Label>
        <Display as={headingLevel} id={HEADING_ID} size="2xl">
          {t("heading")}
        </Display>
        {/* The unpublished help centre: its label as text, and what to do until 007 publishes it. */}
        <Text as="span" size="sm" className="font-medium">
          {t("allTopics")}
        </Text>
        <Text size="sm" tone="subtle" measure>
          {t("allTopicsPending")}
        </Text>
      </Stack>
      {/* The artboard's 360 px + rest split is approximated by the primitive's 1-3 grid, whose
          desktop first column is 442 px in the 1328 px container. `Grid` owns the column sets
          (§2: no component ships a bespoke grid), and a fifth option for a 22 px difference
          would be a token invented at a call site. */}
      <Stack gap="none" className="border-rule border-b md:col-span-2">
        {FAQ_ENTRIES.map((entry) => (
          <details
            className="border-rule py-md group border-t"
            key={entry.id}
            data-fo-faq-entry={entry.id}
          >
            <summary className="text-md gap-md flex min-h-[44px] cursor-pointer list-none items-center justify-between font-medium [&::-webkit-details-marker]:hidden">
              {t(entry.questionKey)}
              {/* The artboards' `+` at the inline end of every summary — the whole of the expand
                  affordance, because `display: flex` suppresses the native disclosure marker and
                  a bold line with no marker reads as a heading (`/review 53` required change 1).
                  Open state rotates the same glyph 45° into a `×`: CSS only (`group-open`), one
                  character in the DOM rather than two swapped ones, and symmetric under RTL. It
                  is `aria-hidden` because `<details>` already exposes the expanded state, and the
                  focus ring is `globals.css`'s token-coloured `:focus-visible` on the summary. */}
              <span
                aria-hidden="true"
                className="text-ink-subtle motion-fast ease-standard shrink-0 leading-none transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <Text className="mt-sm" measure size="sm" tone="muted">
              {t(entry.answerKey)}
            </Text>
          </details>
        ))}
      </Stack>
    </Grid>
  );
}
