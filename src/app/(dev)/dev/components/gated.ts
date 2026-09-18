/**
 * The fake providers `/dev/components` renders the three data-gated sections' populated branches
 * with (spec 004 §5.3 "`/dev/components` — flag-on gallery", AC-28; TASK-054).
 *
 * They exist because two of the three sections render **nothing** on every Phase-0 page, so the
 * gallery is the only surface where their populated branch can be looked at, screenshotted and
 * run through axe. They are passed as the sections' `provider` prop, which mutates no module
 * state inside a request — the rule `MediaAsset`'s `manifest` prop set (spec 006 §5.3) — so
 * nothing here can leak onto `/{locale}`.
 *
 * **The review fixtures say, in their own text, that they are fixtures.** The founder's
 * 2026-09-08 ruling is that reviews are real-only and never seeded, and AC-15 forbids a
 * testimonial on a rendered page; a plausible-looking invented quotation sitting in the repo is
 * exactly the thing that ends up on a marketing page one day. So the quotation is a sentence
 * about the fixture, the name is `Fixture`, and no part of it could be mistaken for a buyer.
 *
 * This file is a route-private module of the `(dev)` group: nothing outside `src/app/(dev)/`
 * imports it, and `ENABLE_DEV_UI` is `false` in production (the env schema fails the build
 * otherwise), so none of it is reachable from a real page.
 */
import type { DestinationStatusProvider } from "@/modules/ui";
import type { ReviewsProvider, TrendingProvider } from "@/modules/ui";
import {
  destinationStatusProviderOf,
  reviewsProviderOf,
  trendingProviderOf,
} from "@/modules/ui";

import { COUNTRIES } from "@/config/countries";
import { localePath } from "@/modules/i18n";

/** The picks, ranked by real orders — the branch spec 008/016 reaches. */
export const GALLERY_TRENDING_RANKED: TrendingProvider = trendingProviderOf(
  [
    { id: "gallery-1", name: "Amber Hour", assetId: "fo-bq-001-hero" },
    { id: "gallery-2", name: "Vistula Red", assetId: "fo-bq-002-hero" },
    { id: "gallery-3", name: "Baltic Dawn", assetId: "fo-bq-003-hero" },
    { id: "gallery-4", name: "Quiet Blush", assetId: "fo-bq-004-hero" },
    { id: "gallery-5", name: "Northern Light", assetId: "fo-bq-005-hero" },
  ],
  "orders",
);

/** A provider with nothing in it: the section is absent, not empty. */
export const GALLERY_TRENDING_EMPTY: TrendingProvider = trendingProviderOf([]);

/** Reviews that announce themselves as fixtures — see the header. */
export const GALLERY_REVIEWS: ReviewsProvider = reviewsProviderOf([
  {
    id: "fixture-1",
    body: "Fixture text, not a review. It is here so the gallery can show what the section looks like once a completed order produces a real one.",
    authorFirstName: "Fixture",
    place: "Warszawa",
    date: "2026-09-01",
    kind: "order",
  },
  {
    id: "fixture-2",
    body: "Fixture text, not a review. Nothing on a customer-facing page renders from this file.",
    authorFirstName: "Fixture",
    place: "Kraków",
    date: "2026-09-02",
    kind: "delivery",
  },
  {
    id: "fixture-3",
    body: "Fixture text, not a review. The shipped provider is a constant empty list.",
    authorFirstName: "Fixture",
    place: "Gdańsk",
    date: "2026-09-03",
    kind: "order",
  },
]);

/**
 * The destination set with only Poland's corridor page linked — the gallery's "one published
 * destination" state. It is built from the shipped registry rather than from a hand-written
 * country, so the projection under test is the real one. The resolver returns the *path* since
 * TASK-092, because a corridor URL carries a per-locale slug (spec 007 AC-20).
 */
export const GALLERY_DESTINATIONS_PUBLISHED: DestinationStatusProvider =
  destinationStatusProviderOf(COUNTRIES, (iso2, locale) =>
    iso2 === "PL" ? localePath(locale, "destinations", "poland") : undefined,
  );
