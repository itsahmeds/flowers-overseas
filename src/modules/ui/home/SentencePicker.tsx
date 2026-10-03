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
 *   That island is the home's only one and carries no copy of its own.
 *
 * The letter is `--color-card` on `--letter-lines`, tilted, with the airmail edge on top (one of
 * A21 clause 2's three places). No "prices include VAT and delivery" line: the founder ruled it off
 * the home on 2026-10-04 ("dont write this on home"); the home shows no price. Each choice is Fraunces italic poppy with a dashed underline and
 * a drawn chevron.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { Button } from "../primitives/Button.tsx";

import { SentenceIsland } from "./SentenceIsland.tsx";
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

/** The select's skin: Fraunces 300 italic poppy, a dashed underline, no native chrome. */
const SELECT =
  "display-em text-lg-s md:text-lg appearance-none border-0 border-b-2 border-dashed border-accent bg-transparent ps-[2px] pe-[24px] leading-[40px] min-h-[44px] [field-sizing:content] cursor-pointer rounded-none hover:bg-blush focus-visible:rounded-md";

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
    <span className={PICK}>
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
  const firstOpen = destinations.find((destination) => destination.open);
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
        "airmail-edge bg-surface-card rounded-letter shadow-letter px-[22px] pt-[20px] pb-[26px] md:px-[32px] md:pt-[22px] md:pb-[30px]",
        "rotate-(--tilt-letter-s) bg-(image:--letter-lines) bg-[position:0_20px] md:rotate-(--tilt-letter)",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-fo-sentence
    >
      <Heading
        id={SENTENCE_IDS.heading}
        className="label text-sm leading-[48px]"
      >
        {t("home.sentence.heading")}
      </Heading>
      <p className="display text-lg-s leading-[48px] md:text-lg">
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
                defaultValue={firstOpen?.iso2}
                data-fo-sentence-country
              >
                {destinations.map((destination) => (
                  <option
                    key={destination.iso2}
                    value={destination.iso2}
                    disabled={!destination.open}
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
      <SentenceIsland formId={SENTENCE_IDS.form} />
      <div className="mt-[22px] flex flex-wrap items-center gap-x-[20px] gap-y-[12px]">
        <Button
          type="submit"
          variant="accent"
          className="flex-auto md:flex-none"
        >
          {t("finder.submit")}
        </Button>
      </div>
    </form>
  );
}
