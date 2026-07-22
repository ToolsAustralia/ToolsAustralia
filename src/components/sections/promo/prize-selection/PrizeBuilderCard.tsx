"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { PrizeMedia } from "@/config/prize-summaries";
import { cn } from "@/utils/cn";
import { ComboHero } from "./ComboHero";
import { PrizeBuilderCta } from "./PrizeBuilderCta";
import { PrizeContentsStrip } from "./PrizeContentsStrip";
import { ToolboxReelCard, ToolsetReelCard } from "./ReelCards";
import { SelectorReel } from "./SelectorReel";
import {
  TOOLBOXES,
  TOOLSETS,
  getToolbox,
  getToolset,
  type ToolboxBrand,
  type ToolsetType,
} from "./constants";
import {
  buildContentsPreview,
  getComboPresentation,
  getContentsChips,
  resolveAccent,
} from "./prize-builder-model";

export interface PrizeBuilderCardProps {
  /** Selected toolbox brand. */
  toolbox: ToolboxBrand;
  /** Selected power toolset brand. */
  toolset: ToolsetType;
  /** True when the winner has taken the $10,000 cash instead of the gear. */
  isCash: boolean;
  onSelectToolbox: (id: ToolboxBrand) => void;
  onSelectToolset: (id: ToolsetType) => void;
  onSelectCash: (isCash: boolean) => void;
  onEnterNow: () => void;
  onOpenDetails: () => void;
  /**
   * Gallery of the ACTIVE prize — the source for the "what's in this prize"
   * thumbnails. Passed in (rather than looked up here) so the card stays a pure
   * presentation component and the owner keeps one catalog read.
   */
  gallery: readonly PrizeMedia[];
  /** "27 JUL · 8PM AEST" from the live major draw; the chip hides when null. */
  drawLabel: string | null;
  /** Whether the hero art is eligible for `priority` (only above-the-fold instances). */
  priorityHero?: boolean;
  className?: string;
}

/**
 * "Build your prize" — the major-draw prize configurator.
 *
 * Two independent coverflow lanes (toolbox, power toolset) assemble a live
 * combination hero; $5,000 cash always rides along, or the winner can take
 * $10,000 tax-free cash instead. Scales to any number of brands because both
 * lanes render straight off the registries in `constants.ts`.
 *
 * The card is CONTROLLED: selection state, catalog lookups, URL syncing and the
 * details modal all live with the owner (`PrizeShowcase`), so evergreen,
 * `/promotions/*` and toolset-landing surfaces each keep their own routing
 * semantics while sharing one piece of UI.
 */
export function PrizeBuilderCard({
  toolbox,
  toolset,
  isCash,
  onSelectToolbox,
  onSelectToolset,
  onSelectCash,
  onEnterNow,
  onOpenDetails,
  gallery,
  drawLabel,
  priorityHero = false,
  className,
}: PrizeBuilderCardProps) {
  const activeToolbox = getToolbox(toolbox) ?? TOOLBOXES[0];
  const activeToolset = getToolset(toolset) ?? TOOLSETS[0];

  const accent = resolveAccent(activeToolset, isCash);
  const combo = useMemo(
    () => getComboPresentation(activeToolbox, activeToolset, isCash),
    [activeToolbox, activeToolset, isCash]
  );
  const chips = getContentsChips(activeToolbox, activeToolset);
  const preview = useMemo(
    () => buildContentsPreview(gallery, activeToolset, combo.image),
    [gallery, activeToolset, combo.image]
  );

  return (
    <div
      className={cn(
        "prize-builder relative w-full overflow-hidden border-[var(--pbc-border)] bg-[var(--pbc-panel)] font-poppins text-[var(--pbc-text)]",
        // No border/radius below `sm` (the handoff's mobile shell is flat), a panel above it.
        //
        // Do NOT reach for a negative margin here to fake full-bleed: `html` and `body` both
        // set `overflow-x: hidden` (globals.css), so an element wider than its parent is
        // CLIPPED on the right rather than overflowing symmetrically — the card lands flush
        // left with a dead strip down the right. The double-gutter is solved by the card
        // dropping its own horizontal padding on phones instead (see the body below).
        "sm:rounded-[20px] sm:border",
        className
      )}
      style={{ "--pbc-accent": accent } as CSSProperties}
    >
      {/* `px-0` below `sm`: every surface already renders this card inside a
          `px-4 sm:px-6 lg:px-8` section container, so a phone was paying the gutter twice
          (32px a side) — enough to clip the neighbouring reel cards out of the 3D stage.
          Below `sm` the container's 16px is the ONLY gutter and the card fills it. */}
      <header className="flex flex-wrap items-start justify-between gap-3 px-0 pb-0.5 pt-3.5 sm:px-4 sm:pt-[18px] lg:px-7 lg:pb-1 lg:pt-6">
        <div className="min-w-0">
          <h2 className="mb-[5px] mt-2 font-poppins text-[25px] font-black uppercase leading-[0.98] tracking-[-0.015em] text-[var(--pbc-text)] lg:mb-1.5 lg:mt-2.5 lg:text-[32px]">
            Build your prize
          </h2>
          {/* Two lines on a phone, not three — the handoff's longer lead cost ~18px of the
              height the two reels and the hero need to share one viewport. Same three facts:
              free choice, the bundled cash, the cash-instead option. */}
          <p className="m-0 max-w-[440px] text-xs leading-[1.5] text-[var(--pbc-sub)]">
            Any toolbox. Any power toolset. Plus{" "}
            <strong className="text-[#18a94d]">$5,000</strong> cash — or skip the gear and take{" "}
            <strong className="text-[var(--pbc-text)]">$10,000, tax free</strong>.
          </p>
        </div>
      </header>

      {/* Narrow viewports stack reels → hero → contents → CTA; wide ones use the 2×2 grid
          with the hero and contents on the left and the reels and CTA on the right.
          The grid switches at `lg`, not the handoff's ~768px: the reel lane is a fixed
          ~470px tall, so between 768 and ~1000px the (fluid) hero column is far shorter
          and `align-items:start` leaves a dead band under the hero caption. Above `lg`
          the two columns balance the way they do at the handoff's own 1080px canvas. */}
      <div className="flex flex-col gap-3 px-0 pb-5 pt-2 sm:gap-4 sm:px-4 sm:pt-2.5 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-x-[22px] lg:gap-y-2.5 lg:px-7 lg:pb-6 lg:pt-3">
        <div className="flex min-w-0 flex-col gap-1 sm:gap-1.5 lg:col-start-2 lg:row-start-1">
          <SelectorReel
            step={1}
            label="Toolbox"
            items={TOOLBOXES}
            selectedId={activeToolbox.id}
            onSelect={(id) => onSelectToolbox(id as ToolboxBrand)}
            dimmed={isCash}
            // Toolbox cards sit 1px tighter at the bottom so the "TOOLBOX" sub-label
            // clears the card edge by the same optical gap as the eyebrow above it.
            cardClassName="px-[11px] pb-[10px] pt-[11px]"
            glowCenterY="26%"
            renderCard={(item) => <ToolboxReelCard toolbox={item} />}
          />
          <SelectorReel
            step={2}
            label="Power toolset"
            items={TOOLSETS}
            selectedId={activeToolset.id}
            onSelect={(id) => onSelectToolset(id as ToolsetType)}
            dimmed={isCash}
            glowCenterY="30%"
            renderCard={(item) => <ToolsetReelCard toolset={item} />}
          />
        </div>

        <ComboHero
          combo={combo}
          accent={accent}
          drawLabel={drawLabel}
          priority={priorityHero}
          className="lg:col-start-1 lg:row-start-1"
        />

        {!isCash && (
          <PrizeContentsStrip
            preview={preview}
            chips={chips}
            accent={accent}
            onOpenDetails={onOpenDetails}
            className="lg:col-start-1 lg:row-start-2 lg:-mt-0.5"
          />
        )}

        <PrizeBuilderCta
          accent={accent}
          isCash={isCash}
          onEnterNow={onEnterNow}
          onChooseBundle={() => onSelectCash(false)}
          onChooseCash={() => onSelectCash(true)}
          className="lg:col-start-2 lg:row-start-2 lg:self-start"
        />
      </div>
    </div>
  );
}
