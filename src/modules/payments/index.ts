/**
 * Public barrel for `payments` (spec 013 §5.2; spec 014 adds Mollie behind the same interface).
 * Created and owned by TASK-255; TASK-254 adds only `events.ts`'s registrations.
 *
 * Provider types never leave the module (§5.2): the `PaymentProvider` interface, its contract
 * suite, `FakePaymentProvider` and the Stripe adapter are imported by path inside the module and
 * by its tests, never through here. **No function exported here takes a charge amount** (AC-9,
 * `tests/unit/payments-types.test.ts`): every amount a provider charges is read from the order.
 *
 * The lifecycle, refund, dispute and webhook exports of §5.2 join this list in their own tasks
 * (TASK-257 onwards).
 */
export {
  declineMessageKey,
  PAYMENT_ERROR_KEYS,
  type PaymentErrorKey,
} from "./decline.ts";
