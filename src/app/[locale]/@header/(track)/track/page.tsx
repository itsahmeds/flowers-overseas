import type { ReactElement } from "react";

import TrackHeader from "./[token]/page";

/**
 * @purpose Tracking lookup header
 * @spec 018
 *
 * The header of `/{locale}/track`, the lookup (spec 018 §5.3; `track-order-*.dc.html`, "the
 * lookup"; TASK-339): the same quiet header as the tracking page, the logo and, from `md`, "Help &
 * WhatsApp" with the number.
 */
export default function TrackLookupHeader({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  return TrackHeader({ params });
}
