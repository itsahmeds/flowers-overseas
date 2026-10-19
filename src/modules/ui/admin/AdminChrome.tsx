/**
 * Admin chrome (spec 012 §5.3 "Admin primitives"; imported by `src/app/admin` from this file and
 * kept out of the `src/modules/ui` barrel, so no public page's client graph can reach it; artboards `admin-sign-in-*`, `admin-home-*`,
 * `admin-users-*` and the Admin group of `docs/design/system/components.dc.html`; TASK-217).
 *
 * Presentational only: every word arrives as a prop from the admin catalogue, so this module
 * holds no string and reads no data. Logical properties only; targets at least 24 × 24 px
 * (most are 40 to 56). The artboards' measures are kept as arbitrary values where the token
 * scale has no step (the 232 px side bar, the 440 px sign-in column).
 */
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

import { Mark } from "../icons/Mark";

export type AdminEnvironment =
  "development" | "test" | "preview" | "staging" | "production";

/** The brand lock-up: the mark, the word mark and the small "Admin". */
export function AdminBrand({
  brand,
  product,
  compact = false,
}: {
  readonly brand: string;
  readonly product: string;
  readonly compact?: boolean;
}): ReactElement {
  return (
    <Link
      href="/admin"
      className="text-logo-ink flex min-h-[40px] items-center gap-[8px] no-underline"
    >
      <Mark size={26} />
      <span
        className={`font-logo tracking-wordmark font-medium whitespace-nowrap ${compact ? "text-[16px]" : "text-[17px]"}`}
      >
        {brand}
      </span>
      <small className="tracking-label text-ink-3 ms-auto text-[11px] font-bold uppercase">
        {product}
      </small>
    </Link>
  );
}

/** The environment chip: butter everywhere but production, blush there. */
export function AdminEnvironmentChip({
  environment,
  label,
}: {
  readonly environment: AdminEnvironment;
  readonly label: string;
}): ReactElement {
  const production = environment === "production";
  return (
    <span
      data-environment={environment}
      className={`inline-flex items-center gap-[6px] rounded-full px-[10px] py-[2px] text-[12px] font-bold tracking-[0.06em] uppercase ${
        production
          ? "bg-blush text-accent-strong shadow-[inset_0_0_0_1px_var(--color-accent)]"
          : "bg-butter text-ink"
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-[7px] rounded-full ${production ? "bg-accent" : "bg-warning"}`}
      />
      {label}
    </span>
  );
}

/** The top bar of the signed-out pages (and of the shell at 390). */
export function AdminTopBar({
  brand,
  product,
  environment,
  environmentLabel,
  children,
}: {
  readonly brand: string;
  readonly product: string;
  readonly environment: AdminEnvironment;
  readonly environmentLabel: string;
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <header className="border-rule bg-paper flex min-h-[56px] items-center gap-[10px] border-b px-[16px]">
      <AdminBrand brand={brand} product={product} compact />
      <AdminEnvironmentChip
        environment={environment}
        label={environmentLabel}
      />
      {children}
    </header>
  );
}

/** The 440 px sign-in column and its card. */
export function AdminSignInCard({
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

/** The card's heading. */
export function AdminSignInTitle({
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

/** The envelope disc of the "check your email" state. */
export function AdminMailDisc(): ReactElement {
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

/** A labelled text field (the artboards' `.fm-f`). */
export function AdminTextField({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  required = false,
  minLength,
  maxLength,
  defaultValue,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly type?: "text" | "email";
  readonly autoComplete?: string;
  readonly required?: boolean;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly defaultValue?: string;
}): ReactElement {
  return (
    <div className="grid min-w-0 content-start gap-[6px]">
      <label htmlFor={id} className="text-ui text-ink font-bold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        {...(autoComplete === undefined ? {} : { autoComplete })}
        {...(minLength === undefined ? {} : { minLength })}
        {...(maxLength === undefined ? {} : { maxLength })}
        {...(defaultValue === undefined ? {} : { defaultValue })}
        className="rounded-field border-field-edge bg-card text-ui text-ink min-h-[50px] w-full border-[1.5px] px-[14px]"
      />
    </div>
  );
}

/** One entry of the side bar. */
export interface AdminShellNavEntry {
  readonly href: string;
  readonly label: string;
  readonly current: boolean;
}

/**
 * The signed-in shell: a 232 px side bar (brand, environment, navigation for the role, the
 * signed-in person and sign-out) and the page; at 390 the side bar folds into a top bar with a
 * disclosure.
 */
export function AdminShell({
  brand,
  product,
  environment,
  environmentLabel,
  navLabel,
  menuLabel,
  nav,
  personName,
  personLine,
  signOutLabel,
  signOutAction,
  children,
}: {
  readonly brand: string;
  readonly product: string;
  readonly environment: AdminEnvironment;
  readonly environmentLabel: string;
  readonly navLabel: string;
  readonly menuLabel: string;
  readonly nav: readonly AdminShellNavEntry[];
  readonly personName: string;
  readonly personLine: string;
  readonly signOutLabel: string;
  readonly signOutAction: string;
  readonly children: ReactNode;
}): ReactElement {
  const navList = (
    <ul className="grid gap-[2px]">
      {nav.map((entry) => (
        <li key={entry.href}>
          <a
            href={entry.href}
            {...(entry.current ? { "aria-current": "page" as const } : {})}
            className={`text-ui text-ink flex min-h-[40px] items-center rounded-[10px] px-[12px] no-underline ${
              entry.current ? "bg-card font-bold shadow-xs" : "hover:bg-paper-3"
            }`}
          >
            {entry.label}
          </a>
        </li>
      ))}
    </ul>
  );
  const person = (
    <div className="border-rule grid gap-[6px] border-t pt-[14px]">
      <p className="text-ui text-ink font-bold">{personName}</p>
      <p className="text-ink-3 text-sm">{personLine}</p>
      <form method="post" action={signOutAction}>
        <button
          type="submit"
          className="text-ui text-link min-h-[40px] underline decoration-[1.5px] underline-offset-[5px]"
        >
          {signOutLabel}
        </button>
      </form>
    </div>
  );
  return (
    <div className="bg-paper min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="border-rule bg-paper-2 hidden border-e p-[16px] md:flex md:flex-col md:gap-[16px]">
        <AdminBrand brand={brand} product={product} />
        <AdminEnvironmentChip
          environment={environment}
          label={environmentLabel}
        />
        <nav aria-label={navLabel} className="grow">
          {navList}
        </nav>
        {person}
      </aside>
      <div className="md:hidden">
        <AdminTopBar
          brand={brand}
          product={product}
          environment={environment}
          environmentLabel={environmentLabel}
        >
          <details className="ms-auto">
            <summary className="text-ui text-ink flex min-h-[40px] cursor-pointer items-center px-[8px] font-bold">
              {menuLabel}
            </summary>
            <div className="border-rule bg-paper-2 absolute start-0 end-0 z-10 grid gap-[16px] border-b p-[16px]">
              <nav aria-label={navLabel}>{navList}</nav>
              {person}
            </div>
          </details>
        </AdminTopBar>
      </div>
      <main className="min-w-0 px-[20px] py-[24px] md:px-[40px] md:py-[28px]">
        {children}
      </main>
    </div>
  );
}

/** A page heading inside the shell. */
export function AdminPageTitle({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <h1 className="font-display tracking-display text-ink text-[26px] leading-[1.15] md:text-[32px]">
      {children}
    </h1>
  );
}

/** One counter card of the home page: a label, a big tabular number, a line and a link. */
export function AdminCounter({
  label,
  value,
  line,
  linkLabel,
  href,
  children,
}: {
  readonly label: string;
  readonly value?: string | undefined;
  readonly line?: string | undefined;
  readonly linkLabel?: string | undefined;
  readonly href?: string | undefined;
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <section className="rounded-photo bg-card grid content-start gap-[10px] p-[24px] shadow-[inset_0_0_0_1px_var(--color-rule),var(--shadow-sm)]">
      <h2 className="text-ui text-ink font-bold">{label}</h2>
      {value === undefined ? null : (
        <p className="font-display text-ink text-[44px] leading-none tabular-nums">
          {value}
        </p>
      )}
      {children}
      {line === undefined ? null : <p className="text-ink-2 text-sm">{line}</p>}
      {href === undefined || linkLabel === undefined ? null : (
        <a
          href={href}
          className="text-ui text-link min-h-[24px] underline decoration-[1.5px] underline-offset-[5px]"
        >
          {linkLabel}
        </a>
      )}
    </section>
  );
}

/** The small cross of a removable chip; decorative, the button carries the name. */
export function AdminRemoveGlyph(): ReactElement {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className="size-[10px]"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M2 2l8 8M10 2l-8 8" />
    </svg>
  );
}
