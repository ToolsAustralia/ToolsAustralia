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
       * why those routes score 0.073 instead of 0.59. */}
      {/* `pb-*` reserves the overlap of the newsletter card, which is
       * `absolute … -translate-y-1/2` (NewsletterSection.tsx) and rises INTO the content
       * above it. `(site)/layout.tsx` carries the identical reservation and says why;
       * this layout never did, which left a residual ~0.10 shift on promo routes after
       * the footer fix removed the larger one. Mirrors Footer's pt-20/24/32. */}
      <div className="min-h-screen-svh pb-20 sm:pb-24 lg:pb-32">{children}</div>
      <div className="relative">
        <NewsletterSection />
        <Footer />
      </div>
      <UnifiedModalManager />
      {/* Cobber AI support — docked LEFT here: the bottom-right corner is taken
          by the guest theme toggle + account FAB (PromotionsLayoutShell). */}
      <SupportChatWidgetMount side="left" />
    </PromotionsLayoutShell>
  );
}
