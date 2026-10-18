/**
 * Case-variant URLs never poison the page cache (spec 003 §6 "Canonical": exactly one URL form
 * per (locale, path), unknown case 404s; spec 007 §2 "Canonical", §5 "parsed, never redirected";
 * TASK-247, QA-2 N-01).
 *
 * The defect lived in the cache files, not in the router: on a case-insensitive volume a request
 * for `/EN` read the prerender of `/en`, and the 404 Next then regenerated for the variant was
 * written into `/en`'s own files, so the real page answered 404 to every later visitor until the
 * build was rebuilt. `src/lib/cache-key-case.ts` keeps every key to its own file.
 *
 * The order of this file is the point: **the real pages, then every variant twice with a pause
 * long enough for the variant's one-second revalidation to run, then the real pages again.** On
 * the old code against a local macOS build whose prerenders are past their revalidate window
 * (the state of any server up for an hour; `touch -A -020000` on `.next/server/app` reproduces
 * it), the first variant request answers 200 with the real page and the regenerated 404 is
 * written into the real page's scoped entry. On case-sensitive Linux (CI, Railway) the files
 * never collided and the whole file holds either way, which is the behaviour the fix makes
 * universal. Unlike the per-page variant cases elsewhere, nothing
 * here is skipped on a Mac: this file is the one that must run where the defect lived.
 */
import { expect, test } from "@playwright/test";

/** One real page per page type, with the case variants QA-2 N-01 used and a few more. */
const PAGES: readonly { page: string; variants: readonly string[] }[] = [
  { page: "/en", variants: ["/EN", "/En"] },
  { page: "/en-gb", variants: ["/EN-GB", "/en-GB"] },
  { page: "/en/occasions", variants: ["/en/Occasions", "/EN/occasions"] },
  {
    page: "/en/occasions/mothers-day",
    variants: ["/en/occasions/Mothers-Day"],
  },
  { page: "/en/send-flowers-to", variants: ["/en/Send-Flowers-To"] },
  {
    page: "/en/send-flowers-to/poland",
    variants: ["/en/send-flowers-to/POLAND"],
  },
  { page: "/en/poland/flowers", variants: ["/en/Poland/flowers"] },
  { page: "/en/flowers/roses", variants: ["/en/flowers/Roses"] },
  {
    page: "/en/poland/product/amber-hour",
    variants: [
      "/en/poland/product/AMBER-HOUR",
      "/en/Poland/product/amber-hour",
    ],
  },
];

function titleOf(html: string): string | undefined {
  return /<title>([^<]*)<\/title>/u.exec(html)?.[1];
}

/**
 * The `noindex` Next writes into a not-found document and into no other (`app-render.js`). The
 * exact form matters: every page outside production also carries `noindex,nofollow` and an
 * `X-Robots-Tag`, so a looser check would pass on the real page served under a second URL.
 */
const NOT_FOUND_ROBOTS = /<meta name="robots" content="noindex"\s*\/?>/u;

const pause = (ms: number): Promise<void> =>
  new Promise((done) => setTimeout(done, ms));

test("case variants answer 404 every time and the lowercase pages keep their own content (TASK-247)", async ({
  request,
}) => {
  test.setTimeout(120_000);
  /** The `<title>` each variant was answered with, per real page. */
  const variantTitles = new Map<string, Set<string | undefined>>();

  // The real pages first, twice, with a pause: a page past its revalidate window is regenerated in
  // the background into its scoped route-cache entry, which is the file a variant collided with.
  for (const visit of [1, 2]) {
    for (const { page } of PAGES) {
      const response = await request.get(page, { maxRedirects: 0 });
      expect(response.status(), `${page} (before, visit ${visit})`).toBe(200);
    }
    await pause(1_500);
  }

  // Two rounds, 1.5 s apart: Next treats a key it did not prerender as revalidate-after-one-second,
  // so the second round reads whatever the first round's regeneration wrote.
  for (const round of [1, 2]) {
    for (const { page, variants } of PAGES) {
      for (const variant of variants) {
        const response = await request.get(variant, { maxRedirects: 0 });
        const html = await response.text();
        const at = `${variant} (round ${round})`;
        expect(response.status(), at).toBe(404);
        // ADR-0006: parsed, never redirected; a 404, not a case-fixing 3xx.
        expect(response.headers()["location"], at).toBeUndefined();
        expect(html, `${at} is the noindex 404 document`).toMatch(
          NOT_FOUND_ROBOTS,
        );
        const titles = variantTitles.get(page) ?? new Set();
        titles.add(titleOf(html));
        variantTitles.set(page, titles);
      }
    }
    if (round === 1) await pause(1_500);
  }

  for (const { page } of PAGES) {
    for (const visit of [1, 2]) {
      const response = await request.get(page, { maxRedirects: 0 });
      const html = await response.text();
      const at = `${page} (visit ${visit}, after its variants)`;
      expect(response.status(), at).toBe(200);
      const title = titleOf(html);
      expect(title, at).toBeDefined();
      expect(html, at).not.toMatch(NOT_FOUND_ROBOTS);
      // The variants were the not-found document, not this page under a second URL, and this
      // page is not the not-found document the variants were answered with.
      expect([...(variantTitles.get(page) ?? [])], at).not.toContain(title);
    }
  }
});
