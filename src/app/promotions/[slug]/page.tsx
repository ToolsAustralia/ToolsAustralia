import { notFound } from "next/navigation";

import PromoBanner from "@/components/sections/promo/PromoBanner";
import PromoHero from "@/components/sections/promo/PromoHero";
import BrandsShowcase from "@/components/sections/promo/BrandsShowcase";
import PromoPackages from "@/components/sections/promo/PromoPackages";
import GiveawayDetails from "@/components/sections/promo/GiveawayDetails";
import PrizeShowcase from "@/components/sections/promo/PrizeShowcase";
import PromoFAQs from "@/components/sections/promo/PromoFAQs";
import UnlockDiscounts from "@/components/sections/promo/UnlockDiscounts";
import FloatingGetEntriesButton from "@/components/sections/promo/FloatingGetEntriesButton";
import { getPrizeBySlug, listPrizes } from "@/config/prizes";

interface PromotionsPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return listPrizes().map((prize) => ({ slug: prize.slug }));
}

export default async function PromotionsPage({ params }: PromotionsPageProps) {
  const { slug } = await params;
  const prize = getPrizeBySlug(slug);

  if (!prize) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-white w-full overflow-hidden scroll-smooth">
      <PromoBanner />

      <main className="w-full overflow-hidden ">
        <PromoHero />
        <BrandsShowcase />
        <PrizeShowcase slug={prize.slug} />
        <PromoPackages />
        <GiveawayDetails />
        <PromoFAQs />
        <UnlockDiscounts />
      </main>

      <FloatingGetEntriesButton />
    </div>
  );
}
