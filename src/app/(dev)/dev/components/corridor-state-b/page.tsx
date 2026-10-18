import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import { setRequestLocale } from "next-intl/server";

import { devUiEnabled } from "@/lib/env.schema";
import { corridorShopEntry } from "@/modules/catalog";
import { CorridorPage, type CorridorView, corridorView } from "@/modules/geo";
import { documentFallbackLocale } from "@/modules/i18n";

/**
 * `/dev/components/corridor-state-b` — the corridor page in its **live state**, for the e2e and
 * visual suites (spec 007 §14 A10; TASK-147).
 *
 * State B renders on no real page in Phase 0: `corridorState()` is `live` only when a florist is
 * signed, an `operations` block is authored **and** a `live` content file exists (spec 007 §13
 * Q3), and none of the three is true for any destination. So the page the visual and axe suites
 * need is built here from the real Poland guide, with exactly the terms a flip would change set
 * (the state, the imperative `h1`, the facts) and the **real** shop entry, chips included, from
 * `corridorShopEntry()` — the catalogue, the published link ids and the existence rule. Nothing
 * is mocked, and nothing here is reachable from a customer page.
 *
 * Same gate as the gallery: a 404 unless `ENABLE_DEV_UI=true`, and `noindex`.
 */
export const metadata: Metadata = {
  title: "Corridor state B fixture",
  robots: { index: false, follow: false },
};

export default async function CorridorStateBFixturePage(): Promise<ReactElement> {
  if (!devUiEnabled(process.env)) notFound();
  const locale = documentFallbackLocale().code;
  setRequestLocale(locale);
  const guide = corridorView("PL", locale, { from: "2026-09-15" });
  if (guide === undefined) throw new Error(`no ${locale} Poland guide`);
  const view: CorridorView = {
    ...guide,
    state: "live",
    h1: "Send flowers to Poland",
    stateKey: "destinations.state.deliveringNow",
    facts: {
      known: true,
      operations: {
        ianaZone: "Europe/Warsaw",
        sameDayCutoffLocal: "14:00",
        deliveryDays: [1, 2, 3, 4, 5, 6],
        sundayDelivery: "peak",
      },
      citiesKey: "destinations.pl.cities",
    },
    liveSlots: await corridorShopEntry(locale, "PL", { chips: true }),
  };
  return <CorridorPage view={view} />;
}
