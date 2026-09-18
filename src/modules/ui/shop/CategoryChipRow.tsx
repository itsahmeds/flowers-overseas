/**
 * `CategoryChipRow` — the sibling row (spec 008 §2 "Sort, filters, pagination", §13 **Q6**, T-30;
 * TASK-108; `docs/design/wireframes/country-category-desktop.dc.html`, "Also for Poland").
 *
 * **This row is the whole browsing affordance.** No filters ship in Phase 0 (§13 Q6): a facet that
 * is worth browsing gets a real authored path (`plan/02` §7), so every chip here is a **link to a
 * page that exists** and a category below the six-product floor is *absent* rather than disabled —
 * it has no URL to link to (§13 Q7, spec 004 AC-14).
 *
 * **Order is `collator(locale)`** (T-30), computed here rather than at the call site, so Polish ł
 * and German umlauts sort where a reader of that locale expects them on every page that renders
 * the row. `sortBy` is spec 003's; no component builds its own `Intl.Collator`.
 *
 * The current page's own category is marked with `aria-current="page"` and rendered as plain text,
 * not as a link to the page the reader is already on.
 */
import type { ReactElement } from "react";

import { type LocaleCode } from "@/config/locales";
import { sortBy } from "@/modules/i18n";

import { Chip } from "../primitives/Chip.tsx";
import { Stack } from "../primitives/layout.tsx";
import { Label } from "../primitives/typography.tsx";

import type { ChipLinkView } from "./viewModel.ts";

export interface CategoryChipRowProps {
  readonly items: readonly ChipLinkView[];
  readonly locale: LocaleCode;
  /** The row's visible eyebrow *and* its accessible name — "Also for Poland" on the artboard. */
  readonly heading: string;
  /** For the `<nav>`'s `aria-labelledby`, where a page renders more than one row. */
  readonly id?: string;
}

export function CategoryChipRow({
  items,
  locale,
  heading,
  id = "category-chips",
}: CategoryChipRowProps): ReactElement | null {
  // A row with nothing in it renders nothing: no eyebrow, no empty rule (§5.2's "a block whose
  // data is missing renders nothing").
  if (items.length === 0) return null;
  const ordered = sortBy(items, locale, (item) => item.name);

  return (
    <Stack as="nav" gap="sm" aria-labelledby={`${id}-heading`} id={id}>
      <Label id={`${id}-heading`}>{heading}</Label>
      <div className="gap-sm flex flex-wrap">
        {ordered.map((item) =>
          item.current === true ? (
            <Chip aria-current="page" key={item.key} tone="muted">
              {item.name}
            </Chip>
          ) : (
            <Chip href={item.href} key={item.key}>
              {item.name}
            </Chip>
          ),
        )}
      </div>
    </Stack>
  );
}
