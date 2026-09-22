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
import { MEDIA_ORIGIN } from "./media-origin";
import { ALL_PATHS, type HeaderRule } from "./robots-headers";

/** The value every derived variant is stored with and served with. */
export const MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * The connection hint for the media origin, as a `Link` **response header** (spec 006 §2.5 "LCP",
 * AC-19; `plan/01` §7; TASK-138 round 3).
 *
 * ## Why there is a hint at all
 *
 * Moving the photographs out of `public/media/` put a **third-party** DNS lookup, TCP handshake
 * and TLS negotiation in front of the hero image, on the LCP critical path, where same-origin
 * delivery had none. CI measured the cost on the first Lighthouse run after the flip: LCP medians
 * 2 248 ms (`/en`) and 2 238 ms (`/pl`) against the 2 000 ms budget of `lighthouserc.json`, the
 * same order on `/de` and `/en-gb`, where the locale documents had been reported at 1 430-1 649 ms
 * while the bytes were same-origin. The hint starts that handshake before the document is parsed,
 * so the connection is already open when the hero preload asks for bytes over it.
 *
 * ## Why a response header and not `<link rel="preconnect">` in `<head>`
 *
 * Both in-document forms were implemented first and **measured on the rendered page**, and
 * neither can be emitted before the hero preload:
 *
 *  - A rendered `<link rel="preconnect">` is a React *hoistable*, and hoistables flush **after**
 *    `highImagePreloads` — i.e. after the `<link rel="preload" as="image">` that
 *    `modules/ui/media/MediaAsset` emits. Verified against this repository's React 19.2 with
 *    `renderToReadableStream`: the rendered link is serialised third, behind the image preload. A
 *    preconnect that arrives after the connection has already been opened by the preload buys
 *    exactly nothing, so the markup would look right and do nothing.
 *  - `preconnect()` from `react-dom`, which *does* write into the preamble's preconnect chunks
 *    ahead of every preload in plain Fizz, **never reaches the document under Next**: called from
 *    the locale layout it produces no `<link>` at all, and neither does `prefetchDNS()`, while a
 *    `preload()` call placed on the same line in the same render does appear. The `C`/`D` hints
 *    are dropped crossing the RSC boundary; only `L` survives. Measured on `/en` against
 *    `next dev`, Next 16.3.4.
 *
 * A `Link` header beats both: it is on the response itself, so the user agent starts the
 * handshake before the first byte of HTML is parsed, which is the earliest any hint can act. It
 * also puts this hint in the same `headers()` block as the CSP that allows the same origin
 * (`next.config.ts`), built from the same `MEDIA_ORIGIN` constant, so a move to a custom domain
 * stays one edit in one file. `scripts/seo/brotli-origin.ts` forwards every header on an HTML
 * document, so the hint is present in exactly the origin CI's Lighthouse measures.
 *
 * ## Why no `crossorigin`, deliberately
 *
 * A connection is reused only by a request whose credentials mode matches the mode it was opened
 * in. `crossorigin` asks for an **anonymous** connection; the `<img>` and `<source>` elements
 * `Photo` renders carry no `crossorigin` attribute, and neither does the preload descriptor in
 * `modules/ui/media/preload.ts`, so both are credentialed non-CORS fetches. An anonymous
 * connection would sit unused beside a second socket opened for the image, which is the failure
 * mode where the hint is present, well-formed and worthless. The familiar "always add
 * `crossorigin`" advice is about **fonts**, which are always CORS fetches; for a plain image it
 * is the opposite instruction. If `crossorigin` ever appears on the images or on the preload, it
 * has to appear here in the same commit — `tests/unit/media-headers.test.ts` states the rule.
 */
export const MEDIA_PRECONNECT_LINK = `<${MEDIA_ORIGIN}>; rel=preconnect`;

/**
 * The media hints in `next.config.ts`'s `headers()` shape, on `/(.*)` like every other rule here.
 * Fresh objects on every call, like `noindexHeaderRules()` and `securityHeaderRules()`.
 *
 * On every path rather than on documents only, because the alternative is a `has:`/`missing:`
 * condition that has to enumerate what a document is not. The cost of the extra ~60 bytes on a
 * subresource is nil where it is measured and nil in production: `scripts/seo/brotli-origin.ts`
 * drops every non-document header before Lighthouse weighs `resource-summary`, and production is
 * HTTP/2 behind Cloudflare, where an identical header on every response is one HPACK index.
 */
export function mediaHeaderRules(): HeaderRule[] {
  return [
    {
      source: ALL_PATHS,
      headers: [{ key: "Link", value: MEDIA_PRECONNECT_LINK }],
    },
  ];
}
