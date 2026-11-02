SET LOCAL ROLE app_owner;

-- Rollback of 0035_florist_access (spec 026a §5.1). The audit rows the trigger wrote stay
-- (`audit_log` is append-only); memberships the admin sync created stay, and grant nothing the
-- sign-in policy does not allow.

DROP TRIGGER IF EXISTS partner_member_audit ON public.partner_member;

RESET ROLE;
