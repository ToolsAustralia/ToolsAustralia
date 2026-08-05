"use client";

import React from "react";
import { Headset, Mail, ChevronDown } from "lucide-react";
import SupportContactForm from "./SupportContactForm";
import SheetShell, { SheetHead } from "@/components/ui/SheetShell";
import { isDashboardFeatureOn } from "@/config/dashboardFeatures";
import { getContactEmail } from "@/lib/email/sender-identities";
import { useDashboardSheetStore } from "@/stores/useDashboardSheetStore";
import { openSupportChat } from "@/lib/support-chat/widget-events";

const FAQS = [
  { q: "When is the major draw?", a: "Live on Facebook at 8:30 PM AEST on the 27th of each month. Entries freeze at 8:00 PM AEST that day." },
  { q: "How do I get more entries?", a: "Every membership and one-time package comes with free entries. Buy a package or upgrade your tier from the Membership tab — the more you hold at freeze time, the more entries you have." },
  { q: "How do partner discounts work?", a: "Active members and one-time-pack holders unlock a percentage of our partner discounts. Open the partner portal from Rewards — you're signed in automatically." },
  { q: "How do I cancel my membership?", a: "Membership → Manage plan. You keep access until the end of your current billing period." },
];

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-2xl border border-token bg-surface">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
        <span className="text-sm font-semibold text-primary-token dark:text-white">{q}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-token transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="px-4 pb-4 text-sm leading-relaxed text-muted-token">{a}</p>}
    </div>
  );
}

/** Support content (Ask Cobber [coming-soon] + Email + FAQ + message form). Shared by the sheet + the /support route. */
export function SupportSheetBody() {
  const contactEmail = getContactEmail();
  const cobberOn = isDashboardFeatureOn("cobberSupport");
  const closeSheet = useDashboardSheetStore((s) => s.closeSheet);
  // "Start a chat" is the dashboard's canonical Cobber entry point. Close this
  // sheet first (so it doesn't sit under the panel), then open the chat panel.
  const handleStartChat = () => {
    closeSheet();
    openSupportChat();
  };
  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-red-600 to-red-800 p-5 text-white shadow-lg">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15"><Headset className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-poppins text-lg font-extrabold">Ask Cobber</h2>
              {!cobberOn && <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Coming soon</span>}
              {cobberOn && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold">
                  <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" /></span>
                  Online
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-white/85">Instant answers about draws, entries, membership and partner discounts.</p>
          </div>
        </div>
        <button type="button" disabled={!cobberOn} onClick={cobberOn ? handleStartChat : undefined} className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-bold text-red-700 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
          {cobberOn ? "Start a chat" : "Available soon"}
        </button>
      </section>

      <section className="rounded-3xl border border-token bg-surface p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-black/[.05] text-primary-token dark:bg-white/[.08] dark:text-white"><Mail className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-poppins text-base font-extrabold text-primary-token dark:text-white">Email us</h2>
            <a href={`mailto:${contactEmail}`} className="text-sm font-semibold text-red-600 hover:underline dark:text-red-400">{contactEmail}</a>
            <p className="text-xs text-muted-token">Usually replies within 1–2 business days.</p>
          </div>
        </div>
      </section>

      <section>
        <span className="mb-3 block text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Common questions</span>
        <div className="space-y-2">{FAQS.map((f) => <Faq key={f.q} q={f.q} a={f.a} />)}</div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-token bg-surface shadow-sm">
        <div className="border-b border-token px-5 py-3">
          <h2 className="font-poppins text-base font-extrabold text-primary-token dark:text-white">Send us a message</h2>
        </div>
        <SupportContactForm />
      </section>
    </div>
  );
}

/** The Support overlay sheet — opened from the nav; reads the global sheet store. */
export default function SupportSheet() {
  const sheet = useDashboardSheetStore((s) => s.sheet);
  const closeSheet = useDashboardSheetStore((s) => s.closeSheet);
  return (
    <SheetShell open={sheet === "support"} onClose={closeSheet} labelledBy="support-sheet-title">
      <SheetHead title="How can we help?" sub="We're here Mon–Fri, 8am–6pm AEST" onClose={closeSheet} id="support-sheet-title" />
      <div className="overflow-y-auto px-5 pb-6">
        <SupportSheetBody />
      </div>
    </SheetShell>
  );
}
