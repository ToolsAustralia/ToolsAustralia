# Cart-Shop-Products — Testing

> _TODO: enumerate any cart/order/product tests._

## Manual smoke

- Add to cart → verify localStorage entry
- Refresh → cart preserved
- Checkout → payment flow → success page → cart cleared
- Verify `Order` row written
- Verify `BenefitsGranted` records the order

## Entry multiplier ceilings — `npm run test:shop-entries` (2026-08-20)

The suite now covers the ceiling chain. What each assertion is actually guarding:

| Assertion | Catches |
| --- | --- |
| Tier order: product beats category beats shop beats inherit | A reordered chain returning the wrong tier's ceiling |
| `"Apparel"` / `"apparel "` / `"APPAREL"` all hit one ceiling | The forked-vocabulary trap — normalisation applied to only one side |
| A category with no ceiling falls through to shop-wide, not to 1 | Fail-closed instead of fall-through, silently withholding entries |
| No tier at any value raises merch above the promo (full 1–10 × 1–10 × every tier combination) | The invariant itself |
| Mixed cart multiplies each line by its own rate, and does **not** equal sum-then-multiply | The defect a single order-level scalar hides |
| `Order.products[].entryMultiplierCap` survives the write | Mongoose strict-mode drop — the ceiling would apply on the page and never reach the grant |
| Config `cap` + `categoryCaps` map survive the write | Same drop on the singleton |
| Both admin product routes declare `entryMultiplierCap` | Zod stripping the field before Mongoose sees it |

**The ladder test was rewritten, not extended.** The previous version divided both sides by the
same `m`, so all four iterations were algebraically identical and it asserted nothing about
multipliers — it could not have failed. The real property needs *two* rates (what the packs run
at, and what merch runs at after the ceiling), which is what it now takes.

All the new assertions were mutation-tested before being trusted: flipping `Math.min` to
`Math.max` fails 3, dropping the `toLowerCase()` from the category key fails 5, and removing
`entryMultiplierCap` from the `Order` line schema fails 1. The suite also deletes the config
singleton on the way out — leaving a ceiling behind would silently change what every later run
resolves to.
