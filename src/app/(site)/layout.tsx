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
      {/* The fallback reserves NO height on purpose.
       *
       * `Header` renders `fixed top-0 left-0 right-0 z-40` (isFixed defaults to true and no
       * caller overrides it), so once it resolves this wrapper computes to height 0 —
       * measured live: `.site-header` is `static, h=0` while its child header is
       * `fixed, h=100`. Pages already clear the fixed header with their own
       * `pt-[var(--app-header-h)]`.
       *
       * The previous `h-[86px] sm:h-[106px]` therefore reserved flow height that the real
       * header never occupies: everything below jumped UP by 106px at hydration, worth a
       * measured 0.073 CLS on every (site) route (`/`, `/winners`, `/membership`,
       * `/mini-draws`). Reserving zero matches what actually renders.
       *
       * Keep the `site-header` class — `body[data-account-layout]` targets it to hide the
       * chrome on /my-account routes. */}
      <Suspense fallback={<div className="site-header" aria-hidden />}>
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
