"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Gift, LayoutDashboard, LogIn, Menu, Moon, X } from "lucide-react";

import { useUserContext } from "@/contexts/UserContext";
import { usePromoTheme, usePromoThemeStore } from "@/stores/usePromoThemeStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { multiplierBadgeSrc } from "@/utils/membership/tier-visuals";
import { addRAFScrollListener } from "@/utils/dom/listenerHelpers";
import {
  MEMBERSHIP_PACKAGES_QUERY_PARAM,
  parseMembershipPackagesTab,
  type MembershipPackagesTab,
} from "@/utils/membership/packagesTabParam";
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
 * PromoBottomDock — the promo page's floating chrome, at every viewport (design handoff,
 * 2026-08-13; extended to desktop 2026-08-13 on owner review).
 *
 * WHAT IT REPLACES. Three separate floating controls used to fight for the same band of
 * screen: the centred "Enter Now" pill, the bottom-left account/theme FAB, and the
 * bottom-right Cobber launcher — each with its own dodge logic to avoid the others (see
 * `useDodgeFloatingObstacles`). This is one bar that owns that band: menu on the left tab,
 * Cobber on the right tab, the visitor's live build and the pack they'd be entering with in
 * the middle, and the entry CTA on the right.
 *
 * HOW THE OLD CONTROLS STAND DOWN. Mounting this sets `data-promo-dock` on `<html>`; one rule
 * in globals.css hides anything carrying `.promo-dock-supersedes` and reserves the bar's
 * height at the end of the page. An attribute rather than props because two of those controls
 * (the guest theme toggle and the Cobber launcher) are mounted by the promotions LAYOUT and
 * cannot be told by a page. `/promotions` (the gallery) mounts no dock, so nothing there
 * changes.
 *
 * IT COLLAPSES AT THE TOP OF THE PAGE. In the hero the bar is just its two corner tabs: the
 * hero has its own full-size ENTER NOW button, and stacking a second one under it is both
 * redundant and a competing target. Everything the bar says about the pack and the build is
 * also still unread at that point. Menu and Cobber stay reachable throughout.
 *
 * COBBER IS THE REAL COBBER. The right tab dispatches the shared `openSupportChat()` event,
 * so the same lazy panel every other page uses opens here — one chat implementation, one
 * conversation state, no mock.
 */

/**
 * Past this scroll depth the bar expands. Same threshold `FloatingGetEntriesButton` used to
 * decide "past the hero" — this replaces that pill, so the moment the CTA appears should not
 * move.
 */
const useIsPastHero = (): boolean => {
  const [pastHero, setPastHero] = useState(false);
  useEffect(() => {
    const evaluate = (scrollY: number) => {
      // `innerHeight` is a viewport metric and must be read live: mobile URL-bar collapse
      // changes it mid-scroll.
      setPastHero(scrollY > window.innerHeight);
    };
    evaluate(window.scrollY);
    return addRAFScrollListener(window, evaluate);
  }, []);
  return pastHero;
};

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
  const currentSlug = usePromoThemeStore((s) => s.slug);
  /**
   * Some brand accents are LIGHT fills — Ryobi's neon lime, DeWalt's yellow — and white ink on
   * them is invisible (reported on Ryobi: the dock's Enter now button read as an empty green
   * slab). This is the same test `PromoHero` and `FloatingGetEntriesButton` run, reused verbatim
   * so all three CTAs flip together: `preferDarkBackground` covers Ryobi, and DeWalt needs the
   * explicit slug check because the store only sets the flag for Ryobi.
   */
  const accentNeedsDarkInk =
    (theme.preferDarkBackground ?? false) || (currentSlug ?? "").startsWith("dewalt-");
  const accentInk = accentNeedsDarkInk ? "#000000" : "#ffffff";
  /** Accent drawn ON a white plate (the tab discs) — same problem, so the same flag decides. */
  const iconAccent = accentNeedsDarkInk ? "#12100f" : theme.primary;
  const { isAuthenticated, loading: userLoading } = useUserContext();
  const themeMode = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const isLightSite = themeMode === "light";

  const [menuOpen, setMenuOpen] = useState(false);
  const expanded = useIsPastHero();

  const multiplier = useResolvedMultiplier("membership-packages", "display");
  const {
    openEntryFlow,
    getRecommendedSubscriptionPlan,
    oneTimePackages,
    oneTimePromoMultiplier,
  } = useMajorDrawEntryCta();

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
  /* Which packages tab the page is on                                   */
  /* ------------------------------------------------------------------ */
  // MembershipSection owns this and already broadcasts it (PromoBanner is the other
  // listener); seed from `?packages=` for a landing that names the tab, then follow.
  const [packagesTab, setPackagesTab] = useState<MembershipPackagesTab>("membership");
  useEffect(() => {
    const forced = parseMembershipPackagesTab(
      new URLSearchParams(window.location.search).get(MEMBERSHIP_PACKAGES_QUERY_PARAM)
    );
    if (forced) setPackagesTab(forced);
    const onTabChange = (e: Event) => {
      const next = (e as CustomEvent<{ activeTab?: MembershipPackagesTab }>).detail?.activeTab;
      if (next) setPackagesTab(next);
    };
    window.addEventListener("membershipTabChanged", onTabChange);
    return () => window.removeEventListener("membershipTabChanged", onTabChange);
  }, []);

  /* ------------------------------------------------------------------ */
  /* Stand the desktop-era floating controls down                        */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    document.documentElement.setAttribute("data-promo-dock", "");
    return () => document.documentElement.removeAttribute("data-promo-dock");
  }, []);

  /**
   * Publish the BAR's height as `--promo-dock-h` so a panel can sit flush on top of it — the
   * menu drawer's own geometry, which anything else rising out of the dock has to match (today
   * the Cobber panel).
   *
   * Deliberately the bar, NOT the dock's full occupied height. The corner tabs overhang the
   * bar's top edge, and a panel resting above THEM leaves the two icons stranded in a strip
   * between the panel and the bar. The drawer covers them; so should everything else. The tabs
   * are `absolute`, so they never extend this container — measuring it gives the bar alone for
   * free.
   *
   * Measured rather than a constant: it changes with the collapsed/expanded state, the
   * breakpoint and the safe-area inset. `useLayoutEffect` so the value lands before paint on
   * the frame the bar expands; otherwise an already-open panel visibly jumps.
   */
  const dockRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const write = () => {
      const el = dockRef.current;
      if (!el) return;
      const height = Math.max(0, Math.round(window.innerHeight - el.getBoundingClientRect().top));
      document.documentElement.style.setProperty("--promo-dock-h", `${height}px`);
    };
    write();
    const observer = new ResizeObserver(write);
    if (dockRef.current) observer.observe(dockRef.current);
    window.addEventListener("resize", write);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", write);
    };
  }, [expanded, menuOpen]);

  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("--promo-dock-h");
    },
    []
  );

  // Escape closes the drawer. Only bound while open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  /**
   * Same entry flow the hero's ENTER NOW runs — it opens "Select Your Package" with the
   * recommended tier already behind it. It used to scroll to `#packages`, which asked the
   * visitor to do the choosing twice.
   */
  const handleEnterNow = useCallback(() => {
    setMenuOpen(false);
    openEntryFlow({ openLocalModal: false });
  }, [openEntryFlow]);

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
      return { combo: "CASH OPTION — NO GEAR", cash: "$10,000" };
    }
    return {
      // Draw 10 removed the $5,000 bonus, so a tool combination has no cash chip. `cash`
      // stays optional rather than empty-string: the bar renders the chip only when set,
      // and "" would paint an empty pill.
      combo: `${toolset.name.toUpperCase()} × ${toolbox.shortName.toUpperCase()}`,
    };
  }, [selection]);

  /**
   * The pack the entry CTA would preselect, so the bar names what the visitor is about to
   * get rather than repeating the draw date the trust bar already carries. Membership tab →
   * the RECOMMENDED tier (Foreman, the same object a Foreman card tap uses); One-Time tab →
   * the entry pack at the bottom of the ladder (Apprentice).
   *
   * Copy rule 11: the PACK is what carries a price; its entries are a free inclusion.
   */
  const defaultPack = useMemo(() => {
    if (packagesTab === "one-time") {
      const apprentice =
        oneTimePackages.find((p) => p.name.toLowerCase().startsWith("apprentice")) ??
        [...oneTimePackages].sort((a, b) => a.price - b.price)[0];
      if (!apprentice) return null;
      const base = apprentice.totalEntries ?? apprentice.entriesPerMonth ?? 0;
      return {
        name: apprentice.name,
        price: `$${apprentice.price}`,
        entries: base * oneTimePromoMultiplier,
      };
    }
    const foreman = getRecommendedSubscriptionPlan();
    return {
      name: foreman.name,
      // "/giveaway", not "/mo" — the promo surface prices a membership by the draw it buys you
      // into, which is the unit this page is about. Matches the tier list in
      // `PartnerBenefitsPromoSection`. One-time packs take no suffix: they are not recurring.
      price: `$${foreman.price}/giveaway`,
      entries: foreman.metadata?.entriesCount ?? 0,
    };
  }, [packagesTab, oneTimePackages, oneTimePromoMultiplier, getRecommendedSubscriptionPlan]);

  const boosted = multiplier != null && multiplier > 1;
  const badgeSrc = boosted ? multiplierBadgeSrc(multiplier) : null;

  /**
   * The dock FOLLOWS THE SITE THEME (owner call, 2026-08-13 — it shipped dark-only and read as a
   * black slab stuck to the bottom of a light page). Expressed as Tailwind `dark:` variants
   * rather than a JS branch on `themeMode`, so the first paint is already correct: the theme
   * bootstrap sets `html.dark` before hydration, whereas a JS read renders the light surface
   * and then flips.
   */
  const barSurface = "bg-white/[0.97] dark:bg-[rgba(10,11,13,0.97)]";
  const panelSurface = "bg-white dark:bg-[#111318]";
  const hairline = "border-black/10 dark:border-white/10";
  const tabBase =
    // `-mb-px` overlaps the bar's top border so the tab reads as part of the bar, not as a
    // chip floating 1px above it.
    `absolute bottom-full z-[1] -mb-px flex items-center border ${hairline} border-b-0 shadow-[0_-8px_20px_rgba(0,0,0,0.18)] dark:shadow-[0_-8px_20px_rgba(0,0,0,0.35)]`;

  return (
    <>
      {/* Scrim — taps outside the drawer close it. */}
      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-[59] bg-black/55 backdrop-blur-[2px]"
        />
      )}

      <div ref={dockRef} className="fixed inset-x-0 bottom-0 z-[60]">
        <div className="relative">
          {/* ── Menu drawer ─────────────────────────────────────────── */}
          {menuOpen && (
            <div
              className={`absolute inset-x-0 bottom-full z-[2] rounded-t-[20px] border border-b-0 ${hairline} ${panelSurface} px-4 pb-[18px] pt-3.5 shadow-[0_-18px_44px_rgba(0,0,0,0.25)] dark:shadow-[0_-18px_44px_rgba(0,0,0,0.5)] motion-safe:animate-[promo-dock-rise_0.3s_cubic-bezier(0.22,1,0.36,1)] lg:bottom-[calc(100%+12px)] lg:left-6 lg:right-auto lg:w-[340px] lg:rounded-2xl lg:border-b`}
              role="dialog"
              aria-label="Promotions menu"
            >
              <span
                aria-hidden
                className="mx-auto mb-3.5 block h-1 w-[38px] rounded-full bg-black/20 dark:bg-white/30 lg:hidden"
              />
              <div className="mb-1.5 flex items-center justify-between">
                {/* The white-text lockup only works on the dark panel; light mode takes the
                    primary logo. */}
                <Image
                  src="/images/Tools Australia Logo/Primary Logo.webp"
                  alt="Tools Australia"
                  width={104}
                  height={20}
                  className="h-5 w-auto object-contain dark:hidden"
                />
                <Image
                  src="/images/Tools Australia Logo/White-Text Logo.webp"
                  alt=""
                  aria-hidden
                  width={104}
                  height={20}
                  className="hidden h-5 w-auto object-contain dark:block"
                />
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border ${hairline} text-gray-500 dark:text-gray-400`}
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
                <span
                  className={`flex flex-none items-center justify-center rounded-[10px] border ${hairline} bg-black/[0.04] p-[8.5px] dark:bg-white/[0.06]`}
                >
                  <Moon className="h-[17px] w-[17px]" style={{ color: iconAccent }} />
                </span>
                <span className="min-w-0 flex-1 font-sans text-sm font-semibold text-gray-900 dark:text-white">
                  Dark mode
                </span>
                <span
                  aria-hidden
                  className={`flex h-6 w-[42px] flex-none rounded-full p-[3px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.25)] transition-colors duration-200 dark:shadow-[inset_0_1px_3px_rgba(0,0,0,0.45)] ${
                    isLightSite ? "justify-start bg-black/[0.12] dark:bg-white/[0.14]" : "justify-end"
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
                  className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3.5 font-sans text-[13px] font-extrabold uppercase tracking-[0.05em]"
                  style={{ background: theme.primary, color: accentInk }}
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
            className={`${tabBase} ${menuOpen ? panelSurface : barSurface} left-0 rounded-tr-[14px] border-l-0 pb-2.5 pl-3 pr-[11px] pt-[7px] lg:pb-2.5 lg:pl-5 lg:pr-4 lg:pt-2`}
          >
            {/* SOLID disc, not a 16% accent tint: on the dark bar a red icon over a red-tinted
                dark disc was barely visible. White gives every accent a consistent, high-contrast
                plate — and a light accent (Ryobi lime, DeWalt yellow) is illegible on white too,
                so those take dark ink by the same rule the CTA uses. */}
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]">
              <Menu className="h-[13px] w-[13px]" style={{ color: iconAccent }} />
            </span>
          </button>

          <button
            type="button"
            onClick={handleCobber}
            aria-label="Open AI support chat"
            className={`${tabBase} ${barSurface} right-0 rounded-tl-[14px] border-r-0 pb-2.5 pl-[11px] pr-3 pt-[7px] lg:pb-2.5 lg:pl-4 lg:pr-5 lg:pt-2`}
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
              <span className="absolute -bottom-px -right-px h-[7px] w-[7px] rounded-full bg-green-500 ring-[1.5px] ring-white dark:ring-[rgba(10,11,13,0.97)]" />
            </span>
          </button>

          {/* ── The bar ─────────────────────────────────────────────── */}
          {expanded ? (
            <div
              // Desktop was ~90px of mostly empty bar. `lg:pt-3` + no extra bottom padding on the
              // row brings it to ~72px — enough for the CTA plus its hanging badge, no more.
              className={`relative z-[3] border-t ${hairline} ${barSurface} px-3.5 pt-2.5 backdrop-blur-[10px] motion-safe:animate-[promo-dock-rise_0.3s_cubic-bezier(0.22,1,0.36,1)] lg:px-10 lg:pt-3`}
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.625rem)" }}
            >
              <div className="flex items-center gap-2.5 lg:mx-auto lg:max-w-[1200px] lg:gap-5 lg:pb-1">
                {/* The bar MOUNTS on expand, so these animations play on arrival with no state
                    to track — and replay if the visitor scrolls back into the hero and out
                    again, which is the moment the reminder is worth repeating. */}
                <div className="min-w-0 flex-1 motion-safe:animate-[promo-dock-pop_0.34s_cubic-bezier(0.22,1,0.36,1)_both]">
                  <div className="flex items-center gap-[7px]">
                    <span className="min-w-0 truncate font-mono text-3xs font-medium text-gray-500 dark:text-gray-400 lg:text-[10px]">
                      {build.combo}
                    </span>
                    {/* Chip only when there IS a cash component — the cash-only option. Since
                        draw 10 a tool combination has none, and an unguarded render would paint
                        an empty green pill rather than nothing. */}
                    {build.cash && (
                      <span className="flex-none whitespace-nowrap rounded-full bg-green-500/15 px-1.5 py-[3px] font-sans text-3xs font-bold text-green-700 dark:bg-green-500/20 dark:text-green-400">
                        {build.cash}
                      </span>
                    )}
                  </div>
                  <p className="mt-[3px] truncate font-sans text-[12.5px] font-bold text-gray-900 dark:text-white lg:mt-[5px] lg:text-[15px]">
                    {defaultPack ? `${defaultPack.name} — ${defaultPack.price}` : "Choose your pack"}
                  </p>
                  <p
                    className="mt-0.5 font-sans text-[9.5px] font-semibold lg:hidden"
                    style={{ color: theme.primaryLight }}
                  >
                    {defaultPack
                      ? `${defaultPack.entries.toLocaleString()} free entries included`
                      : "Free entries included"}
                  </p>
                </div>

                {/* Desktop puts the entries line in its own column — the design's three-stacked
                    lines look cramped in a 1200px bar. */}
                <p
                  className="hidden flex-none text-right font-sans text-xs font-semibold lg:block motion-safe:animate-[promo-dock-pop_0.34s_cubic-bezier(0.22,1,0.36,1)_0.05s_both]"
                  style={{ color: theme.primaryLight }}
                >
                  {defaultPack
                    ? `${defaultPack.entries.toLocaleString()} free entries included`
                    : "Free entries included"}
                </p>

                {/* Wrapper scales, so the hanging multiplier badge rides in with the button
                    instead of sitting there while the button grows under it. */}
                <div className="relative flex-none motion-safe:animate-[promo-dock-cta-pop_0.46s_cubic-bezier(0.22,1,0.36,1)_0.06s_both]">
                  {badgeSrc && (
                    <Image
                      src={badgeSrc}
                      alt=""
                      width={46}
                      height={46}
                      // Hangs over the button's top-right corner. `-right-2` and not further on
                      // a phone: the bar's own px-3.5 is all the room there is before the badge
                      // starts falling off the screen edge.
                      className="pointer-events-none absolute -right-2 -top-4 z-[2] h-10 w-10 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] lg:-right-4 lg:-top-[18px] lg:h-[46px] lg:w-[46px]"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleEnterNow}
                    className="block rounded-[10px] px-[18px] py-[13px] font-sans text-[12.5px] font-extrabold uppercase tracking-[0.04em] lg:rounded-[11px] lg:px-[26px] lg:py-[14px] lg:text-sm"
                    style={{
                      background: theme.primary,
                      color: accentInk,
                      boxShadow: `0 6px 18px ${theme.shadowRgba}`,
                    }}
                  >
                    Enter now
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Collapsed: the tabs are the whole dock. This strip keeps them off the safe-area
               inset (the home indicator) without painting a bar behind them. */
            <div aria-hidden style={{ height: "env(safe-area-inset-bottom)" }} />
          )}
        </div>
      </div>
    </>
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
      <span
        className="flex flex-none items-center justify-center rounded-[10px] border border-white/[0.09] bg-white/[0.06] p-[8.5px]"
        style={{ color: accent }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 font-sans text-sm font-semibold text-white">{label}</span>
      <span className="font-mono text-3xs text-gray-500">{href}</span>
    </Link>
  );
}
