/**
 * `ListingEmpty` — the honest empty state (spec 008 §2's states, §5.3, **AC-8**'s render half,
 * `plan/02` §5; TASK-108; `docs/design/system/components.dc.html`, "Listing empty state").
 *
 * One sentence saying what is true — we have nothing we can deliver there yet — and the ways out:
 * the corridor guide, the destinations index, the occasion hubs. **Never** an empty grid, a
 * "0 results" heading, a skeleton, a placeholder card or a product with no price (AC-8). The
 * component renders no `<ul>` and no card element at all, which is what the e2e assertion counts.
 *
 * It reaches only one page type: the shop root of a published country whose catalogue has no
 * deliverable product. A country category or occasion listing **cannot** be empty — it exists only
 * where six products do (§13 Q7) — which is why the sheet draws that cell as unreachable.
 *
 * The links are a slot rather than a fixed list: which guide, which hubs and what they are called
 * is the page's knowledge, not the component's (the `SiteFooter` precedent). Each one is a real
 * link to a page that exists; the caller passes none it cannot resolve (spec 004 AC-14).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { Chip } from "../primitives/Chip.tsx";
import { Stack } from "../primitives/layout.tsx";
import { Display, Text } from "../primitives/typography.tsx";

export interface ListingEmptyLink {
  readonly id: string;
  readonly href: string;
  readonly label: string;
}

export interface ListingEmptyProps {
  /** The destination's name in the page locale, from `countries.ts` — never a slug. */
  readonly country: string;
  /** The ways out. An empty array renders the sentence alone rather than an empty row. */
  readonly links?: readonly ListingEmptyLink[];
  /**
   * `h1` when the empty state **is** the page (the country shop root of a destination with no
   * deliverable product — TASK-109): a page has one heading, and on that page this sentence is it.
   * `h2`/`h3` where a template nests it under its own heading (the gallery).
   */
  readonly headingLevel?: "h1" | "h2" | "h3";
}

export function ListingEmpty({
  country,
  links = [],
  headingLevel = "h2",
}: ListingEmptyProps): ReactElement {
  const t = useTranslations("shop");

  return (
    <Stack
      as="section"
      gap="sm"
      className="border-rule p-md max-w-[640px] border"
      data-fo-listing-empty={country}
    >
      <Display as={headingLevel} size="xl">
        {t("empty.heading", { country })}
      </Display>
      <Text measure size="md" tone="muted">
        {t("empty.body", { country })}
      </Text>
      {links.length === 0 ? null : (
        <div className="gap-sm flex flex-wrap">
          {links.map((link) => (
            <Chip href={link.href} key={link.id}>
              {link.label}
            </Chip>
          ))}
        </div>
      )}
    </Stack>
  );
}
