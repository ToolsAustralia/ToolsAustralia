"use client";

import { ShieldCheck, Zap, Lock } from "lucide-react";
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

  return (
    <div className="relative overflow-hidden rounded-[20px] border border-[#EFF0F3] bg-white shadow-[0_10px_26px_-20px_rgba(15,23,42,.5)] dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-none">
      {/* 4px brand rule across the top */}
      <div className="h-1 bg-gradient-to-r from-red-600 via-[#FF6B6B] to-red-600" />

      <div className="p-3.5 lg:p-[22px]">
        {/* Entry packs — header, tier picker, sticky mobile buy bar and the money path all
            live inside MiniDrawPackages so purchase state has exactly one owner. */}
        {showPackages && (
          <MiniDrawPackages
            key={String(miniDraw._id)}
            miniDrawId={miniDraw._id}
            minimumEntries={miniDraw.minimumEntries}
            totalEntries={miniDraw.totalEntries}
            userEntryCount={userEntryCount}
            drawName={miniDraw.name}
            showStickyBar
          />
        )}

        {/* Closed / Completed / Cancelled states */}
        {!isCompleted && !isCancelled && !showPackages && (
          <div className="flex flex-col items-center py-8 text-center sm:py-10">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-neutral-800 sm:h-14 sm:w-14">
              <Lock className="h-5 w-5 text-gray-400 dark:text-neutral-500 sm:h-6 sm:w-6" />
            </div>
            <p className="text-sm font-semibold text-gray-800 dark:text-neutral-100 sm:text-base">
              {isSoldOut ? "Entries are now closed" : "This draw is no longer accepting entries"}
            </p>
            {!isSoldOut && (
              <p className="mt-1.5 max-w-xs text-xs text-gray-500 sm:text-sm">
                Please check back for other giveaways.
              </p>
            )}
          </div>
        )}

        {isCompleted && (
          <div className="flex flex-col items-center py-8 text-center sm:py-10">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-neutral-800 sm:h-14 sm:w-14">
              <ShieldCheck className="h-5 w-5 text-gray-400 dark:text-neutral-500 sm:h-6 sm:w-6" />
            </div>
            <p className="text-sm font-semibold text-gray-800 dark:text-neutral-100 sm:text-base">
              This mini draw has ended
            </p>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-neutral-400 sm:text-sm">
              Check the results page for winners!
            </p>
          </div>
        )}

        {isCancelled && (
          <div className="flex flex-col items-center py-8 text-center sm:py-10">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 sm:h-14 sm:w-14">
              <Zap className="h-5 w-5 text-red-400 sm:h-6 sm:w-6" />
            </div>
            <p className="text-sm font-semibold text-red-700 sm:text-base">This mini draw has been cancelled</p>
            <p className="mt-1.5 text-xs text-red-500 sm:text-sm">
              Reach out to the support team if you need assistance.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
