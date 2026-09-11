/**
 * `Cache-Control` for the image space (spec 006 §2.5 "Cache headers", §5.4; TASK-079).
 *
 * > `/media/*` is served `public, max-age=31536000, immutable`. Variant URLs never mutate; a new
 * > image is a new asset version. This is the only new response-header change in the spec.
 *
 * `immutable` is a promise, and the thing that makes it keepable is `staticVariantLoader`'s URL
 * shape: `/media/{assetId}/{width}.{fmt}`, content-addressed by asset **version** and width. A
 * changed photograph is a new asset id, never the same URL with new bytes — so a year-long cache
 * can never serve a stale image, and a client that has one has the right one.
 *
 * Factored out of `next.config.ts` for the same reason `robots-headers.ts` was: the config calls
 * `assertEnv()` at import time, so a rule asserted from that module cannot be unit-tested without
 * a valid environment. `tests/unit/media-headers.test.ts` asserts this one as a whole string.
 *
 * **Why there is no e2e assertion yet.** No bytes are committed under `public/media/` until
 * TASK-080, and Next answers a **404** in this space with its own
 * `private, no-cache, no-store` — correctly, since a missing file must not be cached for a year.
 * Measured locally against `pnpm start` with a throwaway file present: `200` +
 * `public, max-age=31536000, immutable`. The e2e assertion belongs in the PR that commits the
 * first variant, so it cannot pass for the wrong reason.
 *
 * **Crawlability, recorded here because this is where the path is written:** when spec 007 lifts
 * `Disallow: /`, `/media/*` — and later the R2 public host — **must stay crawlable**. Google
 * cannot index or even fetch the images it evaluates for Core Web Vitals if the image space is
 * disallowed, and blocking it is the classic own-goal (spec 006 §6). The requirement is carried
 * for 007 in `docs/runbooks/imagery.md` (TASK-081).
 */
import type { HeaderRule } from "./robots-headers.ts";

/** The static image space, in Next's header-source syntax. */
export const MEDIA_PATHS = "/media/:path*";

export const MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Fresh objects on every call, matching `noindexHeaderRules()`. */
export function mediaCacheHeaderRules(): HeaderRule[] {
  return [
    {
      source: MEDIA_PATHS,
      headers: [{ key: "Cache-Control", value: MEDIA_CACHE_CONTROL }],
    },
  ];
}
