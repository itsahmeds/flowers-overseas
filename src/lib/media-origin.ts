/**
 * The media origin: **one constant** every image URL and the CSP that allows it are built from
 * (spec 006 §2.6 "R2 delivery", ADR-0015 "R2 for images", ADR-0016; TASK-138).
 *
 * ## Why a constant and not `R2_PUBLIC_BASE_URL`
 *
 * Both of the things that need this value are decided at **build** time, and neither of them can
 * read a server variable:
 *
 *  - Every indexable page is prerendered (`revalidate = 3600` + `generateStaticParams`), so the
 *    image URLs are written into HTML by `next build`. On Railway that build is the container
 *    build, and it runs with **no credential and no `R2_*` variable in the environment** — the
 *    CI container job fails on purpose if one is present (`.github/workflows/ci.yml`, spec 001
 *    §14 A17, spec 040 §14 A1). A loader that read `process.env.R2_PUBLIC_BASE_URL` would
 *    therefore have nothing to read exactly where the URLs are produced.
 *  - The CSP is a per-environment constant emitted from `next.config.ts`'s `headers()` and baked
 *    into the same artefact (`src/lib/csp.ts`). An origin resolved differently at build and at
 *    ISR-revalidation time would put URLs on the page that the page's own policy blocks — the
 *    one failure mode neither half can be tested into safety afterwards.
 *
 * So the origin is a committed value, like `VERCEL_LIVE_ORIGIN` and `GOOGLE_TAG_MANAGER_ORIGIN`
 * in `src/lib/csp.ts`: a public host, in the diff, where a reviewer can see it change. It is not
 * a secret — `.env.example` annotates it "not secret" and it appears in the `src` of every
 * photograph on the site. `R2_PUBLIC_BASE_URL` stays in the environment contract for the tooling
 * that writes to the bucket, and `scripts/media-upload.ts` **fails if the two disagree**, so the
 * "single configuration point" is enforced rather than merely intended.
 *
 * **Where that enforcement is not.** `R2_PUBLIC_BASE_URL` is required at runtime (`lib/env.ts`
 * refuses to boot without it) but nothing at runtime compares it to this constant — only the
 * upload script does, and only when it runs. Today that is harmless, because no request path
 * reads the variable at all: every image URL on every page comes from here, at build time. It
 * would stop being harmless the day something server-side starts building an image URL from the
 * environment, and the fix then is to make *that* read this constant rather than to add a check
 * (`/review 94` round 2 nit).
 *
 * ## The host, and why it is this one
 *
 * `media.flowersoverseas.com`, a Cloudflare **custom domain** on the `flowersoverseas-media`
 * bucket (founder action, 2026-09-22). It replaced the `pub-*.r2.dev` development URL this task
 * shipped against, and the swap was the one line below plus nothing else — which is the whole
 * reason the value is in one place. The bucket's jurisdiction still reads European Union, so
 * ADR-0015 holds; verified serving over HTTP/2 with `cache-control: public, max-age=31536000,
 * immutable` on the objects.
 *
 * Three things the move bought, in the order they matter:
 *
 *  - **`r2.dev` is rate-limited and Cloudflare does not recommend it for production traffic.**
 *    That ceiling is gone.
 *  - **It is on the site's own Cloudflare zone**, so the handshake the hero image waits for is
 *    cheaper than a handshake to a third-party edge — see `src/lib/media-headers.ts` for the LCP
 *    measurement that made this urgent.
 *  - **`img-src` names a subdomain of our own site** instead of an unrelated third party, which
 *    is what ADR-0016 prefers. It is still a *separate origin*, so it is still a cross-origin
 *    fetch and the `preconnect` hint is still correct.
 *
 * **Still open:** the bucket's `r2.dev` public development URL serves the same objects and is
 * still enabled. Two front doors to the same bytes, one of them rate-limited and unwatched, is a
 * thing to close — a founder action in the Cloudflare dashboard, recommended in
 * `docs/tasks/TASK-138.md` and `docs/runbooks/imagery.md`, not taken here.
 */

/**
 * Where derived image variants are served from. No trailing slash: a URL is
 * `${MEDIA_ORIGIN}/${objectKey}` and the separator belongs to the join, not to the origin.
 */
export const MEDIA_ORIGIN = "https://media.flowersoverseas.com";

/**
 * The URL of one stored object, from the **manifest's own** `objectKey`
 * (`seed/data/media-variants.json`). The key is passed in and never derived here: a second key
 * convention in the loader is how a URL and the object it addresses drift apart, and a 404 on a
 * variant is a photograph that silently becomes a placeholder.
 *
 * It throws on a key it would otherwise have to repair. A leading slash would produce a double
 * slash that R2 treats as a different (absent) key, and an empty key would address the bucket
 * root; both are bugs in the caller, and quietly fixing either would hide the bug behind an image
 * that loads until the day it does not.
 */
export function mediaUrl(objectKey: string): string {
  if (objectKey === "" || objectKey.startsWith("/")) {
    throw new Error(
      `object key \`${objectKey}\` is not a stored key: keys come from the variant manifest and have no leading slash (spec 006 §2.6)`,
    );
  }
  return `${MEDIA_ORIGIN}/${objectKey}`;
}
