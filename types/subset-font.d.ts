/**
 * Minimal types for `subset-font` (spec 004 AC-4; TASK-045).
 *
 * The package ships no declarations and has no `@types/` package. It is a **devDependency used by
 * one hand-run script** (`scripts/fonts/build-fonts.ts`, which regenerates the committed WOFF2
 * subsets and is never part of `pnpm build`), so the honest surface is the three options that
 * script passes plus its return value — not a full mirror of harfbuzz's subsetter. Adding `any`
 * anywhere is what `CLAUDE.md` forbids, and `declare module "subset-font"` untyped would be that
 * with extra steps.
 */
declare module "subset-font" {
  interface SubsetFontOptions {
    /** Output format. The script always asks for `woff2`. */
    readonly targetFormat?: "sfnt" | "woff" | "woff2";
    /** Variation axes to pin (`{ wght: 500 }`) or restrict (`{ wght: "400:600" }`). */
    readonly variationAxes?: Readonly<Record<string, number | string>>;
    /** Drop TrueType hinting instructions. */
    readonly noHinting?: boolean;
    /** OpenType layout features to keep; everything else is dropped. */
    readonly keepFeatures?: readonly string[];
    /** Whole tables to drop, by four-character tag. */
    readonly dropTables?: readonly string[];
    readonly preserveNameIds?: readonly number[];
    readonly noLayoutClosure?: boolean;
    readonly glyphNames?: boolean;
  }

  /** Subsets `font` to the glyphs needed by `text`. */
  export default function subsetFont(
    font: Buffer,
    text: string,
    options?: SubsetFontOptions,
  ): Promise<Buffer>;
}
