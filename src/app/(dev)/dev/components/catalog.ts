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
  "Chips",
  "Photography placeholders",
  // TASK-052: the named media slots, and the home's three above-the-fold surfaces. The gallery
  // is where the hero, the finder and the proof row are reviewable side by side and where axe
  // and the visual suite reach the finder's open type-ahead state.
  "Media slots",
  "Home hero and finder",
  "Site header",
  // TASK-051: the consent sheet's four banner states and its three settings states (§5.3), so
  // the visual and axe suites reach `settings-open` and `saved` without driving the island.
  "Consent sheet",
  // TASK-049: the five `SiteFooter` states of spec 004 §5.3, so the visual and axe suites reach
  // `links-populated` and `company-registered` years before 007 publishes a page or the OÜ exists.
  "Site footer",
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
export const LABEL_SAMPLE = "Made by a local florist";

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

/**
 * The header's states (TASK-048, spec §14 A4). Only two of the four §5.3 states are renderable on
 * this page: `sticky-scrolled` is a scroll position rather than markup, and `nav-populated` needs
 * a `published: true` row that Phase 0 does not have — it is covered by the mocked-registry
 * assertions in `tests/unit/ui-site-header.test.tsx` instead. The breakpoint states are shown by
 * the two viewports of `tests/visual/header.spec.ts`.
 */
export const HEADER_STATES = {
  heading:
    "SiteHeader \u00b7 default (Phase 0: every category and account target unpublished)",
  note: "Full-bleed, zero client JavaScript, and not one form control. Two sibling elements since spec \u00a714 A4's addendum: the utility strip scrolls with the page, and `<header role=\"banner\">` \u2014 masthead + category row, 132 px at 390 px and 138 px at 1440 px \u2014 is what is sticky (an inner sticky wrapper is bounded by its parent's padding box and has zero px of room; the strip's height is content-driven, so a negative sticky offset would be exact only at the widths it is tested at). The chrome the document reserves is still their sum: 245 px on the mobile artboard and 183 px on the desktop one, band by band: utility strip 44 (113 at 390 px, where it runs to three lines), masthead 50 / 84, mobile search band 52, category row 28 / 52, plus the hairlines. Every category, `For florists`, `Sign in`, `My orders` and `Basket (0)` renders as text because its registry row is unpublished, and so does the search band \u2014 spec \u00a714 A4: the artboards draw a placeholder sentence and the word `Search`, there is no search route until spec 008, and this header renders no affordance that does nothing. The language switcher and the currency chip sit in the utility strip, where they are visible at 390 px without scrolling; every rendered link clears 44 px; the one control left is the mobile menu button, disabled because there is nothing to disclose yet.",
} as const;

export const MIRROR_NOTE =
  'Under dir="rtl" the arrow and chevron-end flip (mirror-in-rtl); the shield, the calendar, the florist mark and the brand mark never do.';

/**
 * The five `SiteFooter` states of spec 004 §5.3 (TASK-049). `idPrefix` keeps each instance's ids
 * unique on this one document — five footers with one `footer-group-sending` id would be a
 * critical `duplicate-id-aria` finding (AC-26) — and the caption names the state so a reviewer
 * reads the screenshot without the source.
 */
export const FOOTER_STATES = [
  {
    id: "links-empty",
    caption:
      "links-empty (Phase 0) · every site-links.ts target unpublished, so every label is text",
  },
  {
    id: "links-populated",
    caption:
      "links-populated · one target published, rendered as a link with no template edit",
  },
  {
    id: "company-unregistered",
    caption:
      "company-unregistered (Phase 0) · trading name and contact channel, no registry code, VAT id or address",
  },
  {
    id: "company-registered",
    caption:
      "company-registered · the Operated by clause, once all five registry fields exist",
  },
  {
    id: "trust-marks-empty",
    caption:
      "trust-marks-empty (Phase 0) · TrustMarks renders nothing and reserves no box",
  },
] as const;

/**
 * The consent sheet's states (§5.3, TASK-051). Five rendered blocks cover all seven named states:
 * the banner's `hidden`/`shown`/`settings-open`/`saved` and the panel's `default`/`dirty`/`saved`,
 * two of which are the same block seen from either component's side.
 */
export const CONSENT_STATES = [
  {
    id: "hidden" as const,
    caption:
      "banner hidden · a decision is recorded, so the island renders nothing at all (no box, no reserved space)",
  },
  {
    id: "shown" as const,
    caption:
      "banner shown · reject / choose / accept at identical width, size, weight and contrast (AC-20)",
  },
  {
    id: "settings-default" as const,
    caption:
      "banner settings-open · settings default · every non-essential category off, essential locked with its reason",
  },
  {
    id: "settings-dirty" as const,
    caption:
      "settings dirty · analytics on, marketing off — the choice Save choices would record",
  },
  {
    id: "saved" as const,
    caption:
      "banner saved · settings saved · the confirmation, announced politely and dismissible",
  },
] as const;

/** The registered-company fixture the `company-registered` state is rendered from. */
export const FOOTER_REGISTERED_COMPANY = {
  legalName: "Flowers Overseas OU (example)",
  registryName: "Estonian Business Register (example)",
  registrationNumber: "00000000",
  vatId: "EE000000000",
  address: {
    lines: ["Example street 1"],
    postalCode: "00000",
    city: "Tallinn",
    countryIso2: "EE",
  },
} as const;

/**
 * The four named media slots (TASK-052). The caption prints the slot's own `sizes` string and
 * reserved ratio, because those two decisions are the whole of what `Media` fixes — and a
 * reviewer reading the sheet should not have to open `slots.ts` to see them.
 */
export const MEDIA_SLOT_CAPTION = "slot · sizes · reserved ratio";

/**
 * The home's above-the-fold states (TASK-052). Three of §5.3's are renderable here: the hero band
 * with its reserved slot, the finder card in its untouched state, and the destination list in its
 * `unpublished-destination` state. The two that are not: `published-destination`, which needs a
 * `corridorPagePublished: true` row Phase 0 does not have (covered by the mocked-registry
 * assertions in `tests/unit/ui-home.test.tsx`), and the type-ahead's open list, which is a
 * hydrated state a screenshot of this page cannot hold still (covered in `tests/e2e/home.spec.ts`
 * and `tests/a11y/home.spec.ts`).
 */
export const HOME_STATES = {
  hero: "HomeHero \u00b7 default \u2014 the reserved full-bleed photo slot with its caption and no `<img>` (plan/10 \u00a73), the paper card at the inline start on the desktop artboard and overlapping the slot by 56 px on the mobile one, the eyebrow, the one `<h1>` (the text LCP element) and the proposition.",
  finder:
    "FinderCard \u00b7 default \u2014 a `get` form: the country field is a native `<input list>` over a `<datalist>` of the seven destinations until the island hydrates, then a filtered list with a polite live region; town/postcode is optional; the date field carries no default, because this document is ISR-cached and a prefilled date goes stale. `Continue` is neutral and targets the destination list while no corridor page is published.",
  destinations:
    "DestinationList \u00b7 unpublished-destination \u2014 all seven named with their state as a word, none of them a link, and the onboarding line. TASK-054's destinations grid inherits this section's id.",
  proof:
    "ProofRow \u00b7 default \u2014 the four claims of the round-2 artboard, in the first person, 2-up on the mobile artboard and 4-up on the desktop one. The delivery-photo fact renders no photo.",
} as const;
