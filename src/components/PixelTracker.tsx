"use client";

/**
 * @deprecated Use `<ConversionPixels />` from `@/components/tracking/ConversionPixels`.
 * This file re-exports the new component to keep any deep imports working.
 */
import ConversionPixels from "./tracking/ConversionPixels";
export default ConversionPixels;

// Legacy consent helpers — auto-accept mode is unchanged; just no-op wrappers.
export const grantPixelConsent = () => {};
export const revokePixelConsent = () => {};
export const hasPixelConsent = (): boolean => true;
