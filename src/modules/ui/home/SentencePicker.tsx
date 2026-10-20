/**
 * `SentencePicker` — the home's letter: a server-rendered `<form method="get">` that takes the
 * buyer to the right flowers (spec 004 §14 **A21 clause 4**, AC-10, AC-11; TASK-177;
 * `docs/design/wireframes/home-{desktop,mobile}.dc.html`, "the sentence").
 *
 * The sentence is the founder's (2026-10-04, option 2, approved in the copy batch): **"Send
 * flowers to [my mum] in [Poland] for [her birthday]."**, headed "Start with who it's for". It is
 * one ICU message with three tags (`home.sentence.frame`), so each locale orders the selects its
 * own way; nothing is concatenated.
 *
 * - **Who** (`home.sentence.who`, an ICU select) has **no `name`** and is never submitted. Its
 *   accessible name is the letter's heading, "Start with who it's for".
 * - **Country** and **occasion** are the two submitted fields (`sentence-model.ts`).
 * - **The possessive.** Each occasion label is an ICU select on the chosen person's pronoun
 *   (`home.sentence.occasion`). The server renders the default person's form (my mum → "her
 *   birthday"), so the form reads right with JavaScript off, and writes all three forms into
 *   `data-label-*` for `SentenceIsland`, which swaps them when the reader picks someone else.
 *   That island is the home's only one and carries no copy of its own. Its chunk waits for the
 *   first interaction with the form (`<AfterPaint island="home-sentence" on="interaction"
 *   control="#send">`, spec 004 §14 A-founder-2026-10-15b; TASK-244).
 *
 * Round 2 (TASK-196): the form draws no surface of its own. `HomeHero` sets it in the desktop
 * card, or in the white card under the phone cover, and that card carries the airmail edge (A24
 * clause 7). No tilt and no ruled lines. No "prices include VAT and delivery" line: the founder ruled it off
 * the home on 2026-10-04 ("dont write this on home"); the home shows no price. Each choice is Fraunces italic poppy with a dashed underline and
 * a drawn chevron.
 *
 * Motion (spec 004 §14 A24 clause 9; TASK-194): each choice is a `data-fo-pick`, under which the
 * one-time shimmer (motion 4) sweeps when the motion module marks the form `data-fo-shimmer` 800 ms
 * after load, if nobody has touched it; Continue is `pending` (motion 3).
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { AfterPaint } from "../deferred/AfterPaint.tsx";
import { SentenceLoader } from "../deferred/InteractionLoaders.tsx";
import { Icon } from "../icons/Icon.tsx";
import { Button } from "../primitives/Button.tsx";

import {
  SENTENCE_FIELDS,
  SENTENCE_IDS,
  SENTENCE_PRONOUNS,
  SENTENCE_WHO,
  sentenceAction,
  sentenceDestinations,
  sentenceOccasions,
} from "./sentence-model.ts";

interface LabelTranslator {
  (key: string, values?: Record<string, string>): string;
  rich: (
    key: string,
    values: Record<string, (chunks: ReactNode) => ReactNode>,
  ) => ReactNode;
}

export interface SentencePickerProps {
  readonly locale: string;
  /** ISO codes whose shop root exists in this locale (`corridorShopEntry()`, from the page). */
  readonly shopCountries?: readonly string[];
  /** `h2` on the home; the gallery nests it under its own heading. */
  readonly headingLevel?: "h2" | "h3";
  readonly className?: string;
}

/**
 * The select's skin: Fraunces 300 italic poppy, a dashed underline, no native chrome.
 *
 * **The value never clips (TASK-231; QA-1 Q1-04, "Polana").** `field-sizing: content` sizes the
 * select's content box to the selected label's *advance* width, and the browser clips the label at
 * that box; an italic's last glyph inks past its advance (Fraunces 300 italic "d" by 0.18 em), so
 * "Poland" lost the stem of its "d". `SELECT_INK_ROOM` widens the content box by a quarter em
 * where `calc-size()` exists (Chromium); without `field-sizing` (Firefox) the select is as wide as
 * its longest option and the label already has room. The chevron stays in the 24 px end padding,
 * clear of the ink.
 */
export const SELECT_INK_ROOM =
  "[inline-size:calc-size(fit-content,_size_+_0.25em)]";

const SELECT = `display-em text-lg-s md:text-lg appearance-none border-0 border-b-2 border-dashed border-accent bg-transparent ps-[2px] pe-[24px] leading-[40px] min-h-[44px] [field-sizing:content] ${SELECT_INK_ROOM} cursor-pointer rounded-none hover:bg-blush focus-visible:rounded-md`;

/** The drawn chevron, inline-end of the choice (the artboard's `.pick::after`). */
const PICK =
  "relative inline-block after:pointer-events-none after:absolute after:end-[6px] after:top-[14px] after:size-[8px] after:rotate-45 after:border-e-2 after:border-b-2 after:border-accent after:content-['']";

/** One choice: the select inside its drawn chevron, with a visually hidden label if it has one. */
function Pick({
  id,
  label,
  children,
}: {
  readonly id: string;
  readonly label?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span className={PICK} data-fo-pick>
      {label === undefined ? null : (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}
      {children}
    </span>
  );
}

export function SentencePicker({
  locale,
  shopCountries = [],
  headingLevel = "h2",
  className,
}: SentencePickerProps): ReactElement {
  const t = useTranslations() as unknown as LabelTranslator;
  const shops = new Set(shopCountries);
  const destinations = sentenceDestinations(locale, (key) => t(key), shops);
  const occasions = sentenceOccasions();
  // Preselected: the first destination Continue takes to a shop (Poland), as before TASK-239.
  const firstShop = destinations.find((destination) => destination.shop);
  const defaultWho = SENTENCE_WHO[0];
  const occasionLabel = (occasion: string, pronoun: string): string =>
    t("home.sentence.occasion", { occasion, pronoun });
  const Heading = headingLevel;

  return (
    <form
      id={SENTENCE_IDS.form}
      method="get"
      action={sentenceAction(locale)}
      aria-labelledby={SENTENCE_IDS.heading}
      className={[
        // Round 2 draws no tilt and no ruled lines (A23 clause 10, A24): the white card around the
        // sentence is the caller's (`HomeHero`: the desktop card, or the phone card below the
        // cover), and so is its airmail edge. The scroll margin clears the sticky header when the
        // header's Send flowers or the phone's docked bar jumps here (`#send`).
        "scroll-mt-[81px] md:scroll-mt-[105px] xl:scroll-mt-[99px]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-fo-sentence
    >
      <Heading
        id={SENTENCE_IDS.heading}
        className="label mb-[10px] text-sm leading-[1.4]"
      >
        {t("home.sentence.heading")}
      </Heading>
      {/* The phone measure is 280 px at every phone width (TASK-239). The not-open mark
          ("Poland (soon)", spec 007 §14 A-founder-2026-10-14c clause 3) left the 390 px line
          10 px of slack, so the webfont swap re-broke the sentence on CI's fallback faces and
          moved the hero (CLS 0.0104 against A21 clause 3's 0.001). At 280 px the sentence breaks
          as it does at 360, where the swap measures 0 in all four locales. */}
      <p className="display text-lg-s m-0 leading-[1.75] max-md:[max-inline-size:280px] md:text-lg">
        {t.rich("home.sentence.frame", {
          who: () => (
            <Pick id={SENTENCE_IDS.who}>
              {/* No `name`: who it is for is never submitted (plan/07). */}
              <select
                id={SENTENCE_IDS.who}
                aria-labelledby={SENTENCE_IDS.heading}
                className={SELECT}
                defaultValue={defaultWho.id}
                data-fo-sentence-who
              >
                {SENTENCE_WHO.map((who) => (
                  <option
                    key={who.id}
                    value={who.id}
                    data-pronoun={who.pronoun}
                  >
                    {t("home.sentence.who", { who: who.id })}
                  </option>
                ))}
              </select>
            </Pick>
          ),
          country: () => (
            <Pick id={SENTENCE_IDS.country} label={t("finder.country.label")}>
              <select
                id={SENTENCE_IDS.country}
                name={SENTENCE_FIELDS.country}
                className={SELECT}
                defaultValue={firstShop?.iso2}
                data-fo-sentence-country
              >
                {/* Every country is selectable; one where ordering is not open says "soon"
                    beside its name, in words (spec 007 §14 A-founder-2026-10-14c clause 3). */}
                {destinations.map((destination) => (
                  <option
                    key={destination.iso2}
                    value={destination.iso2}
                    data-fo-sentence-destination={destination.iso2}
                  >
                    {destination.open
                      ? t(destination.nameKey)
                      : t("home.sentence.notYet", {
                          country: t(destination.nameKey),
                        })}
                  </option>
                ))}
              </select>
            </Pick>
          ),
          occasion: () => (
            <Pick
              id={SENTENCE_IDS.occasion}
              label={t("corridor.calendar.occasion")}
            >
              <select
                id={SENTENCE_IDS.occasion}
                name={SENTENCE_FIELDS.occasion}
                className={SELECT}
                data-fo-sentence-occasion
              >
                {occasions.map((occasion) => (
                  <option
                    key={occasion.id}
                    value={occasion.id}
                    {...Object.fromEntries(
                      SENTENCE_PRONOUNS.map((pronoun) => [
                        `data-label-${pronoun}`,
                        occasionLabel(occasion.id, pronoun),
                      ]),
                    )}
                  >
                    {occasionLabel(occasion.id, defaultWho.pronoun)}
                  </option>
                ))}
              </select>
            </Pick>
          ),
        })}
      </p>
      <AfterPaint island="home-sentence" on="interaction" control="#send">
        <SentenceLoader formId={SENTENCE_IDS.form} />
      </AfterPaint>
      <div className="mt-[14px] flex flex-wrap items-center gap-x-[20px] gap-y-[12px]">
        <Button
          type="submit"
          variant="accent"
          className="flex-auto md:flex-none"
          pending
        >
          {t("finder.submit")}
          {/* "Continue →" (TASK-231; QA-3 D-19): the drawn arrow, `arrow-end`, decorative and
              mirrored under `dir="rtl"` by the icon set (`mirror-in-rtl`); no new string. While
              the next page loads, motion 3's bloom takes the arrow's slot (TASK-194): the arrow
              is the label's own `svg`, the bloom's sits one level deeper. */}
          <Icon
            name="arrow-end"
            size={16}
            className="ms-[8px] inline-block align-[-2px]"
          />
        </Button>
      </div>
    </form>
  );
}
