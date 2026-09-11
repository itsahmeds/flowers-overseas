/** Public barrel for `ui` (design tokens, layout primitives, icons, chrome, the image wrapper). Owned by: spec 004. */

/**
 * The only import path for the design system (spec 004 §2 "Where the design system lives", §13 Q9;
 * TASK-045).
 *
 * `plan/01` §5's module list is domain-shaped and has no home for a design system, while `app/`
 * must stay "routes only; thin" and the header and footer are rendered by every route group. So
 * `src/modules/ui` is a **documented addition** to that list rather than an exception to the
 * boundary rule: it has this public barrel, no deep imports, `app/` imports from it and never the
 * reverse, and it is registered in the same PR in `docs/architecture.md` §3 and the `MODULES`
 * manifest of `scripts/check-layout.ts`.
 *
 * What is deliberately **not** exported:
 *
 *  - the tokens themselves. They live in `src/app/globals.css`'s `@theme` block and reach
 *    components as generated Tailwind utilities, so no TypeScript constant can drift from the CSS
 *    and `fo/no-raw-color` has nothing to allow. `CONTRAST_PAIRS` and the ratio arithmetic *are*
 *    exported, because the gate that keeps the palette accessible is a manifest plus a test.
 *  - the font objects' internals. `fontVariables` is the one string a document layout needs.
 *
 * **`ConsentGallery` is deliberately not exported**, and the reason is a measurement rather than a
 * taste: it is a `"use client"` component that imports both consent views statically, and a
 * client module reachable from this barrel is bundled into the document JavaScript of **every
 * route that imports the barrel at all** — including `/`, which renders no consent sheet. Measured
 * on this build: +1 990 B Brotli on `/` and on each locale document, against the 1 434 B §14 A1
 * leaves. `/dev/components` therefore imports it by path, as the only file allowed to
 * (`src/app/(dev)/dev/components/page.tsx`), and the public barrel stays the public surface.
 *
 * Also deliberately absent, by spec §3 "Non-goals" (`/review 27` required change 2): **no form
 * layer** — "no input, select, textarea or form component ships here beyond the consent controls;
 * the design system's form layer is written against the checkout's real fields rather than
 * guessed" (§13 Q10) → 010/013; and **no price block** — "no price is rendered in this spec" (§8)
 * → 005/008/009. The icon set is likewise only what the approved canvas uses plus the two
 * direction-carrying icons `MIRRORED_IN_RTL` names, since AC-5's mirroring contract needs both of
 * them; a component that needs another icon adds it with its consumer.
 *
 * Later 004 tasks extend this list: `TrustStrip`, the occasion tiles and the explainer
 * (TASK-053) and the gated rows and the destinations grid (TASK-054). The consent sheet
 * (TASK-051) is here. `Media` + the R2 loader seam and the home's hero, finder and proof row are
 * here (TASK-052; the barrel note that assigned `Media` to TASK-053 is corrected by the TASK-052
 * row, which names it explicitly). `SiteFooter` (TASK-049) is here:
 * it exports the component, the `FooterView` projection its five §5.3 states are reached through,
 * and the two constants the consent island and the reminder stub share with it.
 */

// Fonts (AC-4). `fontVariables` goes on `<html>`; the two font objects are exported for the
// preload assertions and for a document that needs one family alone.
export { bodyFont, displayFont, fontVariables } from "./fonts";

// Icons (AC-5). `MIRRORED_IN_RTL` is exported so the mirroring intent is assertable, not so a call
// site can override it.
export { Icon, ICON_NAMES, MIRRORED_IN_RTL } from "./icons/Icon";
export type { IconName, IconProps } from "./icons/Icon";
export { Mark } from "./icons/Mark";
export type { MarkProps } from "./icons/Mark";

// Chrome (spec 004 §5.3; TASK-048). `SiteHeader` is a synchronous Server Component: it takes the
// locale as a prop and reads its copy through `useTranslations`, so it renders wherever a request
// locale is set and adds no client JavaScript (§14 A1).
export { SiteHeader } from "./layout/SiteHeader.tsx";
export type { SiteHeaderProps } from "./layout/SiteHeader.tsx";

// Layout primitives.
export {
  Cluster,
  Container,
  CONTAINER_WIDTHS,
  GAPS,
  Grid,
  Row,
  Stack,
} from "./primitives/layout";
export type {
  ContainerProps,
  ContainerWidth,
  Gap,
  GridProps,
  RowProps,
  StackProps,
} from "./primitives/layout";

// Accessibility primitives.
export { SkipLink, VisuallyHidden } from "./primitives/a11y";
export type { SkipLinkProps, VisuallyHiddenProps } from "./primitives/a11y";

// Type primitives.
export {
  Display,
  DISPLAY_SIZES,
  Label,
  Text,
  TEXT_SIZES,
  TEXT_TONES,
} from "./primitives/typography";
export type {
  DisplayProps,
  DisplaySize,
  LabelTextProps,
  TextProps,
  TextSize,
  TextTone,
} from "./primitives/typography";

// Controls and content primitives.
export {
  Button,
  BUTTON_SIZES,
  BUTTON_STATES,
  BUTTON_VARIANTS,
} from "./primitives/Button";
export type {
  ButtonProps,
  ButtonSize,
  ButtonState,
  ButtonVariant,
} from "./primitives/Button";
export { Chip, CHIP_TONES } from "./primitives/Chip";
export type { ChipProps, ChipTone } from "./primitives/Chip";
export { Photo, PHOTO_RATIOS, Placeholder } from "./primitives/Photo";
export type {
  PhotoProps,
  PhotoRatio,
  PlaceholderProps,
} from "./primitives/Photo";

// Chrome (AC-9, AC-14; TASK-049). `SiteFooter` is a synchronous Server Component and adds no
// client JavaScript; `CONSENT_REOPEN_ATTRIBUTE` is the attribute TASK-051's island binds its
// re-open handler to, exported so the two tasks share one constant.
export {
  CONSENT_REOPEN_ATTRIBUTE,
  FOOTER_ID_PREFIX,
  REMINDERS_ANCHOR,
  REMINDERS_ENDPOINT,
  REMINDERS_FIELD_ID,
  SiteFooter,
} from "./layout/SiteFooter";
export type { SiteFooterProps } from "./layout/SiteFooter";
export { companyIdentity, footerView } from "./layout/footerView";
export type {
  CompanyIdentityView,
  FooterCompanyView,
  FooterGroupView,
  FooterLinkView,
  FooterView,
  FooterViewOptions,
} from "./layout/footerView";

// The consent sheet (AC-17, AC-19, AC-20; TASK-051). `ConsentBanner` is a synchronous Server
// Component; the island and the settings panel are two `next/dynamic({ ssr: false })` chunks
// behind it, and every string they render is resolved here and passed as props, so no message
// catalogue, no cookie register and no zod reaches the browser (§13 Q13 option (b), §14 A1).
// `consentView` and the cookie helpers are exported because the projection and the `fo_consent`
// value are what the tests and spec 007's cookie policy read.
export { ConsentBanner } from "./consent/ConsentBanner";
export {
  CONSENT_ENDPOINT,
  consentView,
  lifetimeLabel,
} from "./consent/consentView";
export type { ConsentTranslate } from "./consent/consentView";
export {
  choicesOf,
  clearConsentCookie,
  parseConsentCookie,
  rawCookieValue,
  serialiseConsentCookie,
} from "./consent/consentCookie";
export type { ConsentChoices, StoredConsent } from "./consent/consentCookie";
export type {
  ConsentCategoryKey,
  ConsentCategoryView,
  ConsentConfig,
  ConsentCookieView,
  ConsentStrings,
  ConsentView,
} from "./consent/consentTypes";

// The trust slot with its Phase-0 empty state (§5.3, §8): renders nothing and reserves no box.
export { TrustMarks } from "./trust/TrustMarks";
export type { TrustMark, TrustMarksProps } from "./trust/TrustMarks";

// The contrast manifest and its arithmetic (AC-3).
export {
  CONTRAST_PAIRS,
  CONTRAST_THRESHOLDS,
  colorTokenNames,
  contrastRatio,
  evaluateContrastPairs,
  formatContrastTable,
  parseOklch,
  parseThemeTokens,
  relativeLuminance,
  resolveColorToken,
} from "./tokens/contrast";
export type {
  ContrastKind,
  ContrastPair,
  ContrastResult,
  Oklch,
} from "./tokens/contrast";

// The image conventions and the loader seam (§2 "Image conventions", ADR-0015; TASK-052). `Media`
// renders the token-gradient placeholder and no `<img>` in Phase 0; the slot table carries the
// `sizes` string and the reserved ratio per named slot, and the loader is swapped inside the
// module when spec 002/006 create the bucket.
export { Media } from "./media/Media.tsx";
export type { MediaProps, MediaSource } from "./media/Media.tsx";
export { MEDIA_SLOTS, MEDIA_SLOT_SPECS, mediaSlot } from "./media/slots.ts";
export type { MediaSlot, MediaSlotSpec } from "./media/slots.ts";
export {
  getMediaLoader,
  placeholderLoader,
  setMediaLoader,
} from "./media/loader.ts";
export type { MediaLoader } from "./media/loader.ts";

// The asset path, the loader seam's second implementation, the LCP preload and the honesty label
// (spec 006 §2.5, AC-2/AC-17/AC-18/AC-19; TASK-079). `MediaAsset` renders a `<picture>` **only**
// when the asset is approved, has variants and has alt text for the resolved locale, and the
// captioned placeholder otherwise; `MediaProvenanceNote` renders the AI label whenever a page
// displays a generated asset and admits **no** prop that could suppress it. Both are Server
// Components and neither adds a client byte. The manifest and the loader are exported for the
// data-flip and R2-flip proofs (TASK-080/TASK-083); no page template needs them, and `resolve`
// is what a template asks instead.
export { MediaAsset } from "./media/MediaAsset.tsx";
export type { MediaAssetProps } from "./media/MediaAsset.tsx";
export {
  MediaProvenanceNote,
  needsAiProvenanceNote,
} from "./media/MediaProvenanceNote.tsx";
export type { MediaProvenanceNoteProps } from "./media/MediaProvenanceNote.tsx";
export {
  PLACEHOLDER_REASONS,
  isDisplayable,
  resolveMedia,
  srcSetFor,
} from "./media/resolve.ts";
export type {
  MediaSourceSet,
  PlaceholderReason,
  ResolvedImage,
  ResolvedMedia,
  ResolvedPlaceholder,
  ResolveMediaOptions,
} from "./media/resolve.ts";
export { assertSinglePriority, preloadArgsFor } from "./media/preload.ts";
export type { MediaPreloadArgs } from "./media/preload.ts";
export {
  PAGE_FORMATS,
  altFor,
  assetById,
  assetsForProduct,
  boxForAsset,
  committedMediaManifest,
  getMediaManifest,
  setMediaManifest,
  variantsFor,
} from "./media/manifest.ts";
export type {
  AltIndex,
  MediaAssetEntry,
  MediaManifest,
  MediaVariantEntry,
  MediaVariantSet,
  PageFormat,
  VariantFormat,
} from "./media/manifest.ts";
export { SEED_SLOT_TO_UI_SLOT, uiSlotForSeedSlot } from "./media/slots.ts";
export type { SeedMediaSlot } from "./media/slots.ts";
export {
  resolveLoader,
  setVariantLoader,
  staticVariantLoader,
} from "./media/loader.ts";
export type { VariantLoader, VariantRef } from "./media/loader.ts";

// The locale home's above-the-fold band and the four-fact proof strip (§13's resolution note,
// AC-10, AC-11; TASK-052). All four are Server Components; the only client JavaScript on the page
// is `FinderTypeahead`, 499 B Brotli measured, and it is an enhancement — the country field is the
// platform's `<input list>` + `<datalist>`, so the finder works with JavaScript disabled.
// `DESTINATIONS_ANCHOR` is exported because TASK-054's destinations grid inherits the id the
// finder's `Continue` points at, and `finderTarget`/`finderDestinations` because AC-11's two
// branches are unit-tested against them.
export { HERO_HEIGHTS, HOME_BLEED, HomeHero } from "./home/HomeHero.tsx";
export type { HomeHeroProps } from "./home/HomeHero.tsx";
export { FinderCard } from "./home/FinderCard.tsx";
export type { FinderCardProps } from "./home/FinderCard.tsx";
export { DestinationList } from "./home/DestinationList.tsx";
export type { DestinationListProps } from "./home/DestinationList.tsx";
export {
  DESTINATIONS_ANCHOR,
  FINDER_IDS,
  finderDestinations,
  finderTarget,
} from "./home/finder-model.ts";
export type { FinderDestination } from "./home/finder-model.ts";
export { PROOF_FACTS, ProofRow } from "./home/ProofRow.tsx";
export {
  type FinderDestinationGroups,
  finderDestinationGroups,
} from "./home/finder-model.ts";

// The rest of the locale home, in the round-2 artboards' order (§13's resolution note, design
// round 6, AC-10, AC-14, AC-15; TASK-053). All five are synchronous Server Components and add no
// client JavaScript: the FAQ's disclosure is the platform's `<details>`, and the occasion tiles,
// the dates strip and the explainer render text and photo placeholders. `OCCASIONS_ANCHOR` and
// the two projections are exported because spec 008 flips `published` in
// `src/config/occasions.ts` and the tests assert both branches from here.
export { OccasionTiles } from "./home/OccasionTiles.tsx";
export type { OccasionTilesProps } from "./home/OccasionTiles.tsx";
export { OccasionDates } from "./home/OccasionDates.tsx";
export type { OccasionDatesProps } from "./home/OccasionDates.tsx";
export { HOW_IT_WORKS_STEPS, HowItWorks } from "./home/HowItWorks.tsx";
export type { HowItWorksProps } from "./home/HowItWorks.tsx";
export { FAQ_ENTRIES, HomeFaq } from "./home/HomeFaq.tsx";
export type { HomeFaqProps } from "./home/HomeFaq.tsx";
export {
  OCCASIONS_ANCHOR,
  occasionDateViews,
  occasionTiles,
} from "./home/occasion-model.ts";
export type {
  OccasionDateView,
  OccasionTileView,
} from "./home/occasion-model.ts";

// The trust strip: three claims, each true today (§2, §5.3, AC-10, AC-15; TASK-053). 008 and 009
// mount the same component on shop pages, which is why the page bleed is a prop.
export { TRUST_CLAIMS, TrustStrip } from "./trust/TrustStrip.tsx";
export type { TrustStripProps } from "./trust/TrustStrip.tsx";
