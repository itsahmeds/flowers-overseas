/**
 * `dbCountryRegistry`: the destination registry read from the `country` table (spec 012b §2.2,
 * §5.2 `src/modules/geo`; TASK-292).
 *
 * One public-context transaction runs `COUNTRY_REGISTRY_QUERY` and the rows are overlaid on the
 * file registry by `countryRegistryFromRows` (`registry.ts`, which says what each side owns). At
 * request time that is `app_web` over `DATABASE_URL`; during `next build` it is `app_build` over
 * `DATABASE_BUILD_URL` (`src/lib/db.ts`), with no fallback to the file when the database cannot
 * be read (§2.0 item 2).
 *
 * Not selected by anything yet: the composition root that picks it in `production`, `staging` and
 * `preview` is TASK-294's cutover (AC-3), after `pnpm catalogue:parity` is empty.
 */
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import { COUNTRIES } from "@/config/countries";
import { withDbContext } from "@/lib/db";

import {
  COUNTRY_REGISTRY_QUERY,
  type CountryRegistryProvider,
  countryRegistryFromRows,
} from "./registry";

export const dbCountryRegistry: CountryRegistryProvider = {
  countries: () =>
    withDbContext({ role: "public", requestId: randomUUID() }, async (db) =>
      countryRegistryFromRows(
        COUNTRIES,
        await db.execute(sql.raw(COUNTRY_REGISTRY_QUERY)),
      ),
    ),
};
