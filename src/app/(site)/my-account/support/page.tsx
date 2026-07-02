"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Headset, Mail, ChevronDown, MessageCircle } from "lucide-react";

import ContactForm from "@/components/features/ContactForm";
import { useDashboardState } from "@/hooks/useDashboardState";
import { isDashboardFeatureOn } from "@/config/dashboardFeatures";
import { getContactEmail } from "@/lib/email/sender-identities";
import DashboardPageHeader from "../components/DashboardPageHeader";

const FAQS = [
  { q: "When is the major draw?", a: "The major draw is held live on Facebook at 8:30 PM AEST on the 27th of each month. Entries freeze at 8:00 PM AEST that day." },
  { q: "How do I get more entries?", a: "Every membership and one-time package comes with free entries. Buy a package or upgrade your tier from the Membership tab — the more you hold at freeze time, the more entries you have." },
  { q: "How do partner discounts work?", a: "Active members and one-time-pack holders unlock a percentage of our partner catalogue. Open the partner portal from the Rewards tab — you're signed in automatically." },
  { q: "How do I cancel my membership?", a: "Go to Membership → Manage plan (or Settings → Subscription). You'll keep access until the end of your current billing period." },
];

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-2xl border border-token bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
      >
        <span className="text-sm font-semibold text-primary-token dark:text-white">{q}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-token transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="px-4 pb-4 text-sm leading-relaxed text-muted-token">{a}</p>}
    </div>
  );
}

export default function SupportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const dash = useDashboardState();
  const contactEmail = getContactEmail();
  const cobberOn = isDashboardFeatureOn("cobberSupport");

  React.useEffect(() => {
    if (status === "loading") return;
    if (!session) router.push("/login");
  }, [session, status, router]);

  if (status === "loading" || dash.isLoading) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen-svh flex flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-xl font-semibold text-primary-token dark:text-white">Please sign in to contact support.</p>
        <Link href="/login" className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700">Sign In</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen-svh w-full min-w-0 max-w-full overflow-x-hidden pb-8">
      <DashboardPageHeader title="How can we help?" sub="Support" icon={MessageCircle} stateTheme={dash.stateTheme} showBack />

      <div className="space-y-4 px-4 pt-4 sm:px-6">
        {/* Ask Cobber — AI assistant (coming soon, gated) */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-red-600 to-red-800 p-5 text-white shadow-lg">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15">
              <Headset className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="font-['Poppins'] text-lg font-extrabold">Ask Cobber</h2>
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
          <button
            type="button"
            disabled={!cobberOn}
            className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-bold text-red-700 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-60 motion-safe:active:translate-y-px"
          >
            {cobberOn ? "Start a chat" : "Available soon"}
          </button>
        </section>

        {/* Email us */}
        <section className="rounded-3xl border border-token bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-black/[.05] text-primary-token dark:bg-white/[.08] dark:text-white">
              <Mail className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-['Poppins'] text-base font-extrabold text-primary-token dark:text-white">Email us</h2>
              <a href={`mailto:${contactEmail}`} className="text-sm font-semibold text-red-600 hover:underline dark:text-red-400">{contactEmail}</a>
              <p className="text-xs text-muted-token">Usually replies within 1–2 business days.</p>
            </div>
          </div>
        </section>

        {/* Common questions */}
        <section>
          <span className="mb-3 block text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Common questions</span>
          <div className="space-y-2">
            {FAQS.map((f) => (
              <Faq key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </section>

        {/* Send us a message (kept — real contact channel) */}
        <section className="overflow-hidden rounded-3xl border border-token bg-surface shadow-sm">
          <div className="border-b border-token px-5 py-3">
            <h2 className="font-['Poppins'] text-base font-extrabold text-primary-token dark:text-white">Send us a message</h2>
          </div>
          <ContactForm />
        </section>
      </div>
    </div>
  );
}
