/**
 * Privacy relay domains (spec 021 §5.2 "Disposable email at step 1", §13 Q4, AC-1; TASK-493):
 * Apple Hide My Email, iCloud, Firefox Relay, DuckDuckGo, SimpleLogin and Proton Pass forward to
 * a real inbox, so they are never treated as disposable, whatever `disposable-domains.ts` holds.
 * A domain here also allows its subdomains.
 */
export const RELAY_ALLOWLIST = [
  "privaterelay.appleid.com",
  "icloud.com",
  "mozmail.com",
  "duck.com",
  "simplelogin.com",
  "simplelogin.co",
  "slmail.me",
  "aleeas.com",
  "passmail.net",
  "passinbox.com",
] as const;
