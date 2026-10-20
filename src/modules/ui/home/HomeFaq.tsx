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
 * **"All help topics" is a link only where the help page exists** (spec 004 §14 A20; spec 041
 * AC-21; TASK-182). `/{locale}/help` is spec 041's page: where it exists the label links to it
 * and the pending line is not drawn; where it does not, the label is not drawn at all and only
 * the line saying what holds today stays (`faq.allTopicsPending`). **The first question renders
 * open**, as both artboards draw it.
 *
 * The five answers are the artboards' own, in the first person (§14 A5). Two of them state
 * delivery timing — the redelivery window and the Warsaw cutoff (the latter only while ordering
 * is open in Poland, AC-34) — which the chrome states in `nav.utility.cutoff`; they are recorded in the PR body
 * for the reviewer, because spec 006 §14 A4 bans that class of phrase from **catalogue copy** and
 * the boundary between the two is a judgement a reviewer should re-make rather than inherit.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import {
  type CountryIso2,
  deliveryDatesOpen,
} from "../../../config/countries.ts";
import { Grid, Stack } from "../primitives/layout.tsx";
import {
  Display,
  Eyebrow,
  HEADING_EM,
  Text,
} from "../primitives/typography.tsx";

import { HOME_BLEED, HOME_SECTION } from "./HomeHero.tsx";

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
  {
    id: "whoDelivers",
    questionKey: "whoDelivers.question",
    answerKey: "whoDelivers.answer",
    // A19's gated sentence: "Order by 14:00 in Warsaw … for delivery today" is appended only
    // while ordering is open in the country it names (spec 007 §14 A-founder-2026-10-14c clause 4,
    // AC-34; TASK-239): Poland's cutoff, so Poland's predicate, not "any destination". Written out
    // rather than assembled, for the reason the block comment above gives about `i18n:check`.
    gatedAnswerKey: "whoDelivers.answerCutoff",
    gatedCountry: "PL",
  },
] as const satisfies readonly {
  id: string;
  questionKey: string;
  answerKey: string;
  /** Appended to the answer only while `deliveryDatesOpen(gatedCountry)` (A19, AC-34). */
  gatedAnswerKey?: string;
  /** The country whose cutoff `gatedAnswerKey` states. */
  gatedCountry?: CountryIso2;
}[];

const HEADING_ID = "faq-heading";

export interface HomeFaqProps {
  /** `h2` on the locale home; `h3` in `/dev/components`, where the section is nested. */
  readonly headingLevel?: "h2" | "h3";
  /**
   * The help page's path where it exists in this locale (spec 041 AC-21; TASK-182), or absent.
   * The home route asks `infoPageExists("help", locale)` and hands it in, because this module may
   * not read `src/modules/content` (`plan/01` §5). Present: "All help topics" is a link and the
   * pending sentence is not drawn. Absent: the pending sentence stays, as before.
   */
  readonly allTopicsHref?: string | undefined;
}

export function HomeFaq({
  headingLevel = "h2",
  allTopicsHref,
}: HomeFaqProps = {}): ReactElement {
  const t = useTranslations("faq");

  return (
    <Grid
      as="section"
      columns="1-3"
      gap="2xl"
      className={`bg-surface-raised items-start ${HOME_SECTION} ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-faq
      data-fo-reveal=""
    >
      <Stack gap="sm">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <Display as={headingLevel} id={HEADING_ID} size="display-s">
          {t.rich("heading", HEADING_EM)}
        </Display>
        {allTopicsHref === undefined ? (
          <Text size="sm" tone="subtle" measure>
            {t("allTopicsPending")}
          </Text>
        ) : (
          <a className="link" href={allTopicsHref} data-fo-faq-all-topics>
            {t("allTopics")}
          </a>
        )}
      </Stack>
      {/* The artboard's 360 px + rest split is approximated by the primitive's 1-3 grid, whose
          desktop first column is 442 px in the 1328 px container. `Grid` owns the column sets
          (§2: no component ships a bespoke grid), and a fifth option for a 22 px difference
          would be a token invented at a call site. */}
      <Stack gap="none" className="border-rule border-b md:col-span-2">
        {FAQ_ENTRIES.map((entry, index) => (
          <details
            className="border-rule group border-t py-[18px]"
            key={entry.id}
            data-fo-faq-entry={entry.id}
            open={index === 0}
          >
            <summary className="display text-h3-s md:text-h3 gap-md flex min-h-[44px] cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
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
                className="text-link motion-fast ease-standard shrink-0 leading-none font-bold transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <Text className="mt-sm" measure size="sm" tone="muted">
              {/* A19: the cutoff sentence is a *second* sentence, appended only while ordering
                  is open in the country it names, so the answer drops it rather than stating a
                  cutoff nobody can order against (TASK-120, TASK-239). */}
              {"gatedAnswerKey" in entry &&
              deliveryDatesOpen(entry.gatedCountry)
                ? `${t(entry.answerKey)} ${t(entry.gatedAnswerKey)}`
                : t(entry.answerKey)}
            </Text>
          </details>
        ))}
      </Stack>
    </Grid>
  );
}
