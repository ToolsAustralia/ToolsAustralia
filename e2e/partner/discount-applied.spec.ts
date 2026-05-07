import { test } from "../fixtures/test";

// Serial when re-enabled: would share tradie-w<N> with mutating membership specs.
test.describe.configure({ mode: "serial" });

// BLOCKED: The shop checkout page (`src/app/(site)/shop/checkout/page.tsx`)
// renders only Subtotal / Shipping / GST / Total — there is no partner-discount
// line item, no auto-applied tradie/foreman/boss discount UI, and no member
// discount displayed at checkout. Partner discounts in this codebase are
// rendered on /my-account (PartnerDiscountsSection) and /my-account/benefits
// (PartnerDiscountQueue) — they grant access to external partner brand offers
// (each card is an outbound link), not a price reduction at our own checkout.
//
// There is therefore nothing for this spec to verify in the shop checkout flow.
// Surfacing as BLOCKED per playwright-spec-author convention.
test.skip("BLOCKED: no partner-discount line on /shop/checkout", () => {});
