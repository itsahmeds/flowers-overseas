/**
 * The delivery-facts block, in both forms (spec 007 §5.3 "Delivery-facts block",
 * `docs/design/system/components.dc.html` "Fact list"; AC-8, AC-19; TASK-091).
 *
 * A description list, one `<dt>`/`<dd>` per fact, and the whole honesty rule of this page in one
 * component:
 *
 *  - **facts-unknown (guide)** keeps every label and prints the blank *in words* — "no cutoff,
 *    because no florist has agreed to one". It is not an empty block and it is not a "coming
 *    soon" box: a buyer who arrived from a search for flower delivery gets a straight answer in
 *    the first screen, and no cutoff, date, city, price or count is claimed (AC-19).
 *  - **facts-known (live)** prints only the rows the `operations` block actually carries. A field
 *    that was not authored removes its row entirely — there is no "unknown" row and no
 *    placeholder bar here — and an incomplete block is what stops the live state from rendering
 *    at all (`corridorState()`).
 *
 * The cutoff is printed with its IANA zone named, because a cutoff without a zone is not a fact
 * (`plan/03` §7, §10). The wall-clock string is the authored `sameDayCutoffLocal`; no clock is
 * read and no instant is constructed, so an ISR document served hours after it was built says
 * exactly what the florist agreed to.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { formatList } from "../../i18n/index.ts";
import { Text } from "../../ui/index.ts";
import type { CorridorView } from "../corridor.ts";

import { countryName, localeCode, registryLabel } from "./labels.ts";

/**
 * ISO-8601 weekday number → the message key naming that day, and `country.sunday_delivery` → the
 * sentence that states it. Both are written as **fully-qualified literals** rather than composed
 * from a template, because `pnpm i18n:check`'s usage scan reads literals: a key reached only by
 * string concatenation would be reported as dead and deleted by the next person to run it.
 */
const WEEKDAY_KEYS: Readonly<Record<number, string>> = {
  1: "corridor.weekday.monday",
  2: "corridor.weekday.tuesday",
  3: "corridor.weekday.wednesday",
  4: "corridor.weekday.thursday",
  5: "corridor.weekday.friday",
  6: "corridor.weekday.saturday",
  7: "corridor.weekday.sunday",
};

const SUNDAY_KEYS: Readonly<Record<string, string>> = {
  none: "corridor.facts.sunday.no",
  peak: "corridor.facts.sunday.peak",
  always: "corridor.facts.sunday.always",
};

function Fact({
  label,
  children,
  unknown = false,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly unknown?: boolean;
}): ReactElement {
  return (
    <>
      <Text
        as="dt"
        size="xs"
        tone="subtle"
        className="label pt-[3px] font-semibold"
      >
        {label}
      </Text>
      <Text as="dd" size="sm" tone={unknown ? "subtle" : "default"}>
        {children}
      </Text>
    </>
  );
}

export interface CorridorFactsProps {
  readonly view: CorridorView;
}

export function CorridorFacts({ view }: CorridorFactsProps): ReactElement {
  const t = useTranslations();
  const c = useTranslations("corridor");
  const country = countryName(t, view.nameKey);
  const { operations, citiesKey } = view.facts;

  return (
    <div className="border-rule bg-surface p-lg gap-md grid max-w-[720px] grid-cols-[minmax(0,160px)_minmax(0,1fr)] border">
      <dl className="gap-sm gap-x-md col-span-2 grid grid-cols-subgrid">
        {view.facts.known && operations !== undefined ? (
          <>
            <Fact label={c("facts.orderBy.label")}>
              {c("facts.orderBy.value", {
                time: operations.sameDayCutoffLocal,
                zone: operations.ianaZone,
              })}
            </Fact>
            <Fact label={c("facts.deliveryDays.label")}>
              {formatList(
                operations.deliveryDays.map((day) =>
                  registryLabel(t, WEEKDAY_KEYS[day] ?? ""),
                ),
                localeCode(view.locale),
              )}
            </Fact>
            <Fact label={c("facts.sunday.label")}>
              {registryLabel(
                t,
                SUNDAY_KEYS[operations.sundayDelivery] ??
                  "corridor.facts.sunday.no",
              )}
            </Fact>
            {citiesKey === undefined ? null : (
              <Fact label={c("facts.cities.label")}>
                {registryLabel(t, citiesKey)}
              </Fact>
            )}
            {view.liveSlots.fromPrice === undefined ? null : (
              <Fact label={c("facts.prices.fromLabel")}>
                {c("facts.prices.fromValue", {
                  price: view.liveSlots.fromPrice,
                })}
              </Fact>
            )}
          </>
        ) : (
          <>
            <Fact label={c("facts.delivering.label")}>
              {c("facts.delivering.none", { country })}
            </Fact>
            <Fact label={c("facts.orderBy.label")} unknown>
              {c("facts.orderBy.none")}
            </Fact>
            <Fact label={c("facts.deliveryDays.label")} unknown>
              {c("facts.deliveryDays.none")}
            </Fact>
            <Fact label={c("facts.soonest.label")} unknown>
              {c("facts.soonest.none")}
            </Fact>
            <Fact label={c("facts.cities.label")} unknown>
              {c("facts.cities.none")}
            </Fact>
            <Fact label={c("facts.prices.label")} unknown>
              {c("facts.prices.none")}
            </Fact>
          </>
        )}
      </dl>
    </div>
  );
}
