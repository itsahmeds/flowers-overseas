ADVISOR: GO WITH FIXES

# Prices for the odd stem counts (spec 005 §13 Q12, §14 A-founder-2026-10-14c)

Advisor research memo, 2026-10-15. Subject: the founder's answer "Prices for 11, 15 and 21 stems. - use industry price." Not legal advice.

## 1. In one sentence
Market prices back today's Polish rose prices at 11 and 15 stems (one cell moves +10 zł), but put 21 red roses at about 329 zł, which no essential or classic band can hold, so the table is GO once the founder rules on two out-of-band cells and the spec stops promising "prices unchanged by position".

## 2. Verdict and the proposed table
**The rule.** For each count, use the Polish market median for that many **red roses**, delivered, VAT included, rounded to the **nearest** §13 Q1 ending (`x9` zł). Never go below today's price for that position. A result outside the product's A1 band is flagged for the founder and never clamped silently. Where the market does not sell by count, today's price stays by position: mixed, seasonal and gift sets, and the ladders that **gain** stems (gerberas 10→11, lilies 5/8/12→5/9/15, sunflowers 13→15).

**What the market says (PL, read 2026-10-15).** The medians are 11 red = **199** (169, 177, 225, 286), 15 red = **239** (199, 210, 234, 235, 269 delivered, 299, 389), 21 red = **329** (329, 330, 389). Sources are at the foot.

| PL (PLN, the only live destination) | 11 / 15 / 21 today | Proposed | Inside A1 band? |
|---|---|---|---|
| Roses classic (BQ-001/003/007) | 199 / 229 / 259 | **199 / 239 / 259**, or 329 at 21 | yes. **329 is outside** classic 199–259 |
| Roses essential (BQ-004) | 149 / 169 / 189 | market 199 / 239 / 329 | **no: all three are outside** 149–189 |
| Roses premium / luxury | 269/309/349, 359/449/529 | unchanged (at or above market) | yes |
| Carnations (BQ-038) | 149 / 169 / 189 | unchanged (11 carnations sell for 119) | yes |
| Everything else | by position | unchanged | yes |

The classic ladder is per **band**, not per flower (`prices.data.ts` `ladders.classic`). The 239 therefore also reprices the middle tier of classic tulips, mixed, seasonal and lilies. That stays inside the band.

**Display only, not authored.** GBP and EUR are FX views of PLN (`plan/10` §2.3), so there is no GBP price to set. At the committed 2026-09-08 ECB rate plus the 2.5% buffer, the classic roses show as about £40.90 / £48.90 / £52.90 (£69.90 at 329) and €47.90 / €56.90 / €61.90 [inferred, computed]. The five EUR destinations are `demo`, and I found no count-priced EUR market, so they stay by position.

**Fixes (each checkable):**
- **F1** spec 005 §14 A-founder-2026-10-14c point 4, AC-36 and T-37: replace "prices byte-identical to the base, position by position" with "prices equal the approved table; every other product is byte-identical by position". As written, AC-36 forbids the founder's own answer.
- **F2** The founder rules on the two flagged cells before anyone edits `prices.data.ts`, and the ruling is recorded in `plan/13` and §14 A1, as A1 requires. Classic 21: keep 259 (about 21% under market) or allow 329. Essential roses: allow 199/239/329, or give BQ-004 the ladder 5/7/9 at today's 149/169/189, where the market median is 129/179/199.
- **F3** §13 Q12's closing note says GBP is converted and never authored, so "industry price in GBP" is not a field anyone looks for.
- **F4** Allowing 329 at 21 for roses only needs a **per-SKU ladder override** in `prices.data.ts`, which `catalogue:check` holds to whatever band the founder sets. That is a code change with its own task, not a data edit.

## 3. The four hats
- **Building:** (1) Ladders are per band, so pricing by count cannot be expressed per flower today (F4). (2) The static dataset has one `PRICE_ACTIVE_FROM` and no superseded rows (`retailRows()`), so editing a ladder rewrites history. Until superseding exists, any later cut on these SKUs cannot honestly quote a 30-day-lowest price. (3) AC-36 conflicts with the answer (F1).
- **Google:** no concern. `Offer.price` comes from the same projection, and old `?tier=` keys are noindex and fall back (spec 009 AC-15).
- **Law and compliance:** (1) Every change here is a rise, so Omnibus Art. 6a (an announced reduction) is not triggered. Show no "was/now" on these SKUs. (2) "11 stems" on a roses-and-mixed product must mean 11 roses, or the label misleads (UCPD). That is a founder or copy call. (3) In-flight buyers keep their 30-minute quote (§13 Q5), so shown = charged holds.
- **Customer:** (1) The default (middle) classic tier goes 229→239 zł, which is small. (2) Even at 329 zł (about £70) we sit far below Interflora UK's international 24 red roses (£124.35 + £12). The risk is florist refusal, not buyer price shock: at the 58% seed payout, 259 zł pays a florist about 150 zł for 21 roses that the same shops sell for 329–389 zł [inferred, from the seed share].

## 4. Questions the founder should ask
1. "Industry price" means the **Polish local** market (this memo), not UK relay prices, which are about twice as high. Is that right?
2. Classic 21 red roses: 259 zł (under market) or 329 zł (outside the band)?
3. Essential roses: out-of-band 11/15/21, or 5/7/9 at today's prices?
4. On a roses-and-mixed bouquet, is "11 stems" 11 roses?
5. Do the EUR demo destinations wait for a real partner's quote? (Recommended: yes.)

## 5. What looks right
Today's PLN ladder is already close to the market at 11 and 15 stems, and premium and luxury need no change. The one-ladder-per-band design keeps the edit to a single cell if the founder stays inside the bands.

**Sources (all read 2026-10-15; delivery noted per source):** Glovo, [Balloons & Flowers Bar, Poznań](https://glovoapp.com/ro/pl/poznan/stores/kwiaciarnia-balloons-flowers-bar-poz) (store card says free delivery, terms not stated); [Tu Kwiaty, Poznań](https://glovoapp.com/pt/pl/poznan/stores/kwiaciarnia-tu-kwiaty-poz) (same); [Green Hub, Koszalin](https://glovoapp.com/kk/pl/koszalin/stores/green-hub-osz) (same) · [laflora.pl 15 róż](https://laflora.pl/15-roz-czerwonych) (199 zł, delivery 0 zł) · [floraonline.pl](https://floraonline.pl/bukiet-15-roz-czerwonych/) (250–350 + 19 zł) · [redrosescompany.pl](https://redrosescompany.pl/bukiet-15-dlugich-czerwonych-roz) (delivery not stated) · [kwiatowadostawa.pl relay](https://kwiatowadostawa.pl/produkt/bukiet-tradycyjny-z-15-roz/) (389/529/649, delivery not stated) · [Interflora EE, Poland](https://www.interflora.ee/en/categories/319-poland) (15 medium roses €60, delivery not stated) · [Fleurop.de roses](https://www.fleurop.de/blumen/rosen) and [delivery](https://www.fleurop.de/service/lieferkosten-und-zeiten) (no counts; +€8.99, abroad €10) · [Interflora FR roses](https://www.interflora.fr/c/fleurs/roses) (no counts) · [Interflora UK abroad](https://www.interflora.co.uk/page/sending-flowers-abroad) (£12) · Interflora UK [24 red roses, int](https://www.interflora.co.uk/product/24-red-rose-hand-tied-rroht024-int) (£124.35, search snippet only; the page did not render).
