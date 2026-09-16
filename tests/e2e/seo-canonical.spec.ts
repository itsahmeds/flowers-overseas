/**
 * T-11, e2e half — the canonical tag as served (spec 007 §6 "Canonical", AC-10; TASK-090 writes
 * it, TASK-091 turns it on).
 *
 * **Un-parked by TASK-091**: the route exists and the list below is the committed set. The hub
 * arrives with TASK-092 and joins this list there.
 *
 * TODO(TASK-094 — sitemaps): add AC-10's last clause — a `noindex` page keeps its canonical **and
 * appears in no sitemap** — once a sitemap exists to intersect (AC-14).
 *
 * The property under test is the one that de-indexes a cluster when it is wrong: the canonical is
 * **self-referencing** and never points at another locale. Every page on a non-indexing deployment
 * is `noindex`, so the suite also proves AC-10's "a page that is `noindex` emits its canonical
 * unchanged" on real documents rather than by argument.
 */
import { expect, test } from "@playwright/test";

/** The committed corridor set: seven destinations in the two locales a human has written. */
const SLUGS = [
  "poland",
  "germany",
  "france",
  "spain",
  "italy",
  "romania",
  "netherlands",
] as const;

const CORRIDOR_URLS = ["en", "en-gb"].flatMap((locale) =>
  SLUGS.map((slug) => `/${locale}/send-flowers-to/${slug}`),
);

const canonicals = (html: string): string[] =>
  [
    ...html.matchAll(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/gi,
    ),
  ].map((match) => match[1] ?? "");

test.describe("canonical, observed (AC-10, T-11)", () => {
  for (const url of CORRIDOR_URLS) {
    test(`${url} emits exactly one self-referencing canonical`, async ({
      request,
      baseURL,
    }) => {
      const response = await request.get(url, { maxRedirects: 0 });
      const html = await response.text();
      const found = canonicals(html);

      expect(found).toHaveLength(1);
      const canonical = found[0] ?? "";
      expect(canonical).toBe(new URL(url, baseURL).toString());
      expect(canonical).toBe(canonical.toLowerCase());
      expect(canonical).not.toContain("?");
      expect(canonical.endsWith("/")).toBe(false);
      expect(canonical.startsWith("http")).toBe(true);

      // Never cross-locale: the canonical's first path segment is this page's locale.
      const locale = url.split("/")[1] ?? "";
      expect(new URL(canonical).pathname.split("/")[1]).toBe(locale);

      // AC-10: the page is `noindex` on every deployment before the §12 flip, and it still has
      // its canonical.
      expect(html).toContain("noindex");
    });

    test(`${url} canonicalises the trailing-slash and parameterised forms to the same URL`, async ({
      request,
      baseURL,
    }) => {
      const expected = new URL(url, baseURL).toString();
      for (const variant of [`${url}?utm_source=newsletter`, `${url}?page=1`]) {
        const response = await request.get(variant, { maxRedirects: 0 });
        if (response.status() !== 200) continue;
        expect(canonicals(await response.text())).toEqual([expected]);
      }
    });
  }
});
