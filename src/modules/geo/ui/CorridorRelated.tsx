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
import type { ReactElement, ReactNode } from "react";

import { Chip } from "../../ui/index.ts";
import type { CorridorRelatedView } from "../corridor.ts";

import { CorridorSection } from "./CorridorSection.tsx";
import { registryLabel } from "./labels.ts";

export interface CorridorRelatedProps {
  readonly related: readonly CorridorRelatedView[];
  /** The shop entry, which the artboard draws under the chips in the same section. */
  readonly children?: ReactNode;
}

export function CorridorRelated({
  related,
  children,
}: CorridorRelatedProps): ReactElement {
  const t = useTranslations();
  const c = useTranslations("corridor");

  return (
    <CorridorSection
      eyebrow={c("related.eyebrow")}
      heading={c("related.heading", { count: related.length })}
      id="corridor-related"
      marker="data-fo-corridor-related"
    >
      <ul className="gap-sm m-0 flex list-none flex-wrap p-0">
        {related.map((destination) => (
          <li key={destination.iso2}>
            <Chip
              data-fo-related-destination={destination.iso2}
              href={destination.href}
            >
              {registryLabel(t, destination.nameKey)}
              <small className="text-fine text-ink-subtle font-normal">
                {registryLabel(t, destination.stateKey)}
              </small>
            </Chip>
          </li>
        ))}
      </ul>
      {children}
    </CorridorSection>
  );
}
