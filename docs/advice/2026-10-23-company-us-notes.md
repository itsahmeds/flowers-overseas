# Notes: spec 041 amendment A-founder-2026-10-23 (Flowers Overseas LLC)

Not part of the appended spec texts. For the orchestrator and the implementing task.

## Where each block went

| Block | Destination | State |
|---|---|---|
| A, A0 | `specs/041-trust-help-legal-pages.md` header cells and section 14 | applied |
| B | `specs/004-design-system-layout.md` section 14 | applied |
| C | `specs/018-tracking-account.md` section 14 | applied |
| D | `docs/advice/2026-10-23-company-us-030a-pointer.md` | saved; apply when spec 030a lands |
| E | below | carried for the implementing task (AC-40); `docs/compliance/ropa.md` is not edited in this PR |

## Numbering

AC-38 is skipped on purpose. Spec 041's section 0 already lists an `AC-38` that is the indexer picking up a cross-reference to spec 016's and spec 018's AC-38. New ids: AC-35, AC-36, AC-37, AC-39, AC-40 and T-37 to T-41.

## Found while applying

- The footer's `companyIdentity()` in `footerView.ts` returns `undefined` when `vatId` is absent, so after `registered: true` with no VAT id the "Operated by" line would drop from every page. T-38 guards it by mutation.
- Spec 041's header row "Approved by / date" still names the founder in full. It is a spec, not a public surface (AC-37 scans the built site, `messages/` and `content/`), so it is left as it was. The founder can ask for it to go.
- The amendment's fine caps (GBP 8.7 million for the UK GDPR, EUR 50,000 under DDG section 33) are from memory of the statutes and are not re-fetched. The lawyer confirms both before anyone quotes them.
- The founder's open question is Q-23a (support email). The default implemented is: no email now, so the imprint, terms and privacy notice stay hidden until `supportEmail` is added.
- `plan/07` section 6 and section 2.2 L87, `plan/09` and `plan/06` still assume the Estonian OU; the orchestrator edits them (listed in the amendment's task-row effect).
- ADR-0021 is cited by the decisions-log row and the amendment. Its file is not in this PR.

## Block E: text for `docs/compliance/ropa.md` (the implementing task inserts it after the title line)

**Controller (GDPR Art. 30(1)(a)).** Flowers Overseas LLC, a Wyoming limited liability company:
- Register: Wyoming Secretary of State, Original ID 2026-002113883, filed 23 October 2026.
- Address: 30 N Gould St Ste R, Sheridan, WY 82801, United States (registered agent and principal office).
- Contact: +1 (213) 592-5150 (phone and WhatsApp). Support email: none yet.
- Decision: ADR-0021, superseding ADR-0004.
- **EU representative (Art. 27 GDPR): not appointed.**
- **UK representative (Art. 27 UK GDPR): not appointed.**
- Whether and when they must be appointed is the lawyer's (spec 041 §14 A-founder-2026-10-23 clause 5). No public page claims either.

Added to "DPAs still to be filed": one line. "All processor terms accepted before 23 October 2026 (Vercel, Railway, Cloudflare, Sentry, Neon) were accepted before Flowers Overseas LLC existed. The lawyer confirms whether they bind the LLC or must be re-accepted in its name. Founder's act."
