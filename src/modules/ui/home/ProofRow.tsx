/**
 * `ProofRow` — the four-fact strip directly under the hero (spec 004 §13's 2026-09-08 resolution
 * note "four-fact proof row", §14 **A5**, §8's honesty rules, AC-15; TASK-052;
 * `docs/design/homepage-v1/README.md` round 2).
 *
 * Four claims, each an icon, a title and one supporting line, 4-up on the desktop artboard and
 * 2-up on the mobile one. The copy is the round-2 artboard's, verbatim, in the first person:
 *
 *  1. 7-day freshness guarantee · **We** redeliver or refund, your choice
 *  2. **We** make it in their own town · Independent shops **we** chose ourselves
 *  3. The price you see is what **we** charge · Delivery and VAT already in it
 *  4. **We** photograph it at the door · The picture reaches you the same day
 *
 * Every one of them is true today, which is what makes this row shippable in Phase 0 while the
 * reviews section is not (§8, `plan/09` AC 6): the guarantee is A6's accepted wording, the
 * florists are independent shops we choose, the price rule is `plan/07` §4's all-in requirement
 * that spec 005/008 implement with integer minor units, and the delivery photo is a promise about
 * the service.
 *
 * **The fourth fact must not render a photo** (the TASK-052 row states it, and it is the trap):
 * "We photograph it at the door" is a promise, not a claim that a photograph is shown here. There
 * is no `Media`, no `Photo` and no `<img>` in this component — the icon is a line drawing from the
 * committed icon set.
 *
 * No number appears in the row that we cannot source: no florist count, no country count, no
 * rating, no review count (AC-15). "7-day" is a term of the guarantee, not a measurement.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { Icon, type IconName } from "../icons/Icon.tsx";
import { Grid, Row, Stack } from "../primitives/layout.tsx";
import { Text } from "../primitives/typography.tsx";

import { HOME_BLEED } from "./HomeHero.tsx";

/**
 * The four facts, in the artboards' order, each with the canvas's icon. Keys, not strings — the
 * copy lives in `messages/*.json` under `home.proof.*` so `pl` reads it in Polish and a founder
 * rewording is a catalogue edit. The two keys are written out per fact rather than built from
 * `id` with a template literal: `pnpm i18n:check`'s usage scan is a text scan (by design — see
 * its header), and a key assembled at runtime reads to it as an unused key.
 */
export const PROOF_FACTS = [
  {
    id: "guarantee",
    icon: "shield-check",
    titleKey: "proof.guarantee.title",
    bodyKey: "proof.guarantee.body",
  },
  {
    id: "local",
    icon: "florist",
    titleKey: "proof.local.title",
    bodyKey: "proof.local.body",
  },
  {
    id: "price",
    icon: "card",
    titleKey: "proof.price.title",
    bodyKey: "proof.price.body",
  },
  {
    id: "photo",
    icon: "document",
    titleKey: "proof.photo.title",
    bodyKey: "proof.photo.body",
  },
] as const satisfies readonly {
  id: string;
  icon: IconName;
  titleKey: string;
  bodyKey: string;
}[];

export function ProofRow(): ReactElement {
  const t = useTranslations("home");

  return (
    <Grid
      as="ul"
      columns="2-4"
      gap="lg"
      className={`border-rule py-lg border-b ${HOME_BLEED}`}
      data-fo-proof-row
    >
      {PROOF_FACTS.map((fact) => (
        <Row as="li" key={fact.id} gap="sm" align="start">
          {/* Decorative: the title beside it carries the meaning (§5.3, no colour-only meaning
              and no icon-only claim). */}
          <Icon
            name={fact.icon}
            size={20}
            className="text-accent mt-[2px] shrink-0"
          />
          <Stack gap="none">
            <Text as="span" size="sm" className="font-medium">
              {t(fact.titleKey)}
            </Text>
            <Text as="span" size="sm" tone="subtle">
              {t(fact.bodyKey)}
            </Text>
          </Stack>
        </Row>
      ))}
    </Grid>
  );
}
