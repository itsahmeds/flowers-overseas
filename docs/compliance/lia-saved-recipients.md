# Legitimate interest assessment: saved recipients

**Status: DRAFT, not signed.** The flag `account.recipients` stays off in production until the
founder signs this assessment below (spec 018 §14 A-founder-2026-10-22 C.7.3, §13 Q21). A
lawyer's review is recommended, not blocking.

| | |
|---|---|
| Processing | A signed-in buyer keeps a recipient's delivery details in their account to send flowers to the same person again without retyping them (`saved_recipient`, migration `0047_buyer_account`) |
| Controller | Flowers Overseas (the entity in `src/config/company.ts`) |
| Data subjects | Recipients of orders: third parties who did not place the order |
| Data | Full name, phone number, address lines, postcode, city, country, the date the copy was last used. **Never** the card message, the delivery note, the type of place (hospital, funeral home, cemetery and the others), a ward or room, or an email address |
| Source | The buyer's own order (an Art. 14 situation: collected from someone other than the data subject) |
| Lawful basis | Art. 6(1)(f) GDPR and UK GDPR: legitimate interests |
| Written by | Implementer of TASK-352 (2026-11-11), from spec 018 C.7.3 and C.16 |

## 1. Purpose test: is there a legitimate interest?

- **The buyer's interest:** sending flowers again to a parent, partner or friend abroad without
  retyping a foreign address and phone number, which is error-prone (foreign address formats,
  numbering plans). Repeat gifting to the same person is the most common pattern in this trade
  (birthdays, anniversaries, Mother's Day).
- **Our interest:** fewer failed deliveries from mistyped addresses, and a smoother repeat order.
- **The recipient's interest:** flowers arrive at the right address.
- The interests are lawful, specific and real. Nothing is used for marketing to the recipient,
  profiling, or any purpose other than filling in a future order of the same buyer.

## 2. Necessity test: is the processing necessary for that purpose?

- Only the fields a delivery needs are kept; the order's own copy keeps the rest for 90 days and is
  then swept with no exemption (spec 002 §8, spec 018 AC-27 as amended).
- **Explicit and per recipient:** a copy is made only when the signed-in buyer ticks an unticked
  box for that one recipient ("Save {name}'s details for next time"), never automatically, never
  pre-ticked, never for a guest.
- **Excluded places:** the box is not offered when the order went to a hospital (health data,
  Art. 9), a funeral home or a cemetery (circumstances of bereavement).
- **Bounded:** at most 20 per buyer; deleted 730 days after the buyer last used it
  (`retention.sweep`, policy `saved_recipient`), or when the buyer removes it (a delete, not a
  pseudonymisation), or when the account is erased or closed.
- A less intrusive alternative (retyping each time) does not achieve the purpose.

## 3. Balancing test: do the recipient's interests override?

| Factor | Assessment |
|---|---|
| Nature of the data | Ordinary contact data. Special categories are excluded by design (no place kind, no hospital, funeral home or cemetery copies, no card message) |
| Reasonable expectations | A person who receives a gift expects the sender to know their address; sending again is the same relationship. The sender already holds these details in their own contacts |
| Impact | Low: the copy is visible only to the buyer who made it (row-level security on `customer.user_id`), never to florists or other buyers; it is used only to fill in that buyer's next order |
| Vulnerability | Possible for bereaved recipients, which is why funeral home and cemetery orders are never offered |
| Safeguards | Minimised columns (no email column, enforced by `pnpm db:check`), unticked opt-in per recipient, cap of 20, 730-day retention after last use, buyer removal at any time, no logging of names, phones or addresses |

**Conclusion (proposed):** the buyer's and our interests are not overridden by the recipient's
interests, rights and freedoms, given the safeguards above.

## 4. Transparency and the recipient's rights

- **Art. 14 notice:** the privacy policy's recipient section (spec 041) says that a sender may keep
  the recipient's delivery details in their account to send flowers again, for how long (2 years
  after the last use), and how to object. The recipient notice on the card and on `/r/{code}`
  (spec 029) links to that section. ⚖️ Lawyer flag: whether this route meets Art. 14(3).
- **Objection and erasure (Art. 21, Art. 17):** a recipient's request deletes every
  `saved_recipient` row holding their phone number, across every customer
  (`docs/runbooks/dsar.md`, "A recipient's erasure or objection: saved recipients"). The buyer is
  not told who asked.
- **Access (Art. 15):** answered from the same query by phone.

## 5. Review

Review this assessment when the data kept changes, when a complaint is received, or yearly.

## Sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| Founder (controller) | | | |
| Lawyer (recommended) | | | |
