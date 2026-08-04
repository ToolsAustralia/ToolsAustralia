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

  return (
    // Sticky to the top of ModalContent's scroll area so the tab (and its multiplier badge)
    // stays reachable while scrolling a long pack list — previously it scrolled away and the
    // only way back was to scroll to the top.
    //
    // The opaque background matches ModalContent's own (bg-white / dark:bg-neutral-950) so
    // tiles pass UNDER it rather than showing through. pt-3 gives the badge's -18px overhang
    // room to sit inside the sticky box; without it the starburst is clipped at the top edge
    // once the element pins. -mt-3 cancels that padding so nothing shifts at rest.
    <div className="sticky top-0 z-20 -mt-3 mb-4 flex justify-center bg-white pb-2 pt-3 dark:bg-neutral-950 sm:mb-6">
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
