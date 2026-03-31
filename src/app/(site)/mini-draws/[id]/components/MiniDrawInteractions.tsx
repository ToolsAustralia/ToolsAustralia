"use client";

import { Ticket, ShieldCheck, Zap, Lock } from "lucide-react";
import MiniDrawPackages from "@/components/features/MiniDrawPackages";
import { useMiniDraw } from "@/hooks/queries/useMiniDrawQueries";

interface MiniDrawInteractionsProps {
  miniDraw: {
    _id: string;
    name: string;
    status: "active" | "completed" | "cancelled";
    totalEntries: number;
    minimumEntries: number;
    entriesRemaining?: number;
    userEntryCount?: number;
    requiresMembership?: boolean;
    hasActiveMembership?: boolean;
  };
}

export default function MiniDrawInteractions({ miniDraw }: MiniDrawInteractionsProps) {
  const { data: miniDrawQueryData } = useMiniDraw(miniDraw._id);

  const minimumEntries = miniDrawQueryData?.minimumEntries ?? miniDraw.minimumEntries ?? 0;
  const totalEntries = miniDrawQueryData?.totalEntries ?? miniDraw.totalEntries ?? 0;
  const entriesRemainingData = miniDrawQueryData?.entriesRemaining ?? miniDraw.entriesRemaining;
  const computedRemaining = Math.max(minimumEntries - totalEntries, 0);
  const entriesRemaining = entriesRemainingData ?? computedRemaining;
  const userEntryCount = miniDrawQueryData?.userEntryCount ?? miniDraw.userEntryCount ?? 0;

  const isCompleted = miniDraw.status === "completed";
  const isCancelled = miniDraw.status === "cancelled";
  const isActive = miniDraw.status === "active";
  const isSoldOut = !isCancelled && entriesRemaining <= 0;
  const showPackages = isActive && !isSoldOut;

  const percentage = minimumEntries > 0 ? Math.min(100, Math.round((totalEntries / minimumEntries) * 100)) : 0;

  return (
    <div className="relative rounded-2xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg dark:shadow-none">
      {/* Subtle gradient accent at top */}
      <div className="h-1 rounded-t-2xl bg-gradient-to-r from-[#ee0000] via-[#ff4444] to-[#ee0000]" />

      <div className="p-3 sm:p-5">
        {/* Urgency banner */}
        {showPackages && percentage >= 75 && (
          <div className="mb-3 sm:mb-4 flex items-center gap-2.5 bg-gradient-to-r from-[#ee0000]/5 to-[#ee0000]/10 border border-[#ee0000]/15 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3">
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ee0000] opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#ee0000]" />
            </span>
            <span className="text-xs sm:text-sm font-semibold text-[#ee0000] dark:text-red-400 leading-tight">
              {percentage >= 90
                ? `Almost full! Only ${entriesRemaining.toLocaleString()} entries left`
                : `Filling fast — ${entriesRemaining.toLocaleString()} entries remaining`}
            </span>
          </div>
        )}

        {/* User entry count */}
        {userEntryCount > 0 && (
          <div className="mb-3 sm:mb-4 flex items-center gap-2.5 bg-green-50/80 dark:bg-green-950/35 border border-green-100 dark:border-green-900/40 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-green-100 dark:bg-green-900/50 flex items-center justify-center flex-shrink-0">
              <Ticket className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600 dark:text-green-400" />
            </div>
            <span className="text-xs sm:text-sm font-medium text-green-700 dark:text-green-300">
              You have <span className="font-bold">{userEntryCount}</span>{" "}
              {userEntryCount === 1 ? "entry" : "entries"} in this draw
            </span>
          </div>
        )}

        {/* Entry Packages */}
        {showPackages && (
          <MiniDrawPackages
            miniDrawId={miniDraw._id}
            minimumEntries={miniDraw.minimumEntries}
            totalEntries={miniDraw.totalEntries}
            userEntryCount={userEntryCount}
          />
        )}

        {/* Closed / Completed / Cancelled states */}
        {!isCompleted && !isCancelled && !showPackages && (
          <div className="flex flex-col items-center text-center py-8 sm:py-10">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gray-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
              <Lock className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400 dark:text-neutral-500" />
            </div>
            <p className="text-sm sm:text-base font-semibold text-gray-800 dark:text-neutral-100">
              {isSoldOut ? "Entries are now closed" : "This draw is no longer accepting entries"}
            </p>
            {!isSoldOut && (
              <p className="text-xs sm:text-sm text-gray-500 mt-1.5 max-w-xs">
                Please check back for other giveaways.
              </p>
            )}
          </div>
        )}

        {isCompleted && (
          <div className="flex flex-col items-center text-center py-8 sm:py-10">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gray-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
              <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400 dark:text-neutral-500" />
            </div>
            <p className="text-sm sm:text-base font-semibold text-gray-800 dark:text-neutral-100">
              This mini draw has ended
            </p>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-neutral-400 mt-1.5">
              Check the results page for winners!
            </p>
          </div>
        )}

        {isCancelled && (
          <div className="flex flex-col items-center text-center py-8 sm:py-10">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
              <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-red-400" />
            </div>
            <p className="text-sm sm:text-base font-semibold text-red-700">
              This mini draw has been cancelled
            </p>
            <p className="text-xs sm:text-sm text-red-500 mt-1.5">
              Reach out to the support team if you need assistance.
            </p>
          </div>
        )}

        {/* Trust signals */}
        {showPackages && (
          <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-100 dark:border-neutral-800 flex items-center justify-center gap-4 sm:gap-6 text-[10px] sm:text-xs text-gray-400 dark:text-neutral-500">
            <div className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>Secure Payment</span>
            </div>
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>Instant Entry</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
