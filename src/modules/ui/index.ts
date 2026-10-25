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

// Fonts (AC-4, §14 A21 clause 3). `fontVariables` goes on `<html>`; the two Latin font objects
// are exported for the preload assertions. Caveat (`./fonts/hand`) is deliberately not exported,
// and nothing this barrel reaches imports it: only the product page's card preview may.
export { bodyFont, displayFont, fontVariables } from "./fonts";

// Icons (AC-5). `MIRRORED_IN_RTL` is exported so the mirroring intent is assertable, not so a call
// site can override it.
export { Icon, ICON_NAMES, MIRRORED_IN_RTL } from "./icons/Icon";
export type { IconName, IconProps } from "./icons/Icon";
export { Mark } from "./icons/Mark";
export type { MarkProps } from "./icons/Mark";
// The outlined wordmark (§14 A21 clause 3; TASK-175). The header and footer swap onto it in
// TASK-176.
export { Wordmark } from "./icons/Wordmark";
export type { WordmarkProps } from "./icons/Wordmark";

// Chrome (spec 004 §5.3; TASK-048). `SiteHeader` is a synchronous Server Component: it takes the
// locale as a prop and reads its copy through `useTranslations`, so it renders wherever a request
// locale is set and adds no client JavaScript (§14 A1).
export { NoticePriceClaim, SiteHeader } from "./layout/SiteHeader.tsx";
export type { SiteHeaderProps } from "./layout/SiteHeader.tsx";
// The listing pages the header's category row may link to (spec 008 §14 A14; TASK-173): the
// document layout asks the catalogue which of them exist in its locale and hands the URLs back as
// `SiteHeader`'s `listingHrefs`, because this module may not read the catalogue (`plan/01` §5).
// On a page in a destination's context the `@header` slot moves the shop items' hrefs to that
// destination's own pages through `inContextListingHrefs()` (spec 043 §5.3 A; TASK-288).
export {
  headerListingTargets,
  inContextListingHrefs,
} from "./layout/header-model.ts";
export type {
  HeaderListingHrefs,
  HeaderListingTarget,
  HeaderShopLinks,
} from "./layout/header-model.ts";

// Layout primitives.
export {
  Cluster,
  Container,
  CONTAINER_WIDTHS,
  GAPS,
  Grid,
  PAGE_FRAME,
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
// `LiveRegion` is the design system's documented live-announcement pattern (spec 003's deferred
// `role="status"` note, closed by TASK-055): permanently mounted, filled later.
export { LiveRegion, SkipLink, VisuallyHidden } from "./primitives/a11y";
export type {
  LiveRegionProps,
  SkipLinkProps,
  VisuallyHiddenProps,
} from "./primitives/a11y";

// Type primitives.
export {
  Display,
  DISPLAY_SIZES,
  Eyebrow,
  HEADING_EM,
  Label,
  Text,
  TEXT_LINK_VARIANTS,
  TEXT_SIZES,
  TEXT_TONES,
  TextLink,
} from "./primitives/typography";
export type {
  DisplayProps,
  DisplaySize,
  EyebrowProps,
  LabelTextProps,
  TextLinkProps,
  TextLinkVariant,
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
// v2 primitives (§14 A21; TASK-175): the price with its equivalents slot, the facts list, the
// breadcrumb trail and the notice bar's look.
export { Price, PRICE_VARIANTS } from "./primitives/Price";
export type { PriceProps, PriceVariant } from "./primitives/Price";
export { Fact, FACTS_DENSITIES, FactsList } from "./primitives/FactsList";
export type {
  FactProps,
  FactsDensity,
  FactsListProps,
} from "./primitives/FactsList";
export { Breadcrumbs, breadcrumbAncestor } from "./primitives/Breadcrumbs";
export type {
  BreadcrumbsPhone,
  BreadcrumbsProps,
  Crumb,
} from "./primitives/Breadcrumbs";
// The phone primitives (spec 004 §14 A24 clause 4, AC-48, AC-49; TASK-195): the docked action,
// the segmented control, the sideways row and the gallery's in-page dots.
export { StickyActionBar } from "./primitives/StickyActionBar";
export type { StickyActionBarProps } from "./primitives/StickyActionBar";
export { SegmentedControl } from "./primitives/SegmentedControl";
export type {
  SegmentedControlProps,
  SegmentOption,
} from "./primitives/SegmentedControl";
export {
  GalleryDots,
  HorizontalScroller,
} from "./primitives/HorizontalScroller";
export type {
  GalleryDotsProps,
  HorizontalScrollerProps,
} from "./primitives/HorizontalScroller";
export { NoticeBar } from "./primitives/NoticeBar";
export type { NoticeBarProps } from "./primitives/NoticeBar";

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

// The deferral of non-critical islands until the LCP paint (spec 004 §14 A-founder-2026-10-15b,
// AC-55; TASK-244): the layout wraps the language popup in it. The set itself
// (`./deferred/deferredSet.ts`) is not exported: tests read it by path, and no client module may
// import its values.
export { AfterPaint } from "./deferred/AfterPaint.tsx";
export type { AfterPaintProps } from "./deferred/AfterPaint.tsx";

// The consent sheet (AC-17, AC-19, AC-20; TASK-051). `ConsentBanner` is a synchronous Server
// Component; the island and the settings panel are two client-only `React.lazy` chunks
// behind it (TASK-376), and every string they render is resolved here and passed as props, so no message
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
  r2Loader,
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
  r2VariantLoader,
  resolveLoader,
  setVariantLoader,
  splitVariantLoader,
  staticVariantLoader,
} from "./media/loader.ts";
export type { VariantLoader, VariantRef } from "./media/loader.ts";

// The locale home, products first (spec 004 §14 A-founder-2026-10-24a item 4; TASK-386,
// TASK-387): the first screen with the inline picker, "Our selection", the occasion tabs (a native
// radio group, no script), the price words and "Coming up". All are Server Components fed by the
// catalogue's `homeView()`, whose shape is `HomeViewSchema`: no field for money exists in it.
export {
  HOME_BLEED,
  HOME_HERO_ASSET,
  HOME_SECTION,
  HOME_V3_SECTION,
  HomeHero,
} from "./home/HomeHero.tsx";
export type { HomeHeroProps } from "./home/HomeHero.tsx";
export {
  HomeCardViewSchema,
  HomePickerViewSchema,
  HomeViewSchema,
  homeItemListEntries,
} from "./home/home-view.ts";
export type {
  HomeCardView,
  HomeItemListEntry,
  HomeView,
} from "./home/home-view.ts";
export { HomeSelection } from "./home/HomeSelection.tsx";
export type { HomeSelectionProps } from "./home/HomeSelection.tsx";
export {
  HOME_OCCASION_GROUP,
  HomeOccasionTabs,
} from "./home/HomeOccasionTabs.tsx";
export type { HomeOccasionTabsProps } from "./home/HomeOccasionTabs.tsx";
export { HomePriceWords } from "./home/HomePriceWords.tsx";
export type { HomePriceWordsProps } from "./home/HomePriceWords.tsx";
export { HomeComingUp } from "./home/HomeComingUp.tsx";
export type { HomeComingUpProps } from "./home/HomeComingUp.tsx";
// The sentence picker left the home with the commerce structure (Q-24c); its form, island and
// `/api/send` route stay until their own clean-up (`docs/tasks/TASK-386.md`, carry-forwards).
export { SentencePicker } from "./home/SentencePicker.tsx";
export type { SentencePickerProps } from "./home/SentencePicker.tsx";
export {
  SENTENCE_FIELDS,
  SENTENCE_IDS,
  SentenceQuerySchema,
  isSentenceDestination,
  sentenceAction,
  sentenceDestinations,
  sentenceOccasions,
  sentenceTarget,
} from "./home/sentence-model.ts";
export type {
  SentenceDestination,
  SentenceLookups,
  SentenceOccasion,
  SentenceQuery,
} from "./home/sentence-model.ts";
export { PROOF_FACTS, ProofRow } from "./home/ProofRow.tsx";
export type { ProofRowProps } from "./home/ProofRow.tsx";

// The three data-gated sections and their provider seams (§13's resolution note, AC-11, AC-14,
// AC-15; TASK-054). Each section reads a provider inside this module and decides for itself
// whether it renders: `TrendingRow` shows the florists' picks with the founder's verbatim label
// until a provider ranked by real orders replaces it, `ReviewsSection` renders **nothing** until
// a completed order produces a real review, and `DestinationsGrid` renders each destination's
// status and links none of them while its corridor page is unpublished. The `with*Provider`
// injection hooks are deliberately **not** exported (spec 003's rule: a caller that could swap a
// provider at runtime would turn the seam into global mutable configuration); the populated
// branch reaches the gallery through each section's optional `provider` prop.
export {
  TRENDING_BASES,
  emptyTrendingProvider,
  getTrendingProvider,
  staticTrendingProvider,
  trendingProviderOf,
} from "./home/trending-provider.ts";
export type {
  TrendingBasis,
  TrendingPick,
  TrendingProvider,
} from "./home/trending-provider.ts";
export { REVIEWS_ANCHOR, ReviewsSection } from "./home/ReviewsSection.tsx";
export type { ReviewsSectionProps } from "./home/ReviewsSection.tsx";
export {
  REVIEW_KINDS,
  getReviewsProvider,
  reviewsProviderOf,
  staticReviewsProvider,
} from "./home/reviews-provider.ts";
export type {
  ReviewKind,
  ReviewsProvider,
  VerifiedReview,
} from "./home/reviews-provider.ts";
export {
  DESTINATIONS_ANCHOR,
  DestinationsGrid,
} from "./home/DestinationsGrid.tsx";
export type { DestinationsGridProps } from "./home/DestinationsGrid.tsx";
export {
  destinationStatusProviderOf,
  getDestinationStatusProvider,
  staticDestinationStatusProvider,
} from "./home/destination-status-provider.ts";
export type {
  DestinationStatus,
  DestinationStatusProvider,
} from "./home/destination-status-provider.ts";

// The rest of the locale home, in the round-2 artboards' order (§13's resolution note, design
// round 6, AC-10, AC-14, AC-15; TASK-053). All five are synchronous Server Components and add no
// client JavaScript: the FAQ's disclosure is the platform's `<details>`, and the occasion tiles,
// the dates strip and the explainer render text and photo placeholders. `OCCASIONS_ANCHOR` and
// the two projections are exported because spec 008 flips `published` in
// `src/config/occasions.ts` and the tests assert both branches from here.
export { OccasionTiles } from "./home/OccasionTiles.tsx";
export { occasionAssetId } from "./home/occasion-model.ts";
export type { OccasionTilesProps } from "./home/OccasionTiles.tsx";
export { HOW_IT_WORKS_STEPS, HowItWorks } from "./home/HowItWorks.tsx";
export type { HowItWorksProps } from "./home/HowItWorks.tsx";
export { FAQ_ENTRIES, HomeFaq } from "./home/HomeFaq.tsx";
export type { HomeFaqProps } from "./home/HomeFaq.tsx";
export {
  DATE_OCCASION_KEYS,
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

// The listing primitives (spec 008 §5.2, AC-6, §13 Q8; TASK-108). Seven Server Components and the
// view models they render from: the grid is a list, the toolbar is a `GET` form, the pagination is
// real links and the card is a **tile** until spec 009 publishes the `product` link id — so the
// whole set adds **zero** bytes of client JavaScript (§5.4). `ProductCardViewSchema` is the place
// the honesty rules of §8 are enforced: it has no field for a badge, a rating, a review count, an
// old price or an add-to-basket, so a projection cannot carry one to a renderer.
// The chooser's form (spec 004 §14 A-founder-2026-10-24a item 3; TASK-385): server-rendered,
// native GET, zero client JavaScript of its own.
export { CountryPicker } from "./shop/CountryPicker.tsx";
export type {
  CountryPickerChoice,
  CountryPickerProps,
} from "./shop/CountryPicker.tsx";
export { ProductCard } from "./shop/ProductCard.tsx";
export type { ProductCardProps } from "./shop/ProductCard.tsx";
export { ListingGrid } from "./shop/ListingGrid.tsx";
export type { ListingGridProps } from "./shop/ListingGrid.tsx";
// Where a grid's example label is displayed: once for the grid, or per card from `md` up
// (spec 004 §14 A-founder-2026-10-19b clause 3; TASK-285). The grid and the page ask it alike.
export {
  GRID_PROVENANCE_MODES,
  gridProvenanceMode,
} from "./shop/gridProvenanceMode.ts";
export type { GridProvenanceMode } from "./shop/gridProvenanceMode.ts";
export { GridProvenance } from "./shop/GridProvenance.tsx";
// Photographed products first, stable within each group (spec 043 §5.2, AC-13; TASK-290).
export { photoFirst } from "./shop/photoFirst.ts";
export type { GridProvenanceProps } from "./shop/GridProvenance.tsx";
export {
  ListingSortForm,
  ListingToolbar,
  SORT_LABEL_KEYS,
} from "./shop/ListingToolbar.tsx";
export type {
  ListingSortFormProps,
  ListingToolbarProps,
} from "./shop/ListingToolbar.tsx";
export { Pagination, pageHref } from "./shop/Pagination.tsx";
export type { PaginationProps } from "./shop/Pagination.tsx";
export { ListingEmpty } from "./shop/ListingEmpty.tsx";
export type {
  ListingEmptyLink,
  ListingEmptyProps,
} from "./shop/ListingEmpty.tsx";
export { FromPriceChip } from "./shop/FromPriceChip.tsx";
export type { FromPriceChipProps } from "./shop/FromPriceChip.tsx";
export { CategoryChipRow } from "./shop/CategoryChipRow.tsx";
// The approximate-equivalents line's message values (spec 004 §14 A21 clause 6; TASK-178), for
// the product page (TASK-179); no card prints the line (A-founder-2026-10-19b clause 2).
export { equivalentsMessageValues } from "./shop/equivalents.ts";
export type { EquivalentsMessageValues } from "./shop/equivalents.ts";
export type { CategoryChipRowProps } from "./shop/CategoryChipRow.tsx";
export {
  CategoryTileViewSchema,
  ChipLinkViewSchema,
  CountryLessCardViewSchema,
  DeliverySlotViewSchema,
  DeliverySlotsViewSchema,
  HubCardViewSchema,
  LISTING_SORTS,
  ListingCardViewSchema,
  ListingSortSchema,
  MediaSlotSchema,
  PRICE_LABEL_KEYS,
  PRICE_NOTE_KEYS,
  PRODUCT_PROVENANCE,
  PriceLabelKeySchema,
  PriceEquivalentsViewSchema,
  PriceNoteKeySchema,
  ProductCardPhotoSchema,
  ProductCardViewSchema,
  ProductProvenanceSchema,
  hasCardPrice,
} from "./shop/viewModel.ts";
export type {
  CategoryTileView,
  ChipLinkView,
  CountryLessCardView,
  DeliverySlotsView,
  HubCardView,
  ListingCardView,
  ListingSort,
  PriceLabelKey,
  PriceEquivalentsView,
  PriceNoteKey,
  ProductCardPhotoView,
  ProductCardView,
  ProductProvenance,
} from "./shop/viewModel.ts";

// The product page and its six primitives (spec 009 §5.2, §5.3, AC-7's render half, AC-9, AC-21,
// AC-23, AC-25's slot half; TASK-126, TASK-127). Server Components, all of them: the grid, the
// chips, the tier radios, the add-on rows and the summary render with JavaScript disabled, and
// none of them computes money — every figure is `productView()`'s, formatted by `formatMoney`.
// They take `catalog`'s types and nothing else from it, because `catalog` and `geo` import this
// barrel at runtime; the two blocks they cannot import (008's breadcrumb, 007's delivery facts)
// reach `ProductPage` as slots from the route. `ProductPage` itself is **not** re-exported: it
// mounts `PrintedCardPreview`, the one importer of Caveat (`./fonts/hand`), and every document
// layout imports this barrel, so a re-export here would put Caveat's `@font-face` on every route
// (PR 168 breaker hole 3). The product route imports `@/modules/ui/product/ProductPage` directly;
// `tests/unit/fonts.test.ts` walks this barrel's import graph and fails if Caveat is reachable.
export { Gallery } from "./product/Gallery.tsx";
export type { GalleryProps } from "./product/Gallery.tsx";
export { TierSelector, tierLabel } from "./product/TierSelector.tsx";
export type { TierSelectorProps } from "./product/TierSelector.tsx";
export { DateChip, dateChipState } from "./product/DateChip.tsx";
export type {
  DateChipProps,
  DateChipState,
  ProductDeliveryDate,
} from "./product/DateChip.tsx";
export { DeliveryDatePicker } from "./product/DeliveryDatePicker.tsx";
export type { DeliveryDatePickerProps } from "./product/DeliveryDatePicker.tsx";
export { AddonPriceList } from "./product/AddonPriceList.tsx";
export type { AddonPriceListProps } from "./product/AddonPriceList.tsx";
export { PriceSummary } from "./product/PriceSummary.tsx";
export type { PriceSummaryProps } from "./product/PriceSummary.tsx";
