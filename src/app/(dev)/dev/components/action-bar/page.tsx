import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import { setRequestLocale } from "next-intl/server";

import { devUiEnabled } from "@/lib/env.schema";
import { documentFallbackLocale } from "@/modules/i18n";
import {
  Button,
  ConsentBanner,
  Container,
  Display,
  Eyebrow,
  Price,
  SiteFooter,
  SiteHeader,
  Stack,
  StickyActionBar,
  Text,
} from "@/modules/ui";

import { ACTION_BAR_FIXTURE } from "../catalog";

/**
 * `/dev/components/action-bar` — the sticky action bar's fixture page (spec 004 §14 A24 clause
 * 4 (a), AC-48, T-53; TASK-195).
 *
 * `StickyActionBar` is `position: fixed`, so it cannot be a state in the gallery's flow; this page
 * is its state instead: the real chrome (header, footer, the consent sheet on a first visit), a
 * selected price and the page's own action in the flow, filler long enough to scroll, and the bar
 * repeating the action and the price. The price is **one string** printed twice, the same
 * projection in the flow and in the bar, which is the shape every page that mounts the bar must
 * have. The bar's action is an in-page link to the flow's action (`#buy`), so with JavaScript off
 * nothing is lost if the bar does not show.
 *
 * `?bar=hidden` renders the bar in its hidden state, so T-53 can compare the two for CLS.
 *
 * Same gate as the gallery: a 404 unless `ENABLE_DEV_UI=true`, and `noindex`.
 */
export const metadata: Metadata = {
  title: ACTION_BAR_FIXTURE.title,
  robots: { index: false, follow: false },
};

export default async function ActionBarFixturePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly bar?: string }>;
}): Promise<ReactElement> {
  if (!devUiEnabled(process.env)) notFound();
  const locale = documentFallbackLocale().code;
  setRequestLocale(locale);
  const { bar } = await searchParams;
  const fixture = ACTION_BAR_FIXTURE;
  const fillers = Array.from(
    { length: fixture.fillerCount },
    (_, index) => index,
  );

  return (
    <>
      <SiteHeader locale={locale} />
      <Container as="main" id="main" width="page">
        <Stack gap="md" padBlock="lg">
          <Display as="h1" size="display-s">
            {fixture.title}
          </Display>
          <Text measure tone="muted">
            {fixture.intro}
          </Text>
          <Eyebrow>{fixture.eyebrow}</Eyebrow>
          <Display as="h2" size="display-s">
            {fixture.name}
          </Display>
          <div data-fo-fixture-selected-price>
            <Price
              amount={fixture.price}
              qualifier={fixture.qualifier}
              variant="page"
            />
          </div>
          <div data-fo-fixture-twin id="buy">
            <Button href="#main" size="send" variant="accent">
              {fixture.action}
            </Button>
          </div>
          {fillers.map((index) => (
            <Text key={index}>{fixture.filler}</Text>
          ))}
          <div data-fo-fixture-last>
            <Text>{fixture.last}</Text>
          </div>
        </Stack>
      </Container>
      <SiteFooter locale={locale} />
      <StickyActionBar
        hidden={bar === "hidden"}
        price={{ amount: fixture.price, caption: fixture.caption }}
      >
        <Button href="#buy" variant="accent">
          {fixture.action}
        </Button>
      </StickyActionBar>
      <ConsentBanner />
    </>
  );
}
