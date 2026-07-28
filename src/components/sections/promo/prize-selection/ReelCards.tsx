"use client";

import Image from "next/image";
import { BrandMark } from "./BrandMark";
import type { ToolboxOption, ToolsetOption } from "./constants";

/** Reel cards are ≤172px wide on every breakpoint — never ship a larger candidate. */
const CARD_IMAGE_SIZES = "172px";

/** Slight overscan so the product render fills the card the way the design frames it. */
const TOOLBOX_RENDER_SCALE = 1.22;
const TOOLSET_PHOTO_SCALE = 1.28;

/** Per-lane drop shadows — the toolbox render sits slightly higher off the card. */
const TOOLBOX_SHADOW = "drop-shadow(0 9px 13px rgba(0,0,0,.42))";
const TOOLSET_SHADOW = "drop-shadow(0 8px 12px rgba(0,0,0,.45))";

/** Toolbox lane card: product render over piece-count eyebrow → brand mark → "TOOLBOX". */
export function ToolboxReelCard({ toolbox }: { toolbox: ToolboxOption }) {
  return (
    <>
      <span className="pbc-card-art relative my-[4px] mb-[6px] flex flex-[1.3] items-center justify-center">
        <span className="relative block h-full w-full">
          <Image
            src={toolbox.image}
            alt=""
            aria-hidden
            fill
            draggable={false}
            sizes={CARD_IMAGE_SIZES}
            className="select-none object-contain object-center"
            style={{ transform: `scale(${TOOLBOX_RENDER_SCALE})`, filter: TOOLBOX_SHADOW }}
          />
        </span>
      </span>

      <span className="relative flex flex-col items-center gap-px">
        <span className="font-poppins text-[8px] font-bold leading-none tracking-[0.16em] text-[var(--pbc-sub)]">
          {toolbox.eyebrow}
        </span>
        {/* Plate height tracks the card height (24px mobile / 30px desktop) so the brand
            mark keeps its proportion instead of eating the product render on a short card. */}
        <span className="pbc-card-art flex h-[var(--pbc-mark-h)] w-full items-center justify-center">
          <BrandMark
            src={toolbox.markImage}
            lightSrc={toolbox.markImageLight}
            color={toolbox.markColor}
            scale={toolbox.markScale}
            title={toolbox.name}
          />
        </span>
        {/* Hidden on phones: the lane header directly above already reads "1 TOOLBOX", so
            repeating it on every card only costs the product render ~9px of a short card. */}
        <span className="font-poppins text-[8px] font-bold leading-none tracking-[0.24em] text-[var(--pbc-sub)] max-sm:hidden">
          TOOLBOX
        </span>
      </span>
    </>
  );
}

/** Toolset lane card: kit photo over the brand wordmark and its kit + storage label. */
export function ToolsetReelCard({ toolset }: { toolset: ToolsetOption }) {
  return (
    <>
      <span className="pbc-card-art relative mb-[3px] flex w-full flex-1 items-center justify-center">
        <span className="relative block h-full w-full">
          <Image
            src={toolset.image}
            alt=""
            aria-hidden
            fill
            draggable={false}
            sizes={CARD_IMAGE_SIZES}
            className="select-none object-contain object-center"
            style={{ transform: `scale(${TOOLSET_PHOTO_SCALE})`, filter: TOOLSET_SHADOW }}
          />
        </span>
      </span>

      <span className="pbc-card-art relative flex h-5 items-center justify-center">
        <span className="relative block h-full w-full">
          <Image
            src={toolset.wordmark}
            alt={toolset.name}
            fill
            unoptimized
            draggable={false}
            sizes={CARD_IMAGE_SIZES}
            className="select-none object-contain object-center"
            style={{ transform: `scale(${toolset.wordmarkScale})` }}
          />
        </span>
      </span>

      {/* Deliberately wraps rather than truncates: "15pc Kit + 7pc MAKTRAK™" does not fit
          one 138px mobile line, and the photo above is flex-1 so a second line simply
          takes its space instead of growing the fixed-height card. */}
      <span className="mt-[3px] text-[8.5px] leading-tight text-[var(--pbc-sub)]">
        {toolset.cardLabel}
      </span>
    </>
  );
}
