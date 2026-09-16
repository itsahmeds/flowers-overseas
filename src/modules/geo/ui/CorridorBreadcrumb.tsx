/**
 * The corridor breadcrumb (spec 007 §5.3 "Accessibility", `docs/design/system/components.dc.html`
 * "Country-page blocks → Breadcrumb"; TASK-091).
 *
 * The drawing, exactly: a `<nav aria-label>` around an ordered list, a rule-coloured `/` between
 * items that is `aria-hidden` (a separator is not content, and it is a character in the flow
 * rather than a chevron that must mirror in RTL), and a leaf that carries `aria-current="page"`
 * and is **not a link**.
 *
 * A crumb whose `href` is `undefined` renders as text. In Phase 0 that is the hub: TASK-092 ships
 * `/{locale}/{destinations}` and publishes its link id, and until it does, linking there would be
 * a link to a 404 — the one thing spec 004 AC-14 forbids and this route inherits.
 *
 * TASK-093 builds `BreadcrumbList` from the **same** `view.breadcrumb` array, so the markup
 * cannot claim a trail the page does not show (spec 007 AC-15).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { CorridorCrumb } from "../corridor.ts";

import { registryLabel } from "./labels.ts";

export interface CorridorBreadcrumbProps {
  readonly crumbs: readonly CorridorCrumb[];
}

export function CorridorBreadcrumb({
  crumbs,
}: CorridorBreadcrumbProps): ReactElement {
  const t = useTranslations();
  const a11y = useTranslations("a11y");

  return (
    <nav aria-label={a11y("breadcrumb")} data-fo-breadcrumb>
      <ol className="gap-sm text-ink-subtle flex list-none flex-wrap items-center p-0 text-sm">
        {crumbs.map((crumb, index) => (
          <li className="gap-sm flex items-center" key={crumb.labelKey}>
            {index === 0 ? null : (
              <span aria-hidden="true" className="text-rule">
                {"/"}
              </span>
            )}
            {crumb.current || crumb.href === undefined ? (
              <span
                {...(crumb.current ? { "aria-current": "page" as const } : {})}
                className={crumb.current ? "text-ink font-semibold" : undefined}
              >
                {registryLabel(t, crumb.labelKey)}
              </span>
            ) : (
              <a className="hover:text-accent" href={crumb.href}>
                {registryLabel(t, crumb.labelKey)}
              </a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
