import { Suspense } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import NewsletterSection from "@/components/sections/NewsletterSection";
import UnifiedModalManager from "@/components/modals/UnifiedModalManager";
import SiteFloatingThemeToggle from "@/components/theme/SiteFloatingThemeToggle";

// Mark layout as dynamic to prevent static generation issues with useSearchParams
export const dynamic = "force-dynamic";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<div className="h-[86px] sm:h-[106px] site-header" />}>
        <div className="site-header">
          <Header />
        </div>
      </Suspense>
      <div className="min-h-screen-svh bg-gray-50 dark:bg-neutral-950">{children}</div>
      {/* Newsletter Section and Footer - Consistent across all pages */}
      <div className="relative site-footer">
        <div className="newsletter-section">
          <NewsletterSection />
        </div>
        <Footer />
      </div>
      {/* Unified Modal Manager - Handles all modals with priority system */}
      <Suspense fallback={null}>
        <UnifiedModalManager />
      </Suspense>
      <SiteFloatingThemeToggle />
    </>
  );
}
