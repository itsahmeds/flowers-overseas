/**
 * `TrustStrip` — three claims, each true today (spec 004 §2 "Layout primitives and chrome" →
 * "Trust strip", §5.3, §8, §14 **A5**, **AC-10**, **AC-15**; `plan/04` §3 §12, `plan/07` §4;
 * TASK-053).
 *
 * §2 fixes both the count and the content: *"server-rendered text, three claims only, each true
 * today — the guarantee (A6 default: '7-day freshness guarantee · redeliver or refund'),
 * 'Hand-made by a local florist', 'Price includes delivery and VAT'. No Trustpilot line, no
 * delivery-photo claim on a page with no photos, no florist count with no florists."* That is
 * exactly what renders, in the first person of §14 A5.
 *
 * **The guarantee's name is its own key, `trust.guarantee.name`.** §13 Q4 leaves the name and its
 * terms open for the founder and the lawyer; keeping the *name* in one key means a rename is a
 * catalogue edit in four locales and not a code change, and it means the same string can be
 * reused by the footer, the guarantee page (007) and the order emails without three of them
 * drifting. The claim beside it is `trust.guarantee.claim`, so a rename does not force a
 * retranslation of the sentence.
 *
 * **What this is not.** It is not the four-fact proof row: that one sits under the hero and sells,
 * this one closes the page and reassures, and §2 asks for both. It renders no icon, no logo, no
 * badge and no number: `TrustMarks` is the (empty) payment/badge slot in the footer, and Phase 0
 * AC 6 forbids the rest. 008 and 009 mount this same component on shop pages.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { Grid, Stack } from "../primitives/layout.tsx";
import { Text } from "../primitives/typography.tsx";
import { VisuallyHidden } from "../primitives/a11y.tsx";

/**
 * The three claims, in `plan/04` §3's order. The guarantee leads because it is the only one of
 * the three that is a *promise* rather than a description, and because it is the string §13 Q4
 * will rename.
 */
export const TRUST_CLAIMS = [
  {
    id: "guarantee",
    titleKey: "guarantee.name",
    bodyKey: "guarantee.claim",
  },
  { id: "local", titleKey: "local.name", bodyKey: "local.claim" },
  { id: "price", titleKey: "price.name", bodyKey: "price.claim" },
] as const satisfies readonly {
  id: string;
  titleKey: string;
  bodyKey: string;
}[];

const HEADING_ID = "trust-strip-heading";

export interface TrustStripProps {
  /** `h2` on the locale home; `h3` in `/dev/components`, where the section is nested. */
  readonly headingLevel?: "h2" | "h3";
  /** Page bleed, so the strip lines up with whatever page mounts it. */
  readonly className?: string;
}

export function TrustStrip({
  headingLevel = "h2",
  className,
}: TrustStripProps = {}): ReactElement {
  const t = useTranslations("trust");

  return (
    <Grid
      as="section"
      columns="1-3"
      gap="lg"
      className={["border-rule py-xl border-y", className]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={HEADING_ID}
      data-fo-trust-strip
    >
      {/* The strip is a named region for a screen reader and a rule-bounded band for everyone
          else: the artboards give it no visible heading, and inventing one would put a line of
          chrome into a design the founder approved without it. */}
      <VisuallyHidden as={headingLevel} id={HEADING_ID}>
        {t("heading")}
      </VisuallyHidden>
      {TRUST_CLAIMS.map((claim) => (
        <Stack gap="none" key={claim.id} data-fo-trust-claim={claim.id}>
          <Text as="span" size="md" className="font-medium">
            {t(claim.titleKey)}
          </Text>
          <Text as="span" size="sm" tone="muted">
            {t(claim.bodyKey)}
          </Text>
        </Stack>
      ))}
    </Grid>
  );
}
