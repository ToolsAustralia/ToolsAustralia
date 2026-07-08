import Footer from "@/components/layout/Footer";
import NewsletterSection from "@/components/sections/NewsletterSection";
import UnifiedModalManager from "@/components/modals/UnifiedModalManager";
import PromotionsLayoutShell from "@/components/promo/PromotionsLayoutShell";
import SupportChatWidgetMount from "@/components/support-chat/SupportChatWidgetMount";
export default function PromotionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PromotionsLayoutShell>
      {children}
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
