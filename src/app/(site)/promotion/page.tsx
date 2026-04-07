import { redirect } from "next/navigation";
import { DEFAULT_PRIZE_SLUG } from "@/config/prizes";

/** Singular /promotion URL — shared with top bar and external links */
export default function PromotionPage() {
  redirect(`/promotions/${DEFAULT_PRIZE_SLUG}`);
}
