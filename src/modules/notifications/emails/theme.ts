/**
 * The email palette, type and measures (artboard `email-layout-*.dc.html`, "Colour", "Type",
 * "Measurements"; spec 016 §5.3; TASK-332).
 *
 * Mail clients do not read CSS custom properties, so an email needs literal colours. They are
 * not new colours: each one is the sRGB rendering of the `@theme` token of `src/app/globals.css`
 * named beside it, the escalation the layout artboard proposes ("emails/theme.ts generated from
 * globals.css (oklch to sRGB hex) ... checked in CI"). `tests/unit/email-theme.test.ts` converts
 * every named token from `globals.css` and fails when a value here no longer matches it, so the
 * email palette cannot drift from the site's.
 */

/** Token name (without `--color-`) → its sRGB hex. */
export const EMAIL_COLOURS = {
  "paper-2": "#fdfbf7",
  card: "#ffffff",
  rule: "#d9d9e8",
  ink: "#1f1c3d",
  "ink-2": "#4a4968",
  "ink-3": "#60607a",
  eyebrow: "#2757b6",
  accent: "#c92516",
  "accent-strong": "#ac0700",
  "accent-ink": "#ffffff",
  link: "#2757b6",
  stem: "#136239",
  "sage-wash": "#ddedff",
  "leaf-wash": "#d9f5e1",
  blush: "#ffe0da",
  butter: "#fff4ca",
  "logo-ink": "#101418",
  "logo-accent": "#095c34",
} as const;

export type EmailColour = keyof typeof EMAIL_COLOURS;

/** The colour of a token. */
export function colour(token: EmailColour): string {
  return EMAIL_COLOURS[token];
}

/**
 * The font stacks of `globals.css`. No web font is loaded: clients that refuse one fall back to
 * Georgia and the system sans, which the layout is drawn to survive (artboard "Type").
 */
export const EMAIL_FONTS = {
  display: "Fraunces,'Iowan Old Style',Georgia,serif",
  body: "'Alegreya Sans','Gill Sans','Segoe UI',system-ui,sans-serif",
  logo: "Newsreader,Georgia,serif",
  mono: "ui-monospace,'SF Mono',Menlo,monospace",
} as const;

/** The artboard's measures, in pixels. */
export const EMAIL_MEASURES = {
  card: 600,
  radiusCard: 14,
  radiusBox: 10,
  gutter: 48,
  phoneGutter: 20,
  blockGap: 20,
  phoneBlockGap: 18,
  heading: 32,
  phoneHeading: 26,
  body: 17,
  phoneBody: 16,
  small: 14,
  label: 13,
  button: 52,
  factLabel: 148,
} as const;
