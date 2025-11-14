"use client";

import { Lock } from "lucide-react";
import MiniDrawPackages from "@/components/features/MiniDrawPackages";
import Link from "next/link";

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
  const userEntryCount = miniDraw.userEntryCount || 0;
  const minimumEntries = miniDraw.minimumEntries ?? 0;
  const totalEntries = miniDraw.totalEntries ?? 0;
  const computedRemaining = Math.max(minimumEntries - totalEntries, 0);
  const entriesRemaining = miniDraw.entriesRemaining ?? computedRemaining;

  const isCompleted = miniDraw.status === "completed";
  const isCancelled = miniDraw.status === "cancelled";
  const isActive = miniDraw.status === "active";
  const isSoldOut = !isCancelled && entriesRemaining <= 0;
  const showPackages = isActive && !isSoldOut;
  const requiresMembership = miniDraw.requiresMembership ?? true;
  const hasActiveMembership = miniDraw.hasActiveMembership ?? false;

  return (
    <div className="space-y-6">
      {/* User Entry Progress */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Your Entries</span>
          <span className="text-sm font-semibold text-[#ee0000]">
            {userEntryCount.toLocaleString()} {userEntryCount === 1 ? "entry" : "entries"}
          </span>
        </div>
      </div>

      {/* Membership Requirement Warning */}
      {requiresMembership && !hasActiveMembership && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-800 mb-1">Membership Required</h3>
              <p className="text-sm text-yellow-700 mb-3">
                You need an active membership to purchase entries for this mini draw.
              </p>
              <Link
                href="/membership"
                className="inline-block bg-yellow-600 hover:bg-yellow-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
              >
                Get Membership
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Entry Packages (only show if draw is open and member is active) */}
      {showPackages && hasActiveMembership && (
        <MiniDrawPackages
          miniDrawId={miniDraw._id}
          minimumEntries={miniDraw.minimumEntries}
          totalEntries={miniDraw.totalEntries}
        />
      )}

      {/* Entries Closed Message */}
      {showPackages && !hasActiveMembership && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-gray-700 font-medium">Membership required to purchase entries</p>
        </div>
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
