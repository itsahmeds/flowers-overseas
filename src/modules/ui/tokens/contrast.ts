/**
 * The declared contrast manifest (spec 004 §2 "Tokens", AC-3; TASK-045).
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
 *    separator at 1.32:1; WCAG 1.4.11 governs boundaries needed to *identify* a component, and the
 *    canvas identifies fields and buttons with `--color-border-strong`/`--color-border-emphasis`
 *    instead. Declaring the hairline as decorative-with-a-reason keeps the manifest complete
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
 * Every pair a component may use. Ordered by surface so a palette change is read top to bottom.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  // Ink on the three paper surfaces.
  {
    foreground: "--color-ink",
    background: "--color-paper",
    kind: "body-text",
    usage: "body copy, headings and links on paper",
  },
  {
    foreground: "--color-ink",
    background: "--color-paper-2",
    kind: "body-text",
    usage: "body copy on a raised surface (cards, the utility strip)",
  },
  {
    foreground: "--color-ink",
    background: "--color-paper-3",
    kind: "body-text",
    usage: "body copy on a muted surface (placeholder chips, table zebra)",
  },
  {
    foreground: "--color-ink-2",
    background: "--color-paper",
    kind: "body-text",
    usage: "secondary copy and the utility strip on paper",
  },
  {
    foreground: "--color-ink-2",
    background: "--color-paper-2",
    kind: "body-text",
    usage: "secondary copy on a raised surface",
  },
  {
    foreground: "--color-ink-2",
    background: "--color-paper-3",
    kind: "body-text",
    usage: "secondary copy on a muted surface",
  },
  {
    foreground: "--color-ink-3",
    background: "--color-paper",
    kind: "body-text",
    usage: "the `label` voice, captions and field placeholders on paper",
  },
  {
    foreground: "--color-ink-3",
    background: "--color-paper-2",
    kind: "body-text",
    usage: "the `label` voice on a raised surface",
  },
  {
    foreground: "--color-ink-3",
    background: "--color-paper-3",
    kind: "body-text",
    usage: "the `label` voice on a muted surface",
  },
  // The accent as text, and the two inked fills.
  {
    foreground: "--color-accent",
    background: "--color-paper",
    kind: "body-text",
    usage: "link hover, accent icons and the accent link voice on paper",
  },
  {
    foreground: "--color-accent",
    background: "--color-paper-2",
    kind: "body-text",
    usage: "accent text on a raised surface",
  },
  {
    foreground: "--color-accent-ink",
    background: "--color-accent",
    kind: "body-text",
    usage: "the label of an accent (primary) button",
  },
  {
    foreground: "--color-accent-ink",
    background: "--color-ink",
    kind: "body-text",
    usage: "the label of an inked (default) button and the inverse surface",
  },
  {
    foreground: "--color-on-accent",
    background: "--color-accent-strong",
    kind: "body-text",
    usage: "the label of an accent button in its hover and active state",
  },
  {
    foreground: "--color-on-inverse",
    background: "--color-ink-muted",
    kind: "body-text",
    usage: "the label of an inked button in its hover state",
  },
  {
    foreground: "--color-on-danger",
    background: "--color-danger-strong",
    kind: "body-text",
    usage: "the label of a danger button in its hover and active state",
  },
  // Photography placeholder: the caption sits on a gradient, so both ends are pairs.
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
  // Component boundaries and the focus ring.
  {
    foreground: "--color-border-strong",
    background: "--color-paper",
    kind: "boundary",
    usage:
      "the boundary of a field, a chip and a secondary button (WCAG 1.4.11)",
  },
  {
    foreground: "--color-border-emphasis",
    background: "--color-paper",
    kind: "boundary",
    usage: "the underline of an active field (the canvas's field treatment)",
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
    usage: "the `:focus-visible` ring on a raised surface",
  },
  {
    foreground: "--color-focus",
    background: "--color-paper-3",
    kind: "focus",
    usage: "the `:focus-visible` ring on a muted surface",
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
    usage: "text on a danger fill",
  },
  // Declared, deliberately not threshold-tested.
  {
    foreground: "--color-rule",
    background: "--color-paper",
    kind: "decorative",
    usage: "the 1 px hairline between sections, and a table's row separator",
    reason:
      "a separator, not a component boundary: nothing has to be identified by it, and the design identifies fields, chips and buttons with --color-border-strong / --color-border-emphasis, which are boundary pairs above (WCAG 1.4.11 applies to the latter, not the former)",
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
    foreground: "--color-surface-inverse",
    background: "--color-paper",
    kind: "boundary",
    usage: "the edge of an inked button or the inverse footer against paper",
  },
];

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
