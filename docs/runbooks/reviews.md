# Reviews: moderation, the review alerts and takedown

Spec 022a. Admin page `/admin/reviews` (permission `reviews.moderate`: admin, ops).

## Moderating a review

Every first-party review comes from a delivered `live` order through its emailed link and arrives
`pending`. Open it in `/admin/reviews`, oldest first, and choose one action:

- **Publish.** The usual answer, the low ratings too. Never hold a review back because of its
  rating or its tone (UCPD Annex I 23b; DMCC Sch. 20).
- **Publish without text.** Only when the text names a person or carries contact details
  (`personal_data`), is abusive (`abuse`) or is unlawful (`illegal`). The stars stay public and
  counted; the card says the comment was withheld and why.
- **Remove.** Only when the review is not genuine (`not_genuine`), repeats another (`duplicate`) or
  belongs to an order we placed ourselves (`test_order`), with a note saying what shows it. A
  removed review appears nowhere public and counts nowhere.
- **Reply.** Shown under the review as "Reply from Flowers Overseas". Thank the buyer; never argue
  and never discuss money here.

Ratings and words are never edited; the database refuses it (`REVIEW_CONTENT_IMMUTABLE`). Every
action is in the audit log and refreshes the public pages and the florist's 90-day rating.

## reviews-pending-overdue

`alert=reviews.pending_overdue`, P3, one per review: a review has waited more than 72 hours. The
review policy promises a check within 3 working days. Moderate it; the alert is resolved by hand
once the review is no longer pending.

## partners-rating-low

`alert=partners.rating_low`, P3, at most once a week per florist: an active florist's 90-day rating
is under 4.20 with at least 3 ratings. Read the reviews and the florist's recent orders and talk to
the florist. Pausing stays a manual decision in `/admin/partners`; nothing pauses automatically.

## Takedown requests on reviews (DSA notice and action)

Every review card carries a "Report" link to our WhatsApp with the review number. On a report: open
the review, decide within the takedown runbook's times, and use **Publish without text** or
**Remove** with the matching reason only; reply to the reporter with the outcome.

## Erasure

Spec 018's erasure calls `reviews.redactForCustomer`: the text and the first name are removed, the
rating stays as an anonymous verified rating shown as "Verified buyer".
