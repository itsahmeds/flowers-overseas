/**
 * **v2** (spec 004 §14 A21; TASK-177; `home-*.dc.html` `#how`): the paper-2 band, the intro
 * beside a numbered route — cornflower rings joined by a dashed rule. No photograph and no
 * guarantee control: the artboard draws neither, and the guarantee has no page yet (A20). The
 * artboard's margin note is new copy and waits for the founder's batch.
 *
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
 * we order, a local florist in the recipient's town will make it, *we* photograph it at the door. The
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

import { Display, Eyebrow } from "../primitives/typography.tsx";

import { HOME_BLEED, HOME_SECTION } from "./HomeHero.tsx";

export const HOW_IT_WORKS_STEPS = [
  {
    id: "choose",
    titleKey: "howItWorks.choose.title",
    bodyKey: "howItWorks.choose.body",
  },
  {
    id: "make",
    titleKey: "howItWorks.make.title",
    bodyKey: "howItWorks.make.body",
  },
  {
    id: "deliver",
    titleKey: "howItWorks.deliver.title",
    bodyKey: "howItWorks.deliver.body",
  },
] as const satisfies readonly {
  id: string;
  titleKey: string;
  bodyKey: string;
}[];

const HEADING_ID = "how-it-works-heading";

/**
 * One step of the route. The numeral is a CSS counter in a cornflower ring (decorative: the
 * `<ol>` already says "1 of 3"), and every step but the last hangs a dashed rule to the next.
 */
const STEP =
  "relative ps-[76px] pb-[36px] [counter-increment:step] before:absolute before:start-0 before:top-[-4px] before:grid before:size-[52px] before:place-items-center before:rounded-full before:bg-surface-card before:font-display before:text-md before:text-mark before:shadow-[inset_0_0_0_1.5px_var(--color-mark),0_0_0_5px_var(--color-paper-2)] before:content-[counter(step)] [&:not(:last-child)]:after:absolute [&:not(:last-child)]:after:start-[25px] [&:not(:last-child)]:after:top-[56px] [&:not(:last-child)]:after:bottom-[4px] [&:not(:last-child)]:after:border-s-2 [&:not(:last-child)]:after:border-dashed [&:not(:last-child)]:after:border-rule [&:not(:last-child)]:after:content-['']";

export interface HowItWorksProps {
  readonly headingLevel?: "h2" | "h3";
}

export function HowItWorks({
  headingLevel = "h2",
}: HowItWorksProps = {}): ReactElement {
  const home = useTranslations("home");
  const StepHeading = headingLevel === "h2" ? "h3" : "h4";

  return (
    <section
      className={`bg-surface-raised ${HOME_SECTION} ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-how-it-works
      id="how"
    >
      <div className="md:gap-2xl grid grid-cols-1 items-start gap-[40px] md:grid-cols-[4fr_7fr]">
        <div>
          <Eyebrow className="mb-[14px]">{home("howItWorks.eyebrow")}</Eyebrow>
          <Display as={headingLevel} id={HEADING_ID} size="display-s">
            {home("howItWorks.heading")}
          </Display>
          <p className="text-ink-muted mt-[18px] max-w-[44ch]">
            {home("howItWorks.intro")}
          </p>
        </div>
        <ol className="grid [counter-reset:step]">
          {HOW_IT_WORKS_STEPS.map((step) => (
            <li
              key={step.id}
              className={STEP}
              data-fo-how-it-works-step={step.id}
            >
              <StepHeading className="display text-h3 leading-(--line-height-title) md:text-[25px]">
                {home(step.titleKey)}
              </StepHeading>
              <p className="text-ink-muted mt-[8px] max-w-[48ch]">
                {home(step.bodyKey)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
