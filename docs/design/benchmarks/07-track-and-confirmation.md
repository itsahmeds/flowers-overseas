# 07 — Tracking and order confirmation

Our `/track/{token}` (no login), `/track` lookup and `/checkout/confirmation/{token}` are `plan/05` rows 20–22, with the post-purchase message plan in `plan/04` §13. This is the weakest page type in the entire competitive field.

Method as in `docs/design/homepage-v1/README.md`. Live fetches **2026-09-09**.

Access log:
| Target | URL | Result |
|---|---|---|
| FloraQueen | https://www.floraqueen.com/pages/help | 200, readable — tracking described |
| FloraQueen | https://www.floraqueen.com/pages/conditions-of-purchase | 200, readable |
| 1-800-Flowers | https://www.1800flowers.com/customer-service-faq | 200, readable — tracking described |
| 1-800-Flowers | https://www.1800flowers.com/orderstatus | **HTTP 404**; `/OrderTrackingLogonView` is robots-disallowed |
| Interflora UK | https://www.interflora.co.uk/order-tracking | **HTTP 404** |
| Interflora UK | https://www.interflora.co.uk/page/delivery-information, /page/terms-and-conditions | 200, readable |
| Euroflorist NO | PDP (SMS confirmation copy) | 200, readable |
| Euroflorist PL | PDP ("Track & Trace") | 200, readable |
| Euroflorist | `/order-confirmed` route named in robots.txt (2026-09-05) | route shape only |
| Teleflora | teleflora.com | **HTTP 403** |
| Bloom & Wild | — | **BLOCKED** |
| Poczta Kwiatowa | all URLs | **404 to WebFetch** |
| Aquarelle | photo-at-dispatch policy per `competitors-national.md` §7 (2026-09-05) | secondary source |

A confirmation page itself cannot be reached without placing an order, so **no confirmation page in this set was observed**. Everything below about confirmation comes from help/FAQ/terms copy describing it.

---

## 1. Per-competitor table

| | FloraQueen | 1-800-Flowers | Interflora UK | Euroflorist NO / PL | Aquarelle FR | GiftBasketsOverseas | Bloom & Wild | Teleflora |
|---|---|---|---|---|---|---|---|---|
| **Is there a no-login tracking page?** | **No** — tracking is inside the account/FloraClub profile | No — `/OrderTrackingLogonView` is a *logon* view; order-number entry is offered on an "Order Tracking Page" (URL not resolvable, `/orderstatus` 404s) | not found (URL 404); no tracking link in the footer groups returned | PL PDP advertises "Track & Trace"; the route `/order-confirmed` exists; a standalone tracking page was not found | not found | "Track Order" item in the menu (2026-09-05) | not visible | **BLOCKED** |
| **Lookup fields** | n/a (login) | order number, or sign in for full history | not visible | not visible | not visible | not visible | not visible | **BLOCKED** |
| **Statuses shown** | "Created", "Being prepared" | order received → shipping confirmation → delivery confirmation | not visible | not visible | not visible | not visible | not visible | **BLOCKED** |
| **Is a tracking number given?** | **No, and they say why**: "we cannot send a tracking number in all cases because many of our florists use their own transportation" | shipping confirmation email for shipped goods; florist-delivered orders get a delivery confirmation instead | courier orders trackable in principle; florist orders not stated | PL: DHL/DPD Track & Trace for courier-shipped bouquets | n/a | n/a | Royal Mail tracked (UK letterbox) | **BLOCKED** |
| **Delivery confirmation channel** | none stated | **email, with a stated deadline**: delivery confirmation "sent by 8PM in the recipient's time zone" | not stated | **NO: SMS** — "Du mottar en SMS med leveringsbekreftelse når blomstene er levert" | **email with a photo** — "Photo prise au moment de l'expédition et envoyée par mail", kept 15 days | none stated | app/email | **BLOCKED** |
| **Photo proof** | none | none | none | none | **yes, at dispatch** (not at delivery), plus "Si votre création florale ne correspond pas à la photo reçue, contactez notre service client dans les 48h" → resend or refund | **yes, but as marketing** — a public "Pictures of Gift Recipients" gallery, not per-order proof | none | **BLOCKED** |
| **Florist identity revealed?** | no | no | named florists appear on some PDPs, not per order | no | no | no | no | **BLOCKED** |
| **Failed-delivery handling, verbatim** | "we do not process refunds" for delays or undelivered orders due to unforeseen circumstances, incorrect addresses provided by customers, or recipient refusals | "100% Smile Guarantee … If you're not satisfied with your purchase, for any reason at all, we'll make it right" | "We are not responsible is [sic] the recipient has moved or refuses the delivery"; if unavailable and no safe place, "a card will be left to rearrange delivery. **We reserve the right to charge for re delivery**" | not visible | "un avis de passage … ou le colis sera déposé devant la porte du destinataire en lieu sûr" | delivery window "between 9 am and 9 pm … cannot guarantee an exact delivery time" | not visible | **BLOCKED** |
| **Complaint window** | **24 hours**, with photographic evidence required from the buyer: photos "within 24 hours of receiving the delivery" | not stated | **1 working day**: "Make any complaint within 1 working day of the date of delivery or intended delivery" | not visible | **48 hours** against the dispatch photo | not stated | not visible | **BLOCKED** |
| **Guarantee on the confirmation path** | "97% probability that your order will arrive on the chosen day" | "100% Smile Guarantee" | "We guarantee the freshness of your flowers for 7 days from the date of delivery/collection"; if they cannot supply, "reimburse your payment in full no later than 7 days after the intended delivery/collection date" | 7-day freshness / "Kvalitetsgaranti" | "Bouquet 100% conforme"; resend or refund | "100% Satisfaction Guarantee" | not visible | **BLOCKED** |
| **Amendment after ordering** | **"Once you have placed your order, you will not be able to modify or cancel it under any circumstances"** | not stated | perishables: "You may not change, cancel or return an order for perishable goods once your order has been dispatched" | not visible | 48-hour withdrawal on bouquets per CGV | not stated | not visible | **BLOCKED** |
| **Confirmation-page contents** | not observable | "order confirmation email will let you know that your order has been received" | not observable | `/order-confirmed` route exists | not observable | not observable | not observable | **BLOCKED** |
| **Reorder / send-again** | not visible | account order history | not visible | not visible | not visible | "GiftyLink Service" (recipient chooses own gift) | subscriptions | **BLOCKED** |
| **Indexability of confirmation/tracking** | `/checkouts/` disallowed | `/OrderTrackingLogonView`, `/account`, `/checkout` disallowed | `/basket`, `/checkout` disallowed | `/order-confirmed`, `/my-pages`, `/payment` disallowed per locale prefix | login paths disallowed | `/change-page/` and tracking params disallowed | not visible | **BLOCKED** |

---

## 2. What we take

1. **A stated deadline for the delivery confirmation.** 1-800-Flowers: confirmation "sent by 8PM in the recipient's time zone" (1800flowers.com/customer-service-faq, 2026-09-09). A promise with a clock on it is worth more than a promise. Ours: the photo arrives on the day of delivery, and we say by when.
2. **SMS/WhatsApp delivery confirmation announced before purchase.** Euroflorist NO puts it on the PDP: "Du mottar en SMS med leveringsbekreftelse når blomstene er levert." Announcing the post-purchase experience *pre*-purchase is a conversion device we already plan (`plan/04` §12) and almost nobody uses.
3. **A photo tied to a complaint window.** Aquarelle is the only competitor with a real proof mechanism: a photo by email plus "if your floral creation does not match the photo received, contact customer service within 48h" → resend or refund. Our photo is at delivery (stronger), so the same mechanism becomes: photo on delivery, X hours to tell us it is wrong, then remake or refund.
4. **Explaining honestly why there is no carrier tracking number.** FloraQueen: "we cannot send a tracking number in all cases because many of our florists use their own transportation". Correct and disarming. Our `/track/{token}` replaces the tracking number with a real timeline — which is exactly the gap FloraQueen admits to and does not fill.
5. **A "what happens next" timeline as the confirmation content.** Nobody in the field publishes one. Our confirmation page (`plan/04` §9) already specifies order number, timeline, tracking link, add-to-calendar, recipient recap and a WhatsApp share of the tracking link for the sender.
6. **Distinct disallowed routes for basket / payment / confirmed**, enumerated for every locale prefix (Euroflorist's robots template). Cheap and correct.
7. **Reorder / send-again as a first-class post-delivery action.** Only GBO does anything here (GiftyLink). Our tracking page already carries "send again / reorder" and the recipient loop.

## 3. What we drop and why

1. **Tracking behind a login.** FloraQueen puts order status inside the account; 1-800-Flowers' route is literally a "LogonView". A gift sender is a one-time guest buyer — token-based, no-login tracking (`plan/05` row 21) is the right answer and the field leaves it open.
2. **"You will not be able to modify or cancel it under any circumstances"** (FloraQueen). Discussed in `04-checkout.md` §3 — we publish a real amendment window tied to the destination cutoff.
3. **"We do not process refunds"** for delays, undelivered orders, or a recipient refusal (FloraQueen). Our guarantee is a remake or a refund; the whole product is trust.
4. **Charging the buyer for redelivery** ("We reserve the right to charge for re delivery", Interflora UK). If our routing failed, the buyer does not pay twice.
5. **"We are not responsible" as the failed-delivery policy** (Interflora UK). We own the outcome; the actionable options (neighbour / redeliver / call recipient) are in `plan/04` §13.
6. **A 24-hour photo-evidence burden on the buyer** (FloraQueen). We hold the evidence.
7. **A 1-working-day complaint window** (Interflora UK). Too short for a gift the buyer never sees; and against a photo we took, a longer window costs us nothing.
8. **A published "97% probability"** (FloraQueen). Unaudited precision reads as invented. `plan/04` §3 and CLAUDE.md forbid it.
9. **A marketing gallery of recipient photos in place of per-order proof** (GBO). Our gallery (`plan/05` row 31) is only approved photos with consent, and it never substitutes for the buyer's own delivery photo.
10. **Nothing at all between "paid" and "delivered".** The field norm — silence — is what makes the cross-border buyer anxious, and it is the whole reason our tracking page and message plan exist.

## 4. Open questions for the founder

1. **Complaint window length.** Aquarelle 48 h against a dispatch photo; Interflora 1 working day; FloraQueen 24 h with buyer-supplied photos. What do we publish, measured from the delivery photo?
2. **Photo consent.** The photo is taken in someone's doorway, often with the recipient present. What does the florist have to do — bouquet only, no people, no house numbers? This needs to be in the partner terms and in the RoPA (`plan/07`).
3. **Florist identity on the tracking page.** `plan/04` §13 says first name + city once the order is accepted. Confirm this is acceptable to partners and does not create a channel-bypass risk.
4. **Redelivery cost.** If the recipient is absent through no fault of ours (wrong address given by the buyer), who pays for the second attempt? The field charges the buyer; we said we would not. Confirm the boundary.
5. **Tracking-link sharing.** The confirmation page offers a WhatsApp share of the tracking page to the sender. If the *sender* forwards it to the recipient, the recipient sees the delivery photo and possibly the message. Is that intended, and does the token need a recipient-safe view?
6. **Substitution approval SLA.** `plan/04` §13 gives 2 hours with default-approve if the main flower changes. Is 2 hours realistic across time zones, and what happens overnight?
