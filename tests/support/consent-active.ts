/**
 * The `consent-active` build's network fence (spec 004 §14 A-founder-2026-10-19d clause 8;
 * TASK-279). That build carries a GA4 fixture id, so its documents load the real tag URL. No
 * request may reach Google from a test: every request to `www.googletagmanager.com` and
 * `*.google-analytics.com` is aborted by route interception, and the suites assert each was
 * aborted (a `requestfailed`) and none answered (no `response`).
 */
import type { Page } from "@playwright/test";

/** The id CI builds the `consent-active` site with (`.github/workflows/ci.yml`). */
export const GA4_FIXTURE_ID = "G-FIXTURE00";

const GOOGLE =
  /^https:\/\/(www\.googletagmanager\.com|[^/]*\.google-analytics\.com)\//u;

export interface GoogleFence {
  /** Requests to a Google analytics origin that the route aborted. */
  readonly aborted: string[];
  /** Responses from one: must stay empty. */
  readonly answered: string[];
}

export async function abortGoogle(page: Page): Promise<GoogleFence> {
  const fence: GoogleFence = { aborted: [], answered: [] };
  await page.route(GOOGLE, (route) => route.abort("blockedbyclient"));
  page.on("requestfailed", (request) => {
    if (GOOGLE.test(request.url())) fence.aborted.push(request.url());
  });
  page.on("response", (response) => {
    if (GOOGLE.test(response.url())) fence.answered.push(response.url());
  });
  return fence;
}
