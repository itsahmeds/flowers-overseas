/**
 * `ReviewsSection` — the artboards' verified-reviews band, hidden until a real review exists
 * (spec 004 §13's 2026-09-08 resolution note, §8, **AC-15**; `plan/07` §7; `plan/09` Phase 0
 * AC 6; founder ruling 2026-09-08 "reviews are real-only, never seeded"; TASK-054).
 *
 * **In Phase 0 this component renders `null`, and there is no data that could change that.**
 * `staticReviewsProvider` is a constant empty list, not a config file (see its header), so the
 * canvas's placeholder rows — `[Buyer first name] · sent to Warszawa · [date] · verified order` —
 * cannot reach a rendered page. That is AC-15, and it is asserted three ways: the served-document
 * assertion in `tests/e2e/honesty.spec.ts`, the catalogue grep in
 * `tests/unit/home-honesty.test.ts`, and the "renders nothing with the shipped provider" unit
 * test in `tests/unit/ui-home-gated.test.tsx`.
 *
 * The populated branch is written now and covered by a fake provider and by `/dev/components`,
 * because the day the first review lands it must render correctly rather than be designed then.
 * What it renders is the artboard: the heading column with the "every review comes from a
 * completed order" sentence and the **Trustpilot slot as a named, empty region** (we have no
 * profile, so there is a labelled region and a grey bar and no score), and the review cards, each
 * a quotation with a first name, a destination town, a date formatted in the reader's locale and
 * the verification word. No star row: a rating is a number we do not have, and drawing five grey
 * stars is the invention AC-15 exists to stop.
 *
 * **Data minimisation is enforced by the type, not by this template** (`plan/07` §2): a
 * `VerifiedReview` carries a first name and a town and cannot carry a surname, an email or an
 * order id, so spec 016's provider cannot widen what the page shows without changing the seam.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { formatDate } from "../../i18n";
import { Grid, Stack } from "../primitives/layout.tsx";
import { Placeholder } from "../primitives/Photo.tsx";
import { Display, Label, Text } from "../primitives/typography.tsx";

import { HOME_BLEED } from "./HomeHero.tsx";
import type { LocaleCode } from "../../../config/locales.ts";
import {
  type ReviewsProvider,
  getReviewsProvider,
} from "./reviews-provider.ts";

/** The id, so the section can be pointed at once it exists. */
export const REVIEWS_ANCHOR = "reviews";

const HEADING_ID = "reviews-heading";

export interface ReviewsSectionProps {
  readonly locale: string;
  /** `h2` on the locale home; `h3` in `/dev/components`, where the section is nested. */
  readonly headingLevel?: "h2" | "h3";
  /** The gallery's populated state — see `TrendingRow`'s twin for why it is a prop. */
  readonly provider?: ReviewsProvider;
}

/** The same cast `./finder-model.ts` documents at length: the locale set is provider-backed data. */
function localeCode(locale: string): LocaleCode {
  return locale as LocaleCode;
}

export function ReviewsSection({
  locale,
  headingLevel = "h2",
  provider,
}: ReviewsSectionProps): ReactElement | null {
  const home = useTranslations("home");
  const source = provider ?? getReviewsProvider();
  const reviews = source.list();

  // Phase 0's whole behaviour: no reviews, no section, no reserved box, no "be the first to
  // review" prompt — which would be an invitation to review an order nobody can place yet.
  if (reviews.length === 0) return null;

  return (
    <Grid
      as="section"
      columns="1-aside"
      gap="2xl"
      className={`py-3xl ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-reviews
      id={REVIEWS_ANCHOR}
    >
      <Stack gap="md">
        <Label>{home("reviews.eyebrow")}</Label>
        <Display as={headingLevel} id={HEADING_ID} size="2xl">
          {home("reviews.heading")}
        </Display>
        <Text measure size="sm" tone="muted">
          {home("reviews.body")}
        </Text>
        {/*
          The Trustpilot slot: a named region with nothing in it. There is no profile, so there is
          no score, no logo and no third-party script — naming the region is what makes the empty
          space legible instead of looking like a failed widget, and the grey bar is the canvas's
          `.ph`, which is decorative and hidden from assistive technology.
        */}
        <div
          aria-label={home("reviews.trustpilotRegion")}
          className="gap-sm flex items-center"
          data-fo-reviews-trustpilot
          role="region"
        >
          <Placeholder width="lg" />
          <Text as="span" size="sm" tone="subtle">
            {home("reviews.trustpilotPending")}
          </Text>
        </div>
      </Stack>
      <Grid as="ul" columns="1-3" gap="lg">
        {reviews.map((review) => (
          <Stack
            as="li"
            gap="md"
            key={review.id}
            className="border-rule p-lg border"
            data-fo-review={review.id}
          >
            <Text measure size="md" tone="muted">
              {review.body}
            </Text>
            <Text as="span" size="xs" tone="subtle">
              {home("reviews.attribution", {
                name: review.authorFirstName,
                place: review.place,
                // A `YYYY-MM-DD` is a calendar date, not an instant: midday UTC is the one
                // hour that lands on the same calendar date in every European zone, so the
                // card cannot print the day before for a reader elsewhere. The
                // `./occasion-model.ts` precedent, for the same reason.
                date: formatDate(
                  new Date(`${review.date}T12:00:00Z`),
                  localeCode(locale),
                  // `short` and not `deliveryDate`: a review carries a **year**, because a
                  // review from two years ago that reads "Tue, 1 Sept" claims to be recent.
                  "short",
                  "UTC",
                ),
                verification: home(
                  review.kind === "order"
                    ? "reviews.verified.order"
                    : "reviews.verified.delivery",
                ),
              })}
            </Text>
          </Stack>
        ))}
      </Grid>
    </Grid>
  );
}
