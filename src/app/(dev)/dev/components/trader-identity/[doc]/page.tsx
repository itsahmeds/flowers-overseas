import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import { setRequestLocale } from "next-intl/server";

import { COMPANY, CompanySchema } from "@/config/company";
import { devUiEnabled } from "@/lib/env.schema";
import { LegalDocumentPage, legalDocumentView } from "@/modules/content";
import { documentFallbackLocale } from "@/modules/i18n";

/**
 * `/dev/components/trader-identity/{imprint|terms|privacy}` — the three legal views that wait for
 * the complete trader identity, rendered under it, for the component-level accessibility check
 * (spec 041 §2 "Rendering, budget and gates", AC-27, T-27; TASK-184).
 *
 * Before the support mailbox exists `infoPageExists()` is false for these three in every locale
 * (AC-2), so no customer URL renders them and no page-level axe run can reach them. This route
 * renders the real view model (`legalDocumentView()`) and the real component
 * (`LegalDocumentPage`) of the committed `en` file under a fixture company that completes the
 * identity: the registry facts of spec 041 §14 A-founder-2026-10-23, a fixture mailbox, and the
 * fixture VAT ID the schema still asks for while `registered` is true (the value
 * `tests/unit/legal-pages.test.tsx` uses). Nothing is mocked but the company. One document per
 * URL, so each `main` landmark and each id is unique, as on the real page.
 *
 * Same gate as the gallery: a 404 unless `ENABLE_DEV_UI=true`, and `noindex`. The page-level axe
 * run on the real URLs is a step of the runbook's trader-identity checklist
 * (`docs/runbooks/info-and-legal-pages.md`).
 */
export const metadata: Metadata = {
  title: "Trader identity fixture",
  robots: { index: false, follow: false },
};

const DOCS = ["imprint", "terms", "privacy"] as const;
type Doc = (typeof DOCS)[number];

export const dynamicParams = false;

export function generateStaticParams(): { doc: Doc }[] {
  return DOCS.map((doc) => ({ doc }));
}

/** The committed company with the identity completed: fixture values, never published. */
const FIXTURE_COMPANY = CompanySchema.parse({
  ...COMPANY,
  registered: true,
  legalName: "Flowers Overseas LLC",
  registryName: "Wyoming Secretary of State",
  registrationNumber: "2026-002113883",
  vatId: "PL1234567890",
  address: {
    lines: ["30 N Gould St Ste R"],
    postalCode: "82801",
    city: "Sheridan",
    countryIso2: "US",
  },
  supportEmail: "help@example.com",
});

export default async function TraderIdentityFixturePage({
  params,
}: {
  readonly params: Promise<{ doc: string }>;
}): Promise<ReactElement> {
  if (!devUiEnabled(process.env)) notFound();
  const { doc } = await params;
  if (!(DOCS as readonly string[]).includes(doc)) notFound();
  const locale = documentFallbackLocale().code;
  setRequestLocale(locale);
  const view = legalDocumentView(doc as Doc, locale, {
    company: FIXTURE_COMPANY,
  });
  if (view === undefined) throw new Error(`no ${locale} ${doc} view`);
  return <LegalDocumentPage view={view} />;
}
