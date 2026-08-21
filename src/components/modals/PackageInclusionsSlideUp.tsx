"use client";

import React from "react";
import Image from "next/image";
import { Check, Minus } from "lucide-react";
import { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { getPackageDisplayName } from "@/utils/membership/getDisplayName";
import { getPackageIcon, getPackageIconWrapperScaleClass } from "@/utils/images/package-icons";
import VerticalAccumulationChart from "@/components/ui/VerticalAccumulationChart";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import { getElectricPackageColorScheme } from "@/utils/package-colors/electricPackageScheme";
import { getPackageById } from "@/data/membershipPackages";
import {
  getPartnerCatalogAccessPercentForMembershipPackageId,
  getPartnerCatalogUnlockedCount,
} from "@/utils/partner-discounts/partner-catalog-visibility";
import { useThemeStore } from "@/stores/useThemeStore";

interface PackageInclusionsExpandedProps {
  isExpanded: boolean;
  packages: LocalMembershipPlan[];
  /** When true, shows the accumulation chart at the bottom (e.g. when toggle is on "Membership packs"). */
  showAccumulationChart?: boolean;
}

const fmt = (n: number) => n.toLocaleString("en-AU");

/**
 * What one package actually includes, resolved from the catalog rather than parsed
 * out of its marketing bullets.
 *
 * The old panel rendered `plan.features` — free text like
 * `"50% Access to Partner Discounts"` — which reads fine in isolation and is
 * useless side by side: three cards of prose cannot answer "what does the extra
 * $20 buy me". Everything below is the structured value behind those strings, so
 * the rows compare.
 */
interface ResolvedInclusions {
  id: string;
  name: string;
  price: number;
  period: string;
  /** Whatever `getPackageIcon` returns — a static import, not necessarily a path. */
  icon: React.ComponentProps<typeof Image>["src"] | null;
  accent: string;
  headingStyle: React.CSSProperties;
  isSubscription: boolean;
  /**
   * Free entries: per month for a subscription, in total for a one-time pack.
   *
   * This is the PROMOTED figure when a multiplier is live — the same number the
   * package card above the panel prints.
   */
  entries: number;
  /** The un-multiplied figure, present ONLY while a promo multiplier is live. */
  baseEntries: number | null;
  /** Partner-catalogue access, as a percent of the ladder. */
  partnerPercent: number;
  /** Offers that percent actually opens, and the catalogue total. */
  partnerOffers: { count: number | null; total: number };
  /** Days of partner access. 0 on subscriptions — access is lifecycle-gated. */
  partnerDays: number;
  /** Member shop discount. 0 on every one-time and mini pack, by design. */
  shopPercent: number;
}

/**
 * PackageInclusionsExpanded
 *
 * The full comparison behind "see full package inclusion". It is a TABLE, not a
 * row of cards: the question a shopper opens this panel with is a comparison one,
 * and a comparison read across three separate bullet lists is one the reader has
 * to do themselves.
 *
 * Every figure is resolved from `@/data/membershipPackages` via the same helpers
 * the rest of the app bills and gates on, so the panel cannot advertise a number
 * the platform does not honour.
 */
const PackageInclusionsExpanded: React.FC<PackageInclusionsExpandedProps> = ({
  isExpanded,
  packages,
  showAccumulationChart = false,
}) => {
  const isDark = useThemeStore((s) => s.theme === "dark");

  // Helper to get package icon - uses centralized utility with fallback logic
  const getPackageIconLocal = (planId: string) => {
    // Try direct lookup first using centralized utility
    const icon = getPackageIcon(planId);
    if (icon) return icon;

    // Try with normalized ID (lowercase) - fallback for edge cases
    const normalizedId = planId.toLowerCase();
    const normalizedIcon = getPackageIcon(normalizedId);
    if (normalizedIcon) return normalizedIcon;

    // Additional fallback: try to find by package type in centralized mapping
    if (normalizedId.includes("apprentice")) return getPackageIcon("additional-apprentice-pack");
    if (normalizedId.includes("tradie")) return getPackageIcon("additional-tradie-pack");
    if (normalizedId.includes("foreman")) return getPackageIcon("additional-foreman-pack");
    if (normalizedId.includes("vip")) return getPackageIcon("additional-vip-pack");
    if (normalizedId.includes("boss")) return getPackageIcon("additional-boss-pack");
    if (normalizedId.includes("power")) return getPackageIcon("additional-power-pack");

    return null;
  };

  if (!isExpanded) return null;

  const isMembershipTab = showAccumulationChart;

  const resolve = (plan: LocalMembershipPlan): ResolvedInclusions => {
    const lowerId = plan.id.toLowerCase();
    const colorScheme = isMembershipTab
      ? getMembershipSectionColorScheme(plan.id, true)
      : getElectricPackageColorScheme(plan.id);
    // Same tier-colour overrides as the live cards (accent + border + heading):
    let accent = colorScheme.accentHex;
    if (isMembershipTab && lowerId.includes("tradie")) accent = getElectricPackageColorScheme("foreman-pack").accentHex;       // membership Tradie → cyan
    else if (isMembershipTab && lowerId.includes("boss")) accent = getElectricPackageColorScheme("power-pack").accentHex;       // membership Boss → red
    else if (!isMembershipTab && lowerId.includes("boss")) accent = getMembershipSectionColorScheme("foreman-subscription", true).accentHex; // one-time Boss → DeWalt yellow

    /**
     * `plan.id` is derived from the package NAME, so it is not a lookup key —
     * `getPackageById("tradie")` is undefined, and the substring tier rules read a
     * bare "tradie" as the one-time pack (40%) rather than the subscription (50%).
     * `metadata.packageId` is the catalog `_id` the adapter now carries for exactly
     * this. The `plan.id` fallback only fires for a plan built outside the adapter
     * (an upsell), where the id IS the record id.
     */
    const packageId = typeof plan.metadata?.packageId === "string" ? plan.metadata.packageId : plan.id;
    const pkg = getPackageById(packageId);

    const isSubscription = pkg ? pkg.type === "subscription" : plan.period === "mo";
    const partnerPercent = getPartnerCatalogAccessPercentForMembershipPackageId(packageId);

    return {
      id: plan.id,
      name: getPackageDisplayName(plan),
      price: plan.price,
      period: plan.period,
      icon: getPackageIconLocal(plan.id),
      accent,
      headingStyle: colorScheme.textGradientStyle ? colorScheme.textGradientStyle : { color: accent },
      isSubscription,
      /**
       * The PLAN's count wins over the catalog's.
       *
       * MembershipSection bakes an active promo / alternating multiplier into
       * `metadata.entriesCount` before it hands the plans over, and the package card
       * rendered directly above this panel prints that multiplied figure. Reading the
       * static catalog first discards it, so during any promo the table stated a LOWER
       * number than the card two inches above it — the panel exists to explain the
       * cards, and it was contradicting them.
       *
       * The catalog remains the fallback for a plan built outside that pipeline.
       */
      entries:
        (typeof plan.metadata?.entriesCount === "number" && plan.metadata.entriesCount > 0
          ? plan.metadata.entriesCount
          : undefined) ??
        (isSubscription ? pkg?.entriesPerMonth : pkg?.totalEntries) ??
        0,
      // Only set while a multiplier is actually live, so the cell can show the same
      // `base → promoted` pair the card does instead of a bare promoted number.
      baseEntries:
        typeof plan.metadata?.promoMultiplier === "number" &&
        plan.metadata.promoMultiplier > 1 &&
        typeof plan.metadata?.originalEntries === "number" &&
        plan.metadata.originalEntries > 0
          ? plan.metadata.originalEntries
          : null,
      partnerPercent,
      partnerOffers: getPartnerCatalogUnlockedCount(partnerPercent),
      partnerDays: pkg?.partnerDiscountDays ?? 0,
      shopPercent: pkg?.shopDiscountPercent ?? 0,
    };
  };

  const rows_ = packages.map(resolve);
  if (rows_.length === 0) return null;

  /** A cell is either a rendered value or a plain yes/no. */
  type Cell = React.ReactNode | boolean;
  interface Row {
    label: string;
    /** Shown under the label — the caveat that would otherwise be a footnote nobody reads. */
    note?: string;
    cell: (p: ResolvedInclusions) => Cell;
  }

  /**
   * The denominator is stated ONCE, in the row's note, and each cell carries only
   * its own figure. "917 of 1,833" in every cell wraps to two lines in a column
   * narrow enough to fit five packages on a phone, and repeating the same total
   * five times spends that width saying nothing new.
   */
  const partnerTotal = rows_[0]?.partnerOffers.total ?? 0;
  const partnerCell = (p: ResolvedInclusions) => {
    const { count } = p.partnerOffers;
    // No count means the percent is off the ladder — state the percent rather
    // than a made-up figure.
    if (count === null) return `${p.partnerPercent}%`;
    return fmt(count);
  };
  const partnerNote = partnerTotal
    ? `Out of ${fmt(partnerTotal)} in the partner catalogue`
    : "Out of the full partner catalogue";

  const rows: Row[] = isMembershipTab
    ? [
        {
          label: "Free entries every month",
          cell: (p) =>
            p.entries > 0
              ? p.baseEntries !== null
                ? (
                    <>
                      <span className={isDark ? "text-white/40 line-through" : "text-slate-400 line-through"}>
                        {fmt(p.baseEntries)}
                      </span>{" "}
                      {fmt(p.entries)}
                    </>
                  )
                : fmt(p.entries)
              : false,
        },
        {
          label: "Entries roll over",
          note: "They build up while you stay a member",
          cell: () => true,
        },
        {
          label: "Partner offers you can redeem",
          note: partnerNote,
          cell: partnerCell,
        },
        {
          label: "Off everything in the shop",
          cell: (p) => (p.shopPercent > 0 ? `${p.shopPercent}%` : false),
        },
        { label: "Cancel anytime", cell: () => true },
      ]
    : [
        {
          label: "Free entries included",
          cell: (p) =>
            p.entries > 0
              ? p.baseEntries !== null
                ? (
                    <>
                      <span className={isDark ? "text-white/40 line-through" : "text-slate-400 line-through"}>
                        {fmt(p.baseEntries)}
                      </span>{" "}
                      {fmt(p.entries)}
                    </>
                  )
                : fmt(p.entries)
              : false,
        },
        {
          label: "Partner offers you can redeem",
          note: partnerNote,
          cell: partnerCell,
        },
        {
          label: "Days of partner access",
          cell: (p) => (p.partnerDays > 0 ? `${p.partnerDays}` : false),
        },
        {
          label: "Entries roll over",
          // BUSINESS.md §5.3 / Terms §5.3: one-time and Mini Pack entries are scoped
          // to the draw cycle they were bought in. Saying so here is the honest half
          // of the membership comparison — leaving it out is what makes a pack look
          // like a cheaper membership.
          note: "Pack entries are for that draw only",
          cell: () => false,
        },
        { label: "One-off — no subscription", cell: () => true },
      ];

  // Three columns fit a phone. Five do not, so the table scrolls sideways inside
  // its own container with the row labels pinned — the alternative is shrinking
  // the type until nothing is readable at any width.
  const scrolls = rows_.length > 3;

  const labelCellBg = isDark ? "bg-[#0d0e12]" : "bg-white";

  /**
   * Tier colour is carried by the bar and the icon on a light ground, NOT by the
   * text.
   *
   * The accents are tuned for the dark package cards these figures used to live on
   * — Boss yellow and VIP gold on white are barely readable, and the gradient
   * headings wash out completely. Rather than invent a second palette, the name and
   * the ticks fall back to near-black on light, where the colour bar above each
   * column still says which tier it is.
   */
  const inkOnLight = "#0f172a";

  return (
    <div className="mt-4 mb-6 w-full">
      <div
        className={`overflow-hidden rounded-2xl border ${
          isDark ? "border-white/12 bg-[#0d0e12]/92" : "border-slate-200 bg-white/95"
        } shadow-[0_4px_20px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:shadow-[0_6px_22px_rgba(0,0,0,0.5)]`}
      >
        <div className="overflow-x-auto">
          <table
            className={`w-full border-collapse text-left ${scrolls ? "min-w-[440px] sm:min-w-[640px]" : ""}`}
          >
            <caption className="sr-only">
              What each package includes, compared side by side
            </caption>

            <thead>
              <tr>
                <th
                  scope="col"
                  className={`sticky left-0 z-10 ${labelCellBg} w-[26%] min-w-[88px] max-w-[112px] px-2 py-4 align-bottom sm:w-[34%] sm:min-w-[150px] sm:max-w-[200px] sm:px-3 text-[11px] font-semibold uppercase tracking-wider ${
                    isDark ? "text-white/50" : "text-slate-500"
                  } sm:px-4`}
                >
                  What you get
                </th>
                {rows_.map((p) => (
                  <th
                    key={p.id}
                    scope="col"
                    className="px-1 py-4 text-center align-bottom sm:px-3"
                  >
                    {/* The tier's own colour bar — the identity the cards carried,
                        kept so a column is recognisable at a glance. */}
                    <span
                      aria-hidden
                      className="mx-auto mb-2 block h-1 w-8 rounded-full"
                      style={{ backgroundColor: p.accent }}
                    />
                    {p.icon && (
                      <span
                        className={`relative mx-auto mb-1.5 block h-8 w-8 sm:h-10 sm:w-10 ${getPackageIconWrapperScaleClass(p.id, "modal")}`}
                      >
                        <Image
                          src={p.icon}
                          alt=""
                          fill
                          className="object-contain"
                          sizes="(max-width: 640px) 32px, 40px"
                        />
                      </span>
                    )}
                    <span
                      className="block text-sm font-bold leading-tight sm:text-base"
                      style={isDark ? p.headingStyle : { color: inkOnLight }}
                    >
                      {p.name}
                    </span>
                    {/*
                      Price is the package's price, never a per-entry rate. Entries
                      are a free inclusion and pricing them per unit is the exact
                      framing we cannot use (CLAUDE.md rule 11).
                    */}
                    <span
                      className={`mt-0.5 block text-[11px] font-medium tabular-nums ${
                        isDark ? "text-white/55" : "text-slate-500"
                      }`}
                    >
                      ${fmt(p.price)}
                      {p.period === "mo" ? "/mo" : ""}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.label}
                  className={`border-t ${isDark ? "border-white/10" : "border-slate-200/80"}`}
                >
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 ${labelCellBg} px-2.5 py-3 text-left align-middle font-normal sm:px-4`}
                  >
                    <span
                      className={`block text-[13px] font-semibold leading-snug sm:text-sm ${
                        isDark ? "text-white/90" : "text-slate-800"
                      }`}
                    >
                      {row.label}
                    </span>
                    {/* Hidden on a phone: the notes are the longest strings in the table,
                        and on a narrow screen they widen this column at the direct cost of
                        a package column. The row labels carry the meaning on their own. */}
                    {row.note && (
                      <span
                        className={`mt-0.5 hidden text-[11px] leading-snug sm:block ${
                          isDark ? "text-white/45" : "text-slate-500"
                        }`}
                      >
                        {row.note}
                      </span>
                    )}
                  </th>

                  {rows_.map((p) => {
                    const value = row.cell(p);
                    return (
                      <td
                        key={p.id}
                        className="px-1 py-3 text-center align-middle sm:px-3"
                      >
                        {typeof value === "boolean" ? (
                          value ? (
                            <>
                              <Check
                                aria-hidden
                                className="mx-auto h-4 w-4"
                                style={{ color: isDark ? p.accent : inkOnLight }}
                              />
                              <span className="sr-only">Included</span>
                            </>
                          ) : (
                            <>
                              <Minus
                                aria-hidden
                                className={`mx-auto h-4 w-4 ${isDark ? "text-white/25" : "text-slate-300"}`}
                              />
                              <span className="sr-only">Not included</span>
                            </>
                          )
                        ) : (
                          <span
                            className={`whitespace-nowrap text-[13px] font-bold tabular-nums sm:text-base ${
                              isDark ? "text-white" : "text-slate-900"
                            }`}
                          >
                            {value}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Entry accumulation chart - only when membership packs tab is active */}
      {showAccumulationChart && (
        <div className="mx-auto mt-6 max-w-md sm:mt-8">
          <VerticalAccumulationChart />
        </div>
      )}
    </div>
  );
};

export default PackageInclusionsExpanded;
