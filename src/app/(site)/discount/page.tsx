import type { Metadata } from "next";
import DiscountPageClient from "./page-client";

// nonce-CSP route class — must render per-request; never cache HTML with a baked nonce
// (see docs/security-csp/architecture.md "Route classes"). Segment config is ignored in
// "use client" files, so this server shim carries it — same shape as /membership.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Partner Discounts | Tools Australia — Every Deal, Readable",
  description:
    "Browse the full Tools Australia partner discount catalogue. Every offer reads in full — see what each one is worth and the access level that lets you redeem it.",
  openGraph: {
    title: "Partner Discounts | Tools Australia — Every Deal, Readable",
    description:
      "Browse the full partner discount catalogue. Every offer reads in full; membership access is what lets you redeem.",
    type: "website",
    url: "/discount",
    images: [
      {
        url: "/images/Tools Australia Logo/Social Media Profile_Black Background.webp",
        width: 1200,
        height: 630,
        alt: "Tools Australia partner discounts",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Partner Discounts | Tools Australia — Every Deal, Readable",
    description: "Browse the full partner discount catalogue. Membership access is what lets you redeem.",
    images: ["/images/Tools Australia Logo/Social Media Profile_Black Background.webp"],
  },
  alternates: { canonical: "/discount" },
  robots: { index: true, follow: true },
};

export default function DiscountPage() {
  return <DiscountPageClient />;
}
