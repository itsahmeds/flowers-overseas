# Resend webhook fixtures (spec 016 §5.2 "Resend webhooks"; TASK-335)

No Resend webhook exists yet (the founder creates it, spec 016 §12), so these are Resend's own
documented example payloads, one per page of <https://resend.com/docs/webhooks/emails/> (`sent`,
`delivered`, `delivery-delayed`, `bounced`, `complained`, `opened`, `clicked`, `failed`), copied
on 2026-11-04. One change: the click's `ipAddress` is replaced by `192.0.2.11` (TEST-NET-1), so no
real address is committed. `delivered@resend.dev` is Resend's test inbox, not a person.

Replace them with payloads recorded from the staging webhook (scrubbed of addresses) once it
exists; `tests/contract/resend-webhook.test.ts` parses each with the schemas the code uses.
