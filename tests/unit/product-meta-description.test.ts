/**
 * **The product page's meta description is N1, verbatim** (spec 004 §14 A23 clause 12, AC-38;
 * TASK-193 escalation E1, accepted 2026-10-05; `/break 194` round 1 HOLE 1).
 *
 * `generateMetadata` for a product URL writes `shop.root.demoNotice` as `<meta name="description">`.
 * `tests/unit/product-route.test.tsx` mocks `getTranslations` to echo the key, so a renamed or
 * reworded key passed there. Here the route reads the real catalogue through next-intl's own
 * translator, and the case asserts the one value: the founder-approved N1 text.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const catalogues: Record<string, Record<string, unknown>> = {
  en: JSON.parse(
    readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8"),
  ) as Record<string, unknown>,
};

vi.mock("next-intl/server", () => ({
  setRequestLocale: (): void => undefined,
  getTranslations: ({
    locale,
    namespace,
  }: {
    readonly locale: string;
    readonly namespace?: string;
  }): Promise<unknown> =>
    Promise.resolve(
      createTranslator({
        locale,
        messages: catalogues[locale] ?? {},
        ...(namespace === undefined ? {} : { namespace }),
      } as Parameters<typeof createTranslator>[0]),
    ),
}));

const route =
  await import("../../src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx");

/** N1, spec 004 §14 A23 clause 12, byte for byte. */
const N1 =
  "Ordering opens soon. Every price here is the price you will pay, with VAT and delivery included.";

describe("the product page's meta description (E1, HOLE 1)", () => {
  // `canonicalFor` needs an absolute base, as on any deployment.
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://flowersoverseas.com");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  for (const segment of ["poland", "germany"] as const) {
    it(`is N1 exactly on /en/${segment}/product/amber-hour`, async () => {
      const metadata = await route.generateMetadata({
        params: Promise.resolve({
          locale: "en",
          segment,
          child: "product",
          grandchild: "amber-hour",
        }),
      });
      expect(metadata.description).toBe(N1);
    });
  }
});
