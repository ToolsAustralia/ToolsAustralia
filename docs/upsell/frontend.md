# Upsell — Frontend

## Pages

- `src/app/(site)/upsell-success/` — post-purchase confirmation page

## Components

[src/components/upload/](../../src/components/upload/) — upload-related components used during upsell flows (e.g. uploading custom images). Per the manifest, this directory belongs to the upsell domain.

> _TODO: enumerate exact components and clarify if upload/ is upsell-specific or shared._

## Hooks

> _TODO: locate any upsell-specific hooks (likely in [src/hooks/](../../src/hooks/) but not currently mapped to this domain)._

## Display

- Upsell hero images from `src/generated/upsellImageManifest.ts` — DO NOT manually edit; regenerate via `npm run build:upsell-manifest`

## E2E test IDs

`UpsellModal` (`src/components/modals/UpsellModal.tsx`) is opened via the
production handoff in `src/app/(site)/my-account/page.tsx` (lines 190-208) —
the page reads `sessionStorage.pendingUpsellFlag === "true"` plus
`sessionStorage.pendingUpsell` (the modal data payload) and calls
`requestModal("upsell", true, data)`. **NB:** if `setupJustCompleted` is
also set in sessionStorage, the my-account effect early-returns and the
upsell will NOT fire. E2E specs that drive the modal must seed the two
`pendingUpsell*` keys but NOT `setupJustCompleted`.

| Component | testid | Source |
|---|---|---|
| `UpsellModal` (`<ModalContainer testId>`) | `upsell-modal` | `e2e/utils/selectors.ts → testid.upsellModal` |
| Redeem (purchase) button | `upsell-redeem-button` | `e2e/utils/selectors.ts → testid.upsellRedeemButton` |
| Decline ("No thanks, maybe later") button | `upsell-decline-button` | `e2e/utils/selectors.ts → testid.upsellDeclineButton` |

Specs: `e2e/upsells/{post-membership,decline,redeem,success-page,attribution}.spec.ts`,
all under the `chromium-fresh` Playwright project. The `attribution.spec.ts`
is skipped — `PaymentEvent` does not yet carry an `original_payment_intent_id`
field linking an upsell PI to its triggering purchase. The `redeem.spec.ts`
documents the negative path only (button disabled when the fixture user has
no saved Stripe card); a real success-path test requires a seeded Stripe
customer + saved PM, which is out of scope for the dev fixture.
