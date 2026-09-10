/**
 * `MediaAsset`: the loader seam, the honesty gate and the single LCP candidate
 * (spec 006 §2.5, **AC-2** / **AC-18** / **AC-19**, T-02 / T-18 / T-19; TASK-079).
 *
 * Rendered with `react-dom/server` against the **real** `messages/*.json` through the same
 * provider the document layout uses (the pattern of `tests/unit/ui-home.test.tsx`), so the
 * placeholder's caption asserted here is the caption that ships.
 *
 * The manifest is the fixture of `./support/media-fixture.ts` — the committed dataset plus the
 * variants and alt text the founder's imagery will add (TASK-080) — installed through the
 * module's own `setMediaManifest()`. Every assertion below is therefore about the shipped code
 * path, and the three columns of AC-18 are exercised in the state that will actually occur.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import { loadMessages } from "../../src/modules/i18n";
import { MediaAsset } from "../../src/modules/ui/media/MediaAsset.tsx";
import {
  type VariantLoader,
  setVariantLoader,
  staticVariantLoader,
} from "../../src/modules/ui/media/loader.ts";
import {
  committedMediaManifest,
  setMediaManifest,
} from "../../src/modules/ui/media/manifest.ts";
import {
  MEDIA_PRELOAD_MARKER,
  assertSinglePriority,
} from "../../src/modules/ui/media/preload.ts";
import {
  BAND_ASSET,
  FIXTURE_ALT,
  PRODUCT_ASSET,
  SECOND_PRODUCT_ASSET,
  mediaFixture,
} from "./support/media-fixture.ts";
import type { MediaFixtureOptions } from "./support/media-fixture.ts";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

/**
 * AC-19's page-level assertion, written once and used in both directions: it passes on a page
 * with one `priority` image and throws on a page with two.
 */
function expectOneImagePreload(html: string): void {
  expect(html.match(new RegExp(MEDIA_PRELOAD_MARKER, "g")) ?? []).toHaveLength(
    1,
  );
}

function render(node: React.ReactElement, locale = "en"): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, ["media", "a11y"])}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

/** Render with a fixture manifest installed for the duration of the render. */
function withManifest(
  node: React.ReactElement,
  options: MediaFixtureOptions = {},
  locale = "en",
): string {
  setMediaManifest(mediaFixture(options));
  return render(node, locale);
}

/** Every `srcset`/`imagesrcset` URL in the markup, in document order. */
function urls(html: string): string[] {
  return [...html.matchAll(/(?:srcSet|srcset|imagesrcset)="([^"]+)"/gi)]
    .flatMap((match) => (match[1] ?? "").split(","))
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? "")
    .filter((url) => url !== "");
}

afterEach(() => {
  setMediaManifest(committedMediaManifest);
  setVariantLoader(staticVariantLoader);
});

describe("AC-18: an `<img>` only when approved, with variants and with alt (T-18)", () => {
  it("renders the photograph when all three hold", () => {
    const html = withManifest(
      <MediaAsset assetId={PRODUCT_ASSET} locale="en" />,
    );

    expect(html).toContain("<img");
    expect(html).toContain(`alt="${FIXTURE_ALT.en ?? ""}"`);
    expect(html).toContain('type="image/avif"');
    expect(html).toContain('data-fo-media-source="ai"');
    expect(html).not.toContain("Photography to supply");
  });

  it("renders the captioned placeholder and no `<img>` when the asset is unapproved", () => {
    const html = withManifest(
      <MediaAsset assetId={PRODUCT_ASSET} locale="en" />,
      {
        unapproved: true,
      },
    );

    expect(html).not.toContain("<img");
    expect(html).not.toContain("srcset");
    expect(html).toContain('data-fo-media-placeholder="unapproved"');
    expect(html).toContain("Photography to supply");
  });

  it("renders the placeholder and no `<img>` when no variant has been derived", () => {
    const html = withManifest(
      <MediaAsset assetId={PRODUCT_ASSET} locale="en" />,
      {
        withoutVariants: true,
      },
    );

    expect(html).not.toContain("<img");
    expect(html).toContain('data-fo-media-placeholder="noVariants"');
  });

  it("renders the placeholder on a Polish page when only English alt exists", () => {
    const html = withManifest(
      <MediaAsset assetId={PRODUCT_ASSET} locale="pl" />,
      { altLocales: ["en"] },
      "pl",
    );

    // The whole point of AC-18: a missing Polish alt degrades to an honest box, never to an
    // English alt on a Polish page (WCAG 1.1.1 + 3.1.2).
    expect(html).not.toContain("<img");
    expect(html).toContain('data-fo-media-placeholder="noAlt"');
    expect(html).not.toContain(FIXTURE_ALT.en ?? "");
  });

  it("refuses an empty alt on a product image rather than treating it as decorative", () => {
    const html = withManifest(
      <MediaAsset assetId={PRODUCT_ASSET} locale="en" />,
      {
        alt: "",
      },
    );

    expect(html).not.toContain("<img");
    expect(html).toContain('data-fo-media-placeholder="noAlt"');
  });

  it("refuses an alt that merely repeats the product name", () => {
    const html = withManifest(
      <MediaAsset
        assetId={PRODUCT_ASSET}
        locale="en"
        productName="Amber Hour"
      />,
      { alt: "Amber Hour" },
    );

    expect(html).not.toContain("<img");
    expect(html).toContain('data-fo-media-placeholder="altRepeatsProductName"');
  });

  it("renders the placeholder for an asset that is not in the manifest at all", () => {
    const html = withManifest(<MediaAsset assetId="fo-nope" locale="en" />);
    expect(html).toContain('data-fo-media-placeholder="unknownAsset"');
  });

  it("takes `alt` from the data by identity — nothing is generated at render", () => {
    const html = withManifest(
      <MediaAsset assetId={PRODUCT_ASSET} locale="de" />,
      {},
      "de",
    );
    expect(html).toContain(`alt="${FIXTURE_ALT.de ?? ""}"`);
  });

  it("reserves the same aspect box in both states, so the swap costs no layout shift", () => {
    const image = withManifest(
      <MediaAsset assetId={PRODUCT_ASSET} locale="en" />,
    );
    const placeholder = withManifest(
      <MediaAsset assetId={PRODUCT_ASSET} locale="en" />,
      { withoutVariants: true },
    );

    expect(image).toContain("aspect-[3/4]");
    expect(placeholder).toContain("aspect-[3/4]");
  });

  it("carries the slot's `sizes`, lazy loading and async decoding below the fold", () => {
    const html = withManifest(
      <MediaAsset assetId={PRODUCT_ASSET} locale="en" />,
    );

    expect(html).toContain('sizes="(min-width: 768px) 25vw, 50vw"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    // React writes these attributes in its own casing; HTML attribute names are
    // case-insensitive, so every assertion on them is too.
    expect(html).not.toMatch(/fetchpriority="high"/i);
  });

  it("offers AVIF first and WebP as the fallback ladder (§2.5)", () => {
    const html = withManifest(
      <MediaAsset assetId={PRODUCT_ASSET} locale="en" />,
    );
    const avif = html.indexOf('type="image/avif"');
    const img = html.indexOf("<img");

    expect(avif).toBeGreaterThan(-1);
    expect(avif).toBeLessThan(img);
    // The WebP ladder is the `<img>`'s own `srcset`, so no ladder is written twice.
    expect(html).toMatch(/<img[^>]+srcSet="[^"]*\.webp/i);
    expect(html).toMatch(/<img[^>]+src="[^"]*\.webp"/i);
  });

  it("never mirrors a photograph in RTL (§7)", () => {
    const html = withManifest(
      <MediaAsset assetId={PRODUCT_ASSET} locale="en" />,
    );
    expect(html).not.toContain("mirror-in-rtl");
  });
});

describe("AC-2: the loader is the only thing that knows a URL (T-02)", () => {
  it("addresses the committed bytes as `/media/{assetId}/{width}.{fmt}`", () => {
    const html = withManifest(
      <MediaAsset assetId={PRODUCT_ASSET} locale="en" />,
    );
    expect(urls(html).every((url) => url.startsWith("/media/"))).toBe(true);
    expect(urls(html)).toContain(`/media/${PRODUCT_ASSET}/640.avif`);
  });

  it("changes **every** rendered URL when a fake loader is installed, with no call-site change", () => {
    const before = urls(
      withManifest(
        <MediaAsset assetId={PRODUCT_ASSET} locale="en" priority={false} />,
      ),
    );

    const fake: VariantLoader = ({ objectKey }) =>
      `https://media.example.test/${objectKey}`;
    setVariantLoader(fake);
    const after = urls(
      withManifest(<MediaAsset assetId={PRODUCT_ASSET} locale="en" />),
    );

    expect(before.length).toBeGreaterThan(0);
    expect(after).toHaveLength(before.length);
    expect(
      after.every((url) => url.startsWith("https://media.example.test/")),
    ).toBe(true);
    for (const url of after) expect(before).not.toContain(url);
  });

  it("swaps the preload's URLs with the same call, so the two cannot disagree", () => {
    setVariantLoader(({ objectKey }) => `https://r2.example.test/${objectKey}`);
    const html = withManifest(
      <MediaAsset assetId={BAND_ASSET} locale="en" priority />,
    );

    const imageSrcSet = /imagesrcset="([^"]+)"/i.exec(html)?.[1] ?? "";
    const sourceSrcSet = /<source[^>]+srcSet="([^"]+)"/i.exec(html)?.[1] ?? "";
    expect(imageSrcSet).not.toBe("");
    expect(imageSrcSet).toBe(sourceSrcSet);
  });

  it("returns the loader it replaced, so a caller can restore it", () => {
    const previous = setVariantLoader(() => "x");
    expect(previous).toBe(staticVariantLoader);
  });
});

describe("AC-19: one `priority` image and its matching preload (T-19)", () => {
  it("emits the preload from the same lookup as the `srcset`, byte for byte", () => {
    const html = withManifest(
      <MediaAsset assetId={BAND_ASSET} locale="en" priority />,
    );

    const imageSrcSet = /imagesrcset="([^"]+)"/i.exec(html)?.[1];
    const imageSizes = /imagesizes="([^"]+)"/i.exec(html)?.[1];
    const sourceSrcSet = /<source[^>]+srcSet="([^"]+)"/i.exec(html)?.[1];
    const imgSizes = /<img[^>]+sizes="([^"]+)"/i.exec(html)?.[1];

    expect(imageSrcSet).toBe(sourceSrcSet);
    expect(imageSizes).toBe(imgSizes);
    expect(imageSizes).toBe("100vw");
    expect(html).toContain('rel="preload"');
    expect(html).toContain('as="image"');
    expect(html).toContain('type="image/avif"');
  });

  it("loads the LCP candidate eagerly at high priority, and nothing else does", () => {
    const priority = withManifest(
      <MediaAsset assetId={BAND_ASSET} locale="en" priority />,
    );
    const lazy = withManifest(<MediaAsset assetId={BAND_ASSET} locale="en" />);

    expect(priority).toContain('loading="eager"');
    expect(priority).toMatch(/fetchpriority="high"/i);
    expect(lazy).toContain('loading="lazy"');
    expect(lazy).not.toContain('rel="preload"');
    expect(lazy).not.toContain("data-fo-media-preload");
  });

  it("counts exactly one image preload on a page with one `priority` candidate", () => {
    setMediaManifest(mediaFixture());
    const page = render(
      <main>
        <MediaAsset assetId={BAND_ASSET} locale="en" priority />
        <MediaAsset assetId={PRODUCT_ASSET} locale="en" />
        <MediaAsset assetId={SECOND_PRODUCT_ASSET} locale="en" />
      </main>,
    );

    expect(() => {
      expectOneImagePreload(page);
    }).not.toThrow();
  });

  it("fails on a fixture page that nominates two `priority` candidates", () => {
    setMediaManifest(mediaFixture());
    const twoPriority = render(
      <main>
        <MediaAsset assetId={BAND_ASSET} locale="en" priority />
        <MediaAsset assetId={PRODUCT_ASSET} locale="en" priority slot="grid" />
      </main>,
    );

    // AC-19 in the negative, with the **same** assertion the page above passes: two `priority`
    // images on one page is a failing test, not a Lighthouse finding two weeks later.
    expect(() => {
      expectOneImagePreload(twoPriority);
    }).toThrow();
  });

  it("refuses `priority` on a slot that is never above the fold", () => {
    expect(() =>
      withManifest(
        <MediaAsset
          assetId={PRODUCT_ASSET}
          locale="en"
          priority
          slot="thumb"
        />,
      ),
    ).toThrow(/never above the fold/);
  });

  it("gives a template the page-level assertion too", () => {
    expect(() => {
      assertSinglePriority([BAND_ASSET]);
    }).not.toThrow();
    expect(() => {
      assertSinglePriority([BAND_ASSET, PRODUCT_ASSET]);
    }).toThrow(/exactly one `priority` image/);
  });
});

describe("the placeholder caption is real copy in every locale", () => {
  for (const locale of LOCALES) {
    it(`captions the empty box in \`${locale}\``, () => {
      const html = withManifest(
        <MediaAsset assetId={PRODUCT_ASSET} locale={locale} />,
        { withoutVariants: true },
        locale,
      );
      expect(html).not.toContain("media.placeholder");
      expect(html).toMatch(/photography to supply/i);
    });
  }
});
