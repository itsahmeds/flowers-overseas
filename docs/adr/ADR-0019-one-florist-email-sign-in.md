# ADR-0019 — One email sign-in for florists and admin, from Phase 0

| Field | Value |
|---|---|
| Status | accepted (founder, 2026-10-04: "all defaults, accept all three", answering spec 011 §13 Q2 with its recommended default) |
| Date | 2026-10-05 |
| Deciders | Ahmed |
| Supersedes | — (no ADR; it replaces the per-order `/v/{token}` links of `plan/06` §5.3 and the "no account in Phase 1" line of `plan/11` §1) |
| Related | ADR-0013 (Resend), ADR-0015 (Auth.js, Neon), specs/011-for-florists-vendor-inbox.md §2, §12, §13 Q2, specs/012-admin-v0.md §2.2, §12 task 1, docs/advice/2026-10-04-specs-010-011-012.md §3.6, G4, G6 |

## Context
The plan has two ways for a florist to reach an order. `plan/06` §5.3 sends a separate signed link
for each order, with no account. `plan/05` #59 and specs 026/027 put florists on a portal with
accounts in Phase 2. Spec 011 builds the Phase 0 florist inbox, and spec 012 builds admin sign-in
in the same week. As first drafted, the two specs each set up Auth.js separately, with their own
adapter, mail sender, environment names and files. Those files collided at `src/lib/auth`, and
admin's default `__Host-` CSRF cookie contradicted its own per-surface path (advisor memo §3.6).
The founder approved specs 010–012 on 2026-10-04 with "all defaults", which answers spec 011
§13 Q2 with its recommended default. The spec asks for this record to be written before planning.

## Options considered
1. **One email sign-in core, shared by florists and admin (recommended default).** Auth.js v5
   with the Email provider (a magic link through Resend) and database sessions, built once in
   `src/lib/auth/` by spec 012 task 1: one adapter, one `Mailer`, one set of env names
   (`AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `MAILER`). Each surface is an instance with its
   own base path, `__Secure-` cookies scoped to its path, session length and allow predicate. The
   link carries no email address, and its `GET` does not use up the token. Cost: florists need
   an email link from Phase 0, and spec 017 must make its order emails sign the florist in and
   open the order in one tap. Forecloses: the per-order link scheme.
2. **Per-order links now, accounts in Phase 2** (`plan/06` §5.3 as written). Cost: two
   mechanisms to build, secure and retire, and a migration of florists in Phase 2.
3. **Two separate Auth.js setups, one for admin and one for florists** (the first drafts).
   Cost: duplicated adapter and mailer, colliding files and env names, and two security
   surfaces to review. `[agent-inferred]`

## Decision
Option 1, "accepted recommended default": florists sign in with an Auth.js email link from
Phase 0, on the one sign-in core that admin also uses (spec 012 task 1, TASK-217). The florist
instance is spec 011's (TASK-212). No separate per-order link scheme is built.

## Consequences and the trade-off accepted
- One core to secure and review. Admin and florist sessions never authenticate each other's
  routes (spec 012 AC-9, spec 011 AC-19). No cookie has a `__Host-` name.
- Resend becomes a processor in Phase 0, earlier than ADR-0013 planned, because admin needs it too.
  Its DPA is filed before the first real email.
- The condition of §13 Q2 binds spec 017: every order email to a florist signs them in and opens
  that order in one tap, with no email address in the link and a `GET` that uses nothing up. If
  spec 017 cannot meet it, this decision is reopened, and the per-order links return as a spec
  017 item.
- A small slice of spec 026 ("active florists sign in on the live site") runs on this core when
  the first florist signs, so florists have a working portal from their first real order.
- Spec 012 §15 names a "proposed ADR-0019" and "ADR-0020" for spec 012b. Those are placeholders.
  They take the next free numbers when 012b proposes them.
- Trade-off, in the spec's wording, which the founder accepted as the default: "Phase 2 then
  needs no second system", at the cost of an email step for a florist on a demo call.
