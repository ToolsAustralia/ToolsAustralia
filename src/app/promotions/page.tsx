import { redirect } from "next/navigation";
import { DEFAULT_PRIZE_SLUG } from "@/config/prizes";

/**
 * /promotions base route - redirects to the default promotion (ryobi-milwaukee)
 */
export default function PromotionsPage() {
  redirect(`/promotions/${DEFAULT_PRIZE_SLUG}`);
}
