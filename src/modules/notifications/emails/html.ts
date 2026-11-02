/**
 * The email HTML builder (spec 016 §5.3 "Email templates"; TASK-332).
 *
 * Emails are rendered as escaped strings, not through React: the job tick that sends them runs in
 * a route handler, which Next bundles under the `react-server` condition, where `react-dom/server`
 * is a module that throws on import. The admin and florist sign-in emails made the same choice for
 * the same reason (`src/modules/admin/sign-in-email.ts`, `src/modules/partners/auth/sign-in-email.ts`).
 *
 * One rule keeps the output safe: **a plain `string` child is always escaped**; only a `SafeHtml`
 * value (built here, from escaped parts) is inserted as markup. Attribute values are escaped too,
 * and a `style` is written from a property map in which every inline-direction property is
 * logical (`padding-inline`, `border-inline-start`, `text-align: start`); block-direction and
 * symmetric shorthands (`padding: 32px 48px 36px`) read the same in both directions.
 */

/** Markup that is already safe to insert: produced only by this module. */
export interface SafeHtml {
  readonly html: string;
}

/** A child of an element: markup, or text to escape. `null` and `false` render nothing. */
export type Child = SafeHtml | string | null | false | undefined;

/** The CSS of one `style` attribute, as property → value (kebab-case property names). */
export type Style = Readonly<Record<string, string | number>>;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Wraps markup this module produced. Never call it with outside input. */
export function trusted(html: string): SafeHtml {
  return { html };
}

/** Text, escaped. */
export function text(value: string): SafeHtml {
  return { html: escapeHtml(value) };
}

/** Children joined in order. */
export function fragment(...children: readonly Child[]): SafeHtml {
  return {
    html: children
      .map((child) =>
        child === null || child === false || child === undefined
          ? ""
          : typeof child === "string"
            ? escapeHtml(child)
            : child.html,
      )
      .join(""),
  };
}

/** Properties whose number takes no unit. */
const UNITLESS: ReadonlySet<string> = new Set([
  "font-weight",
  "line-height",
  "opacity",
]);

/**
 * `{ "font-size": 17, "font-weight": 700 }` → `font-size:17px;font-weight:700`: a number is
 * pixels unless the property is unitless; a string is written as is.
 */
export function styleOf(style: Style): string {
  return Object.entries(style)
    .map(([property, value]) => {
      const written =
        typeof value === "number" && !UNITLESS.has(property)
          ? `${value}px`
          : String(value);
      return `${property}:${written}`;
    })
    .join(";");
}

/** The attributes of an element. `false`, `null` and `undefined` omit the attribute. */
export type Attributes = Readonly<
  Record<string, string | number | true | false | null | undefined | Style>
>;

function attributesOf(attributes: Attributes): string {
  return Object.entries(attributes)
    .map(([name, value]) => {
      if (value === false || value === null || value === undefined) return "";
      if (value === true) return ` ${name}`;
      const written =
        typeof value === "object" ? styleOf(value) : String(value);
      return ` ${name}="${escapeHtml(written)}"`;
    })
    .join("");
}

const VOID_ELEMENTS: ReadonlySet<string> = new Set(["meta", "br", "img"]);

/** One element: `el("p", { style }, "text", child)`. */
export function el(
  tag: string,
  attributes: Attributes,
  ...children: readonly Child[]
): SafeHtml {
  const open = `<${tag}${attributesOf(attributes)}>`;
  if (VOID_ELEMENTS.has(tag)) return { html: open };
  return { html: `${open}${fragment(...children).html}</${tag}>` };
}
