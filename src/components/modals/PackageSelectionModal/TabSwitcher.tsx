"use client";

/**
 * TabSwitcher — One-Time / Membership Packs pills.
 *
 * Package-modal redesign (2026-08-04): a rounded-999 track holding two pills, the active
 * one carrying the gold gradient. Replaces the old slate `rounded-[20px]` block.
 *
 * The multiplier badge hangs off the ACTIVE TAB, not the cards. It used to sit on each
 * package tile, which repeated the same figure once per card; on the tab it is stated
 * once, next to the thing it actually qualifies.
 */

import React from "react";
import Image from "next/image";
import { cn } from "@/utils/cn";

interface TabSwitcherProps {
  oneTimeSubTab: "one-time" | "membership";
  onSelectOneTime: () => void;
  onSelectMembership: () => void;
  resolvedOneTimeMultiplier: number | null;
  resolvedMembershipMultiplier: number | null;
}

const TabSwitcher: React.FC<TabSwitcherProps> = ({
  oneTimeSubTab,
  onSelectOneTime,
  onSelectMembership,
  resolvedOneTimeMultiplier,
  resolvedMembershipMultiplier,
}) => {
  const tabs = [
    {
      key: "one-time" as const,
      label: "One-Time",
      onClick: onSelectOneTime,
      multiplier: resolvedOneTimeMultiplier,
    },
    {
      key: "membership" as const,
      label: "Membership Packs",
      onClick: onSelectMembership,
      multiplier: resolvedMembershipMultiplier,
    },
  ];

  // Sticky, and FLUSH on all three edges it meets.
  //
  // It was already `sticky top-0`, but only half-escaped its scroll container:
  //   - `-mt-3` cancels the container's mobile `p-3`; nothing cancelled the `sm:p-6`, so on
  //     desktop the bar docked 12px BELOW the header with page showing through the gap.
  //   - nothing cancelled the horizontal padding, so the band stopped short of the modal
  //     edges and tiles slid past it on both sides.
  //
  // Negative margins pull it to the container's edges; matching padding puts its own content
  // back where it was, so the opaque band spans the full width at every breakpoint. Opaque,
  // not translucent: tiles scroll under this, and a blurred backdrop still shows them moving.
  //
  // And the offset is NEGATIVE, not `top-0`. A scroll container's padding-top offsets its
  // sticky children, so `top-0` docked the bar 25px down (1px border + 24px `sm:p-6`) with
  // page visible in the gap. `-top-3 sm:-top-6` cancels exactly that, so the docked position
  // matches the flow position and the bar is flush in BOTH states.
  return (
    // Sticky to the top of ModalContent's scroll area so the tab (and its multiplier badge)
    // stays reachable while scrolling a long pack list — previously it scrolled away and the
    // only way back was to scroll to the top.
    //
    // The background is the scroll body's own measured surface (#ffffff / #0a0a0a) so tiles
    // pass UNDER it rather than showing through. Written as ARBITRARY values, not `bg-white`
    // + `dark:bg-neutral-950`: globals.css has `.dark .modal-panel-body .bg-white` glassing
    // every white chip in a dark modal to `rgb(38 38 38 / .4)`, and at (0,3,0) it out-specifies
    // the `dark:` utility — the band went 40% transparent and tiles read straight through it.
    // That rule's own comment prescribes this escape hatch. pt-3 gives the badge's -18px overhang
    // room to sit inside the sticky box; without it the starburst is clipped at the top edge
    // once the element pins. -mt-3 cancels that padding so nothing shifts at rest.
    <div className="sticky -top-3 z-20 -mx-3 -mt-3 mb-4 flex justify-center bg-[#ffffff] px-3 pb-2 pt-3 dark:bg-[#0a0a0a] sm:-top-6 sm:-mx-6 sm:-mt-6 sm:mb-6 sm:px-6 sm:pt-6">
      <div
        role="tablist"
        aria-label="Package type"
        // Track colours are Tailwind, not inline, because they must flip with the modal
        // shell: ModalContent is bg-white in light mode, where a white-on-white track is
        // invisible. Only the gold active pill is theme-independent.
        className="flex w-full gap-[3px] rounded-full border border-[rgba(15,23,42,.10)] bg-[rgba(15,23,42,.04)] p-[3px] dark:border-[rgba(255,255,255,.08)] dark:bg-[rgba(255,255,255,.04)] sm:inline-flex sm:w-auto sm:gap-1 sm:p-1"
      >
        {tabs.map((tab) => {
          const active = oneTimeSubTab === tab.key;
          const showBadge = active && tab.multiplier != null && tab.multiplier > 1;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={tab.onClick}
              className={cn(
                "relative flex-1 whitespace-nowrap rounded-full border-0 px-2 py-2.5 font-sans text-[11.5px] font-extrabold leading-none transition-[background,color,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)] focus:outline-none sm:flex-none sm:px-[22px] sm:py-[11px] sm:text-[13.5px]",
                !active &&
                  "text-[#5b6573] hover:text-[#15181f] dark:text-[#a3a3a3] dark:hover:text-[#f5f5f5]"
              )}
              style={
                active
                  ? {
                      background: "linear-gradient(180deg,#f6dd8c,#d4af37 60%,#a87f1d)",
                      color: "#221a02",
                      boxShadow:
                        "inset 0 1px 0 rgba(255,255,255,.5), 0 10px 22px -10px rgba(212,175,55,.65)",
                    }
                  : { background: "transparent" }
              }
            >
              {tab.label}
              {showBadge && (
                <Image
                  src={`/images/badge/X${tab.multiplier}.webp`}
                  alt={`${tab.multiplier}x entries`}
                  width={52}
                  height={52}
                  className="pointer-events-none absolute -right-[18px] -top-[18px] h-[52px] w-[52px] object-contain"
                  style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,.55))" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TabSwitcher;
