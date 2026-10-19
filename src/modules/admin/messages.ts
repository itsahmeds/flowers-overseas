/**
 * The admin catalogue's one reader (spec 012 §2.2 "Admin copy", §7, AC-7; TASK-217).
 *
 * Admin strings live in `messages/admin/en.json` (+ `en.meta.json`), English only in v0, every
 * key shipped `reviewed: false` (founder copy pending). This module is the only importer of that
 * file, and only admin code imports this module, so no public bundle carries an admin string and
 * no public locale's reviewed share counts one (`tests/unit/admin-catalogue.test.ts`).
 */
import { createTranslator } from "next-intl";

import catalogue from "../../../messages/admin/en.json" with { type: "json" };

/** The admin interface's one locale in v0 (spec 012 §13 Q9). */
export const ADMIN_LOCALE = "en" as const;

export const adminMessages = catalogue;

/** A translator over the whole admin catalogue: `adminT("admin.signIn.title")`. */
export const adminT = createTranslator({
  locale: ADMIN_LOCALE,
  messages: catalogue,
});
