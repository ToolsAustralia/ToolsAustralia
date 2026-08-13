"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Gift, LayoutDashboard, LogIn, Menu, Moon, X } from "lucide-react";

import { useUserContext } from "@/contexts/UserContext";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { formatMajorDrawChipUtc } from "@/utils/common/timezone";
import { multiplierBadgeSrc } from "@/utils/membership/tier-visuals";
import { hexToRgbaString } from "@/utils/package-colors/packageColorScheme";
import { openSupportChat } from "@/lib/support-chat/widget-events";
import { COBBER_AVATAR } from "@/components/support-chat/cobberAccent";
import {
  fromPrizeSlug,
  getPublishedPrizeSelection,
  getToolbox,
  getToolset,
  PRIZE_SELECTION_EVENT,
  TOOLBOXES,
  TOOLSETS,
  type PrizeSelectionSnapshot,
} from "./prize-selection";

/**
 * PromoBottomDock — the phone-only chrome for a promo page (design handoff, 2026-08-13).
 *
 * WHAT IT REPLACES. Below `lg`, three separate floating controls used to fight for the same
 * band of screen: the centred "Enter Now" pill, the bottom-left account/theme FAB, and the
 * bottom-right Cobber launcher — each with its own dodge logic to avoid the others (see
 * `useDodgeFloatingObstacles`). This is one bar that owns that band: menu on the left tab,
 * Cobber on the right tab, the visitor's live build in the middle, and the entry CTA on the
 * right. Desktop is untouched and keeps all three controls.
 *
 * HOW THE OLD CONTROLS STAND DOWN. Mounting this sets `data-promo-dock` on
 * `<html>`; one media-scoped rule in globals.css hides anything carrying
 * `.promo-dock-supersedes` below `lg` and reserves the bar's height at the end of the page.
 * An attribute rather than props because two of those controls (the guest theme toggle and
 * the Cobber launcher) are mounted by the promotions LAYOUT and cannot be told by a page.
 * `/promotions` (the gallery) mounts no dock, so nothing there changes.
 *
 * COBBER IS THE REAL COBBER. The right tab dispatches the shared `openSupportChat()` event,
 * so the same lazy panel every other page uses opens here — one chat implementation, one
 * conversation state, no mock.
 */

/** Scroll target for the entry CTA — the packages section both promo page types render. */
const PACKAGES_ANCHOR = "packages";

export interface PromoBottomDockProps {
  /**
   * The page's own prize slug. Used for the FIRST paint only, so the bar opens naming the
   * combination the page is about instead of the registry's first entry and then correcting
   * itself a frame later. The prize builder takes over from its first publish.
   */
  prizeSlug?: string | null;
}

export default function PromoBottomDock({ prizeSlug = null }: PromoBottomDockProps) {
  const theme = usePromoTheme();
  const { isAuthenticated, loading: userLoading } = useUserContext();
  const themeMode = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const isLightSite = themeMode === "light";

  const [menuOpen, setMenuOpen] = useState(false);

  const { data: currentMajorDraw } = useCurrentMajorDraw();
  const multiplier = useResolvedMultiplier("membership-packages", "display");

  /* ------------------------------------------------------------------ */
  /* The visitor's live build                                            */
  /* ------------------------------------------------------------------ */
  const [selection, setSelection] = useState<PrizeSelectionSnapshot | null>(() => {
    const fromSlug = fromPrizeSlug(prizeSlug ?? undefined);
    return fromSlug ? { ...fromSlug, isCash: false } : null;
  });

  useEffect(() => {
    // The builder publishes on ITS mount, which happens before this effect (the dock renders
    // after `<main>`), so seed from the retained snapshot before subscribing. Keep the
    // slug-derived first paint when no builder has published on this page.
    const published = getPublishedPrizeSelection();
    if (published) setSelection(published);
    const onChange = (e: Event) => setSelection((e as CustomEvent<PrizeSelectionSnapshot>).detail);
    window.addEventListener(PRIZE_SELECTION_EVENT, onChange);
    return () => window.removeEventListener(PRIZE_SELECTION_EVENT, onChange);
  }, []);

  /* ------------------------------------------------------------------ */
  /* Stand the desktop-era floating controls down                        */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    document.documentElement.setAttribute("data-promo-dock", "");
    return () => document.documentElement.removeAttribute("data-promo-dock");
  }, []);

  // Escape closes the drawer. Only bound while open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const handleEnterNow = useCallback(() => {
    setMenuOpen(false);
    document.getElementById(PACKAGES_ANCHOR)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleCobber = useCallback(() => {
    setMenuOpen(false);
    openSupportChat();
  }, []);

  /* ------------------------------------------------------------------ */
  /* Bar copy                                                            */
  /* ------------------------------------------------------------------ */
  const build = useMemo(() => {
    const toolbox = getToolbox(selection?.toolbox ?? TOOLBOXES[0].id) ?? TOOLBOXES[0];
    const toolset = getToolset(selection?.toolset ?? TOOLSETS[0].id) ?? TOOLSETS[0];
    if (selection?.isCash) {
      return { combo: "CASH OPTION — NO GEAR", cash: "$10,000", isCash: true };
    }
    return {
      combo: `${toolset.name.toUpperCase()} × ${toolbox.shortName.toUpperCase()}`,
      cash: "+ $5,000",
      isCash: false,
    };
  }, [selection]);

  const drawLabel = useMemo(() => {
    if (!currentMajorDraw?.drawDate) return null;
    const date = new Date(currentMajorDraw.drawDate);
    return Number.isNaN(date.getTime()) ? null : formatMajorDrawChipUtc(date);
  }, [currentMajorDraw?.drawDate]);

  const boosted = multiplier != null && multiplier > 1;
  const badgeSrc = boosted ? multiplierBadgeSrc(multiplier) : null;

  // The dock stays dark in BOTH site themes: it sits over prize photography and the hero art
  // at every scroll depth, and a light bar there reads as a second, competing page surface.
  const barBackground = "rgba(10,11,13,0.97)";
  const panelBackground = "#111318";
  const tabBase =
    // `-mb-px` overlaps the bar's top border so the tab reads as part of the bar, not as a
    // chip floating 1px above it.
    "absolute bottom-full z-[1] -mb-px flex items-center border border-white/10 border-b-0 shadow-[0_-8px_20px_rgba(0,0,0,0.35)]";

  return (
    <div className="lg:hidden">
      {/* Scrim — taps outside the drawer close it. */}
      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-[59] bg-black/55 backdrop-blur-[2px]"
        />
      )}

      <div className="fixed inset-x-0 bottom-0 z-[60]">
        <div className="relative">
          {/* ── Menu drawer ─────────────────────────────────────────── */}
          {menuOpen && (
            <div
              className="absolute inset-x-0 bottom-full z-[2] rounded-t-[20px] border border-b-0 border-white/10 px-4 pb-[18px] pt-3.5 shadow-[0_-18px_44px_rgba(0,0,0,0.5)] motion-safe:animate-[promo-dock-rise_0.3s_cubic-bezier(0.22,1,0.36,1)]"
              style={{ background: panelBackground }}
              role="dialog"
              aria-label="Promotions menu"
            >
              <span aria-hidden className="mx-auto mb-3.5 block h-1 w-[38px] rounded-full bg-white/30" />
              <div className="mb-1.5 flex items-center justify-between">
                <Image
                  src="/images/Tools Australia Logo/White-Text Logo.webp"
                  alt="Tools Australia"
                  width={104}
                  height={20}
                  className="h-5 w-auto object-contain"
                />
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-white/[0.16] text-gray-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {isAuthenticated && (
                <>
                  <DrawerLink
                    href="/my-account"
                    label="My Account"
                    icon={<LayoutDashboard className="h-[17px] w-[17px]" />}
                    accent={theme.primary}
                    onNavigate={() => setMenuOpen(false)}
                  />
                  <DrawerLink
                    href="/mini-draws"
                    label="Mini Draws"
                    icon={<Gift className="h-[17px] w-[17px]" />}
                    accent={theme.primary}
                    onNavigate={() => setMenuOpen(false)}
                  />
                </>
              )}

              {/* Theme switch — the same store the site-wide toggle drives. */}
              <button
                type="button"
                onClick={toggleTheme}
                aria-pressed={!isLightSite}
                className="flex w-full items-center justify-between gap-2.5 px-0.5 py-3.5 text-left"
              >
                <span className="flex flex-none items-center justify-center rounded-[10px] border border-white/[0.09] bg-white/[0.06] p-[8.5px]">
                  <Moon className="h-[17px] w-[17px]" style={{ color: theme.primary }} />
                </span>
                <span className="min-w-0 flex-1 font-sans text-sm font-semibold text-white">Dark mode</span>
                <span
                  aria-hidden
                  className={`flex h-6 w-[42px] flex-none rounded-full p-[3px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.45)] transition-colors duration-200 ${
                    isLightSite ? "justify-start bg-white/[0.14]" : "justify-end"
                  }`}
                  style={isLightSite ? undefined : { background: theme.primary }}
                >
                  <span className="h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.5)]" />
                </span>
              </button>

              {!userLoading && !isAuthenticated && (
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3.5 font-sans text-[13px] font-extrabold uppercase tracking-[0.05em] text-white"
                  style={{ background: theme.primary }}
                >
                  <LogIn className="h-4 w-4" />
                  Log in
                </Link>
              )}
            </div>
          )}

          {/* ── Corner tabs, attached to the bar's top edge ──────────── */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className={`${tabBase} left-0 rounded-tr-[14px] border-l-0 pb-2.5 pl-3 pr-[11px] pt-[7px]`}
            style={{ background: menuOpen ? panelBackground : barBackground }}
          >
            <span
              className="flex h-[22px] w-[22px] items-center justify-center rounded-full"
              style={{ background: hexToRgbaString(theme.primary, 0.16) }}
            >
              <Menu className="h-[13px] w-[13px]" style={{ color: theme.primary }} />
            </span>
          </button>

          <button
            type="button"
            onClick={handleCobber}
            aria-label="Open AI support chat"
            className={`${tabBase} right-0 rounded-tl-[14px] border-r-0 pb-2.5 pl-[11px] pr-3 pt-[7px]`}
            style={{ background: barBackground }}
          >
            <span className="relative block h-[22px] w-[22px]">
              <Image
                src={COBBER_AVATAR}
                alt=""
                width={22}
                height={22}
                className="h-[22px] w-[22px] rounded-full bg-[#F1DDC2] object-cover"
                style={{ boxShadow: `0 0 0 1.5px ${theme.primary}` }}
              />
              <span className="absolute -bottom-px -right-px h-[7px] w-[7px] rounded-full bg-green-500 ring-[1.5px] ring-[rgba(10,11,13,0.97)]" />
            </span>
          </button>

          {/* ── The bar ─────────────────────────────────────────────── */}
          <div
            className="relative z-[3] flex items-center gap-2.5 border-t border-white/10 px-3.5 pt-2.5 backdrop-blur-[10px]"
            style={{
              background: barBackground,
              paddingBottom: "calc(env(safe-area-inset-bottom) + 0.625rem)",
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-[7px]">
                <span className="min-w-0 truncate font-mono text-3xs font-medium text-gray-400">
                  {build.combo}
                </span>
                <span className="flex-none whitespace-nowrap rounded-full bg-green-500/20 px-1.5 py-[3px] font-sans text-3xs font-bold text-green-400">
                  {build.cash}
                </span>
              </div>
              <p className="mt-[3px] truncate font-sans text-[12.5px] font-bold text-white">
                {drawLabel ? `Drawn ${drawLabel}` : "Major draw — drawn live"}
              </p>
              <p className="mt-0.5 font-sans text-[9.5px] font-semibold" style={{ color: theme.primaryLight }}>
                {boosted ? `${multiplier}× free entries live` : "Free entries included"}
              </p>
            </div>

            <div className="relative flex-none">
              {badgeSrc && (
                <Image
                  src={badgeSrc}
                  alt=""
                  width={40}
                  height={40}
                  // Hangs over the button's top-right corner. `-right-2` and not further: the
                  // bar's own px-3.5 is all the room there is before the badge starts falling
                  // off the screen edge.
                  className="pointer-events-none absolute -right-2 -top-4 z-[2] h-10 w-10 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
                />
              )}
              <button
                type="button"
                onClick={handleEnterNow}
                className="block rounded-[10px] px-[18px] py-[13px] font-sans text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-white"
                style={{ background: theme.primary, boxShadow: `0 6px 18px ${theme.shadowRgba}` }}
              >
                Enter now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DrawerLink({
  href,
  label,
  icon,
  accent,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  accent: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center justify-between gap-2.5 border-b border-white/[0.07] px-0.5 py-3.5"
    >
      <span className="flex flex-none items-center justify-center rounded-[10px] border border-white/[0.09] bg-white/[0.06] p-[8.5px]" style={{ color: accent }}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 font-sans text-sm font-semibold text-white">{label}</span>
      <span className="font-mono text-3xs text-gray-500">{href}</span>
    </Link>
  );
}
