"use client";

/**
 * Hero — re-exports the UpsellHero primitive configured for StripePaymentModal.
 *
 * Callers pass `tone` (derived from the destination package tier or "danger"
 * for past-due payment flows) and `packageName` for the headline copy.
 * The Shell handles the gradient background; Hero just needs the eyebrow +
 * headline + sub text.
 */
export { default as UpsellHero, TONE_ACCENT } from "@/components/modals/upsell-shell/UpsellHero";
