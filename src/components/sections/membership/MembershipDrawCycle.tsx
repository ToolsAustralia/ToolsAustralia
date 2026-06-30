"use client";

/**
 * MembershipDrawCycle — "It's a cycle, on repeat every month."
 *
 * Four draw-cycle stages ride the reusable <Carousel3D> turntable. The carousel
 * engine owns all motion / physics / drag / a11y; this file owns only the card
 * material + section chrome. Each card lights itself by its ring `depth`: a soft
 * key-light sheen and a depth-keyed top edge-light bloom on the front card, and
 * the "Live draw" stage glows brand-red dead-front. Kept deliberately light
 * (solid fill + drop shadow, no stacked backdrop-blur) so it stays AA-legible
 * and GPU-cheap on top of the carousel's own depth-of-field blur.
 */

import { Calendar, Lock, Trophy, Sparkles, type LucideIcon } from "lucide-react";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { Carousel3D, type Carousel3DItemState } from "@/components/ui/Carousel3D";
import { cn } from "@/utils/cn";

interface Stage {
  t: string;
  h: string;
  d: string;
  Icon: LucideIcon;
  /** Accent colour driving the icon tile (brand cyan / slate / red / gold). */
  c: string;
  hot: boolean;
}

const STAGES: Stage[] = [
  { t: "Each month", h: "Renewal", d: "Your membership renews and your free entries land before the draw.", Icon: Calendar, c: "#00c2ed", hot: false },
  { t: "27th · 8:00 PM", h: "Freeze", d: "The board locks. Purchases pause for the final hours.", Icon: Lock, c: "#7c8699", hot: false },
  { t: "27th · 8:30 PM", h: "Live draw", d: "One winner, live on Facebook — certified random draw.", Icon: Trophy, c: "#ee0000", hot: true },
  { t: "12:00 AM", h: "Next cycle", d: "A fresh draw opens — your stacked free entries roll in.", Icon: Sparkles, c: "#f0a500", hot: false },
];

/**
 * One draw-cycle stage card. Presentational only — Carousel3D owns the ring
 * transform, depth-of-field, physics and z-stacking. The focused card blooms:
 * a key-light gloss + a depth-keyed top edge-light; the hot (red) stage gets a
 * live ring + "Live on Facebook".
 */
function StageCard({ item, isActive, depth }: Carousel3DItemState<Stage>) {
  const { Icon } = item;
  const front = Math.max(0, depth); // 0..1, only front-facing cards light up
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-3xl border bg-white p-5 sm:p-6 dark:bg-neutral-900",
        isActive ? "border-black/10 dark:border-white/10" : "border-black/5 dark:border-white/5",
        item.hot && isActive && "ring-2 ring-red-500/40",
      )}
      style={{
        // Contact shadow deepens when the card is front-of-stage.
        boxShadow: isActive
          ? "0 30px 60px -28px rgba(8,10,16,0.55), 0 8px 20px -12px rgba(8,10,16,0.4)"
          : "0 14px 30px -22px rgba(8,10,16,0.5)",
      }}
    >
      {/* Key-light gloss: a faint diagonal highlight that makes the card read lit;
          intensity follows depth so back cards stay calm. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-3xl"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.10) 22%, transparent 46%)",
          opacity: 0.7 * (0.35 + 0.65 * front),
          mixBlendMode: "soft-light",
        }}
      />
      {/* Top edge-light: a thin bright line along the lip, brightest dead-front. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-0 h-px rounded-full"
        style={{
          opacity: 0.3 + 0.55 * front,
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.9) 30%, rgba(255,255,255,0.9) 70%, transparent)",
        }}
      />

      <span
        className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{
          background: item.hot ? "linear-gradient(135deg,#ff2a2a,#c40d0d)" : `${item.c}1f`,
          color: item.hot ? "#fff" : item.c,
          boxShadow: item.hot ? "0 8px 22px -10px rgba(238,0,0,.7)" : undefined,
        }}
      >
        <Icon className="h-6 w-6" />
      </span>
      <div className="relative mt-4 text-xs font-bold uppercase tracking-wider text-muted-token">{item.t}</div>
      <h3 className="relative mt-1 font-['Poppins'] text-xl font-extrabold text-primary-token dark:text-white">{item.h}</h3>
      <p className="relative mt-2 text-sm leading-relaxed text-muted-token">{item.d}</p>
      {item.hot && (
        <span className="relative mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600 dark:bg-red-400" /> Live on Facebook
        </span>
      )}
    </div>
  );
}

export default function MembershipDrawCycle() {
  return (
    <section className="relative overflow-hidden bg-page py-16 sm:py-20">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(760px 480px at 6% 0%, rgba(0,194,237,.10), transparent 60%), radial-gradient(820px 560px at 96% 106%, rgba(238,0,0,.09), transparent 60%)",
        }}
        aria-hidden
      />
      <SectionContainer as="div" className="relative">
        <div className="text-center">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">The monthly rhythm</span>
          <h2 className="mt-4 font-['Poppins'] text-3xl font-extrabold tracking-tight text-primary-token sm:text-4xl lg:text-5xl dark:text-white">
            It&apos;s a cycle, on repeat every month.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-token sm:text-lg">
            A full turn every month — renew, freeze, draw, reset. Drag the ring, or just watch it spin.
          </p>
        </div>

        <div className="mx-auto mt-2 max-w-3xl">
          <Carousel3D<Stage>
            items={STAGES}
            getKey={(s) => s.h}
            getLabel={(s) => `${s.h} — ${s.t}`}
            label="Monthly draw cycle"
            renderItem={(state) => <StageCard {...state} />}
            hideControls
            layout="wheel"
            radiusX={218}
            radiusXMobile={134}
            radiusY={98}
            radiusYMobile={74}
            depthZ={120}
            rotate={26}
            minScale={0.72}
            minOpacity={0.62}
            maxBlur={1.1}
            perspective={980}
            intervalMs={4200}
            stageHeight={430}
            cardWidth={264}
          />
        </div>
      </SectionContainer>
    </section>
  );
}
