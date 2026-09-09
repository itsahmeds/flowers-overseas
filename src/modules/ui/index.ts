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
 * Also deliberately absent, by spec §3 "Non-goals" (`/review 27` required change 2): **no form
 * layer** — "no input, select, textarea or form component ships here beyond the consent controls;
 * the design system's form layer is written against the checkout's real fields rather than
 * guessed" (§13 Q10) → 010/013; and **no price block** — "no price is rendered in this spec" (§8)
 * → 005/008/009. The icon set is likewise only what the approved canvas uses plus the two
 * direction-carrying icons `MIRRORED_IN_RTL` names, since AC-5's mirroring contract needs both of
 * them; a component that needs another icon adds it with its consumer.
 *
 * Later 004 tasks extend this list: `SiteHeader`/`TrustStrip` (TASK-048, TASK-053), the consent
 * banner (TASK-051) and `Media` + the R2 loader seam (TASK-053). `SiteFooter` (TASK-049) is here:
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
