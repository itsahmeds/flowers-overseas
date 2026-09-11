/**
 * The **control** for spec 005 AC-18's geo-blocking gate (T-16; TASK-069).
 *
 * A gate that only ever runs over clean code proves nothing: "no exported function takes the
 * buyer's location" and "the analyser found nothing" are the same green. This module is the
 * pricing API as EU 2018/302 forbids it — a buyer country in a parameter name, a visitor object
 * one property deep, an IP address on a nested type and a `geo` hint behind a type alias — and
 * `tests/unit/catalog-geo-surface.test.ts` asserts the analyser finds **every** one of them here
 * before asserting it finds none in `src/modules/catalog`.
 *
 * Nothing imports this at runtime. It is read by the TypeScript compiler API only, which is why
 * the shapes are hand-written rather than borrowed from the module: a control that shared a type
 * with the subject could be made green by editing the subject.
 */

/** A caller's inferred location. The thing the regulation says a price may not depend on. */
export interface VisitorLocation {
  readonly ipAddress: string;
  readonly countryIso: string;
}

/** A nested carrier, so the walk has to descend to find the offence. */
export interface BuyerContext {
  readonly visitor: VisitorLocation;
  readonly sessionId: string;
}

/** The alias case: the offending name is on the alias' target, not on the parameter. */
export type GeoHint = { readonly geo: string };

/** Parameter-name offence: `buyerCountry` in the signature itself. */
export function priceForBuyerCountry(input: {
  readonly sku: string;
  readonly buyerCountry: string;
}): number {
  return input.sku.length + input.buyerCountry.length;
}

/** Property offence two levels down: `visitor` → `ipAddress`. */
export function priceForContext(context: BuyerContext): number {
  return context.visitor.countryIso.length;
}

/** Return-type offence: the geography leaves through the result rather than the argument. */
export function quoteWithHint(sku: string): { readonly hint: GeoHint } {
  return { hint: { geo: sku } };
}

/** Bare-parameter offence: the parameter is *called* `buyer`, with no type to inspect. */
export function surchargeFor(buyer: string): number {
  return buyer.length;
}
