import Footer from "@/components/layout/Footer";
import NewsletterSection from "@/components/sections/NewsletterSection";
import UnifiedModalManager from "@/components/modals/UnifiedModalManager";

export default function PromotionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* Newsletter Section and Footer - Consistent across promotional pages */}
      <div className="relative">
        <NewsletterSection />
        <Footer />
      </div>
      {/* Unified Modal Manager - Handles all modals with priority system */}
      <UnifiedModalManager />
    </>
  );
}
