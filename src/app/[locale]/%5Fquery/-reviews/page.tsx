import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import { reviewsPageQuery } from "@/modules/reviews/display";

import {
  type ReviewsRequest,
  reviewsRouteBody,
  reviewsRouteMetadata,
} from "../../reviews-route";

/**
 * `/{locale}/{reviews}?page=N` and `?stars=n`: the reviews page's parameter route (spec 022a §6
 * "Canonical and pagination", AC-24; TASK-373). Per request: `?page=N` is a real, self-canonical
 * page; `?stars=n` is `noindex,follow` and canonical to the bare URL; anything malformed and any
 * page past the last is a 404. `?page=1` never reaches here (`./first`, a 301).
 */
export const dynamic = "force-dynamic";

interface ReviewsQueryProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function requestOf(props: ReviewsQueryProps): Promise<ReviewsRequest> {
  const query = reviewsPageQuery(await props.searchParams);
  if (query.kind !== "page") notFound();
  return { page: query.page, stars: query.stars };
}

export async function generateMetadata(
  props: ReviewsQueryProps,
): Promise<Metadata> {
  const { locale } = await props.params;
  return reviewsRouteMetadata(locale, await requestOf(props));
}

export default async function ReviewsQueryRoute(
  props: ReviewsQueryProps,
): Promise<ReactElement> {
  const { locale } = await props.params;
  return reviewsRouteBody(locale, await requestOf(props));
}
