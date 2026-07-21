"use client";

import dynamic from "next/dynamic";
import { LazyMount } from "@/components/ui/LazyMount";

/**
 * Lazy-loaded wrapper for WinnerTestimoniesClient.
 * Use this in Server Components when you need ssr: false for the dynamic import.
 *
 * Wrapped in LazyMount so the chunk + winners fetch defer until the section nears
 * the viewport — matching the homepage's LazyMount treatment of the same section.
 */
const WinnerTestimoniesClient = dynamic(
  () => import("@/app/(site)/components/WinnerTestimoniesClient"),
  { ssr: false }
);

export default function WinnerTestimoniesClientLazy() {
  return (
    <LazyMount>
      <WinnerTestimoniesClient />
    </LazyMount>
  );
}
