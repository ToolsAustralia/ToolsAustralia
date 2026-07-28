import type { Metadata } from "next";
import MembershipPageClient from "./components/MembershipPageClient";
import { resolvePortalReturn } from "@/utils/partner-discounts/portal-return";
// SERVER-ONLY import (1,833-row map) — must never reach the client bundle; only the
// resolved PortalReturn (name + pct) crosses to MembershipPageClient as a prop. The
// map is dependency-injected into resolvePortalReturn so the (client-shared)
// portal-return util never imports it — see that module's header (panel F-003).
import { PARTNER_CATALOG_OFFERS } from "@/generated/partnerCatalogOffers";

// nonce-CSP route class — must render per-request; never cache HTML with a baked nonce
// (see docs/security-csp/architecture.md "Route classes").
export const dynamic = "force-dynamic";

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

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const portalReturn = resolvePortalReturn(await searchParams, PARTNER_CATALOG_OFFERS);
  return <MembershipPageClient portalReturn={portalReturn} />;
}
