/**
 * `Cache-Control` for the image space (spec 006 §2.5 "Cache headers", §5.4; TASK-079, moved onto
 * the objects themselves by TASK-138).
 *
 * > `/media/*` is served `public, max-age=31536000, immutable`. Variant URLs never mutate; a new
 * > image is a new asset version.
 *
 * **Where the header comes from changed; the header did not.** Until TASK-138 the derived bytes
 * were committed under `public/media/` and Next sent this value from a `headers()` rule in
 * `next.config.ts`. The bytes are now objects in `flowersoverseas-media` and the application
 * serves no image at all, so the rule went with the files and the value is written **onto each
 * object** by `scripts/media-upload.ts` (`Cache-Control` is stored metadata in R2 and is returned
 * on every GET of the object). One constant, one place, still asserted as a whole string by
 * `tests/unit/media-headers.test.ts` — and now checkable against a real response, which the old
 * rule never was, because a 404 in that space correctly answered `no-store` and there were no
 * bytes to ask for.
 *
 * `immutable` is a promise, and the thing that makes it keepable is the object key:
 * `media/{assetId}/{width}.{fmt}`, content-addressed by asset **version** and width. A changed
 * photograph is a new asset id, never the same key with new bytes — so a year-long cache can
 * never serve a stale image, and a client that has one has the right one.
 *
 * **Crawlability, recorded here because this is where the cache promise is written:** when spec
 * 007 lifts `Disallow: /`, the image origin must stay crawlable, or Google cannot fetch the
 * images it evaluates for Core Web Vitals. That requirement moved to the bucket's public host
 * along with the bytes (`src/lib/media-origin.ts`, `docs/runbooks/imagery.md`, spec 006 §6).
 */

/** The value every derived variant is stored with and served with. */
export const MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";
