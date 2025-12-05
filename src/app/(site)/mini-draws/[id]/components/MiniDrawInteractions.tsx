"use client";

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
  // Subscribe to minidraw query updates for real-time UI updates
  const { data: miniDrawQueryData } = useMiniDraw(miniDraw._id);

  // Use query data if available (for optimistic updates), otherwise fall back to props
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
    <div className="space-y-6">
      {/* Entry Packages - Show to all users (authenticated and unauthenticated) */}
      {/* MiniDrawPackages component handles login modal for unauthenticated users */}
      {showPackages && (
        <MiniDrawPackages
          miniDrawId={miniDraw._id}
          minimumEntries={miniDraw.minimumEntries}
          totalEntries={miniDraw.totalEntries}
          userEntryCount={userEntryCount}
        />
      )}

      {!isCompleted && !isCancelled && !showPackages && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-gray-700 font-medium">
            {isSoldOut ? "Entries are now closed" : "This draw is no longer accepting entries"}
          </p>
          {!isSoldOut && <p className="text-sm text-gray-600 mt-1">Please check back for other giveaways.</p>}
        </div>
      )}

      {/* Completed Message */}
      {isCompleted && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-gray-700 font-medium">This mini draw has ended</p>
          <p className="text-sm text-gray-600 mt-1">Check the results page for winners!</p>
        </div>
      )}

      {isCancelled && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <p className="text-red-700 font-medium">This mini draw has been cancelled</p>
          <p className="text-sm text-red-600 mt-1">Reach out to the support team if you need assistance.</p>
        </div>
      )}
    </div>
  );
}
