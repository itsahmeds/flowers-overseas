/**
 * The only import path into the content module: the trust and legal pages' content, their
 * existence predicate and their view model (spec 041 §2, §5.2, §13 Q7; TASK-182).
 *
 * A recorded `plan/01` §5 deviation (§13 Q7): no listed module owns company and legal content, so
 * this one does, registered in the layout manifest (`scripts/check-layout.ts`) and
 * `docs/architecture.md` §3. No database is read (`pnpm check:no-db`), and nothing on the render
 * path reads `node:fs`: the content arrives through the generated typed index.
 *
 * Owned by: spec 041.
 *
 * @spec 041
 */
export {
  type ContactView,
  type CompanyBlockView,
  type DestinationRowView,
  type InfoCrumbView,
  type InfoLinkView,
  type InfoPageOptions,
  type InfoPageRef,
  type InfoPageView,
  type InfoSectionView,
  infoContentLocale,
  infoPageAlternatePaths,
  infoPageExists,
  infoPageFileReviewed,
  infoPageForLeaf,
  infoPageForSegment,
  infoPageHreflangPaths,
  infoPagePath,
  infoPageView,
  isSourceContentLocale,
  isUntranslatedDraft,
  listInfoPages,
  missingInfoPageLinkIds,
  parsedInfoFiles,
  trustContent,
} from "./pages.ts";
export {
  type InfoParseIssue,
  type InfoParseResult,
  type InfoSourceFile,
  type ParsedInfoFile,
  infoPathFacts,
  parseInfoFile,
} from "./parse.ts";
export {
  type InfoContentProvider,
  fixtureInfoContentProvider,
  staticInfoContentProvider,
} from "./provider.ts";
export {
  HonestyAllowSchema,
  INFO_FAQ_MAX,
  INFO_FAQ_MIN,
  InfoPageContentSchema,
  LegalDocumentSchema,
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
  type HonestyAllow,
  type InfoPageContent,
  type LegalDocument,
} from "./schemas.ts";
export {
  type ControllerView,
  type CookieRegisterRowView,
  type ImprintFactsView,
  type InfoPageHeadView,
  type LegalBlockView,
  type LegalDocumentView,
  type LegalDraftLine,
  type LegalSectionView,
  type LegalStamp,
  infoPageHeadView,
  legalDocumentView,
} from "./legal.ts";
export {
  type LegalBlock,
  type LegalSection,
  blockTexts,
  legalBody,
} from "./legal-body.ts";
export { InfoPage, type InfoPageProps } from "./components/InfoPage.tsx";
export {
  LegalDocumentPage,
  type LegalDocumentPageProps,
} from "./components/LegalDocument.tsx";
