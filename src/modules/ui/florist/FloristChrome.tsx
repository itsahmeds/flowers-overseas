/**
 * Florist chrome (spec 011 §5.3; artboards `florist-sign-in-desktop` / `-mobile` and the frame of
 * `florist-inbox-desktop` / `-mobile`; TASK-212). Imported by the florist route tree from this
 * file and kept out of the `src/modules/ui` barrel, like the admin chrome, so no public page's
 * client graph can reach it.
 *
 *  - `FloristHeader` — the artboards' `.fr-hdr`: the mark and the word mark linking to the inbox,
 *    then whatever the page puts at the end (the language links before sign-in; the menu after).
 *    60 px on a phone, 72 px from `md`.
 *  - `FloristLanguageLinks` — `.fr-langs`: one link per language, the current one marked with
 *    `aria-current`. Before sign-in they are `?hl=` links (never `Accept-Language`, never an IP);
 *    on a phone they sit under the card, on a desktop in the header (the audit's decision 4).
 *  - `FloristLanguageForm` — after sign-in the same links are buttons of one `POST` form that
 *    stores `partner_member.locale_code` (AC-32).
 *  - `FloristNotice` — `.fm-notice`, `warn` in blush: the expired-link line.
 *  - `FloristDemoNotice` — `.fr-demo`: the demo line under the header on every inbox page.
 *  - `FloristMenu` — `.fr-menu`: a `<details>` disclosure holding the language form and sign-out,
 *    so it works with JavaScript off.
 *
 *  - `FloristSignInCard`, `FloristSignInTitle`, `FloristMailDisc`, `FloristTextField` — the
 *    artboards' `.si-card`, the same 440 px card the admin sign-in draws. Drawn here rather than
 *    imported from the admin chrome, which no non-admin route may import (spec 012 AC-7).
 *
 * Presentational only: every word arrives as a prop. Logical properties only; targets ≥ 44 px.
 */
import type { ReactElement, ReactNode } from "react";

import { Mark } from "../icons/Mark";

export function FloristHeader({
  homeHref,
  homeLabel,
  brand,
  children,
}: {
  readonly homeHref: string;
  /** The link's accessible name, e.g. "Flowers Overseas, your orders". */
  readonly homeLabel: string;
  readonly brand: string;
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <header className="border-rule bg-paper flex min-h-[60px] items-center gap-[12px] border-b px-[20px] md:min-h-[72px] md:px-[56px]">
      <a
        href={homeHref}
        aria-label={homeLabel}
        className="text-logo-ink inline-flex min-h-[44px] items-center gap-[10px] no-underline"
      >
        <Mark className="size-[28px] flex-none md:size-[34px]" />
        <span
          aria-hidden="true"
          className="font-logo tracking-wordmark text-[18px] font-medium whitespace-nowrap md:text-[22px]"
        >
          {brand}
        </span>
      </a>
      {children}
    </header>
  );
}

export interface FloristLanguageOption {
  readonly code: string;
  /** The language's own name ("Polski"). */
  readonly name: string;
  readonly href: string;
  readonly current: boolean;
}

const LANGUAGE_LINK =
  "text-ui inline-flex min-h-[44px] items-center px-[8px] underline-offset-[4px]";

/** `.fr-langs` as `?hl=` links. `placement` decides where it shows: header (md+) or under the card. */
export function FloristLanguageLinks({
  label,
  options,
  placement,
}: {
  readonly label: string;
  readonly options: readonly FloristLanguageOption[];
  readonly placement: "header" | "below";
}): ReactElement {
  return (
    <nav
      aria-label={label}
      className={
        placement === "header"
          ? "ms-auto hidden flex-wrap items-center gap-x-[6px] gap-y-[4px] md:flex"
          : "flex flex-wrap items-center justify-center gap-x-[6px] gap-y-[4px] pb-[24px] md:hidden"
      }
    >
      {options.map((option) => (
        <a
          key={option.code}
          href={option.href}
          lang={option.code}
          hrefLang={option.code}
          {...(option.current ? { "aria-current": "true" as const } : {})}
          className={`${LANGUAGE_LINK} ${option.current ? "text-ink font-bold no-underline" : "text-ink-2 underline"}`}
        >
          {option.name}
        </a>
      ))}
    </nav>
  );
}

/** After sign-in: the languages as the buttons of one form that stores the choice (AC-32). */
export function FloristLanguageForm({
  label,
  action,
  back,
  options,
}: {
  readonly label: string;
  readonly action: string;
  /** The page to return to (a florist path; the handler checks it). */
  readonly back: string;
  readonly options: readonly Omit<FloristLanguageOption, "href">[];
}): ReactElement {
  return (
    <form method="post" action={action} aria-label={label}>
      <input type="hidden" name="back" value={back} />
      <div className="-ms-[8px] flex flex-wrap items-center gap-x-[6px] gap-y-[4px]">
        {options.map((option) => (
          <button
            key={option.code}
            type="submit"
            name="locale"
            value={option.code}
            lang={option.code}
            {...(option.current ? { "aria-current": "true" as const } : {})}
            className={`${LANGUAGE_LINK} cursor-pointer bg-transparent ${option.current ? "text-ink font-bold" : "text-ink-2 underline"}`}
          >
            {option.name}
          </button>
        ))}
      </div>
    </form>
  );
}

/** `.fm-notice` (`warn`: blush, no rule). */
export function FloristNotice({
  tone,
  children,
}: {
  readonly tone: "warn" | "plain";
  readonly children: ReactNode;
}): ReactElement {
  return (
    <p
      role={tone === "warn" ? "alert" : "status"}
      className={`rounded-field text-ui text-ink grid gap-[6px] px-[18px] py-[16px] leading-[1.3] ${
        tone === "warn"
          ? "bg-blush"
          : "bg-paper-2 shadow-[inset_0_0_0_1px_var(--color-rule)]"
      }`}
    >
      {children}
    </p>
  );
}

/** `.fr-demo`: the demo line under the header. */
export function FloristDemoNotice({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <p
      role="note"
      className="border-rule bg-paper-3 text-ink-2 [&_b]:text-ink border-b px-[20px] py-[10px] text-sm leading-[1.3] md:px-[56px]"
    >
      {children}
    </p>
  );
}

/** `.fr-menu`: the header's disclosure, holding the language form and sign-out. */
export function FloristMenu({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <details className="relative ms-auto">
      <summary className="text-ui inline-flex min-h-[44px] cursor-pointer list-none items-center gap-[10px] rounded-full px-[16px] font-bold shadow-[inset_0_0_0_1.5px_var(--color-ink)] [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="relative h-[12px] w-[18px] border-y-2 border-current after:absolute after:start-0 after:end-0 after:top-[3px] after:border-t-2 after:border-current after:content-['']"
        />
        {label}
      </summary>
      <div className="border-rule bg-paper absolute end-0 z-20 mt-[8px] grid w-[min(320px,calc(100vw-40px))] gap-[14px] rounded-[16px] border p-[16px] shadow-[var(--shadow-md)]">
        {children}
      </div>
    </details>
  );
}

/** A heading inside the menu panel (`.fr-panel h2`). */
export function FloristMenuHeading({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <h2 className="tracking-label text-ink-3 text-xs font-bold uppercase">
      {children}
    </h2>
  );
}

/** `.si-body` / `.si-card`: the 440 px sign-in column and its card. */
export function FloristSignInCard({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <main className="bg-paper grid justify-items-center px-[20px] pt-[32px] pb-[48px] md:px-[56px] md:pt-[72px] md:pb-[96px]">
      <div className="rounded-photo bg-card grid w-full max-w-[440px] gap-[18px] px-[24px] py-[28px] shadow-[inset_0_0_0_1px_var(--color-rule),var(--shadow-sm)] md:px-[40px] md:pt-[40px] md:pb-[36px]">
        {children}
      </div>
    </main>
  );
}

/** The card's heading: 30 px on a phone, 36 px from `md`. */
export function FloristSignInTitle({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <h1 className="font-display tracking-display text-ink text-[30px] leading-[1.12] md:text-[36px]">
      {children}
    </h1>
  );
}

/** `.si-mail`: the envelope disc of the "check your email" state. */
export function FloristMailDisc(): ReactElement {
  return (
    <span className="bg-sage-wash text-mark grid size-[52px] place-items-center rounded-full">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="size-[26px]"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </svg>
    </span>
  );
}

/** `.fm-f`: a labelled email field. */
export function FloristTextField({
  id,
  name,
  label,
  autoComplete,
  maxLength,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly autoComplete: string;
  readonly maxLength: number;
}): ReactElement {
  return (
    <div className="grid min-w-0 content-start gap-[6px]">
      <label htmlFor={id} className="text-ui text-ink font-bold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="email"
        required
        autoComplete={autoComplete}
        maxLength={maxLength}
        className="rounded-field border-field-edge bg-card text-ui text-ink min-h-[50px] w-full border-[1.5px] px-[14px]"
      />
    </div>
  );
}
