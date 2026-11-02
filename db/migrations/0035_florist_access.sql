-- 0035_florist_access — the founder grants a florist access in admin, and that grant is audited
-- (spec 026a §2 "The founder grants access in admin", §5.1, AC-8; TASK-355).
--
-- Numbered 0035 (orchestrator, 2026-11-03): 0034 is TASK-363's (payouts), in flight; `db:check`
-- reports the gap until it merges.
--
--   `partner_member_audit`  AFTER INSERT OR UPDATE OR DELETE, FOR EACH ROW, on `partner_member`,
--                           with `0016`'s `audit_row_change('user_id', 'partner_id')`: the row id
--                           of the audit entry is `{user_id}:{partner_id}`. Granting or removing a
--                           florist's access to recipient data is an admin write and gets the
--                           audit every other admin write gets (spec 012 §2.3, "a trigger, not a
--                           convention"). `syncPartnerOwnerMember` writes the membership under
--                           the actions `partner.member.grant` and `partner.member.revoke`.
--                           Writes outside the admin context (the first-sign-in stamp, the
--                           florist's language switch, both `app.role = 'system'`) return early
--                           in the trigger and are not audited, as on every audited table.
--
-- `partner_member` has no personal column (user and partner ids, a role, two timestamps and a
-- language), so `audit_mask()` gains no entry. Nothing else changes: `invited_at` and
-- `accepted_at` exist since `0005`, and `locale_code` since `0022`. No change to any order
-- table. No seed.
--
-- Rollback: `0035_florist_access.down.sql`.

SET LOCAL ROLE app_owner;

CREATE TRIGGER partner_member_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.partner_member
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('user_id', 'partner_id');

RESET ROLE;
