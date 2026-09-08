/**
 * Typed message keys for next-intl (spec 003 §2 "Messages", §7; TASK-034).
 *
 * `en.json` is the source of truth, so it is also the *type* of every catalogue: with this
 * augmentation `t("errors.notFound.heading")` is checked by `tsc` and a typo or a renamed key is a
 * red build rather than a runtime fallback string (`plan/03` §5). TASK-038 generates the same
 * augmentation from the completed catalogue.
 *
 * `Locale` is deliberately **not** augmented to a literal union: the locale set is provider-backed
 * data that spec 002/012 hydrate from Postgres (spec 003 §2 "the no-database seam", AC-5), so
 * pinning it to today's four codes in the type system would be a lie the moment the database
 * answers. Locale codes are validated at the boundary instead — `launchLocale()` in
 * `src/modules/i18n/routing.ts`.
 */
import type en from "./messages/en.json";

declare module "next-intl" {
  interface AppConfig {
    Messages: typeof en;
  }
}
