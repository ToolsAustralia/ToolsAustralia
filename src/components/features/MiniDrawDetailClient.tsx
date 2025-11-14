"use client";

import React from "react";
import Image from "next/image";
import { Trophy, Users, Gift, Lock, GaugeCircle } from "lucide-react";
import MiniDrawPackages from "@/components/features/MiniDrawPackages";
import Link from "next/link";

interface MiniDrawDetailClientProps {
  miniDraw: {
    _id: string;
    name: string;
    description: string;
    status: "active" | "completed" | "cancelled";
    totalEntries: number;
    minimumEntries?: number;
    entriesRemaining?: number;
    cycle?: number;
    requiresMembership?: boolean;
    hasActiveMembership?: boolean;
    prize: {
      name: string;
      description: string;
      value: number;
      images: string[];
      category: string;
    };
    latestWinner?: {
      _id: string;
      userId: string;
      entryNumber: number;
      selectedDate: string;
      selectionMethod?: string;
      imageUrl?: string;
      cycle?: number;
    };
  };
}

export default function MiniDrawDetailClient({ miniDraw }: MiniDrawDetailClientProps) {
  const minimumEntries = miniDraw.minimumEntries ?? 0;
  const totalEntries = miniDraw.totalEntries ?? 0;
  const computedRemaining = Math.max(minimumEntries - totalEntries, 0);
  const entriesRemaining = miniDraw.entriesRemaining ?? computedRemaining;
  const capacityPercentage = minimumEntries > 0 ? Math.min(100, Math.round((totalEntries / minimumEntries) * 100)) : 0;
  const cycle = miniDraw.cycle ?? 1;
  const latestWinner = miniDraw.latestWinner;
  const latestWinnerCycle = latestWinner?.cycle ?? cycle - 1;

  const isCompleted = miniDraw.status === "completed";
  const isCancelled = miniDraw.status === "cancelled";
  const isActive = miniDraw.status === "active";
  const isSoldOut = !isCancelled && entriesRemaining <= 0;
  const showPackages = isActive && !isSoldOut;
  const requiresMembership = miniDraw.requiresMembership ?? true;
  const hasActiveMembership = miniDraw.hasActiveMembership ?? false;
  const showMembershipWarning = requiresMembership && !hasActiveMembership;

  const getStatusBadge = () => {
    const badges = {
      open: { text: "Open", color: "bg-green-100 text-green-800" },
      filled: { text: "Entries Full", color: "bg-yellow-100 text-yellow-800" },
      completed: { text: "Completed", color: "bg-gray-100 text-gray-800" },
      cancelled: { text: "Cancelled", color: "bg-red-100 text-red-800" },
    };

    let badgeKey: keyof typeof badges = "open";
    if (isCancelled) {
      badgeKey = "cancelled";
    } else if (isCompleted) {
      badgeKey = "completed";
    } else if (isSoldOut) {
      badgeKey = "filled";
    }

    const badge = badges[badgeKey];
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">{miniDraw.name}</h1>
          <p className="text-lg text-gray-600 mb-4">{miniDraw.description}</p>
          <div className="flex items-center gap-3 mb-4">{getStatusBadge()}</div>

          {/* Membership Required Warning */}
          {showMembershipWarning && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg mb-4">
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-yellow-800 mb-1">Membership Required</h3>
                  <p className="text-yellow-700 mb-3">
                    You need an active membership to participate in this mini draw. Join now to get access to exclusive
                    draws and prizes!
                  </p>
                  <Link
                    href="/membership"
                    className="inline-block bg-yellow-600 hover:bg-yellow-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
                  >
                    Get Membership
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Prize Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Prize Showcase */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <Trophy className="w-6 h-6 text-red-600" />
                <h2 className="text-2xl font-bold text-gray-900">Prize</h2>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{miniDraw.prize.name}</h3>
              <p className="text-gray-600 mb-4">{miniDraw.prize.description}</p>
              <div className="text-2xl font-bold text-red-600 mb-4">${miniDraw.prize.value.toLocaleString()}</div>
              {miniDraw.prize.images && miniDraw.prize.images.length > 0 && (
                <div className="grid grid-cols-2 gap-4">
                  {miniDraw.prize.images.map((image, index) => (
                    <div key={index} className="relative w-full h-48 rounded-lg overflow-hidden">
                      <Image
                        src={image}
                        alt={`${miniDraw.prize.name} - Image ${index + 1}`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 50vw"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Entry Snapshot */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Entry Snapshot</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <GaugeCircle className="w-5 h-5 text-red-600" />
                  <div>
                    <div className="font-medium text-gray-900">Progress</div>
                    <div className="text-gray-700">
                      {totalEntries.toLocaleString()} / {minimumEntries.toLocaleString()} entries
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Gift className="w-5 h-5 text-red-600" />
                  <div>
                    <div className="font-medium text-gray-900">Cycle</div>
                    <div className="text-gray-700">Currently running cycle #{cycle}</div>
                  </div>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-red-500 to-red-700 h-2.5 transition-all duration-500"
                    style={{ width: `${capacityPercentage}%` }}
                  ></div>
                </div>

                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-red-600" />
                  <div>
                    <div className="font-medium text-gray-900">
                      {isSoldOut || isCompleted ? "Capacity Reached" : "Entries Remaining"}
                    </div>
                    <div className="text-gray-700">
                      {isSoldOut || isCompleted ? "No additional entries accepted" : entriesRemaining.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {(isCancelled || isSoldOut) && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {isCancelled
                    ? "This mini draw has been cancelled. Please contact support if you have any questions."
                    : "Capacity has been reached. Thanks for participating!"}
                </div>
              )}
            </div>

            {latestWinner && (
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl shadow-lg p-6 border-2 border-yellow-200">
                <div className="flex items-center gap-3 mb-4">
                  <Gift className="w-6 h-6 text-yellow-600" />
                  <h2 className="text-2xl font-bold text-gray-900">Latest Winner</h2>
                </div>
                <p className="text-gray-700">
                  Entry #{latestWinner.entryNumber} • Selected{" "}
                  {new Date(latestWinner.selectedDate).toLocaleDateString()}
                  {latestWinnerCycle > 0 ? ` (Cycle #${latestWinnerCycle})` : ""}
                </p>
                {latestWinner.imageUrl && (
                  <div className="mt-4">
                    <Image
                      src={latestWinner.imageUrl}
                      alt="Winner"
                      width={160}
                      height={160}
                      className="w-40 h-40 object-cover rounded-xl border border-yellow-200"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column - Actions */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-3">Current Status</h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                {isCancelled
                  ? "This draw has been cancelled. If you have any questions, reach out to our support team."
                  : isCompleted
                  ? "The required entries have been met and the draw is now closed. Stay tuned for the winner announcement!"
                  : isSoldOut
                  ? "Capacity has been reached. We are preparing to announce the winner shortly."
                  : latestWinner
                  ? `Congratulations to our recent winner! Cycle #${latestWinnerCycle} wrapped up successfully. Secure your entries for the new cycle.`
                  : `Only ${entriesRemaining.toLocaleString()} entries needed to reach the draw threshold. Secure your spot before the giveaway fills up.`}
              </p>
            </div>

            {showPackages && hasActiveMembership && (
              <MiniDrawPackages
                miniDrawId={miniDraw._id}
                minimumEntries={miniDraw.minimumEntries}
                totalEntries={miniDraw.totalEntries}
              />
            )}

            {showPackages && !hasActiveMembership && (
              <div className="bg-gray-50 rounded-xl shadow-lg p-6 border-2 border-gray-200">
                <div className="flex items-center gap-3 mb-4">
                  <Lock className="w-6 h-6 text-gray-600" />
                  <h3 className="text-lg font-bold text-gray-900">Membership Required</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  You need an active membership to purchase entries for this mini draw.
                </p>
                <Link
                  href="/membership"
                  className="inline-block bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors w-full text-center"
                >
                  Get Membership
                </Link>
              </div>
            )}

            {!showPackages && !isCompleted && !isCancelled && (
              <div className="bg-white rounded-xl shadow-lg p-6 border border-red-100 text-center">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Entries Closed</h3>
                <p className="text-sm text-gray-600">
                  We’ve reached the maximum number of entries for this giveaway. Keep an eye out for the next mini draw!
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
