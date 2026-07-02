"use client";

import { Ticket, Gift, ShieldCheck, CreditCard, Store, History, MessageCircle, ArrowRight } from "lucide-react";
import { QuickTile } from "@/components/ui/QuickTile";

interface DashboardGuestPanelProps {
  drawName: string;
  onBecomeMember: () => void;
  onBuyPackage: () => void;
  className?: string;
}

const MEMBER_BENEFITS = [
  { icon: Ticket, text: "Free entries into every major draw" },
  { icon: Gift, text: "Partner discounts at top tool brands" },
  { icon: ShieldCheck, text: "Loyalty milestones & bonus entries" },
];

/**
 * Guest (no-plan) home body. A one-time package also grants draw entry + catalogue
 * access, so we NEVER gate everything behind membership — two equal CTAs.
 */
export default function DashboardGuestPanel({ drawName, onBecomeMember, onBuyPackage, className }: DashboardGuestPanelProps) {
  return (
    <div className={className}>
      <section className="rounded-3xl border border-token bg-surface p-5 shadow-sm">
        <h3 className="font-['Poppins'] text-lg font-extrabold text-primary-token dark:text-white">Enter the {drawName}</h3>
        <p className="mt-1 text-sm text-muted-token">Membership from $20/mo · packages from $10.</p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onBecomeMember}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-red-500 to-red-700 px-4 py-3 text-sm font-bold text-white transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-safe:active:translate-y-px"
          >
            Become a member <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onBuyPackage}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-token bg-surface px-4 py-3 text-sm font-bold text-primary-token transition-transform hover:bg-black/[.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-white dark:hover:bg-white/[.05] motion-safe:active:translate-y-px"
          >
            Buy a package
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-3xl border border-token bg-surface p-5 shadow-sm">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">What members get</span>
        <ul className="mt-3 space-y-3">
          {MEMBER_BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium text-primary-token dark:text-white">{text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4">
        <span className="mb-3 block text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Explore</span>
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          <QuickTile icon={CreditCard} label="Membership" accentHex="#ee0000" href="/my-account/membership" />
          <QuickTile icon={Store} label="Partners" accentHex="#0ea5a5" href="/my-account/benefits" />
          <QuickTile icon={History} label="Past draws" accentHex="#8b5cf6" href="/my-account/draws" />
          <QuickTile icon={MessageCircle} label="Support" accentHex="#64748b" href="/my-account/support" />
        </div>
      </section>
    </div>
  );
}
