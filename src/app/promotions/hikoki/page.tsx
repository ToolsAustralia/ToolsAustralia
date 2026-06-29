import { Metadata } from "next";
import { getPrizeBySlug } from "@/config/prizes";
import { getDefaultPrizeForToolsetSlug } from "@/config/promo-landing-slugs";
import ToolsetLandingPage from "../_components/ToolsetLandingPage";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const prizeSlug = getDefaultPrizeForToolsetSlug("hikoki");
  const prize = getPrizeBySlug(prizeSlug);
  if (!prize) {
    return { title: "Promotion - Tools Australia" };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au";
  const prizeImage = prize.gallery?.[0]?.src || "/images/grand-draw.jpg";
  const fullImageUrl = prizeImage.startsWith("http") ? prizeImage : `${baseUrl}${prizeImage}`;

  return {
    title: `${prize.label} - Tools Australia`,
    description: prize.summary || prize.detailedDescription || `Enter to win ${prize.label}`,
    openGraph: {
      title: `${prize.label} - Tools Australia`,
      description: prize.summary || prize.detailedDescription || `Enter to win ${prize.label}`,
      images: [{ url: fullImageUrl, width: 1200, height: 630, alt: prize.label }],
      type: "website",
      url: `${baseUrl}/promotions/hikoki`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${prize.label} - Tools Australia`,
      description: prize.summary || prize.detailedDescription || `Enter to win ${prize.label}`,
      images: [fullImageUrl],
    },
  };
}

export default function HikokiPromotionsPage() {
  return <ToolsetLandingPage toolsetSlug="hikoki" />;
}
