"use client";

import dynamic from "next/dynamic";

/**
 * Lazy-loaded wrapper for WinnerTestimoniesClient.
 * Use this in Server Components when you need ssr: false for the dynamic import.
 */
const WinnerTestimoniesClient = dynamic(
  () => import("@/app/(site)/components/WinnerTestimoniesClient"),
  { ssr: false }
);

export default function WinnerTestimoniesClientLazy() {
  return <WinnerTestimoniesClient />;
}
