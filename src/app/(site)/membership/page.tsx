import type { Metadata } from "next";
import MembershipPageClient from "./components/MembershipPageClient";

export const metadata: Metadata = {
  title: "Membership | Tools Australia - Exclusive Perks & Member Deals",
  description:
    "Unlock exclusive member-only deals, extra entries for the Major Giveaway, and premium perks. Choose a membership plan that fits your needs.",
  openGraph: {
    title: "Membership | Tools Australia - Exclusive Perks & Member Deals",
    description: "Unlock exclusive member-only deals, extra entries for the Major Giveaway, and premium perks.",
    type: "website",
    url: "/membership",
    images: [
      {
        url: "/images/Tools Australia Logo/Social Media Profile_Black Background.webp",
        width: 1200,
        height: 630,
        alt: "Tools Australia Membership",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Membership | Tools Australia - Exclusive Perks & Member Deals",
    description: "Unlock exclusive member-only deals and extra entries for the Major Giveaway.",
    images: ["/images/Tools Australia Logo/Social Media Profile_Black Background.webp"],
  },
  alternates: { canonical: "/membership" },
  robots: { index: true, follow: true },
};

export default function SignUpPage() {
  return <MembershipPageClient />;
}
