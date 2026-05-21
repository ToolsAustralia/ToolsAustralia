import { notFound } from "next/navigation";
import type { Metadata } from "next";
import MembershipSectionDevClient from "@/components/dev/MembershipSectionDevClient";

/**
 * Development-only: preview the electric package card across user states,
 * tabs, promo multipliers, theme, and reduced motion. Returns 404 in production.
 */

export const metadata: Metadata = {
  title: "Membership section (dev) | Tools Australia",
  description: "Development-only electric package card preview",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function DevMembershipSectionPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  return <MembershipSectionDevClient />;
}
