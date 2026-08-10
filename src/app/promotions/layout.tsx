import Footer from "@/components/layout/Footer";
import NewsletterSection from "@/components/sections/NewsletterSection";
import UnifiedModalManager from "@/components/modals/UnifiedModalManager";
import PromotionsLayoutShell from "@/components/promo/PromotionsLayoutShell";
import SupportChatWidgetMount from "@/components/support-chat/SupportChatWidgetMount";
export default function PromotionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PromotionsLayoutShell>
      {/* Reserves a viewport of height for the page BEFORE its content streams in.
       *
       * Without it the footer — which follows immediately below — paints at the very top
       * of the viewport while `children` is still an empty Suspense boundary, then gets
       * displaced ~5200px the moment content arrives. Measured at CLS 0.593 on every
       * promo route, in every urgency tier, and it was the single largest contributor to
       * the desktop Speed Insights score.
       *
       * This div lives in the LAYOUT, so it is part of the RSC shell and renders
       * immediately — that is what makes it work. The footer then starts below the fold,
       * and a shift of an off-screen element does not count toward CLS. It is the same
       * reservation `(site)/layout.tsx` already makes via `.site-main-content`, which is
       * why those routes score 0.073 instead of 0.59.
       *
       * The reservation is a viewport PLUS the newsletter card's upward overhang — a flat
       * 100svh leaves that overhang on screen and still measures CLS 0.102. See the
       * `.min-h-screen-svh-newsletter` comment in globals.css for the geometry. */}
      <div className="min-h-screen-svh-newsletter">{children}</div>
      <div className="relative">
        <NewsletterSection />
        <Footer />
      </div>
      <UnifiedModalManager />
      {/* Cobber AI support — docked RIGHT, the site-wide default. It used to be forced LEFT
          because the guest theme toggle + account FAB occupied bottom-right; those both moved
          to bottom-left (2026-08-10), so /promotions now matches every other page. Chat on the
          right is also the near-universal convention and the better thumb target. */}
      <SupportChatWidgetMount />
    </PromotionsLayoutShell>
  );
}
