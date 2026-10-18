/**
 * The priority image **per width** (spec 004 §14 A24 clause 5, AC-36 as amended; T-38; TASK-188),
 * read off rendered HTML.
 *
 * > At each of 1440 × 900 and 390 × 844, exactly one **displayed** `<img>` carries
 * > `fetchpriority="high"`, and exactly one `<link rel="preload">` whose `media` matches that width
 * > names it. An image that is not displayed at a width is not downloaded at that width.
 *
 * An image is displayed at a width unless its `<picture>` opens with a `<source>` whose `media`
 * names the other range and whose `srcset` is an inline `data:` URL (the blank `MediaAsset` selects
 * where its box is hidden): a browser picks the first matching source, so that image fetches
 * nothing there. A preload with no `media` counts at **both** widths, which is what makes "both
 * preloads unscoped by `media`" red.
 */

/** The two ranges, as `MediaAsset`'s `PRIORITY_MEDIA` spells them. */
export const WIDTHS = {
  "md-up": "(min-width: 48rem)",
  "below-md": "(width < 48rem)",
} as const;
export type Width = keyof typeof WIDTHS;

export interface PictureFacts {
  /** Where the image is displayed: one range, or both. */
  readonly displayedAt: Width | "both";
  readonly high: boolean;
  readonly eager: boolean;
  /** The first real (non-blank) `<source>`'s ladder: what a preload must name. */
  readonly srcset: string;
  readonly sizes: string;
  /** Where in the HTML the `<picture>` starts. */
  readonly index: number;
}

export interface PreloadFacts {
  readonly srcset: string;
  readonly sizes: string;
  /** `undefined` when the preload carries no `media`: it applies at every width. */
  readonly media: string | undefined;
}

function attribute(tag: string, name: string): string | undefined {
  const raw = new RegExp(`\\s${name}="([^"]*)"`, "iu").exec(tag)?.[1];
  return raw === undefined ? undefined : unescape(raw);
}

function unescape(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
}

export function pictures(html: string): readonly PictureFacts[] {
  return [...html.matchAll(/<picture[^>]*>([\s\S]*?)<\/picture>/gu)].map(
    (match) => {
      const inner = match[1] ?? "";
      const sources = inner.match(/<source[^>]*>/giu) ?? [];
      const blank = sources.find((source) =>
        (attribute(source, "srcset") ?? "").startsWith("data:"),
      );
      const blankMedia =
        blank === undefined ? undefined : attribute(blank, "media");
      const real = sources.find(
        (source) => !(attribute(source, "srcset") ?? "").startsWith("data:"),
      );
      const img = /<img[^>]*>/iu.exec(inner)?.[0] ?? "";
      const displayedAt: Width | "both" =
        blankMedia === WIDTHS["md-up"]
          ? "below-md"
          : blankMedia === WIDTHS["below-md"]
            ? "md-up"
            : "both";
      return {
        displayedAt,
        high: /fetchpriority="high"/iu.test(img),
        eager: /loading="eager"/iu.test(img),
        srcset: unescape(attribute(real ?? img, "srcset") ?? ""),
        sizes: attribute(real ?? img, "sizes") ?? "",
        index: match.index,
      };
    },
  );
}

export function imagePreloads(html: string): readonly PreloadFacts[] {
  return (html.match(/<link[^>]*>/giu) ?? [])
    .filter((link) => /rel="preload"/iu.test(link) && /as="image"/iu.test(link))
    .map((link) => ({
      srcset: unescape(attribute(link, "imagesrcset") ?? ""),
      sizes: attribute(link, "imagesizes") ?? "",
      media: attribute(link, "media"),
    }));
}

/** At one width: the displayed `fetchpriority="high"` images and the preloads that apply. */
export function atWidth(
  html: string,
  width: Width,
): {
  readonly high: readonly PictureFacts[];
  readonly eager: readonly PictureFacts[];
  readonly preloads: readonly PreloadFacts[];
} {
  const shown = pictures(html).filter(
    (picture) =>
      picture.displayedAt === width || picture.displayedAt === "both",
  );
  return {
    high: shown.filter((picture) => picture.high),
    eager: shown.filter((picture) => picture.eager),
    preloads: imagePreloads(html).filter(
      (preload) =>
        preload.media === undefined || preload.media === WIDTHS[width],
    ),
  };
}
