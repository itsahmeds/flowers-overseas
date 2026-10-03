/**
 * `SentencePicker` — the home's letter: a server-rendered `<form method="get">` that takes the
 * buyer to the right flowers (spec 004 §14 **A21 clause 4**, AC-10, AC-11; TASK-177;
 * `docs/design/wireframes/home-{desktop,mobile}.dc.html`, "the sentence").
 *
 * It replaces the v1 finder card and its `FinderTypeahead` island, so the home now ships **no**
 * island of its own: the form works with JavaScript off, and the only JavaScript on the page is
 * the shared chrome's. Every decision about data — which destinations are open, their collation,
 * where a submission lands — is `sentence-model.ts`'s.
 *
 * **What is drawn, and what waits for the founder's copy batch.** The artboard writes the form
 * as one sentence ("I'd like to send flowers to … in … for …") with a "who it's for" select. Its
 * words are new English, and the `en` catalogue sits at the 5 % unreviewed ceiling (spec 003
 * §6, shared with TASK-176 to TASK-179), so this ships the letter's look and behaviour with the
 * **reviewed** words that already exist: the hub's heading, the finder's "Country" label and
 * `Continue`, the occasions' own names and the price line. The sentence and the relationship
 * select (which has no `name` and is never submitted) arrive with the batch, listed in the
 * brief's `## Result`. One new string ships: the "not yet" option label.
 *
 * Look: the letter is `--color-card` on `--letter-lines`, tilted by `--tilt-letter`, with the
 * airmail edge on top (one of A21 clause 2's three places); each choice is a native `<select>`
 * in Fraunces italic poppy with a dashed underline and a drawn chevron, `field-sizing: content`.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { Button } from "../primitives/Button.tsx";

import {
  SENTENCE_FIELDS,
  SENTENCE_IDS,
  sentenceAction,
  sentenceDestinations,
  sentenceOccasions,
} from "./sentence-model.ts";

type LabelTranslator = (key: string, values?: Record<string, string>) => string;

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
  "display-em text-lg-s md:text-lg appearance-none border-0 border-b-2 border-dashed border-accent bg-transparent ps-[2px] pe-[24px] leading-[40px] [field-sizing:content] cursor-pointer rounded-none hover:bg-blush focus-visible:rounded-md";

/** The drawn chevron, inline-end of the choice (the artboard's `.pick::after`). */
const PICK =
  "relative inline-block after:pointer-events-none after:absolute after:end-[6px] after:top-[14px] after:size-[8px] after:rotate-45 after:border-e-2 after:border-b-2 after:border-accent after:content-['']";

function Pick({
  id,
  label,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span className="gap-x-sm inline-flex flex-wrap items-baseline">
      <label htmlFor={id} className="text-ink">
        {label}
      </label>
      <span className={PICK}>{children}</span>
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
        {t("destinationsHub.h1")}
      </Heading>
      <p className="display text-lg-s gap-x-lg flex flex-wrap leading-[48px] md:text-lg">
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
              <option key={occasion.id} value={occasion.id}>
                {t(occasion.nameKey)}
              </option>
            ))}
          </select>
        </Pick>
      </p>
      <div className="mt-[22px] flex flex-wrap items-center gap-x-[20px] gap-y-[12px]">
        <Button
          type="submit"
          variant="accent"
          className="flex-auto md:flex-none"
        >
          {t("finder.submit")}
        </Button>
        <p className="text-ink-muted text-sm leading-(--line-height-tight)">
          {t("nav.utility.pricesInclude")}
        </p>
      </div>
    </form>
  );
}
