"use client";

import { useState } from "react";
import Image from "next/image";
import { Crown } from "lucide-react";
import { Card, SectionTitle, Badge, Donut, type DonutSegment } from "@/components/admin/ui";
import { getPackageById } from "@/data/membershipPackages";
import { getPackageIcon } from "@/utils/images/package-icons";
import MembershipByPackageDetailModal from "@/components/modals/MembershipByPackageDetailModal";
import type { MembershipByPackageData } from "@/hooks/queries/useAdminQueries";
import { tierColorByPackageId } from "./tierColors";

/** Exact AUD — full value, thousands separators, no k/M compacting, decimals only if present. */
const moneyExact = (n: number) => `$${n.toLocaleString("en-AU", { maximumFractionDigits: 2 })}`;

/**
 * Active memberships donut + legend for the admin Overview.
 *
 * Replaces the legacy `MembershipBreakdownSection`. Segments come from the
 * `useMembershipByPackage` hook (active counts per tier); colors from the
 * `brand-tier` tokens via `tierColorByPackageId` (spec D4). Per-row price comes
 * from the static package data (`getPackageById(...).price`), not the hook.
 * Legend rows show the package icon (`getPackageIcon`), falling back to the
 * tier color dot when no icon exists. Past-due and Paused render as text badges
 * beside the donut. Paused is a 30-day-retention-pause proxy (see
 * `totalPausedCount` in `MembershipAnalyticsService`).
 */
export default function MembershipCard({
  data,
  loading = false,
  onUserClick,
}: {
  data: MembershipByPackageData | undefined;
  loading?: boolean;
  onUserClick?: (userId: string) => void;
}) {
  // Detail-modal state — clicking a donut arc or legend row opens the
  // membership-by-package modal scoped to that tier (legacy `MembershipBreakdownSection` UX).
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<{ packageId: string; packageName: string } | null>(null);

  const openModalForPackage = (packageId: string, packageName: string) => {
    setSelectedPackage({ packageId, packageName });
    setModalOpen(true);
  };

  // Only show skeletons when there is no data yet — a background refetch keeps the
  // existing donut/legend visible instead of flashing placeholders.
  const showSkeleton = loading && !data;

  const packages = data?.packages ?? [];

  const segments: DonutSegment[] = packages.map((pkg) => ({
    id: pkg.packageId,
    label: pkg.packageName,
    color: tierColorByPackageId(pkg.packageId),
    value: pkg.activeCount,
    count: pkg.activeCount,
  }));

  const totalActive = packages.reduce((sum, pkg) => sum + pkg.activeCount, 0);
  const pastDue = data?.summary?.totalPastDueCount ?? 0;
  const totalPastDueRevenue = data?.summary?.totalPastDueRevenue ?? 0;
  // 30-day-retention-pause proxy from MembershipAnalyticsService (no live DB pause flag).
  const paused = data?.summary?.totalPausedCount ?? 0;

  return (
    <Card className="p-5 h-full">
      <SectionTitle
        title="Active memberships"
        subtitle="Live distribution by tier"
        icon={Crown}
        right={
          pastDue > 0 || paused > 0 ? (
            <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-1.5">
              {pastDue > 0 && <Badge tone="danger">{pastDue} past due · {moneyExact(totalPastDueRevenue)}</Badge>}
              {paused > 0 && <Badge tone="warning">{paused} paused</Badge>}
            </div>
          ) : undefined
        }
      />

      {showSkeleton ? (
        <>
          <div className="flex justify-center">
            <div
              className="rounded-full border-[22px] border-neutral-200 dark:border-neutral-800 animate-pulse"
              style={{ width: 168, height: 168 }}
            />
          </div>
          <div className="space-y-2.5 mt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="w-5 h-5 shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
                <span className="h-3.5 flex-1 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
                <span className="h-3.5 w-8 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse shrink-0" />
              </div>
            ))}
          </div>
        </>
      ) : (
      <>
      <div className="flex justify-center">
        <Donut
          segments={segments}
          centerLabel={totalActive.toLocaleString("en-AU")}
          centerSub="active"
          onSegmentClick={(segment) => openModalForPackage(segment.id, segment.label)}
        />
      </div>

      {/* Legend */}
      <div className="space-y-2.5 mt-4">
        {packages.map((pkg) => {
          const price = getPackageById(pkg.packageId)?.price;
          const icon = getPackageIcon(pkg.packageId);
          return (
            <button
              key={pkg.packageId}
              type="button"
              onClick={() => openModalForPackage(pkg.packageId, pkg.packageName)}
              className="flex items-center gap-2.5 w-full text-left cursor-pointer rounded-md -mx-1 px-1 py-0.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-300 dark:focus-visible:ring-neutral-600 transition-colors"
            >
              {icon ? (
                <span className="w-5 h-5 shrink-0 flex items-center justify-center">
                  <Image src={icon} alt="" className="w-full h-full object-contain" />
                </span>
              ) : (
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: tierColorByPackageId(pkg.packageId) }}
                />
              )}
              <span className="min-w-0 flex-1 flex items-baseline gap-1.5 truncate">
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300 truncate">
                  {pkg.packageName}
                </span>
                {price != null && (
                  <span className="text-2xs text-neutral-400 dark:text-neutral-500 num shrink-0">
                    ${price}/mo
                  </span>
                )}
              </span>
              <span className="text-sm font-bold text-neutral-900 dark:text-white num shrink-0">
                {pkg.activeCount.toLocaleString("en-AU")}
              </span>
              <span className="text-2xs text-neutral-500 dark:text-neutral-400 num w-20 text-right shrink-0">
                {moneyExact(pkg.activeRevenue)}
              </span>
            </button>
          );
        })}
      </div>
      </>
      )}

      <MembershipByPackageDetailModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedPackage(null);
        }}
        packageId={selectedPackage?.packageId ?? ""}
        packageName={selectedPackage?.packageName ?? ""}
        onUserClick={onUserClick}
      />
    </Card>
  );
}
