"use client";

import { useState } from "react";
import Image from "next/image";
import { Trophy, Check, ShieldCheck, ArrowRight } from "lucide-react";
import Seg from "@/components/ui/Seg";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import MetallicButton from "@/components/ui/MetallicButton";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { usePrizeCatalog } from "@/hooks/usePrizeCatalog";

type PrizePick = "setup" | "cash";

const ITEMS: Record<PrizePick, string[]> = {
  setup: [
    "Your pick of brand — Milwaukee, DeWalt, Makita & more",
    "Toolbox + power-tool kit + storage system",
    "$5,000 cash on top",
  ],
  cash: ["$10,000 cash, tax-free", "Paid straight to your bank", "Spend it however you like"],
};

export default function MembershipPrizeChooser() {
  const { activePrize, resolvePrize } = usePrizeCatalog();
  const cashPrize = resolvePrize("cash-prize");
  const [pick, setPick] = useState<PrizePick>("setup");
  const isCash = pick === "cash";
  const pickOptions = [
    { value: "setup" as const, label: "The setup" },
    { value: "cash" as const, label: "The cash" },
  ];

  const entry = isCash ? cashPrize : activePrize;
  const image = entry?.gallery?.[0]?.src ?? activePrize?.gallery?.[0]?.src ?? "";
  const imageAlt = entry?.gallery?.[0]?.alt ?? "This month's prize";
  const tagLabel = isCash ? "$10,000 cash" : "The Ultimate Tradie Setup";
  const amount = isCash ? 10000 : 5000;
  const amountCap = isCash ? "paid straight to your bank account" : "cash on top of the gear";

  return (
    <section id="prize" className="relative overflow-hidden bg-neutral-950 py-16 text-white sm:py-20 lg:py-24">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 64% at 31% 42%, rgba(255,234,196,.16), transparent 60%), radial-gradient(60% 50% at 92% 8%, rgba(238,0,0,.18), transparent 60%)",
        }}
        aria-hidden
      />
      <SectionContainer as="div" className="relative">
        <div className="text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11.5px] font-extrabold uppercase tracking-[0.16em]"
            style={{
              color: "#f1d99a",
              background: "linear-gradient(180deg,rgba(212,175,55,.18),rgba(212,175,55,.05))",
              borderColor: "rgba(212,175,55,.5)",
              boxShadow: "0 0 28px -12px rgba(212,175,55,.7)",
            }}
          >
            <Trophy className="h-3.5 w-3.5" style={{ color: "#d4af37" }} /> This month&apos;s prize
          </span>
          <h2 className="mt-5 font-poppins text-[26px] font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Win the Ultimate Tradie Setup.{" "}
            <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">Or take the $10,000 cash.</span>
          </h2>
          {/* Mobile: toggle sits above the image so switching reflects in the art */}
          <div className="mt-6 flex justify-center lg:hidden">
            <Seg value={pick} onChange={setPick} tone="dark" accentHex="#f0a500" options={pickOptions} />
          </div>
        </div>

        <div className="mt-8 grid items-center gap-10 lg:grid-cols-2">
          <div className="relative">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-white/15 bg-white/5">
              {image && <Image src={image} alt={imageAlt} fill className="object-contain" sizes="(max-width:1024px) 100vw, 560px" />}
            </div>
            <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold backdrop-blur">{tagLabel}</span>
          </div>

          <div>
            <div className="hidden lg:block">
              <Seg value={pick} onChange={setPick} tone="dark" accentHex="#f0a500" options={pickOptions} />
            </div>
            <div className="mt-5 font-poppins text-5xl font-extrabold text-amber-300">
              <AnimatedNumber value={amount} format={(n) => `$${Math.round(n).toLocaleString()}`} />
            </div>
            <div className="text-sm text-white/60">{amountCap}</div>
            <ul className="mt-5 flex flex-col gap-2.5">
              {ITEMS[pick].map((it) => (
                <li key={it} className="flex items-start gap-2 text-sm text-white/90">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" /> {it}
                </li>
              ))}
            </ul>
            <div className="mt-7">
              <MetallicButton
                href="#membership"
                variant="primary"
                size="md"
                borderRadius="full"
                className="whitespace-nowrap !rounded-xl !px-5 !text-sm sm:!rounded-full sm:!px-8 sm:!text-base"
                icon={<ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />}
              >
                Get free entries
              </MetallicButton>
            </div>
            <p className="mt-4 inline-flex items-center gap-2 text-xs text-white/55">
              <ShieldCheck className="h-3.5 w-3.5" /> Drawn live on Facebook, 27th · independently certified
            </p>
          </div>
        </div>
      </SectionContainer>
    </section>
  );
}
