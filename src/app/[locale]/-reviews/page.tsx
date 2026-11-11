import type { Metadata } from "next";
import type { ReactElement } from "react";

import {
  reviewsLocales,
  reviewsRouteBody,
  reviewsRouteMetadata,
} from "../reviews-route";

/**
 * `/{locale}/{reviews}` (`/en/reviews`, `/de/bewertungen`, `/pl/opinie`): the reviews page, bare
 * (spec 022a §2, §5.4, AC-24; TASK-373). `next.config.ts` rewrites the localised address here
 * (`src/lib/reviews-routes.ts`); a URL with `?page=` or `?stars=` goes to the parameter route.
 * ISR 3600, tags `reviews` and `info:reviews` (`src/lib/cache.ts`). Reads no query string and no
 * cookie, so it is one cache entry for every visitor. 404 with zero published reviews.
 */
export const revalidate = 3600;
export const dynamicParams = false;

interface ReviewsParams {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams(): { locale: string }[] {
  return reviewsLocales().map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: ReviewsParams): Promise<Metadata> {
  const { locale } = await params;
  return reviewsRouteMetadata(locale, { page: 1, stars: undefined });
}

export default async function ReviewsRoute({
  params,
}: ReviewsParams): Promise<ReactElement> {
  const { locale } = await params;
  return reviewsRouteBody(locale, { page: 1, stars: undefined });
}
