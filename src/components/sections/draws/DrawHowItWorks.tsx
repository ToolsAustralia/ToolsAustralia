"use client";

import { Ticket, Snowflake, Trophy } from "lucide-react";

const STEPS = [
  {
    icon: Ticket,
    title: "Get your entries",
    body: "Every membership and one-time package comes with free entries.",
  },
  {
    icon: Snowflake,
    title: "Entries freeze on the 27th",
    body: "Entries lock at 8:00 PM AEST on the 27th. Everything you're holding at that moment is your final count for the draw.",
  },
  {
    icon: Trophy,
    title: "Drawn live at 8:30 PM",
    body: "The winner is drawn live on Facebook at 8:30 PM AEST — taking home the Ultimate Tradie Setup or $10,000 cash.",
  },
];

/** How the major draw works — 3 static steps. No partner-discount mention (unrelated to the draw). */
export default function DrawHowItWorks() {
  return (
    <section className="rounded-3xl border border-token bg-surface p-5 shadow-sm">
      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">How the draw works</span>
      <ol className="mt-4 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={step.title} className="relative rounded-2xl border border-token bg-black/[.02] p-4 dark:bg-white/[.03]">
              <span className="absolute right-3 top-3 font-poppins text-2xl font-black text-black/[.08] dark:text-white/[.10]">
                {i + 1}
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-3 font-poppins text-sm font-extrabold text-primary-token dark:text-white">{step.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-token">{step.body}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
