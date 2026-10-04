/**
 * The declared contrast manifest (spec 004 §2 "Tokens", AC-3, §14 A21 clause 2; TASK-045,
 * TASK-175).
 *
 * §2 asks for "every foreground/background pair a component is allowed to use" plus a unit test
 * that computes the WCAG 2.1 relative-contrast ratio for each and fails below its threshold. This
 * module is the manifest and the arithmetic; `tests/unit/contrast.test.ts` is the gate. Adding a
 * component that needs a new pair means adding it here, which means passing the test — `plan/07`
 * §8's "contrast-checked palette" as a gate rather than a promise.
 *
 * Two deliberate design points:
 *
 *  - **The values are read from `src/app/globals.css`, not restated here.** The test parses the
 *    `@theme` block and resolves the `var()` chains, so the ratios are computed from the tokens
 *    themselves: changing `--color-ink-3` to a failing value fails the test with the pair named,
 *    which is exactly AC-3's wording, and no colour literal is duplicated into TypeScript (which
 *    `fo/no-raw-color` would reject anyway).
 *  - **A `decorative` kind exists and must carry a reason.** `--color-rule` is a 1 px section
 *    separator at about 1.4:1; WCAG 1.4.11 governs boundaries needed to *identify* a component,
 *    and the design identifies fields with `--color-field-edge` and buttons by their fill or ink
 *    outline instead. Declaring the hairline as decorative-with-a-reason keeps the manifest complete
 *    (every colour token appears in it — asserted) without shipping a silent exception.
 */

/** What a pair is used for; each kind carries the WCAG threshold that applies to it. */
export type ContrastKind =
  "body-text" | "large-text" | "boundary" | "focus" | "decorative";

/**
 * WCAG 2.1 thresholds. 4.5:1 for body text (1.4.3), 3:1 for text ≥24 px or ≥19 px bold, 3:1 for
 * UI component boundaries and focus indicators (1.4.11). `decorative` asserts nothing and demands
 * a written reason instead.
 */
export const CONTRAST_THRESHOLDS: Readonly<Record<ContrastKind, number>> = {
  "body-text": 4.5,
  "large-text": 3,
  boundary: 3,
  focus: 3,
  decorative: 1,
};

export interface ContrastPair {
  /** Foreground token, as declared in the `@theme` block. */
  readonly foreground: string;
  /** Background token. */
  readonly background: string;
  readonly kind: ContrastKind;
  /** Where the pair is used — the sentence a reviewer checks the component against. */
  readonly usage: string;
  /** Required for `decorative`: why no ratio threshold applies. */
  readonly reason?: string;
}

/**
 * Every pair a component may use (design system v2, `docs/design/system/colour.dc.html`). Ordered
 * by surface so a palette change is read top to bottom.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  // Ink on the grounds: milk paper, the cream band, the muted band and the white card or field.
  {
    foreground: "--color-ink",
    background: "--color-paper",
    kind: "body-text",
    usage: "body copy, headings and names on the page",
  },
  {
    foreground: "--color-ink-2",
    background: "--color-paper",
    kind: "body-text",
    usage: "secondary copy, breadcrumb links and none-values on the page",
  },
  {
    foreground: "--color-ink-3",
    background: "--color-paper",
    kind: "body-text",
    usage:
      "the label voice, the equivalents line, small print and the honesty label on the page",
  },
  {
    foreground: "--color-ink",
    background: "--color-paper-2",
    kind: "body-text",
    usage: "body copy, headings and names on a cream band",
  },
  {
    foreground: "--color-ink-2",
    background: "--color-paper-2",
    kind: "body-text",
    usage: "secondary copy, breadcrumb links and none-values on a cream band",
  },
  {
    foreground: "--color-ink-3",
    background: "--color-paper-2",
    kind: "body-text",
    usage:
      "the label voice, the equivalents line, small print and the honesty label on a cream band",
  },
  {
    foreground: "--color-ink",
    background: "--color-paper-3",
    kind: "body-text",
    usage:
      "body copy, headings and names on a muted band (the summary's sticky dock, a disabled control)",
  },
  {
    foreground: "--color-ink-2",
    background: "--color-paper-3",
    kind: "body-text",
    usage:
      "secondary copy, breadcrumb links and none-values on a muted band (the summary's sticky dock, a disabled control)",
  },
  {
    foreground: "--color-ink-3",
    background: "--color-paper-3",
    kind: "body-text",
    usage:
      "the label voice, the equivalents line, small print and the honesty label on a muted band (the summary's sticky dock, a disabled control)",
  },
  {
    foreground: "--color-ink",
    background: "--color-card",
    kind: "body-text",
    usage: "body copy, headings and names on a white card, letter or field",
  },
  {
    foreground: "--color-ink-2",
    background: "--color-card",
    kind: "body-text",
    usage:
      "secondary copy, breadcrumb links and none-values on a white card, letter or field",
  },
  {
    foreground: "--color-ink-3",
    background: "--color-card",
    kind: "body-text",
    usage:
      "the label voice, the equivalents line, small print and the honesty label on a white card, letter or field",
  },
  // Ink on the four stamp tints (stamps, the note card, the price summary, the picker note).
  {
    foreground: "--color-ink",
    background: "--color-blush",
    kind: "body-text",
    usage: "a stamp's day and name, a summary's rows on blush",
  },
  {
    foreground: "--color-ink-2",
    background: "--color-blush",
    kind: "body-text",
    usage: "a stamp's month and note on blush",
  },
  {
    foreground: "--color-ink-3",
    background: "--color-blush",
    kind: "body-text",
    usage: "the label voice on blush",
  },
  {
    foreground: "--color-ink",
    background: "--color-butter",
    kind: "body-text",
    usage: "a stamp's day and name, a summary's rows on butter",
  },
  {
    foreground: "--color-ink-2",
    background: "--color-butter",
    kind: "body-text",
    usage: "a stamp's month and note on butter",
  },
  {
    foreground: "--color-ink-3",
    background: "--color-butter",
    kind: "body-text",
    usage: "the label voice on butter",
  },
  {
    foreground: "--color-ink",
    background: "--color-sage-wash",
    kind: "body-text",
    usage: "a stamp's day and name, a summary's rows on sage-wash",
  },
  {
    foreground: "--color-ink-2",
    background: "--color-sage-wash",
    kind: "body-text",
    usage: "a stamp's month and note on sage-wash",
  },
  {
    foreground: "--color-ink-3",
    background: "--color-sage-wash",
    kind: "body-text",
    usage: "the label voice on sage-wash",
  },
  {
    foreground: "--color-ink",
    background: "--color-leaf-wash",
    kind: "body-text",
    usage: "a stamp's day and name, a summary's rows on leaf-wash",
  },
  {
    foreground: "--color-ink-2",
    background: "--color-leaf-wash",
    kind: "body-text",
    usage: "a stamp's month and note on leaf-wash",
  },
  {
    foreground: "--color-ink-3",
    background: "--color-leaf-wash",
    kind: "body-text",
    usage: "the label voice on leaf-wash",
  },
  // Poppy: prices, Send and the one emotional phrase per page.
  {
    foreground: "--color-accent",
    background: "--color-paper",
    kind: "body-text",
    usage: "a price, a from-price and the italic phrase on paper",
  },
  {
    foreground: "--color-accent",
    background: "--color-paper-2",
    kind: "body-text",
    usage: "a price, a from-price and the italic phrase on paper-2",
  },
  {
    foreground: "--color-accent",
    background: "--color-card",
    kind: "body-text",
    usage: "a price, a from-price and the italic phrase on card",
  },
  {
    foreground: "--color-accent",
    background: "--color-blush",
    kind: "body-text",
    usage: "a sentence choice in its hover state (blush behind poppy italic)",
  },
  {
    foreground: "--color-accent-ink",
    background: "--color-accent",
    kind: "body-text",
    usage: "the label of a primary or send button and of the poppy chip",
  },
  {
    foreground: "--color-on-accent",
    background: "--color-accent-strong",
    kind: "body-text",
    usage: "a primary button's label in its hover, active and busy states",
  },
  // Cornflower: links, eyebrows, the selected chip, day and tier.
  {
    foreground: "--color-sky",
    background: "--color-paper",
    kind: "body-text",
    usage: "a link, an eyebrow and a quiet button on paper",
  },
  {
    foreground: "--color-sky-strong",
    background: "--color-paper",
    kind: "body-text",
    usage: "a link's hover state on paper",
  },
  {
    foreground: "--color-sky",
    background: "--color-paper-2",
    kind: "body-text",
    usage: "a link, an eyebrow and a quiet button on paper-2",
  },
  {
    foreground: "--color-sky-strong",
    background: "--color-paper-2",
    kind: "body-text",
    usage: "a link's hover state on paper-2",
  },
  {
    foreground: "--color-sky",
    background: "--color-card",
    kind: "body-text",
    usage: "a link, an eyebrow and a quiet button on card",
  },
  {
    foreground: "--color-sky-strong",
    background: "--color-card",
    kind: "body-text",
    usage: "a link's hover state on card",
  },
  {
    foreground: "--color-on-selected",
    background: "--color-selected",
    kind: "body-text",
    usage: "the label of the current chip and the selected day or tier",
  },
  // Poppy-strong: a date's fee, on the chip and in the summary (TASK-179).
  {
    foreground: "--color-accent-strong",
    background: "--color-card",
    kind: "body-text",
    usage: "a date chip's fee on card (the product page's date picker)",
  },
  {
    foreground: "--color-accent-strong",
    background: "--color-butter",
    kind: "body-text",
    usage: "the fee row of the product page's summary on butter",
  },
  // Leaf: "included".
  {
    foreground: "--color-stem",
    background: "--color-paper",
    kind: "body-text",
    usage: "the word “included” on paper (the add-on list, the summary panel)",
  },
  {
    foreground: "--color-stem",
    background: "--color-card",
    kind: "body-text",
    usage: "the word “included” on card (the add-on list, the summary panel)",
  },
  {
    foreground: "--color-stem",
    background: "--color-butter",
    kind: "body-text",
    usage: "the word “included” on butter (the add-on list, the summary panel)",
  },
  // The inverse surface: the notice bar and the promise band.
  {
    foreground: "--color-on-inverse",
    background: "--color-surface-inverse",
    kind: "body-text",
    usage: "the notice bar's sentence and links, the promise band's copy",
  },
  {
    foreground: "--color-on-inverse-accent",
    background: "--color-surface-inverse",
    kind: "body-text",
    usage:
      "the notice bar's strong phrase and the promise band's eyebrow and icons",
  },
  {
    foreground: "--color-on-inverse-accent",
    background: "--color-surface-inverse",
    kind: "focus",
    usage:
      "the focus ring on the inverse surface (`surface-inverse` swaps the poppy ring, which is 2.90:1 on ink, for sunflower)",
  },
  // The photo slot's caption sits on a gradient, so both ends are pairs.
  {
    foreground: "--color-photo-ink",
    background: "--color-photo-stop-1",
    kind: "body-text",
    usage: "the `photo` placeholder caption over the gradient's lightest stop",
  },
  {
    foreground: "--color-photo-ink",
    background: "--color-photo-stop-3",
    kind: "body-text",
    usage: "the `photo` placeholder caption over the gradient's darkest stop",
  },
  // Component boundaries, the logo and the focus ring.
  {
    foreground: "--color-field-edge",
    background: "--color-card",
    kind: "boundary",
    usage: "a field's 1.5 px edge on its white fill (WCAG 1.4.11)",
  },
  {
    foreground: "--color-field-edge",
    background: "--color-paper",
    kind: "boundary",
    usage: "a field's edge against the page",
  },
  {
    foreground: "--color-border-strong",
    background: "--color-paper",
    kind: "boundary",
    usage: "a chip's hover edge and a secondary control's boundary",
  },
  {
    foreground: "--color-border-emphasis",
    background: "--color-paper",
    kind: "boundary",
    usage: "the secondary button's 1.5 px ink outline",
  },
  {
    foreground: "--color-surface-inverse",
    background: "--color-paper",
    kind: "boundary",
    usage:
      "the edge of the notice bar, the current page number and the inverse band against paper",
  },
  {
    foreground: "--color-logo-ink",
    background: "--color-paper",
    kind: "boundary",
    usage: "the logo mark's stem and petals (a graphical object, WCAG 1.4.11)",
  },
  {
    foreground: "--color-logo-accent",
    background: "--color-paper",
    kind: "boundary",
    usage: "the logo mark's origin and heart",
  },
  {
    foreground: "--color-focus",
    background: "--color-paper",
    kind: "focus",
    usage: "the `:focus-visible` ring on paper",
  },
  {
    foreground: "--color-focus",
    background: "--color-paper-2",
    kind: "focus",
    usage: "the `:focus-visible` ring on paper-2",
  },
  {
    foreground: "--color-focus",
    background: "--color-paper-3",
    kind: "focus",
    usage: "the `:focus-visible` ring on paper-3",
  },
  {
    foreground: "--color-focus",
    background: "--color-card",
    kind: "focus",
    usage: "the `:focus-visible` ring on card",
  },
  // Status colours, both directions.
  {
    foreground: "--color-success",
    background: "--color-paper",
    kind: "body-text",
    usage: "success text",
  },
  {
    foreground: "--color-warning",
    background: "--color-paper",
    kind: "body-text",
    usage: "warning text",
  },
  {
    foreground: "--color-danger",
    background: "--color-paper",
    kind: "body-text",
    usage: "error text, including a field's error message",
  },
  {
    foreground: "--color-on-success",
    background: "--color-success",
    kind: "body-text",
    usage: "text on a success fill",
  },
  {
    foreground: "--color-on-warning",
    background: "--color-warning",
    kind: "body-text",
    usage: "text on a warning fill",
  },
  {
    foreground: "--color-on-danger",
    background: "--color-danger",
    kind: "body-text",
    usage: "the label of a danger button",
  },
  {
    foreground: "--color-on-danger",
    background: "--color-danger-strong",
    kind: "body-text",
    usage: "a danger button's label in its hover and active state",
  },
  // Declared, deliberately not threshold-tested.
  {
    foreground: "--color-rule",
    background: "--color-paper",
    kind: "decorative",
    usage:
      "the 1 px hairline between sections, a card chip's inset edge and the facts list's row separators",
    reason:
      "a separator, not a component boundary: nothing has to be identified by it alone \u2014 a chip is identified by its white fill and its text, a field by --color-field-edge, a button by its fill or its ink outline, which are the boundary pairs above (WCAG 1.4.11 applies to those, not to the hairline)",
  },
  {
    foreground: "--color-photo-stop-2",
    background: "--color-paper",
    kind: "decorative",
    usage: "the middle stop of the photography placeholder gradient",
    reason:
      "a gradient stop behind a caption whose own contrast is tested against the lightest and darkest stops; no text or boundary uses this colour directly",
  },
  {
    foreground: "--color-sun",
    background: "--color-paper",
    kind: "decorative",
    usage:
      "the sunflower tape on the P.S. and the sunflower rule under the demo sentence",
    reason:
      "a highlight that is never text on paper and never the only carrier of a meaning (the typography and colour sheets' rule); as text it appears only on ink, which is the body-text pair above",
  },
];

/**
 * Colour tokens that are not one opaque colour, so no ratio can be computed for them, each with
 * the reason it needs none. Every other `--color-*` token must appear in a pair (AC-3's "absent
 * from the manifest" clause); these are the only exemptions, and the test reads this list rather
 * than a hard-coded name.
 */
export const NON_SINGLE_COLOUR_TOKENS: Readonly<Record<string, string>> = {
  "--color-photo":
    "the placeholder gradient; its three stops are declared separately and the caption is paired against the lightest and darkest",
  "--color-shade":
    "plum-navy at 12 % alpha, used only inside box-shadow and drop-shadow values; no text or boundary is drawn in it",
  "--color-scrim":
    "plum-navy at 45 % alpha behind an open overlay; the overlay's own surface carries the text, so the scrim is never a text background",
};

/** An OKLCH colour, as written in the `@theme` block. */
export interface Oklch {
  /** Lightness, 0–1. */
  readonly l: number;
  /** Chroma, 0–0.4-ish. */
  readonly c: number;
  /** Hue, degrees. */
  readonly h: number;
}

const OKLCH = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/;
const VAR_REFERENCE = /^var\(\s*(--[\w-]+)\s*\)$/;

/** Parses `oklch(42% 0.1 155)`. Returns `undefined` for anything else. */
export function parseOklch(value: string): Oklch | undefined {
  const match = OKLCH.exec(value.trim());
  if (match === null) return undefined;
  const [, l, c, h] = match;
  if (l === undefined || c === undefined || h === undefined) return undefined;
  return { l: Number(l) / 100, c: Number(c), h: Number(h) };
}

/**
 * Extracts the custom properties of the first `@theme` block of a stylesheet, with whitespace
 * collapsed so a multi-line value (the gradient, a shadow) is one string.
 *
 * Deliberately a small regex parser rather than a PostCSS dependency: the input is one file this
 * repository writes, the failure mode is a missing token (which the test reports by name), and a
 * CSS AST in a unit test would be a second parser to keep in step with Tailwind's.
 */
export function parseThemeTokens(css: string): Map<string, string> {
  const start = css.indexOf("@theme");
  if (start === -1) return new Map();
  const open = css.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let index = open; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  const block = css.slice(open + 1, end === -1 ? css.length : end);
  // Comments would otherwise contribute fake declarations.
  const withoutComments = block.replaceAll(/\/\*[\s\S]*?\*\//g, "");
  const tokens = new Map<string, string>();
  for (const declaration of withoutComments.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;
    const name = declaration.slice(0, colon).trim();
    if (!name.startsWith("--")) continue;
    tokens.set(
      name,
      declaration
        .slice(colon + 1)
        .replaceAll(/\s+/g, " ")
        .trim(),
    );
  }
  return tokens;
}

/** Every declared `--color-*` token, alias or primitive. */
export function colorTokenNames(tokens: Map<string, string>): string[] {
  return [...tokens.keys()]
    .filter((name) => name.startsWith("--color-"))
    .sort();
}

/**
 * Resolves a token to a colour, following `var()` aliases. Throws with the chain when a token is
 * missing or is not an OKLCH colour — a semantic alias pointing at a gradient is a bug worth a
 * loud failure.
 */
export function resolveColorToken(
  name: string,
  tokens: Map<string, string>,
  seen: readonly string[] = [],
): Oklch {
  if (seen.includes(name)) {
    throw new Error(
      `circular token reference: ${[...seen, name].join(" -> ")}`,
    );
  }
  const value = tokens.get(name);
  if (value === undefined) {
    throw new Error(
      `token ${name} is not declared in the @theme block${seen.length > 0 ? ` (via ${seen.join(" -> ")})` : ""}`,
    );
  }
  const reference = VAR_REFERENCE.exec(value);
  if (reference?.[1] !== undefined) {
    return resolveColorToken(reference[1], tokens, [...seen, name]);
  }
  const colour = parseOklch(value);
  if (colour === undefined) {
    throw new Error(
      `token ${name} is not a single OKLCH colour and cannot be contrast-tested: ${value}`,
    );
  }
  return colour;
}

/** OKLab → linear sRGB (the standard matrices; values are not gamut-clamped yet). */
function oklchToLinearSrgb({ l, c, h }: Oklch): [number, number, number] {
  const hue = (h * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);
  const lCube = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCube = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCube = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube,
    -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube,
    -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube,
  ];
}

/**
 * WCAG 2.1 relative luminance of an OKLCH colour.
 *
 * The linear-sRGB channels are clamped to the display gamut first, which is what a browser does
 * when it paints an out-of-gamut OKLCH value, so the number the test asserts is the contrast the
 * visitor actually sees rather than a mathematical one.
 */
export function relativeLuminance(colour: Oklch): number {
  const [r, g, b] = oklchToLinearSrgb(colour).map((channel) =>
    Math.min(1, Math.max(0, channel)),
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two OKLCH colours, 1–21. */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastResult extends ContrastPair {
  readonly ratio: number;
  readonly threshold: number;
  readonly passes: boolean;
}

/** Computes the ratio of every manifest pair against the tokens of a stylesheet. */
export function evaluateContrastPairs(
  css: string,
  pairs: readonly ContrastPair[] = CONTRAST_PAIRS,
): ContrastResult[] {
  const tokens = parseThemeTokens(css);
  return pairs.map((pair) => {
    const ratio = contrastRatio(
      resolveColorToken(pair.foreground, tokens),
      resolveColorToken(pair.background, tokens),
    );
    const threshold = CONTRAST_THRESHOLDS[pair.kind];
    return { ...pair, ratio, threshold, passes: ratio >= threshold };
  });
}

/**
 * A contrast ratio as `n.nn`, built from integer arithmetic.
 *
 * Not `toFixed()` and not `Intl.NumberFormat`: `fo/no-adhoc-intl` allows neither outside
 * `src/modules/i18n/format.ts`, and it is right to — but this number is **developer output** (a PR
 * table, a step summary, the gallery), not a value a buyer reads, so it must not be localised
 * either. Integer hundredths with an ASCII decimal point is the honest third answer.
 */
export function formatRatio(ratio: number): string {
  const hundredths = Math.round(ratio * 100);
  const whole = Math.trunc(hundredths / 100);
  const fraction = String(hundredths % 100).padStart(2, "0");
  return `${String(whole)}.${fraction}`;
}

/** The table the PR body and the runbook quote. */
export function formatContrastTable(
  results: readonly ContrastResult[],
): string {
  const lines = [
    "| Foreground | Background | Kind | Ratio | Threshold |",
    "|---|---|---|---|---|",
  ];
  for (const result of results) {
    lines.push(
      `| \`${result.foreground}\` | \`${result.background}\` | ${result.kind} | ${formatRatio(result.ratio)}:1 | ${result.kind === "decorative" ? "n/a" : `${String(result.threshold)}:1`} |`,
    );
  }
  return lines.join("\n");
}
