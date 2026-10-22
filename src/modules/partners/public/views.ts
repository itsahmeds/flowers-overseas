/**
 * The florists' public pages as view models (spec 011 §2, §5.4; TASK-210): the content file's view
 * from `infoPageView()`, the payout example resolved through the catalogue, and the example order
 * from `exampleFloristOrderView()`. Asynchronous because the catalogue's read API is; the
 * components that render them are synchronous server components with no client JavaScript.
 *
 * No cookie, header, clock or database: every visitor gets the same page, built once per ISR
 * window.
 */
import { infoPageView } from "@/modules/content";

import { exampleFloristOrderView } from "../ui/inbox/example.ts";
import { localeCode } from "../ui/inbox/format.ts";
import type { FloristsLandingView } from "../ui/public/FloristsLanding.tsx";
import type { WalkthroughView } from "../ui/public/FloristsWalkthrough.tsx";

import { payoutExampleView } from "./payout.ts";

/** The landing's view, or `undefined` where the landing does not exist in this locale (404). */
export async function floristsLandingView(
  locale: string,
): Promise<FloristsLandingView | undefined> {
  const page = infoPageView("for-florists", locale);
  if (page === undefined) return undefined;
  return {
    page,
    payout: await payoutExampleView(locale),
    example: await exampleFloristOrderView(localeCode(locale), "offer"),
  };
}

/** The walkthrough's view, or `undefined` where it does not exist in this locale (404). */
export async function walkthroughView(
  locale: string,
): Promise<WalkthroughView | undefined> {
  const page = infoPageView("how-orders-work", locale);
  if (page === undefined) return undefined;
  return {
    page,
    offer: await exampleFloristOrderView(localeCode(locale), "offer"),
    accepted: await exampleFloristOrderView(localeCode(locale), "accepted"),
  };
}
