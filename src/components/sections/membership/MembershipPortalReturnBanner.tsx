"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowRight, ExternalLink, Store } from "lucide-react";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useMemberships } from "@/hooks/useMemberships";
import { usePortalHandoff } from "@/components/sections/rewards/PortalHandoff";
import { partnerDiscountSsoEnabled } from "@/config/featureFlags";
import { resolveUnlockPackagesForLevel } from "@/utils/partner-discounts/unlock-packages";
import {
  resolvePortalBannerView,
  type PortalReturn,
} from "@/utils/partner-discounts/portal-return";
import {
  PARTNER_CATALOG_TIER_COUNTS,
  PARTNER_CATALOG_TOTAL,
} from "@/generated/partnerCatalogPreview";
import { getPackageId, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";

export type { PortalReturn };

interface MembershipPortalReturnBannerProps {
  portalReturn?: PortalReturn;
  /** Card-CTA select (fires the purchase gate + Klaviyo Started Checkout — correct
   *  here: the banner CTA starts a genuine NEW checkout, unlike the deep-link). */
  onSelectPlan: (plan: LocalMembershipPlan) => void;
  /** Candidate plans from useMembershipCardCta ([...membershipPlans, ...oneTimePlans]),
   *  promo-applied so the modal opens with the same entries a card tap would show. */
  plans: LocalMembershipPlan[];
}

const fmt = (n: number): string => n.toLocaleString("en-AU");

// `min-h` is load-bearing, not cosmetic. The banner renders a loading skeleton first, then swaps
// in one of six settled states, and any height difference either way moves the whole page. Before
// this floor existed the measured CLS was 0.58-0.61 (Google's "good" bar is 0.10).
//
// Each value is the MEASURED tallest of {skeleton, every settled state} in that band — a floor set
// from the skeleton alone is not enough, and both failure directions really occur:
//   <768   skeleton 333px, tallest settled 361.8px (the longest short-of offer copy)  -> GROWS
//   768+   skeleton 339px, tallest settled 333px                                      -> SHRINKS
//   1024+  skeleton 273px, tallest settled 283.3px                                    -> GROWS
// So the breakpoints are NOT decorative: 768 exists because the skeleton is taller than every
// settled state there, which a single base value cannot express.
//
// Re-measure these if the banner copy, the CTA stack or the skeleton changes — the check is
// `scripts`-free: load /membership?utm_campaign=rewards-return (with and without `offer_id`) at
// 390/768/1280 and compare the section height before and after `aria-busy` clears.
const SECTION_CLASS =
  "relative border-b border-white/10 pt-[var(--app-header-h)] text-white lg:pt-[var(--app-header-h-lg)] min-h-[362px] md:min-h-[339px] lg:min-h-[284px]";
const SECTION_STYLE = {
  background:
    "radial-gradient(640px 300px at 88% 0%, rgba(238,0,0,.4), transparent 60%),linear-gradient(150deg,#1c0e0e 0%,#0b0a0d 55%,#140d14 100%)",
} as const;
/** The light gradient stop is #e02424, not #ff5a5a: white 13.5px/900 measured only
 *  3.06-3.13:1 against #ff5a5a at its lightest pixel and 13.5px bold does NOT qualify as
 *  WCAG "large text", so it failed AA. #e02424 measures 4.72:1 (panel F-035). */
const CTA_CLASS =
  "flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#e02424] to-[#c40d0d] px-5 py-3 text-[13.5px] font-extrabold text-white transition-[filter] hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:ring-offset-black";

/**
 * Compact strip above the /membership hero for visitors bouncing back from the
 * partner portal (utm_campaign=rewards-return). State source is useDashboardState
 * (queue-reconciled partnerAccessPct — NOT UserContext.userData); the six-state
 * copy/CTA matrix lives in `utils/partner-discounts/portal-return.ts`
 * (`resolvePortalBannerView`, unit-tested via `npm run test:portal-return`).
 *
 * While account state loads, the banner renders a same-height SKELETON SHELL
 * instead of returning null (panel F-001): the server already knows `portalReturn`,
 * so the section reserves its space at first paint and only the copy/CTA swap in —
 * no late mount pushing the whole page down.
 *
 * The banner takes the fixed-header offset (pt-[var(--app-header-h)]) since it
 * becomes the page's first section when present; the hero then DROPS its own offset
 * for pt-8/lg:pt-10 via `hasPortalBanner`, so the two don't stack a duplicate
 * header-height band (F-022).
 */
export default function MembershipPortalReturnBanner({
  portalReturn,
  onSelectPlan,
  plans,
}: MembershipPortalReturnBannerProps) {
  const router = useRouter();
  // Session status, NOT `acct`, decides whether to offer /login (F-028): `acct === "none"`
  // also covers authenticated users with no active benefits, and /login would bounce them
  // to /my-account — out of the funnel.
  const { status: sessionStatus } = useSession();
  const { acct, partnerAccessPct, isLoading, pausedUntil } = useDashboardState();
  const { subscriptionPackages, oneTimePackages } = useMemberships();
  const sso = usePortalHandoff();
  const ssoEnabled = partnerDiscountSsoEnabled();

  const requiredPct = portalReturn?.requiredPct ?? null;

  // Cheapest package (across both purchase families) covering the offer's percent,
  // mapped back to the promo-applied LocalMembershipPlan the CTA hands to onSelectPlan.
  const recommended = useMemo(() => {
    if (requiredPct == null) return null;
    const { subscription, oneTime } = resolveUnlockPackagesForLevel(requiredPct);
    const option =
      subscription && oneTime
        ? oneTime.price < subscription.price
          ? oneTime
          : subscription
        : (subscription ?? oneTime);
    if (!option) return null;
    const apiPlans = [...subscriptionPackages, ...oneTimePackages];
    const plan = plans.find((p) => getPackageId(p, apiPlans) === option.packageId) ?? null;
    if (!plan) return null;
    const cumulativeCount = PARTNER_CATALOG_TIER_COUNTS[option.pct] ?? 0;
    return { plan, cumulativeCount };
  }, [requiredPct, plans, subscriptionPackages, oneTimePackages]);

  if (!portalReturn) return null;

  // ── Loading shell (F-001): same section, space reserved, no copy yet ─────────
  // A signed-OUT visitor skips it entirely (F-047): their state is fully resolved
  // server-side (`portalReturn` + acct "none" + 0%), and `isLoading` for them tracks
  // only `/api/major-draw` — a query this banner never reads. Waiting on it withheld
  // the funnel's primary landing copy (and its LCP text) for 3-8s. Signed-in visitors
  // still see the shell, because their percent genuinely needs the account fetch.
  if (isLoading && sessionStatus !== "unauthenticated") {
    return (
      <section className={SECTION_CLASS} style={SECTION_STYLE} aria-busy="true">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:py-6">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#ff6b6b]">
              <Store className="h-3.5 w-3.5" /> Partner catalogue
            </span>
            {/* Sized to the TALLEST settled variant, not to a guess (panel F-027):
                the first pass reserved 24px/16px for a wrapping h2 + sub and the hero
                still dropped up to 114.5px when the copy swapped in. Headline ≈50px
                (two lines at text-lg, 56px at sm), sub ≈62px. */}
            <div aria-hidden="true">
              <div className="mt-1.5 h-[50px] w-64 max-w-full rounded bg-white/10 motion-safe:animate-pulse sm:h-[56px] lg:h-[44px]" />
              <div className="mt-1 h-[62px] w-80 max-w-full rounded bg-white/10 motion-safe:animate-pulse lg:h-[40px]" />
            </div>
          </div>
          {/* One CTA block only. Reserving the meta line + "See all packages" as well
              OVERSHOT (measured: skeleton 409px vs settled 337px → a 72px upward jump):
              those two only render for an authed member short of the offer, and at first
              paint the account state is still unknown. Reserving the shared minimum keeps
              every guest state within a few px; the authed short-of state still grows,
              which is the one case whose data genuinely has not arrived yet. */}
          <div
            aria-hidden="true"
            className="h-[44px] w-full shrink-0 rounded-xl bg-white/10 motion-safe:animate-pulse lg:w-[240px]"
          />
        </div>
      </section>
    );
  }

  const view = resolvePortalBannerView({
    portalReturn,
    // No cast (F-046): PortalBannerAcct IS DashboardAccountState, so a new dashboard
    // state now fails type-check here until this matrix handles it.
    acct,
    partnerAccessPct,
    ssoEnabled,
    recommended: recommended
      ? {
          planName: recommended.plan.name,
          planIsSubscription: recommended.plan.period === "mo",
          cumulativeCount: recommended.cumulativeCount,
        }
      : null,
    catalogTotal: PARTNER_CATALOG_TOTAL,
    pausedUntilLabel: pausedUntil
      ? pausedUntil.toLocaleDateString("en-AU", { day: "numeric", month: "long" })
      : null,
    isAuthenticated: sessionStatus === "authenticated",
  });

  const total = fmt(PARTNER_CATALOG_TOTAL);
  const ssoErrorMessage = view.cta?.kind === "sso" ? sso.error : null;

  /** Unlock CTA (F-005): an ACTIVE subscriber "unlocking" via a subscription is an
   *  UPGRADE — cta.onSelect would bounce them to the bare dashboard, so route
   *  straight to the manage-subscription sheet instead (its tier taps open the
   *  upgrade/downgrade confirm). Everyone else opens the purchase modal. */
  const handleUnlock = () => {
    if (!recommended) return;
    if (view.cta?.kind === "unlock" && view.cta.planIsSubscription && acct === "active") {
      router.push("/my-account?open=subscription");
      return;
    }
    onSelectPlan(recommended.plan);
  };

  return (
    <section className={SECTION_CLASS} style={SECTION_STYLE}>
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:py-6">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#ff6b6b]">
            <Store className="h-3.5 w-3.5" /> Partner catalogue
          </span>
          <h2 className="mt-1.5 font-poppins text-lg font-black leading-snug sm:text-xl">
            {view.headline}
          </h2>
          <p className="mt-1 max-w-[560px] text-[13px] font-semibold leading-relaxed text-white/70">
            {view.sub}
          </p>
          {view.showLoginHint && (
            <p className="mt-1.5 text-[12px] font-semibold text-white/70">
              Already a member?{" "}
              <Link
                href="/login"
                className="font-bold text-white underline underline-offset-4 hover:text-[#ff6b6b]"
              >
                Log in to check your access
              </Link>
            </p>
          )}
          {ssoErrorMessage && (
            <p className="mt-1.5 text-[12px] font-semibold text-[#ff6b6b]" role="alert">
              {ssoErrorMessage}
            </p>
          )}
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 lg:w-auto lg:min-w-[240px]">
          {view.cta?.kind === "unlock" && (
            <>
              <button type="button" onClick={handleUnlock} className={CTA_CLASS}>
                Unlock with the {view.cta.planName} <ArrowRight className="h-4 w-4" />
              </button>
              {view.cta.showCatalogueMeta && (
                <>
                  <span className="text-center text-[11px] font-semibold text-white/60">
                    {view.cta.cumulativeCount === PARTNER_CATALOG_TOTAL
                      ? `Unlocks all ${total} partner offers`
                      : `Unlocks ${fmt(view.cta.cumulativeCount)} of ${total} partner offers`}
                  </span>
                  {/* py+negative-margin = 44px touch target without changing the visual rhythm (F-012). */}
                  <a
                    href="#membership"
                    className="-my-1 py-[13px] text-center text-[12px] font-bold text-white/80 underline underline-offset-4 hover:text-white"
                  >
                    See all packages
                  </a>
                </>
              )}
            </>
          )}

          {view.cta?.kind === "sso" && (
            <button
              type="button"
              onClick={sso.start}
              disabled={sso.busy}
              className={`${CTA_CLASS} disabled:opacity-60`}
            >
              <Store className="h-4 w-4" />
              {sso.busy ? "Opening…" : "Open partner portal"}
              <ExternalLink className="h-4 w-4" />
            </button>
          )}
          {view.cta?.kind === "sso" && sso.overlay}

          {view.cta?.kind === "manage" && (
            <Link
              href="/my-account?open=subscription"
              className="flex items-center justify-center gap-2 rounded-xl border border-white/25 px-5 py-3 text-[13.5px] font-extrabold text-white transition-colors hover:border-white/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              {/* "Resume membership", not "Manage membership" (F-048): the sub tells them
                  to resume, and ManageSheet renders a real "Resume now" control — a
                  vaguer label adds hesitation at exactly the wrong moment. */}
              Resume membership <ArrowRight className="h-4 w-4" />
            </Link>
          )}

          {view.cta?.kind === "payment" && (
            <Link
              href="/my-account?open=payment"
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#fbbf24] to-[#d97706] px-5 py-3 text-[13.5px] font-extrabold text-[#241a02] transition-[filter] hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              Update payment <ArrowRight className="h-4 w-4" />
            </Link>
          )}

          {view.cta?.kind === "scroll" && (
            <a
              href="#membership"
              className="flex items-center justify-center gap-2 rounded-xl border border-white/25 px-5 py-3 text-[13.5px] font-extrabold text-white transition-colors hover:border-white/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              {view.cta.label} <ArrowRight className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
