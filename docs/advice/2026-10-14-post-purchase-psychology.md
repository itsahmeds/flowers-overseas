ADVISOR: GO WITH FIXES

# Post-purchase psychology: pay step, confirmation, tracking, buyer emails

Advisor research memo, 2026-10-14. Subject: the founder's note on the confirmation design ("you are invoking the negative emotion... don't talk abt refund here"). Covers specs 010 (pay step), 013 §7 (`payments.confirmation.*`), 018 §7 (`tracking.*`, `postPurchase.*`), 016 §5 (B1 to B6) and the wireframes `confirmation-*`, `track-order-*`, `email-buyer-*`. This is not legal advice. Every legal sentence below is a proposal, and the lawyer signs it off with the legal set (`plan/13` B4).

**In five lines**
1. The founder is right. Once the card is charged, the job is to confirm the buyer chose well and to look forward to the gift. A sentence about failing ("If we cannot deliver it") puts that failure in the buyer's head at the moment they have just committed.
2. Reassurance about cancelling and refunds is most useful **before Pay**: that is when it removes doubt and the law requires it. After Pay it belongs in the small print: present and findable, never the headline.
3. After purchase, write about **gain and anticipation**: the date, the city, the person, the bouquet being made. Do not write about loss and fallback.
4. The **delivery photo email is the peak and the end** of the whole experience for a sender who never sees the handover. Design it as the gift moment: photo first, no asks, sent on the day.
5. A cancellation, when it happens, is the one message where the refund *is* the headline. Lead with the amount and when it arrives, and write it plainly.

**Verdict (GO WITH FIXES).** The flow is sound. Four copy and layout fixes, each checkable:
- **F1** spec 013 §7, `payments.confirmation.paid`: replace "We have your order and your payment. If we cannot deliver it, you get a full refund." with the confirmation copy on page 2. The refund sentence goes nowhere else on the page.
- **F2** spec 018 §7 `postPurchase.cancelPromise` and AC-9, plus the `.s13-cancel` panel in `confirmation-*.dc.html`: move cancelling out of a highlighted panel into a quiet line at the foot of the block (page 2 copy). Drop "We refund the full amount to your card." from that line. AC-9 then quotes the new sentence. "For free" already says the buyer loses nothing.
- **F3** spec 016 §5 B1: the hero is thanks, date and city. The cancellation and perishable sentences, trader identity, complaint path and the terms PDF go in a labelled block at the foot of the email (page 4). They stay out of the subject line, the preheader and the first screen.
- **F4** spec 016 §5 B4: put the photo first, then the page 5 copy, and nothing to sell or rate in the same email. Send it on the delivery day by a stated hour.

---

## The evidence, and how strong it is

| Claim | Source | Strength |
|---|---|---|
| People judge an experience mostly by its most intense moment and its end | Kahneman, Fredrickson, Schreiber, Redelmeier 1993, *Psychological Science* 4(6) ([publisher](https://www.psychologicalscience.org/journals/psychological-science/j.1467-9280.1993.tb00589.x/)) | Lab evidence, widely replicated. Applying it to emails is [inferred] |
| Givers judge a gift by the **moment of exchange** (the reaction); recipients judge it by its later use | Galak, Givi, Williams 2016, *Current Directions in Psych. Science* ([CMU summary](https://www.cmu.edu/news/stories/archives/2016/december/gift-study.html)) | Review of studies. That the photo stands in for the moment the giver cannot see is [inferred], but it follows directly |
| Imagining an outcome makes it feel more likely | Gregory, Cialdini, Carpenter 1982, summarised in [Cambridge, *Heuristics and Biases*](https://www.cambridge.org/core/books/abs/heuristics-and-biases/imagining-can-heighten-or-lower-the-perceived-likelihood-of-contracting-a-disease-the-mediating-effect-of-ease-of-imagery/6F39F220C321101BDF26C703D4376A3D) | Lab evidence. Its application to "if we cannot deliver" is [inferred] |
| A negation ("not lost") can call up the very idea it negates when no ready positive schema exists | Mayo, Schul, Burnstein 2004, *JESP* 40(4) ([HUJI](https://cris.huji.ac.il/en/publications/i-am-not-guilty-vs-i-am-innocent-successful-negation-may-depend-o/)) | Lab evidence |
| Negative information weighs more than positive | Baumeister et al. 2001, *Rev. Gen. Psych.* 5(4) ([PDF](https://fbaum.unc.edu/teaching/articles/Baumeister_2001.pdf)) | Broad review |
| Gain framing ("75% lean") is rated better than the same fact framed as loss ("25% fat") | Levin and Gaeth 1988, *JCR* 15(3) ([Iowa](https://iro.uiowa.edu/esploro/outputs/journalArticle/How-Consumers-are-Affected-by-the/9984963239602771)) | Lab evidence. The effect shrinks once people experience the product |
| Waiting for an experience is enjoyable in itself, more than waiting for an object | Kumar, Killingsworth, Gilovich 2014, *Psych. Science* 25(10) ([PDF](https://bpb-us-e1.wpmucdn.com/blogs.cornell.edu/dist/b/6819/files/2019/12/KumarKillingswothGilovich.14.pdf)) | Four studies. Treating a sent gift as an "experience" for the sender is [inferred] |
| Showing the work being done raises perceived value | Buell and Norton 2011, *Management Science* 57(9) ([RePEc](https://ideas.repec.org/p/hbs/wpaper/14-034.html)) | Five experiments |
| Before purchase, trust and returns worries make people abandon: 19% distrust the site with their card, 13% cite the returns policy | [Baymard, cart abandonment](https://baymard.com/lists/cart-abandonment-rate) (updated 2025-09-22) | Large survey. Supports reassurance **at Pay** |
| Order confirmations are read far more than marketing emails (click rate 12.5% vs 3.1%); the subject line should say plainly that it is a transactional email | [Litmus](https://www.litmus.com/blog/best-practices-for-optimizing-order-confirmation-emails) (older Experian data, open-rate figure in source is garbled) | Industry data, dated |
| A guarantee shown prominently can lower sales for a trusted product | KitchenAid test, [conversion.com podcast](https://conversion.com/?p=8751); Desmet 2014 finds guarantee effects small ([RePEc](https://ideas.repec.org/a/eee/jbrese/v67y2014i9p1971-1978.html)) | **Opinion and anecdote**, not a controlled study |

No study tests the exact sentence "If we cannot deliver it, you get a full refund" on a confirmation page. The case for removing it is strong inference from the rows above, not proof.

**What the brands do (only what I could verify):** UrbanStems couriers "take photos outside the delivery location", and not in every case ([help centre](https://help.urbanstems.com/en-US/articles/delivery-tracking-issues-292594)). 1-800-Flowers promises the delivery confirmation "by 8PM in the recipient's time zone" (`docs/design/benchmarks/07` §2). Aquarelle emails a photo at dispatch and gives the buyer a 48-hour complaint window against it (same file). BloomNet's proof-of-delivery rules require the whole order centred, no people in the frame, and the address where possible ([BloomNet](https://www.bloomnet.net/help/what-makes-a-valid-proof-of-delivery-photo/)). For Bloom & Wild, only customer reviews mention a photo ([reviews.co.uk](https://reviews.co.uk/company-reviews/store/bloom-and-wild/4p)). Poczta Kwiatowa was fined over 1.6 million zł by UOKiK for a term saying it did not guarantee delivery on peak days ([Gazeta Prawna](https://www.gazetaprawna.pl/firma/artykuly/11190287,kara-uokik-poczta-kwiatowa.html)): the small print may not contradict the promise. **Not verified:** Interflora, Fleurop, Flowerbx, Serenata, Moonpig, Bouqs, Kwiaciarnia. Their confirmation and photo practices were not reachable without placing an order.

---

## Page 1. Pay step (spec 010 step 3)

1. **Emotional goal:** safety and control at the moment of greatest doubt. This is the one place where risk reversal earns its keep (Baymard, above).
2. **Show first:** the total that is the charge, the delivery date and city, the payment methods. **Leave out:** urgency timers and any "only N left". Do not mention failure here either: state what the buyer *can* do, not what might go wrong.
3. **Copy (proposed):**
   - Summary line: "£45.90 · includes VAT and delivery · nothing more to pay"
   - Delivery line: "Delivered in Kraków on Friday 17 October."
   - Pre-contract sentence, directly above the button, gain first: "You can cancel for free until we start preparing your order. Flowers are fresh, so the 14-day cancellation right does not apply after that. [Terms]"
   - Guarantee line, small, beside the total: "If anything is wrong with your flowers, we put it right. [Our guarantee]"
   - Button: "Pay £45.90 and place order"
4. **Legal placement:** this is where the law needs it: the CRD Art. 6(1) information, including that no withdrawal right applies to perishables (Art. 16(d)), and the button wording (Art. 8(2)). It stays visible here, in full, before Pay. ⚖️ The lawyer confirms the gain-first order of the sentence.
5. **Measure later:** drop-off between reaching step 3 and pressing Pay, and how often "Terms" is opened from the pay step.

## Page 2. Confirmation page (spec 013 states plus spec 018 block)

1. **Emotional goal:** relief and pride ("I did a lovely thing, and it is in good hands"), then anticipation. Post-purchase doubt fades when the buyer sees the choice confirmed as a good one (cognitive dissonance, Festinger 1957; measured by Sweeney, Hausknecht, Soutar 2000, [CORE](https://core.ac.uk/works/69312181)). A fallback does not help.
2. **Show first:** thanks, then who gets it, where and when, then what was paid. **Leave out:** refunds, "if we cannot", failure states, payment mechanics. Cancelling is still possible, but it sits at the foot of the block as one quiet line, not a panel with a button (F2).
3. **Copy (proposed):**
   - H1: "Thank you. We have your order."
   - Sub: "Your flowers arrive in Kraków on Friday 17 October." (On the cookie-gated page the recipient's first name may replace the city: "Anna gets her flowers on Friday 17 October.")
   - Paid panel: "Paid £45.90" / "Includes VAT and delivery. Reference FO-7K2M-9QXA."
   - Email line: "Your confirmation is on its way to a•••@example.com."
   - Steps (`postPurchase.steps`): "Order placed · Being made · On its way · Delivered". Add ", with a photo" only if the founder answers Q1 yes.
   - Next line: "We email you at each step. You do not need to do anything."
   - Tiles: "Track your order" · "Add to calendar" · "Share the tracking link" · "Your invoice"
   - Foot line (F2): "Plans changed? You can cancel for free until we start preparing your order. [Cancel this order]"
   - Help: "Questions? Message us on WhatsApp."
4. **Legal placement:** the durable-medium confirmation is the B1 email plus the terms PDF (Art. 8(7)). In my reading the page itself need not repeat the withdrawal text [inferred]. The cancel line stays because the self-service cancel is a product promise (spec 018 A6 D4). ⚖️ Lawyer confirms.
5. **Measure later:** cancellations within one hour of ordering (a doubt signal), and "where is my order" WhatsApp messages before the delivery date.

## Page 3. Tracking page (spec 018)

1. **Emotional goal:** calm certainty and a sense of motion. The buyer comes back to see progress, not to manage risk.
2. **Show first:** the headline state, then the date and city, then the timeline. **Leave out:** payment status, refund wording on a live order, and cancelling (spec 018 already keeps cancel off token pages).
3. **Copy (proposed; headline / sub):**
   - confirmed: "We have your order" / "It arrives in Kraków on Friday 17 October."
   - being_made: "Your bouquet is being made" / "Made by our florist Anna in Kraków." (`tracking.floristLine` as is)
   - on_its_way: "On its way" / "It arrives today, between 10:00 and 14:00 Kraków time."
   - delivered: "Delivered" / photo first, then "Delivered in Kraków at 11:42 on Friday 17 October." Actions: "Send flowers again" · "Message us"
   - cancelled and refunded: keep spec 018's lines; they are already plain and honest.
4. **Legal placement:** a footer link "Terms and cancelling". Nothing in the body.
5. **Measure later:** tracking visits per order (a high count before delivery means anxiety), and clicks on "Send flowers again" from the delivered state.

## Page 4. B1 order received, and B2 being made (spec 016)

**B1. Goal:** the same relief as the confirmation page, now in a place the buyer can find again. It is also the legal record.
- **Subject:** "Your order FO-7K2M-9QXA: flowers for Kraków on Fri 17 Oct". Use the city, not the recipient's name, because subject lines show on lock screens [inferred, data minimisation]. **Preheader:** "Thank you. We email you again when your bouquet is being made."
- **Hero:** "Thank you, Sam." / "Your flowers arrive in Kraków on Friday 17 October." Then the recap panel (products, recipient name and city, date, "Paid £45.90, includes VAT and delivery"), then the button "Track your order", then the next line: "Next: our florist makes your bouquet, and we email you when they start."
- **Foot block (F3), heading "Your order terms":** "You can cancel for free until we start preparing your order: reply to this email or use the link on your tracking page. Flowers are fresh, so the 14-day cancellation right does not apply after that." Then trader identity, complaint path, and "Our terms are attached (PDF)."
- **Legal placement:** everything Art. 8(7) requires is in the email and the PDF, under a clear heading, so it is present but not in the hero. ⚖️ The lawyer confirms the heading and that a footer block counts as "clear and comprehensible".
- **Measure:** replies to B1 that ask "did it go through?" (should be near zero); the tracking-link click rate.

**B2. Goal:** delight that real work has started (the labor illusion: seeing the effort raises value).
- **Subject:** "Your bouquet is being made" · **Hero:** "Our florist in Kraków is making your bouquet now." / "It arrives on Friday 17 October." · Button: "Track your order".
- **Leave out:** "it can no longer be cancelled". True, but negative. The tracking page refuses a late cancel plainly if anyone tries.
- **Measure:** B2 open rate compared with B1 (interest in progress).

## Page 5. B3 on its way, B4 delivered with photo (the peak)

**B3. Goal:** anticipation with a time on it. **Subject:** "On its way in Kraków" · **Hero:** "Your flowers are on their way." / "They arrive today, between 10:00 and 14:00 Kraków time." Keep it short: one button, nothing to do.

**B4. Is it the peak? Yes.** For a sender abroad it is both the peak and the end (Kahneman 1993). It is also their only view of the moment of exchange, which is the part givers care about most (Galak et al. 2016). How to make it one:
1. **Photo first, full width,** above everything but a one-line headline. Florist brief: the whole bouquet centred, daylight, no people, no house number or street (BloomNet's "no people" rule; we drop its "show the address" rule because this photo is for joy and minimisation, not courier proof [inferred]). ⚖️ A photo rule goes into the florist terms and the RoPA (benchmark 07 Q2).
2. **Send it on the day, by a stated hour** in the recipient's zone, as 1-800-Flowers does.
3. **Name the moment honestly:** "Delivered to Anna" only when the florist records a hand-over to the recipient; otherwise "Delivered in Kraków" plus where it was left. (B4 carries no recipient name today, so this needs a spec 016 change; see Q2.)
4. **No asks in the peak:** no review request, discount or cross-sell. Keep the Trustpilot invite 24 hours later, as `plan/04` §13 says, and send the invoice (B8) **before** delivery so the photo is the last email [opinion, Q4].
- **Subject:** "Delivered in Kraków. Here is your photo" · **Preheader:** "Your flowers arrived at 11:42 on Friday."
- **Copy:** headline "Delivered."; under the photo "Your flowers reached Kraków at 11:42 on Friday 17 October. Made by our florist Anna."; one quiet footer link "Send flowers again".
- **Measure later:** clicks from the B4 photo to the tracking page, replies to B4 (thank-you replies are a good sign), and repeat orders within 90 days, comparing orders that got a photo with orders that did not.

## Page 6. B5 cancelled, B6 refund

1. **Goal:** closure with no loss and trust kept. Here the refund **is** the message. Lead with it.
2. **Show first:** the amount and when it arrives. **Leave out:** any reason that names anyone (binding), and excuses.
3. **Copy (proposed):**
   - B5 by us, subject: "Your order FO-7K2M-9QXA is cancelled and refunded" · body: "We could not deliver this order. We have refunded £45.90." (the founder's wording) / "We are sorry. The money reaches your card within 5 to 10 working days, depending on your bank." ([Stripe](https://docs.stripe.com/refunds)) / "[Send flowers again]"
   - B5 by buyer: "You cancelled this order. We have refunded £45.90." / the same timing line.
   - B6 partial: "Refunded £12.00 on 18 October" / the same timing line / the buyer status beside it.
4. **Legal placement:** none extra. The refund is the content.
5. **Measure later:** reorders within 30 days after a B5 sent by us.

---

## The four hats
- **Building:** (1) F2 changes the quoted sentence in spec 018 AC-9, so it needs an amendment before the copy changes, or the AC test fails. (2) B4's "Delivered to Anna" needs a hand-over field the florist records, and B4's content row in spec 016 §5. (3) No concern on architecture: everything else is copy and order.
- **Google:** no concern. Every surface here is noindex.
- **Law and compliance:** (1) The pay-step block and B1's foot block must keep every Art. 6(1) item, including the no-withdrawal statement (Art. 6(1)(k)), in clear words. Moving them down is fine; shrinking them into near-invisible grey text is not [inferred]. ⚖️ The lawyer signs off. (2) A delivery photo of a doorway is personal data around the recipient; the photo rule needs consent wording and a RoPA line (`plan/07` §1.3). (3) Do not promise a photo on every order unless it can be kept (UrbanStems hedges, and spec 010 §8 forbids the promise today).
- **Customer:** (1) The current panel puts failure next to the amount paid, on a phone, at the moment of highest dissonance. Remove it (F1). (2) A large "Cancel for free" button on the thank-you screen invites second thoughts (F2) [inferred].

## Questions the founder should ask
1. Do we promise a photo with every order, or "when we can"? (Spec 010 §8 says no photo promise; spec 018's step says "Delivered, with a photo".)
2. May the delivered email name the recipient by first name when the florist hands the bouquet over?
3. Is a quiet text link enough for cancelling on the confirmation page, or do you want a button?
4. Should the invoice go out before delivery, so the photo email is the last thing the buyer receives?
5. Who reads the pay-step and B1 legal sentences, and when: the lawyer with the legal set?

## What looks right
The binding voice ("we send it, our florist makes it") already avoids every process worry, and the plain B5 wording ("We could not deliver this order. We have refunded {amount}.") is exactly how a cancellation should read. The step list and the photo already give the journey a peak; it just needs to be placed last and kept clear of anything else.
