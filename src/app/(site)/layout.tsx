import { Suspense } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import NewsletterSection from "@/components/sections/NewsletterSection";
import UnifiedModalManager from "@/components/modals/UnifiedModalManager";
import SupportChatWidgetMount from "@/components/support-chat/SupportChatWidgetMount";

// NOTE (2026-07-19): this layout's force-dynamic (a workaround for useSearchParams during
// prerender) was removed — the Suspense boundaries below are the documented fix, and a
// layout-level force-dynamic would override the ISR the marketing pages declare. Pages in
// the nonce-CSP class declare their own `export const dynamic = "force-dynamic"` instead.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<div className="h-[86px] sm:h-[106px] site-header" />}>
        <div className="site-header">
          <Header />
        </div>
      </Suspense>
      {/* pb-* reserves space for the newsletter card, which is absolute -translate-y-1/2
          and overlaps upward into page content. Mirrors Footer's pt-20/24/32. */}
      <div className="site-main-content min-h-screen-svh bg-gray-50 dark:bg-neutral-950 pb-20 sm:pb-24 lg:pb-32">
        {children}
      </div>
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
      {/* AI Support Chat Widget — z-9000, below modal base of 10000 */}
      <SupportChatWidgetMount />
    </>
  );
}
