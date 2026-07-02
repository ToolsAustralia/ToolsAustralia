"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, ExternalLink, Trophy } from "lucide-react";
import Seg from "@/components/ui/Seg";
import { useLeafTimer } from "@/hooks/useLeafTimer";
import { usePrizeCatalog } from "@/hooks/usePrizeCatalog";

interface DrawsMajorHeroProps {
  drawName: string;
  drawDateIso: string | null;
  drawStatus: string;
}

type PrizePick = "setup" | "cash";

const ITEMS: Record<PrizePick, string[]> = {
  setup: [
    "Your pick of brand — Milwaukee, DeWalt, Makita & more",
    "Toolbox + power-tool kit + storage system",
    "$5,000 cash on top",
  ],
  cash: ["$10,000 cash, tax-free", "Paid straight to your bank", "Spend it however you like"],
};

function CountCell({ v, l }: { v: number; l: string }) {
  return (
    <div className="flex min-w-[44px] flex-col items-center rounded-xl bg-white/10 px-2 py-1.5">
      <span className="num text-lg font-black tabular-nums text-white">{String(v).padStart(2, "0")}</span>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-white/60">{l}</span>
    </div>
  );
}

/** Premium major-draw hero: prize picker (setup vs $10k cash) + live countdown + promotion link. */
export default function DrawsMajorHero({ drawName, drawDateIso, drawStatus }: DrawsMajorHeroProps) {
  const { activePrize, resolvePrize } = usePrizeCatalog();
  const cashPrize = resolvePrize("cash-prize");
  const [pick, setPick] = useState<PrizePick>("setup");
  const now = useLeafTimer(1000);

  const isCash = pick === "cash";
  const entry = isCash ? cashPrize : activePrize;
  const image = entry?.gallery?.[0]?.src ?? activePrize?.gallery?.[0]?.src ?? "";
  const imageAlt = entry?.gallery?.[0]?.alt ?? "This month's prize";
  const heading = isCash ? "Straight Cash" : activePrize?.heroHeading ?? "The Ultimate Tradie Setup";
  const isCompleted = drawStatus === "completed";

  const target = drawDateIso ? new Date(drawDateIso).getTime() : NaN;
  const ms = Number.isFinite(target) ? Math.max(0, target - now) : 0;
  const cd = {
    d: Math.floor(ms / 86_400_000),
    h: Math.floor((ms / 3_600_000) % 24),
    m: Math.floor((ms / 60_000) % 60),
    s: Math.floor((ms / 1000) % 60),
  };

  return (
    <section className="relative overflow-hidden rounded-3xl bg-neutral-950 p-5 text-white shadow-lg sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 64% at 31% 42%, rgba(255,234,196,.14), transparent 60%), radial-gradient(60% 50% at 92% 8%, rgba(238,0,0,.20), transparent 60%)",
        }}
      />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
            <span className="relative flex h-2 w-2">
              {!isCompleted && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />}
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            {isCompleted ? "Draw complete" : `Live · ${drawName}`}
          </span>
          <span className="text-xs text-white/60">Drawn 8:30 PM AEST · live on Facebook</span>
        </div>

        <div className="mt-4 grid items-center gap-5 lg:grid-cols-2">
          <div className="relative">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-white/15 bg-white/5">
              {image && <Image src={image} alt={imageAlt} fill className="object-contain" sizes="(max-width:1024px) 100vw, 480px" />}
            </div>
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold backdrop-blur">
              <Trophy className="h-3 w-3 text-amber-300" /> {isCash ? "$10,000 cash" : "The Ultimate Tradie Setup"}
            </span>
          </div>

          <div>
            <Seg
              value={pick}
              onChange={setPick}
              tone="dark"
              accentHex="#f0a500"
              options={[
                { value: "setup", label: "Ultimate Setup", shortLabel: "Setup" },
                { value: "cash", label: "$10,000 Cash", shortLabel: "Cash" },
              ]}
            />
            <h2 className="mt-4 font-['Poppins'] text-2xl font-black leading-tight">{heading}</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {ITEMS[pick].map((it) => (
                <li key={it} className="flex items-start gap-2 text-sm text-white/90">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" /> {it}
                </li>
              ))}
            </ul>
            <a
              href="/promotions"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              View this promotion <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>

        {!isCompleted && Number.isFinite(target) && (
          <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <span className="text-sm font-semibold text-white/70">Entries freeze in</span>
            <div className="flex items-center gap-1.5">
              <CountCell v={cd.d} l="days" />
              <CountCell v={cd.h} l="hrs" />
              <CountCell v={cd.m} l="min" />
              <CountCell v={cd.s} l="sec" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
