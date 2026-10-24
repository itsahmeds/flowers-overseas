# Spec 030a pointer: company identity on florist statements (apply when 030a lands)

Spec 030a (florist payouts and statements) is not on `main` (it is on branch `docs/spec-030a-florist-payouts`, PR 329). Whoever merges that PR, or the next amendment to 030a, appends the block below to 030a's section 14. Source: spec 041 section 14 A-founder-2026-10-23 (Block D of the amendment).

---

**A-founder-2026-10-23 (pointer from spec 041 §14 A-founder-2026-10-23).** A statement or self-billing document sent to a florist names us as follows:
- `legalName`, `registryName`, `registrationNumber` and the address with region and country, from `src/config/company.ts`;
- a VAT ID only where one is issued, from the issuer's VAT-registration data;
- no person's name;
- no EIN, unless the accountant names a law that requires it on a document sent to an EU florist.

Its tests assert the identity block against the committed `COMPANY`, and a `vatId` fixture adds exactly one VAT line. Whether a statement is a self-billed invoice, and what VAT it shows, is the accountant's (ADR-0021).
