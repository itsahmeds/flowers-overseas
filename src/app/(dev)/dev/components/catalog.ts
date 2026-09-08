/**
 * The gallery's own copy (spec 004 §2 "Component gallery"; TASK-045).
 *
 * **These strings are deliberately not in the message catalogue, and that is not a
 * `fo/no-literal-strings` loophole.** They are developer-facing identifiers — token names, variant
 * names, state names — read only by whoever is building a component, on a route that exists solely
 * where `ENABLE_DEV_UI=true` and that the env schema refuses in production (AC-28). Translating
 * "disabled" or "`--color-ink-2`" would make the gallery lie about the code it documents, and
 * adding twenty developer keys to `messages/en.json` would put them in front of the `plan/13` B12
 * native reviewers whose time is for buyer-facing copy. Keeping them here — in a data module, not
 * in JSX — is what keeps the lint rule honest rather than suppressed: no component file gains a
 * literal, and `pnpm i18n:check` gains no unused key.
 *
 * Every later 004 task extends the lists below with its own component's states (§2, enforced by
 * the reviewer).
 */

export const GALLERY_TITLE = "Design system · /dev/components";

export const GALLERY_INTRO =
  "Every design token and every component state spec 004 ships. Server-rendered, noindex, present only where ENABLE_DEV_UI=true, and refused in production by the env schema. This page is the visual-regression and axe surface for states no Phase-0 page reaches.";

/** Section ids double as the in-page anchors and the section headings. */
export const SECTIONS = [
  "Colour",
  "Type",
  "Space",
  "Radius, shadow, motion, layers",
  "Icons",
  "Brand mark",
  "Layout primitives",
  "Buttons",
  "Fields",
  "Chips",
  "Photography placeholders",
  "Prices",
  "Contrast manifest",
] as const;

/** The colour ramps, in the order `globals.css` declares them. */
export const COLOUR_RAMPS: readonly {
  readonly name: string;
  readonly swatches: readonly {
    readonly token: string;
    readonly className: string;
    readonly inkClassName: string;
  }[];
}[] = [
  {
    name: "Paper / surface",
    swatches: [
      {
        token: "--color-paper · surface",
        className: "bg-paper",
        inkClassName: "text-ink",
      },
      {
        token: "--color-paper-2 · surface-raised",
        className: "bg-paper-2",
        inkClassName: "text-ink",
      },
      {
        token: "--color-paper-3 · surface-muted",
        className: "bg-paper-3",
        inkClassName: "text-ink",
      },
      {
        token: "--color-ink · surface-inverse",
        className: "bg-ink",
        inkClassName: "text-on-inverse",
      },
    ],
  },
  {
    name: "Ink",
    swatches: [
      {
        token: "--color-ink",
        className: "bg-ink",
        inkClassName: "text-on-inverse",
      },
      {
        token: "--color-ink-2 · ink-muted",
        className: "bg-ink-2",
        inkClassName: "text-on-inverse",
      },
      {
        token: "--color-ink-3 · ink-subtle · border-strong",
        className: "bg-ink-3",
        inkClassName: "text-on-inverse",
      },
      {
        token: "--color-rule · border",
        className: "bg-rule",
        inkClassName: "text-ink",
      },
    ],
  },
  {
    name: "Accent and status",
    swatches: [
      {
        token: "--color-accent · brand · focus",
        className: "bg-accent",
        inkClassName: "text-on-accent",
      },
      {
        token: "--color-accent-strong (hover)",
        className: "bg-accent-strong",
        inkClassName: "text-on-accent",
      },
      {
        token: "--color-success",
        className: "bg-success",
        inkClassName: "text-on-success",
      },
      {
        token: "--color-warning",
        className: "bg-warning",
        inkClassName: "text-on-warning",
      },
      {
        token: "--color-danger",
        className: "bg-danger",
        inkClassName: "text-on-danger",
      },
      {
        token: "--color-danger-strong (hover)",
        className: "bg-danger-strong",
        inkClassName: "text-on-danger",
      },
    ],
  },
];

/** The type ramp: the display voice and the body voice at every step. */
export const TYPE_SAMPLES = [
  { token: "--text-display", sample: "Send flowers to Kraków" },
  { token: "--text-display-s", sample: "A vetted local florist makes it" },
  { token: "--text-2xl", sample: "Price includes delivery and VAT" },
  { token: "--text-xl", sample: "Ordered from Berlin, delivered in Gdańsk" },
] as const;

export const BODY_SAMPLES = [
  {
    token: "--text-lg",
    sample:
      "Zamów kwiaty z Wrocławia — łąka, róże, żonkile. Grüße aus Österreich. Bucureşti, İstanbul.",
  },
  {
    token: "--text-md",
    sample:
      "Zamów kwiaty z Wrocławia — łąka, róże, żonkile. Grüße aus Österreich. Bucureşti, İstanbul.",
  },
  {
    token: "--text-sm",
    sample:
      "Zamów kwiaty z Wrocławia — łąka, róże, żonkile. Grüße aus Österreich. Bucureşti, İstanbul.",
  },
  {
    token: "--text-xs",
    sample:
      "Zamów kwiaty z Wrocławia — łąka, róże, żonkile. Grüße aus Österreich. Bucureşti, İstanbul.",
  },
] as const;

/** The label voice, which is the visual signature of the whole design. */
export const LABEL_SAMPLE = "Ships from a local florist";

export const SPACE_STEPS = [
  { token: "--spacing-xs", className: "w-xs" },
  { token: "--spacing-sm", className: "w-sm" },
  { token: "--spacing-md", className: "w-md" },
  { token: "--spacing-lg", className: "w-lg" },
  { token: "--spacing-xl", className: "w-xl" },
  { token: "--spacing-2xl", className: "w-2xl" },
  { token: "--spacing-3xl", className: "w-3xl" },
] as const;

export const RADIUS_STEPS = [
  { token: "--radius-none", className: "rounded-none" },
  { token: "--radius-sm", className: "rounded-sm" },
  { token: "--radius-md", className: "rounded-md" },
  { token: "--radius-full", className: "rounded-full" },
] as const;

export const SHADOW_STEPS = [
  { token: "--shadow-xs", className: "shadow-xs" },
  { token: "--shadow-sm", className: "shadow-sm" },
  { token: "--shadow-md", className: "shadow-md" },
] as const;

export const MOTION_TOKENS = [
  "--duration-fast 120ms",
  "--duration-base 200ms",
  "--duration-slow 320ms",
  "--ease-standard",
  "--ease-emphasised",
  "prefers-reduced-motion: reduce removes all of it (AC-6)",
] as const;

export const LAYER_TOKENS = [
  "--layer-header 100 (sticky header)",
  "--layer-banner 200 (language suggestion)",
  "--layer-overlay 300 (consent sheet, focused skip link)",
] as const;

export const BUTTON_LABEL = "Continue";
export const BUTTON_BUSY_LABEL = "Checking availability";
export const BUTTON_LINK_LABEL = "See destinations";

/** The one interactive chip: a chip that is navigation rather than a marker. */
export const CHIP_LINK_LABEL = "All destinations";

export const FIELD_SAMPLES = {
  countryLabel: "Country",
  countryPlaceholderNote: "Poland",
  helpText: "Search opens with the shop (spec 008).",
  errorText: "Choose a destination country to continue.",
  dateLabel: "Delivery date",
  disabledLabel: "Town or postcode",
} as const;

export const CHIP_SAMPLES = [
  { tone: "neutral", text: "EUR", label: "Prices shown in euro" },
  { tone: "accent", text: "Delivering now", label: undefined },
  { tone: "muted", text: "Guide · waiting list", label: undefined },
] as const;

export const PHOTO_CAPTIONS = {
  hero: "Photo slot · hero · founder to supply",
  landscape: "Photo slot · occasion tile",
  portrait: "Photo slot · florist portrait",
  square: "Photo slot · bouquet",
} as const;

/**
 * Pre-formatted prices. `Price` never formats — `formatMoney()` in `src/modules/i18n/format.ts` is
 * the only caller of `Intl.NumberFormat` (spec 003 AC-21) — so the gallery passes strings a
 * formatter would have produced, per locale.
 */
export const PRICE_SAMPLES = [
  { locale: "de-DE", value: "49,00 €" },
  { locale: "pl-PL", value: "219,00 zł" },
  { locale: "en-GB", value: "£42.00" },
] as const;

/** The in-page anchor of a section heading; used by the nav chips and the headings alike. */
export function sectionId(section: string): string {
  return section.toLowerCase().replaceAll(/[^a-z]+/g, "-");
}

/** The badge under a mirrored icon. */
export const MIRROR_TAG = "mirror-in-rtl";

/** Captions inside the layout-primitive demo. */
export const PRIMITIVE_CAPTIONS = {
  stack: "Stack · gap md",
  rowClusterGrid: "Row · Cluster · Grid",
  visuallyHiddenLead: "VisuallyHidden: ",
  visuallyHiddenTrail:
    "(the element before this parenthesis is present for a screen reader only)",
} as const;

export const MIRROR_NOTE =
  'Under dir="rtl" the arrow and chevron-end flip (mirror-in-rtl); the check, the clock, the shield and the brand mark never do.';
