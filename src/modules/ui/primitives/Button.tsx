/**
 * `Button` (spec 004 §2, §5.3, AC-20's "equal prominence" arithmetic; components sheet v2
 * "Button"; TASK-045, TASK-175).
 *
 * v2 draws every button as a **pill** in Alegreya Sans 700: `primary` is the poppy pill (54 px),
 * `accent` is the same poppy fill and is what the product page's Send uses with `size="send"`
 * (60 px, the full width of the buy column), `secondary` is a 1.5 px ink outline on no fill,
 * `quiet` is cornflower underlined text 44 px tall with no padding, and `danger` keeps the danger
 * fill. v1's ink-filled primary is retired (the sheet's mapping). Every later task takes its
 * buttons from here — which is what makes AC-20's "same rendered width class, same font size and
 * weight" a property of one component instead of three call sites.
 *
 * **Eight states, all reachable in `/dev/components`** (§2's gallery clause): `default`, `hover`,
 * `active`, `focus-visible`, `disabled`, `busy`, `full-width` and `with-icon`. Three of them are
 * pointer/keyboard states that a screenshot cannot reach, so `forceState` renders the *same*
 * classes statically. Nothing outside the gallery may pass it.
 *
 * A disabled button is `disabled` **and** `aria-disabled` (forms only, never chrome — A20), and a
 * busy one keeps focus (it stays in the tab order and announces `aria-busy`), because a control
 * that vanishes from the tab order mid-interaction loses the keyboard user's place.
 *
 * `href` renders an `<a>` with the same skin: a control that navigates is a link (WCAG 4.1.2).
 */
import type { ReactElement, ReactNode } from "react";

export const BUTTON_VARIANTS = [
  "primary",
  "accent",
  "secondary",
  "quiet",
  "danger",
] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export const BUTTON_SIZES = ["md", "sm", "send"] as const;
export type ButtonSize = (typeof BUTTON_SIZES)[number];

/** The eight states the gallery renders for every variant. */
export const BUTTON_STATES = [
  "default",
  "hover",
  "active",
  "focus-visible",
  "disabled",
  "busy",
  "full-width",
  "with-icon",
] as const;
export type ButtonState = (typeof BUTTON_STATES)[number];

/** Gallery-only: renders a pointer state's classes statically. */
export type ForcedButtonState = "hover" | "active" | "focus-visible";

const BASE =
  "inline-flex items-center justify-center gap-[10px] rounded-full font-bold leading-[1.1] whitespace-nowrap transition-colors motion-fast ease-standard select-none";

/** Block size and type per size. Every size clears the 44 px target (§5.3). */
const SIZE_CLASS: Readonly<Record<ButtonSize, string>> = {
  md: "min-h-(--control-md) text-body-s",
  sm: "min-h-(--control-sm) text-ui",
  send: "min-h-(--control-send) w-full text-[19px]",
};

/** Inline padding per size; `quiet` takes none, because it is text that happens to be a button. */
const PADDING_CLASS: Readonly<Record<ButtonSize, string>> = {
  md: "px-[28px]",
  sm: "px-[20px]",
  send: "px-[28px]",
};

/**
 * Each skin is written out in full — the pointer classes included — because Tailwind finds class
 * names by scanning the source text: a `hover:` prefix added at runtime would produce no CSS.
 * `hover`/`active` are the unprefixed forms `forceState` renders statically in the gallery.
 */
interface VariantSkin {
  readonly base: string;
  readonly pointer: string;
  readonly hover: string;
  readonly active: string;
}

const VARIANT_SKIN: Readonly<Record<ButtonVariant, VariantSkin>> = {
  primary: {
    base: "bg-accent text-on-accent",
    pointer:
      "hover:bg-accent-strong active:bg-accent-strong active:translate-y-px",
    hover: "bg-accent-strong",
    active: "bg-accent-strong translate-y-px",
  },
  accent: {
    base: "bg-accent text-on-accent",
    pointer:
      "hover:bg-accent-strong active:bg-accent-strong active:translate-y-px",
    hover: "bg-accent-strong",
    active: "bg-accent-strong translate-y-px",
  },
  secondary: {
    base: "bg-transparent text-ink shadow-[inset_0_0_0_1.5px_var(--color-ink)]",
    pointer:
      "hover:bg-surface-raised active:bg-surface-muted active:translate-y-px",
    hover: "bg-surface-raised",
    active: "bg-surface-muted translate-y-px",
  },
  quiet: {
    base: "bg-transparent text-link underline decoration-[1.5px] underline-offset-[5px]",
    pointer: "hover:text-link-strong active:text-link-strong",
    hover: "text-link-strong",
    active: "text-link-strong",
  },
  danger: {
    base: "bg-danger text-on-danger",
    pointer:
      "hover:bg-danger-strong active:bg-danger-strong active:translate-y-px",
    hover: "bg-danger-strong",
    active: "bg-danger-strong translate-y-px",
  },
};

/** The sheet's disabled skin, the same for every variant: muted fill, subtle ink, a hairline. */
const DISABLED_SKIN =
  "bg-surface-muted text-ink-subtle shadow-[inset_0_0_0_1.5px_var(--color-rule)] cursor-not-allowed";

export interface ButtonProps {
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly type?: "button" | "submit" | "reset";
  readonly disabled?: boolean;
  /** In progress: keeps focus and the tab order, announces `aria-busy`. */
  readonly busy?: boolean;
  readonly fullWidth?: boolean;
  /** Renders an `<a>` instead of a `<button>`. */
  readonly href?: string;
  /** Icon at the inline start, from the icon set. Decorative — the label carries the meaning. */
  readonly iconStart?: ReactNode;
  /** Gallery only (`/dev/components`): render a pointer state statically. */
  readonly forceState?: ForcedButtonState;
  readonly className?: string;
  readonly id?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-label"?: string;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  type = "button",
  disabled = false,
  busy = false,
  fullWidth = false,
  href,
  iconStart,
  forceState,
  className,
  id,
  ...aria
}: ButtonProps): ReactElement {
  const skin = VARIANT_SKIN[variant];
  const forced =
    forceState === "hover"
      ? skin.hover
      : forceState === "active"
        ? skin.active
        : forceState === "focus-visible"
          ? "outline-[2.5px] outline-offset-[3px] outline-solid outline-focus"
          : "";

  const classes = [
    BASE,
    SIZE_CLASS[size],
    variant === "quiet" ? "px-0" : PADDING_CLASS[size],
    disabled
      ? DISABLED_SKIN
      : [
          busy ? `${skin.base} ${skin.hover}` : skin.base,
          skin.pointer,
          forced,
          "cursor-pointer",
        ].join(" "),
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {iconStart}
      <span>{children}</span>
    </>
  );

  if (href !== undefined) {
    return (
      <a id={id} className={classes} href={href} {...aria}>
        {content}
      </a>
    );
  }

  return (
    <button
      id={id}
      className={classes}
      type={type}
      disabled={disabled}
      aria-disabled={disabled ? true : undefined}
      aria-busy={busy ? true : undefined}
      {...aria}
    >
      {content}
    </button>
  );
}
