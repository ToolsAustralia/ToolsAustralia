import Footer from "@/components/layout/Footer";
import NewsletterSection from "@/components/sections/NewsletterSection";
import UnifiedModalManager from "@/components/modals/UnifiedModalManager";
import PromotionsLayoutShell from "@/components/promo/PromotionsLayoutShell";

export default function PromotionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PromotionsLayoutShell>
      {/* Header removed from promo pages as per requirements */}
      {children}
      {/* Newsletter Section and Footer - Consistent across promotional pages */}
      <div className="relative">
        <NewsletterSection />
        <Footer />
      </div>
      {/* Unified Modal Manager - Handles all modals with priority system */}
      <UnifiedModalManager />
    </PromotionsLayoutShell>
  );
}
