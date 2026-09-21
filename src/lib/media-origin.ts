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
 * ## The `r2.dev` risk, stated rather than hidden
 *
 * The configured host is a `pub-*.r2.dev` development URL. Cloudflare rate-limits `r2.dev` and
 * does not recommend it for production traffic, and it puts a third-party origin into `img-src`
 * against ADR-0016's preference for the shortest possible allowlist. **A custom domain
 * (`media.flowersoverseas.com`) is a founder action**; when it exists, this one line changes, the
 * CSP string changes with it, and nothing else does — which is the whole reason the value is in
 * one place. Recorded in `docs/tasks/TASK-138.md` and `docs/runbooks/imagery.md`.
 */

/**
 * Where derived image variants are served from. No trailing slash: a URL is
 * `${MEDIA_ORIGIN}/${objectKey}` and the separator belongs to the join, not to the origin.
 */
export const MEDIA_ORIGIN =
  "https://pub-92d8bd7f38564349a725f321388b8c9c.r2.dev";

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
