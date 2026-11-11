/**
 * `page_location` and `page_referrer` as GA4 may see them (spec 023 §5.2 "Location sanitising",
 * AC-7; TASK-492). Pure and dependency-light: the deferred chunk runs it in the browser and the
 * unit table runs it in Node.
 *
 *  - origin plus path, every parameter segment of a private route (`src/config/analytics.ts`)
 *    replaced by its name: `/en-gb/track/:token`, `/r/:code`;
 *  - the query string keeps only `ALLOWED_QUERY_KEYS` (`step` and the five `utm_*` keys), so an
 *    `email=` or a search `q=` never leaves the browser;
 *  - no fragment.
 *
 * It absorbs spec 018 §8's rewrite rule and the bootstrap's former token and search rewrites.
 */
import { ALLOWED_QUERY_KEYS, PRIVATE_ROUTES } from "@/config/analytics";

function privatePath(segments: string[]): boolean {
  let hit = false;
  for (const route of PRIVATE_ROUTES) {
    for (let start = 0; start + route.length <= segments.length; start++) {
      if (
        route.every(
          (part, offset) =>
            part.startsWith(":") || part === segments[start + offset],
        )
      ) {
        route.forEach((part, offset) => {
          if (part.startsWith(":")) segments[start + offset] = part;
        });
        hit = true;
      }
    }
  }
  return hit;
}

/** Whether a URL is on a private route (its title is then replaced by the `page_type`). */
export function isPrivateLocation(url: string): boolean {
  return privatePath(new URL(url).pathname.split("/"));
}

/** The sanitised `page_location` for an absolute URL. */
export function sanitisePageLocation(url: string): string {
  const parsed = new URL(url);
  const segments = parsed.pathname.split("/");
  privatePath(segments);
  const kept = new URLSearchParams();
  parsed.searchParams.forEach((value, key) => {
    if (ALLOWED_QUERY_KEYS.includes(key)) kept.append(key, value);
  });
  const query = kept.toString();
  return `${parsed.origin}${segments.join("/")}${query === "" ? "" : `?${query}`}`;
}

/**
 * The sanitised `page_referrer`: a same-origin referrer by the same rule, a cross-origin one as
 * the browser sent it (our `Referrer-Policy` already trims ours), an empty one as empty.
 */
export function sanitiseReferrer(referrer: string, origin: string): string {
  if (referrer === "") return "";
  try {
    return new URL(referrer).origin === origin
      ? sanitisePageLocation(referrer)
      : referrer;
  } catch {
    return "";
  }
}
