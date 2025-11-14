import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import NewsletterSection from "@/components/sections/NewsletterSection";
import UnifiedModalManager from "@/components/modals/UnifiedModalManager";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {children}
      {/* Newsletter Section and Footer - Consistent across all pages */}
      <div className="relative">
        <NewsletterSection />
        <Footer />
      </div>
      {/* Unified Modal Manager - Handles all modals with priority system */}
      <UnifiedModalManager />
    </>
  );
}
