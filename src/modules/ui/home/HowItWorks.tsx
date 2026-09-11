/**
 * `HowItWorks` — the artboards' explainer band (spec 004 §2 "Locale-home skeleton", §13's
 * 2026-09-08 resolution note, §14 **A5**, AC-10, AC-15; TASK-053; `docs/design/homepage-v1/`
 * README "Round 2, founder direction").
 *
 * §2's default was "How it works in three steps (You choose → a vetted local florist makes it →
 * photo on delivery)". The founder-approved round-2 artboards **supersede that wording**, and
 * this component renders theirs: the eyebrow "How we send your flowers", the headline "Three
 * people touch your order. None of them is a courier.", the three-sentence cross-border
 * explanation the benchmark study found only on Interflora PL and Euroflorist PL, then the
 * `01 / 02 / 03` steps and the guarantee control.
 *
 * **The section's internal name in `TASKS.md` is "the relay explainer"; the word never reaches a
 * reader** (§14 A5). Nothing here says relay, corridor, partner, third party, vendor or network:
 * we order, *our* florist in the recipient's town makes it, *we* photograph it at the door. The
 * one sentence that could read as a disclaimer — "nothing crosses a border, so there is no
 * customs form and nothing to pay on arrival" — is the strongest fact we have and is stated as
 * ours, not as a limitation of somebody else's service.
 *
 * **"Read the guarantee in full" is text, not a link.** `/{locale}/guarantee` is a `site-links.ts`
 * row owned by spec 007 with `published: false`, and it is lawyer-gated (`plan/13` B4). The
 * artboard draws an underlined control; a control that goes nowhere is worse than a sentence, so
 * the label renders as text with the line that says where the terms are today — the same
 * treatment the header's search band and the footer's unpublished columns get (§14 A4).
 *
 * **The band's photograph is a placeholder with no `<img>`** (`plan/10` §3). Its caption is
 * `media.placeholder.delivery`, whose wording this task had to resolve before rendering it
 * (`/review 41`): "the delivery photo we send you" asserted the consent-gated feature spec 027
 * owns, so the caption now describes **the photograph the slot will hold** — a bouquet handed
 * over at the recipient's door — and asserts no product feature at all. The promise itself is
 * step 03's, where the four-fact proof row already makes it in the same words.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { Media } from "../media/Media.tsx";
import { Grid, Row, Stack } from "../primitives/layout.tsx";
import { Display, Label, Text } from "../primitives/typography.tsx";

import { HOME_BLEED } from "./HomeHero.tsx";

/**
 * The three steps, in the artboards' order. Keys, not strings, and both keys written out per step
 * rather than built from `id`: `pnpm i18n:check`'s usage scan is a text scan, and a key assembled
 * at runtime reads to it as an unused key (the note `ProofRow` carries).
 */
export const HOW_IT_WORKS_STEPS = [
  {
    id: "choose",
    ordinal: "01",
    titleKey: "howItWorks.choose.title",
    bodyKey: "howItWorks.choose.body",
  },
  {
    id: "make",
    ordinal: "02",
    titleKey: "howItWorks.make.title",
    bodyKey: "howItWorks.make.body",
  },
  {
    id: "deliver",
    ordinal: "03",
    titleKey: "howItWorks.deliver.title",
    bodyKey: "howItWorks.deliver.body",
  },
] as const satisfies readonly {
  id: string;
  ordinal: string;
  titleKey: string;
  bodyKey: string;
}[];

const HEADING_ID = "how-it-works-heading";

export interface HowItWorksProps {
  /** `h2` on the locale home; `h3` in `/dev/components`, where the section is nested. */
  readonly headingLevel?: "h2" | "h3";
}

export function HowItWorks({
  headingLevel = "h2",
}: HowItWorksProps = {}): ReactElement {
  const home = useTranslations("home");
  const media = useTranslations("media");

  return (
    <Grid
      as="section"
      columns="1-2"
      gap="2xl"
      className={`border-rule py-3xl items-center border-t ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-how-it-works
    >
      <Media slot="band" alt="" caption={media("placeholder.delivery")} />
      <Stack gap="lg">
        <Label>{home("howItWorks.eyebrow")}</Label>
        <Display as={headingLevel} id={HEADING_ID} size="2xl">
          {home("howItWorks.heading")}
        </Display>
        <Text measure size="md" tone="muted">
          {home("howItWorks.intro")}
        </Text>
        <Stack as="ol" gap="lg" className="border-rule pt-lg border-t">
          {HOW_IT_WORKS_STEPS.map((step) => (
            <Row
              as="li"
              key={step.id}
              gap="md"
              align="start"
              data-fo-how-it-works-step={step.id}
            >
              {/* The ordinal is decorative: the list is an `<ol>`, so a screen reader already
                  says "1 of 3", and reading "01" as well would say it twice. */}
              <span aria-hidden="true" className="w-[40px] shrink-0">
                <Display as="span" size="xl" className="text-accent">
                  {step.ordinal}
                </Display>
              </span>
              <Stack gap="none">
                <Text as="span" size="md" className="font-medium">
                  {home(step.titleKey)}
                </Text>
                <Text as="span" size="sm" tone="muted">
                  {home(step.bodyKey)}
                </Text>
              </Stack>
            </Row>
          ))}
        </Stack>
        {/* The unpublished guarantee page: its label as text, plus the line that says where the
            terms are today. Never a dead link (AC-14). */}
        <Stack gap="xs">
          <Text as="span" size="sm" className="font-medium">
            {home("howItWorks.guarantee")}
          </Text>
          <Text as="span" size="sm" tone="subtle">
            {home("howItWorks.guaranteePending")}
          </Text>
        </Stack>
      </Stack>
    </Grid>
  );
}
