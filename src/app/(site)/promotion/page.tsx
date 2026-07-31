import { redirect } from "next/navigation";
import { DEFAULT_PRIZE_SLUG } from "@/config/prizes";

// nonce-CSP route class — must render per-request; never cache HTML with a baked nonce
// (see docs/security-csp/architecture.md "Route classes").
export const dynamic = "force-dynamic";

/** Singular /promotion URL — shared with top bar and external links */
export default async function PromotionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Forward the incoming query string. Redirecting to a BARE pathname dropped every param
  // before any code on the destination ran — `?ttclid=` and every `utm_*` included — so ad
  // traffic landing here arrived at /promotions/<slug> stripped of its attribution. Rebuild
  // it so the destination request's middleware pass (which mints the ttclid cookie) and the
  // client-side attribution capture both still see the params.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    // Repeated params arrive as string[]; preserve every occurrence rather than collapsing.
    if (Array.isArray(value)) for (const v of value) params.append(key, v);
    else if (value !== undefined) params.append(key, value);
  }
  const query = params.toString();
  redirect(`/promotions/${DEFAULT_PRIZE_SLUG}${query ? `?${query}` : ""}`);
}
