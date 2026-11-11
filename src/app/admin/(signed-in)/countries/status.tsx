/**
 * @purpose The country status chip and the country-page flag, shared by /admin/countries and its detail page
 * @spec 012b
 */
import type { ReactElement } from "react";

import { activeCountries } from "@/config/countries";
import { adminT } from "@/modules/admin";
import { AdminChip } from "@/modules/ui/admin/AdminData";

/** Live on the leaf wash, demo dashed, disabled plain (the artboard's tokens). */
export function CountryStatusChip({
  status,
}: {
  readonly status: "demo" | "live" | "disabled";
}): ReactElement {
  const tone = status === "live" ? "ok" : status === "demo" ? "demo" : "plain";
  return (
    <AdminChip tone={tone}>
      {adminT(`admin.countries.status.${status}`)}
    </AdminChip>
  );
}

/**
 * The corridor page flag (`corridorPagePublished`), read from the served registry: in slice A it
 * is carried from `src/config/countries.ts` and is read-only (§2.8; its editor is slice B's).
 */
export function countryPagePublished(iso2: string): boolean {
  return (
    activeCountries().find((country) => country.iso2 === iso2)
      ?.corridorPagePublished ?? false
  );
}
