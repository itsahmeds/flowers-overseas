/**
 * Related destinations (spec 007 §5.3 "Related destinations", AC-18;
 * `docs/design/system/components.dc.html` "Related destinations"; TASK-091).
 *
 * Up to three tiles, in the order the guide's author ranked them, each with the destination's
 * name and the same status chip the finder and the destinations grid print — one vocabulary for
 * "delivering" and "not delivering yet" across the site.
 *
 * The three empty branches are the whole point of the block, and none of them is visible: a
 * target with no page **in this locale** is dropped rather than rendered (never a dead link,
 * never a disabled one, never padded back to three), and at zero the caller renders nothing at
 * all — heading included. The filtering happens in `corridorView()`, so this component cannot
 * link at a 404 even if it tried.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { Chip, Display, Grid, Label, Stack } from "../../ui/index.ts";
import type { CorridorRelatedView } from "../corridor.ts";

import { registryLabel } from "./labels.ts";

export interface CorridorRelatedProps {
  readonly related: readonly CorridorRelatedView[];
}

export function CorridorRelated({
  related,
}: CorridorRelatedProps): ReactElement {
  const t = useTranslations();
  const c = useTranslations("corridor");

  return (
    <Stack as="section" gap="md" data-fo-corridor-related>
      <Stack gap="xs">
        <Label>{c("related.eyebrow")}</Label>
        <Display size="xl">
          {c("related.heading", { count: related.length })}
        </Display>
      </Stack>
      <Grid columns="1-3" gap="md">
        {related.map((destination) => (
          <a
            className="border-rule bg-surface p-md gap-sm hover:border-accent flex flex-col border"
            data-fo-related-destination={destination.iso2}
            href={destination.href}
            key={destination.iso2}
          >
            <Display as="span" size="lg">
              {registryLabel(t, destination.nameKey)}
            </Display>
            <Chip tone="muted" className="self-start">
              {registryLabel(t, destination.stateKey)}
            </Chip>
          </a>
        ))}
      </Grid>
    </Stack>
  );
}
