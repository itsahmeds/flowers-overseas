/**
 * The consumer side of the fixture catalogues (`pnpm i18n:check --src <case>/src`, T-22).
 *
 * The usage scan is a text scan (see `scripts/i18n-check.ts`), so this file only has to *look*
 * like the application: a namespace binding plus the key literals that namespace reads. The
 * ambient `useTranslations` declaration keeps the fixture standalone — it is never executed.
 */
declare function useTranslations(namespace: string): (key: string) => string;

const meta = useTranslations("meta");
const errors = useTranslations("errors");
const banner = useTranslations("banner");

export const rendered: readonly string[] = [
  meta("home.title"),
  errors("notFound.heading"),
  banner("headline"),
];
