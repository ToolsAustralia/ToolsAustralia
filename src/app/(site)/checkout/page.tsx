import type { Metadata } from "next";
import CheckoutClient from "./components/CheckoutClient";

/**
 * `/checkout` sits in the nonce-CSP route class alongside `/shop`, so it must
 * never prerender. Do NOT add `generateStaticParams` — that exact mistake has
 * already shipped once on `/shop/brand/[brand]`.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout | Tools Australia",
  description: "Complete your Tools Australia order.",
  // A checkout page has no business in search results.
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return <CheckoutClient />;
}
