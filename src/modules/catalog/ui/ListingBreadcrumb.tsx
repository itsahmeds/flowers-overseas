/**
 * The listing breadcrumb (spec 008 §5.3 "Accessibility" — "the breadcrumb is 007's component
 * unchanged"; `docs/design/wireframes/country-shop-{desktop,mobile}.dc.html`, "Home / Send flowers
 * to / Poland / Flowers"; TASK-109).
 *
 * Spec 007's `CorridorBreadcrumb` markup, to the attribute: a `<nav aria-label>` around an ordered
 * list, a rule-coloured `/` between items that is `aria-hidden` (a separator is not content, and
 * it is a character in the flow rather than a chevron that must mirror in RTL), and a leaf that
 * carries `aria-current="page"` and is **not a link**.
 *
 * It is a second component rather than a reuse of that one because a `ListingCrumb` carries a
 * `labelValue` its `CorridorCrumb` does not: a category or occasion crumb is a message with the
 * founder's **authored name** substituted into it ("Roses"), which is content rather than chrome
 * (`plan/02` §12), and a component that cannot take the value would have to compose the sentence.
 * Nothing else differs, and `tests/unit/catalog-shop-page.test.tsx` pins the two markups together
 * so they cannot drift.
 *
 * TASK-115 builds `BreadcrumbList` from the **same** `view.breadcrumb` array, so the markup cannot
 * claim a trail the page does not show (spec 008 AC-17).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { Breadcrumbs } from "@/modules/ui";

import type { ListingCrumb } from "../listing";

import { registryLabel } from "./labels";

export interface ListingBreadcrumbProps {
  readonly crumbs: readonly ListingCrumb[];
}

export function ListingBreadcrumb({
  crumbs,
}: ListingBreadcrumbProps): ReactElement {
  const t = useTranslations();

  return (
    <Breadcrumbs
      label={registryLabel(t, "a11y.breadcrumb")}
      crumbs={crumbs.map((crumb) => ({
        key: crumb.labelKey,
        label: registryLabel(
          t,
          crumb.labelKey,
          crumb.labelValue === undefined
            ? undefined
            : { name: crumb.labelValue },
        ),
        href: crumb.href,
        current: crumb.current,
      }))}
    />
  );
}
