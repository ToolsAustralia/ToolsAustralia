"use client";

import Image from "next/image";
import { cn } from "@/utils/cn";

interface FeaturePanelProps {
  /** Composite render of the exact combination the visitor configured. */
  comboImage: string;
  /** "Makita + 470 Piece Kincrome Toolbox" — the combination on screen. */
  comboTitle: string;
  /** "15 power tools" / "MAKTRAK™ 7pc + Kincrome box". */
  stats: { tools: string; storage: string };
  /** Hidden in cash mode — there is no bundled $5,000 when the winner took the $10,000. */
  showCashBonus: boolean;
  className?: string;
}

/**
 * "Everything you'd win" — the combination at a glance.
 *
 * Rendered as the desktop left rail and, on mobile, as the block that scrolls
 * away above the sticky tab row. Same component both times so the two never
 * drift.
 */
export default function FeaturePanel({
  comboImage,
  comboTitle,
  stats,
  showCashBonus,
  className,
}: FeaturePanelProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="relative aspect-[16/7] w-full overflow-hidden rounded-xl border border-[var(--pbc-tile-border)] bg-gradient-to-b from-white to-[#eef0f2] lg:aspect-[4/3]">
        <Image
          src={comboImage}
          alt={comboTitle}
          fill
          sizes="(max-width: 1023px) 92vw, 320px"
          className="object-contain p-2"
        />
        {showCashBonus && (
          <span className="absolute bottom-[9px] right-[9px] rounded-full bg-[#18a94d] px-[9px] py-[5px] font-poppins text-[8px] font-extrabold leading-none tracking-[0.1em] text-white shadow-[0_6px_16px_-6px_#18a94d]">
            + $5,000 CASH
          </span>
        )}
      </div>

      <p className="mt-3 font-poppins text-[8.5px] font-bold leading-none tracking-[0.18em] text-[#18a94d] lg:mt-3.5">
        EVERYTHING YOU&apos;D WIN
      </p>
      <h3 className="mt-1.5 font-poppins text-lg font-extrabold leading-[1.1] tracking-[-0.01em] text-[var(--pbc-text)] lg:text-xl">
        {comboTitle}
      </h3>

      <dl className="mt-3.5 flex flex-col gap-0.5">
        <StatRow label="Power tools" value={stats.tools} dotColor="var(--pbc-accent)" />
        <StatRow label="Storage" value={stats.storage} dotColor="var(--pbc-accent)" />
        {showCashBonus && (
          <StatRow label="Cash bonus" value="$5,000" dotColor="#18a94d" emphasise />
        )}
      </dl>
    </div>
  );
}

function StatRow({
  label,
  value,
  dotColor,
  emphasise = false,
}: {
  label: string;
  value: string;
  dotColor: string;
  emphasise?: boolean;
}) {
  return (
    <div className="flex items-center gap-[9px] border-t border-[var(--pbc-border)] py-[9px]">
      <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: dotColor }} />
      <dt className="shrink-0 font-poppins text-[11px] font-semibold leading-tight text-[var(--pbc-sub)]">
        {label}
      </dt>
      <dd
        className={cn(
          "ml-auto text-right font-poppins leading-snug",
          emphasise
            ? "text-[13px] font-extrabold text-[#18a94d]"
            : "text-[11px] font-bold text-[var(--pbc-text)]"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
