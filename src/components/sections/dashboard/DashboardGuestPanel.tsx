"use client";

import Link from "next/link";
import { Ticket, Gift, ShieldCheck, CreditCard, Store, History, MessageCircle, ArrowRight, ArrowUpRight } from "lucide-react";
import { QuickTile } from "@/components/ui/QuickTile";
import { getOneTimePackages } from "@/data/membershipPackages";

// Lowest PUBLIC one-time pack price (guests have no additional-pack access), derived from the
// catalog so the "from" price can't drift stale (was a hardcoded "$10"; cheapest is Apprentice $25).
// Guard the empty case so Math.min(...[]) can't render "$Infinity" if the catalog ever has none.
const PUBLIC_PACK_PRICES = getOneTimePackages().filter((p) => !p.isAdditional).map((p) => p.price);
const MIN_PACK_PRICE = PUBLIC_PACK_PRICES.length ? Math.min(...PUBLIC_PACK_PRICES) : 25;

interface DashboardGuestPanelProps {
  drawName: string;
  onBecomeMember: () => void;
  onBuyPackage: () => void;
  /** Membership Streak "Members only" teaser (Build Kit §05) — the ladder as the sell. */
  streakTeaser?: React.ReactNode;
  className?: string;
}

const MEMBER_BENEFITS = [
  { icon: Ticket, text: "Free entries into every major draw" },
  // Not "at top tool brands" — the partner catalogue carries no Milwaukee/DeWalt/Makita/Ryobi
  // offers (audit 2026-07-31), and a guest who joins on that promise finds cinemas and cruises.
  { icon: Gift, text: "Partner discounts across 1,800+ Australian brands" },
  { icon: ShieldCheck, text: "Loyalty milestones & bonus entries" },
];

/**
 * Guest (no-plan) home body. A one-time package also grants draw entry + catalogue
 * access, so we NEVER gate everything behind membership — two equal CTAs.
 */
export default function DashboardGuestPanel({ drawName, onBecomeMember, onBuyPackage, streakTeaser, className }: DashboardGuestPanelProps) {
  return (
    <div className={className}>
      <section className="rounded-3xl border border-token bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-poppins text-lg font-extrabold text-primary-token dark:text-white">Enter the {drawName}</h3>
          {/* A guest holds no entries yet — give them a way to SEE the draw (prize showcase)
              before committing to a purchase. /promotions → the default promotions LANDING page
              (NOT /major-draw, which hard-redirects to /promotional/giveaway). */}
          <Link
            href="/promotions"
            aria-label={`View the ${drawName}`}
            title={`View the ${drawName}`}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-token bg-surface text-muted-token transition-colors hover:bg-black/[.03] hover:text-primary-token focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:hover:bg-white/[.05] dark:hover:text-white"
          >
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted-token">Membership from $20/mo · packages from ${MIN_PACK_PRICE}.</p>
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

      {/* Membership Streak teaser — the full reward ladder as the reason to join */}
      {streakTeaser && <div className="mt-4">{streakTeaser}</div>}

      <section className="mt-4">
        <span className="mb-3 block text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Explore</span>
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          <QuickTile icon={CreditCard} label="Membership" accentHex="#ee0000" href="/my-account/membership" />
          <QuickTile icon={Store} label="Partners" accentHex="#0ea5a5" href="/my-account/rewards" />
          <QuickTile icon={History} label="Past draws" accentHex="#8b5cf6" href="/my-account/draws" />
          <QuickTile icon={MessageCircle} label="Support" accentHex="#64748b" href="/my-account/support" />
        </div>
      </section>
    </div>
  );
}
