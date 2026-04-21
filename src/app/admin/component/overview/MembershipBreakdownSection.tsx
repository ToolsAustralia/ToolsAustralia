"use client";

import React, { useState } from "react";
import DashboardSection from "./DashboardSection";
import MembershipByPackageDetailModal from "@/components/modals/MembershipByPackageDetailModal";
import { useMembershipByPackage } from "@/hooks/queries/useAdminQueries";
import { RefreshCw, Package } from "lucide-react";
import Image from "next/image";
import { getPackageIcon, getPackageIconWrapperScaleClass } from "@/utils/images/package-icons";

interface MembershipBreakdownSectionProps {
  isExpanded: boolean;
  /** When false, section header is not collapsible (e.g. desktop always expanded) */
  collapsible?: boolean;
  onClose: () => void;
  onUserClick: (userId: string) => void;
}

export default function MembershipBreakdownSection({
  isExpanded,
  collapsible = true,
  onClose,
  onUserClick,
}: MembershipBreakdownSectionProps) {
  const { data: membershipByPackageData, isLoading: membershipByPackageLoading } = useMembershipByPackage();
  const [membershipModalPackage, setMembershipModalPackage] = useState<{
    packageId: string;
    packageName: string;
    initialStatusFilter?: "active" | "past_due" | "cancelled";
  } | null>(null);
  const [isMembershipByPackageModalOpen, setIsMembershipByPackageModalOpen] = useState(false);

  if (!isExpanded) return null;

  return (
    <>
      <DashboardSection
        title="Membership Breakdown"
        subtitle={
          membershipByPackageData && !membershipByPackageLoading
            ? `${(membershipByPackageData.summary?.totalActiveCount ?? 0).toLocaleString()} active · ${(membershipByPackageData.summary?.totalPastDueCount ?? 0).toLocaleString()} past due`
            : undefined
        }
        collapsible={collapsible}
        isExpanded={isExpanded}
        onToggleExpand={onClose}
        noPadding={false}
        className="shadow-md"
      >
        {membershipByPackageLoading && (
          <div className="flex items-center justify-center py-5 sm:py-6 text-gray-500 dark:text-neutral-400 text-xs sm:text-sm">
            <RefreshCw className="w-6 h-6 sm:w-8 sm:h-8 animate-spin mr-2 shrink-0" />
            <span>Loading membership breakdown…</span>
          </div>
        )}

        {!membershipByPackageLoading && membershipByPackageData && (
          <>
            {/* Summary Bar */}
            <div className="mb-3 sm:mb-4 p-3 sm:p-4 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-green-950/40 rounded-md sm:rounded-lg border border-emerald-200 dark:border-emerald-800 text-[11px] sm:text-sm text-gray-700 dark:text-neutral-200 leading-snug">
              <div className="flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-1.5 sm:gap-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setMembershipModalPackage({ packageId: "all", packageName: "All", initialStatusFilter: "active" });
                    setIsMembershipByPackageModalOpen(true);
                  }}
                  className="text-left hover:underline focus:outline-none focus:ring-1 focus:ring-red-300 rounded"
                >
                  Active:{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {(membershipByPackageData.summary?.totalActiveCount ?? 0).toLocaleString()} users
                  </span>
                  {" · "}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    $
                    {(membershipByPackageData.summary?.totalActiveRevenue ?? 0).toLocaleString("en-AU", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    total income
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMembershipModalPackage({ packageId: "all", packageName: "All", initialStatusFilter: "past_due" });
                    setIsMembershipByPackageModalOpen(true);
                  }}
                  className="text-left hover:underline focus:outline-none focus:ring-1 focus:ring-red-300 rounded"
                >
                  Past due:{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {(membershipByPackageData.summary?.totalPastDueCount ?? 0).toLocaleString()} users
                  </span>
                  {" · "}
                  <span className="font-semibold text-amber-700">
                    $
                    {(membershipByPackageData.summary?.totalPastDueRevenue ?? 0).toLocaleString("en-AU", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                  </span>
                </button>
              </div>
            </div>

            {/* Mobile: compact matrix — packages as columns, status as rows */}
            <div className="sm:hidden mb-2 overflow-x-auto -mx-1 px-1 brand-scrollbar">
              <table className="w-full min-w-[280px] text-[10px] border-collapse table-fixed">
                <thead>
                  <tr>
                    <th className="w-[22%] p-0" aria-hidden />
                    {membershipByPackageData.packages.map((pkg) => {
                      const packageIcon = getPackageIcon(pkg.packageId);
                      return (
                        <th key={pkg.packageId} className="p-1 text-center font-semibold text-gray-800 dark:text-neutral-200 align-bottom">
                          <div className="flex flex-col items-center gap-0.5 min-h-[3.25rem] justify-end">
                            {packageIcon ? (
                              <Image
                                src={packageIcon}
                                alt=""
                                width={32}
                                height={32}
                                className={`w-7 h-7 object-contain ${getPackageIconWrapperScaleClass(pkg.packageId, "badge")}`}
                              />
                            ) : (
                              <div className="w-7 h-7 rounded flex items-center justify-center bg-gray-100">
                                <Package className="w-3.5 h-3.5 text-gray-400" />
                              </div>
                            )}
                            <span className="leading-tight line-clamp-2 text-[9px] font-semibold normal-case">
                              {pkg.packageName}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      {
                        label: "Active",
                        key: "active" as const,
                        labelClass: "text-emerald-700",
                        buttonClass:
                          "text-emerald-700 hover:bg-emerald-50/90 hover:ring-1 hover:ring-emerald-200/80",
                      },
                      {
                        label: "Past due",
                        key: "past_due" as const,
                        labelClass: "text-amber-700",
                        buttonClass:
                          "text-amber-700 hover:bg-amber-50/90 hover:ring-1 hover:ring-amber-200/80",
                      },
                      {
                        label: "Cancelled",
                        key: "cancelled" as const,
                        labelClass: "text-red-600",
                        buttonClass: "text-red-600 hover:bg-red-50/90 hover:ring-1 hover:ring-red-200/80",
                      },
                    ] as const
                  ).map((row) => (
                    <tr key={row.key} className="border-t border-gray-100">
                      <th
                        scope="row"
                        className={`text-left py-1 pr-1 font-semibold align-middle ${row.labelClass}`}
                      >
                        {row.label}
                      </th>
                      {membershipByPackageData.packages.map((pkg) => {
                        const value =
                          row.key === "active"
                            ? pkg.activeCount
                            : row.key === "cancelled"
                              ? pkg.cancelledCount
                              : pkg.pastDueCount ?? 0;
                        const filter: "active" | "past_due" | "cancelled" =
                          row.key === "active" ? "active" : row.key === "cancelled" ? "cancelled" : "past_due";
                        return (
                          <td key={pkg.packageId} className="text-center py-1 px-0.5 align-middle tabular-nums">
                            <button
                              type="button"
                              onClick={() => {
                                setMembershipModalPackage({
                                  packageId: pkg.packageId,
                                  packageName: pkg.packageName,
                                  initialStatusFilter: filter,
                                });
                                setIsMembershipByPackageModalOpen(true);
                              }}
                              className={`w-full min-w-0 rounded px-0.5 py-0.5 font-semibold ${row.buttonClass}`}
                            >
                              {value.toLocaleString()}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Desktop: package cards */}
            <div className="hidden sm:grid sm:grid-cols-3 gap-2 sm:gap-4">
              {membershipByPackageData.packages.map((pkg) => {
                const packageIcon = getPackageIcon(pkg.packageId);
                return (
                  <button
                    key={pkg.packageId}
                    type="button"
                    onClick={() => {
                      setMembershipModalPackage({ packageId: pkg.packageId, packageName: pkg.packageName });
                      setIsMembershipByPackageModalOpen(true);
                    }}
                    className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg sm:rounded-xl p-3 sm:p-4 flex items-center gap-2 sm:gap-3 hover:border-emerald-300 dark:hover:border-emerald-600 hover:shadow-md hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 transition-all text-left cursor-pointer w-full"
                  >
                    {packageIcon ? (
                      <Image
                        src={packageIcon}
                        alt={pkg.packageName}
                        width={48}
                        height={48}
                        className={`flex-shrink-0 rounded w-10 h-10 sm:w-12 sm:h-12 object-contain ${getPackageIconWrapperScaleClass(pkg.packageId, "badge")}`}
                      />
                    ) : (
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded flex items-center justify-center bg-gray-100 flex-shrink-0">
                        <Package className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white truncate">
                        {pkg.packageName}
                      </p>
                      <p className="text-[11px] sm:text-sm text-gray-600 dark:text-neutral-400">
                        Active: {pkg.activeCount.toLocaleString()}
                      </p>
                      <p className="text-[11px] sm:text-sm text-red-600">Cancelled: {pkg.cancelledCount.toLocaleString()}</p>
                      <p className="text-[11px] sm:text-sm text-amber-700">Past due: {(pkg.pastDueCount ?? 0).toLocaleString()}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </DashboardSection>

      <MembershipByPackageDetailModal
        isOpen={isMembershipByPackageModalOpen}
        onClose={() => {
          setIsMembershipByPackageModalOpen(false);
          setMembershipModalPackage(null);
        }}
        packageId={membershipModalPackage?.packageId ?? ""}
        packageName={membershipModalPackage?.packageName ?? ""}
        initialStatusFilter={membershipModalPackage?.initialStatusFilter}
        onUserClick={onUserClick}
      />
    </>
  );
}
