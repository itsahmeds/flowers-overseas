import type { PageAnalytics as PageAnalyticsPayload } from "../page";

/**
 * The page's GA4 payload as one hidden element (spec 023 §5.2 "How payloads reach the browser";
 * TASK-492). Server-rendered from the view model, identical for every visitor, read by the
 * deferred chunk only after an analytics grant. `hidden` exposes nothing to assistive technology.
 */
export function PageAnalytics({
  payload,
}: {
  readonly payload: PageAnalyticsPayload;
}) {
  return <div data-fo-analytics={JSON.stringify(payload)} hidden />;
}
