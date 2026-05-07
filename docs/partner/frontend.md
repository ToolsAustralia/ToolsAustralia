# Partner — Frontend

## Pages

- `src/app/(site)/partner/page.tsx` — public "Become a Partner" landing page (hero + form).
- `src/app/(site)/my-account/page.tsx` (`PartnerDiscountsSection`) — member dashboard partner discounts panel.
- `src/app/(site)/my-account/benefits/page.tsx` — full benefits panel including `PartnerDiscountQueue`.

## Components

- `src/app/(site)/partner/components/PartnerInteractive.tsx` — hero + modal trigger.
- `src/app/(site)/partner/components/PartnershipFormSection.tsx` — application form, POSTs to `/api/partner-applications`.
- `src/components/sections/promo/UnlockDiscounts.tsx` — partner brand cards grid + "ENTER TO UNLOCK DISCOUNT" CTA. Shown both publicly and inside the member dashboard depending on `hasAccess`.
- `src/components/features/PartnerDiscountQueue.tsx` — countdown / queue card.

## Data sources

- TanStack Query for partner catalog reads.
- Discount visibility computed server-side via `partner-catalog-visibility.ts`.
- Static brand catalog at `src/data/partnerBrandOffers.ts`.

## E2E test IDs

| Test ID | Component | File |
|---|---|---|
| `partner-application-form` | `PartnershipFormSection` form | `src/app/(site)/partner/components/PartnershipFormSection.tsx` |
| `partner-application-submit` | Submit button on partner form | `src/app/(site)/partner/components/PartnershipFormSection.tsx` |
| `partner-discount-queue-item` | Reserved (queue item) | `src/components/features/PartnerDiscountQueue.tsx` (planned) |

E2E specs in `e2e/partner/`:

- `discounts-view.spec.ts` (`chromium-tradie`) — active subscriber sees Partner Discounts cards on `/my-account`.
- `application-form.spec.ts` (`chromium-guest`) — guest fills + submits the form; verifies `PartnerApplication` row is persisted via `getDb()`.
- `discount-applied.spec.ts` (`chromium-tradie`) — **BLOCKED**: `/shop/checkout` has no partner-discount line item / no auto-applied price reduction. Partner discounts in this codebase grant access to external partner brand offers, not an in-app checkout discount.
- `eligibility.spec.ts` (`chromium-fresh`) — non-member sees "Unlock Partner Discounts" + "ENTER TO UNLOCK DISCOUNT" CTA.
