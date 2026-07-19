import { redirect } from "next/navigation";
import { DEFAULT_PRIZE_SLUG } from "@/config/prizes";

// nonce-CSP route class — must render per-request; never cache HTML with a baked nonce
// (see docs/security-csp/architecture.md "Route classes").
export const dynamic = "force-dynamic";

/** Singular /promotion URL — shared with top bar and external links */
export default function PromotionPage() {
  redirect(`/promotions/${DEFAULT_PRIZE_SLUG}`);
}
