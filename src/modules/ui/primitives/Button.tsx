/**
 * `Button` (spec 004 §2, §5.3, AC-20's "equal prominence" arithmetic; TASK-045).
 *
 * The canvas's `.btn`: 50 px tall, 26 px inline padding, `--radius-sm`, medium weight, tracked
 * 0.02em, inked fill by default and the accent fill for the one primary action on a page. Every
 * later 004 task takes its buttons from here — which is what makes AC-20's "same rendered width
 * class, same font size and weight" a property of one component instead of three call sites.
 *
 * **Eight states, all reachable in `/dev/components`** (§2's gallery clause): `default`, `hover`,
 * `active`, `focus-visible`, `disabled`, `busy`, `full-width` and `with-icon`. Three of them are
 * pointer/keyboard states that a screenshot cannot reach, so `forceState` renders the *same*
 * classes statically — the "hover-equivalent" §2 asks the gallery for. Nothing outside the gallery
 * may pass it.
 *
 * A disabled button is `disabled` **and** `aria-disabled`, and a busy one keeps focus (it stays in
 * the tab order and announces `aria-busy`), because a control that vanishes from the tab order
 * mid-interaction loses the keyboard user's place.
 *
 * `href` renders an `<a>` with the same skin: a control that navigates is a link (WCAG 4.1.2), and
 * the design gives them identical weight, so this is the one component where both exist.
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

export const BUTTON_SIZES = ["md", "sm"] as const;
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
  "inline-flex items-center justify-center gap-sm rounded-sm font-medium tracking-[0.02em] transition-colors motion-fast ease-standard select-none";

const SIZE_CLASS: Readonly<Record<ButtonSize, string>> = {
  // 50 px on the canvas; the 44 px tap-target floor of §5.3 is met with room to spare.
  md: "min-h-[50px] px-[26px] text-md",
  sm: "min-h-[44px] px-md text-sm",
};

interface VariantSkin {
  readonly base: string;
  readonly hover: string;
  readonly active: string;
}

const VARIANT_SKIN: Readonly<Record<ButtonVariant, VariantSkin>> = {
  primary: {
    base: "bg-surface-inverse text-on-inverse border border-transparent",
    hover: "bg-ink-muted",
    active: "bg-ink",
  },
  accent: {
    base: "bg-accent text-on-accent border border-transparent",
    hover: "bg-accent-strong",
    active: "bg-accent-strong",
  },
  secondary: {
    base: "bg-surface text-ink border border-border-strong",
    hover: "border-border-emphasis text-ink",
    active: "bg-surface-muted",
  },
  quiet: {
    base: "bg-transparent text-ink border border-transparent underline underline-offset-4",
    hover: "text-accent",
    active: "text-ink-muted",
  },
  danger: {
    base: "bg-danger text-on-danger border border-transparent",
    hover: "bg-danger-strong",
    active: "bg-danger-strong",
  },
};

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
  const hoverClasses = skin.hover
    .split(" ")
    .map((utility) => `hover:${utility}`)
    .join(" ");
  const activeClasses = skin.active
    .split(" ")
    .map((utility) => `active:${utility}`)
    .join(" ");
  const forced =
    forceState === "hover"
      ? skin.hover
      : forceState === "active"
        ? skin.active
        : forceState === "focus-visible"
          ? "outline-2 outline-offset-2 outline-focus"
          : "";

  const classes = [
    BASE,
    SIZE_CLASS[size],
    skin.base,
    hoverClasses,
    activeClasses,
    forced,
    fullWidth ? "w-full" : "",
    disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
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
