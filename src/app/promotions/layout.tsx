import Footer from "@/components/layout/Footer";
import NewsletterSection from "@/components/sections/NewsletterSection";
import UnifiedModalManager from "@/components/modals/UnifiedModalManager";
import PromotionsLayoutShell from "@/components/promo/PromotionsLayoutShell";
export default function PromotionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PromotionsLayoutShell>
      {children}
      <div className="relative">
        <NewsletterSection />
        <Footer />
      </div>
      <UnifiedModalManager />
    </PromotionsLayoutShell>
  );
}
