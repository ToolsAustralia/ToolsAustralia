import { redirect } from "next/navigation";

// nonce-CSP route class — must render per-request; never cache HTML with a baked nonce
// (see docs/security-csp/architecture.md "Route classes").
export const dynamic = "force-dynamic";

export default function MajorDrawPage() {
  // NOTE: We redirect to the promotional giveaway page while the dedicated
  // major draw layout is paused, keeping the UX consistent for every visitor.
  redirect("/promotional/giveaway");
}
