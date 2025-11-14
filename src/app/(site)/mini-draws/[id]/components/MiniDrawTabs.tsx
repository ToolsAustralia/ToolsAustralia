"use client";

import { useState } from "react";
import Image from "next/image";
import { Trophy, FileText, CheckCircle, Sparkles, Crown } from "lucide-react";

interface MiniDrawTabsProps {
  miniDraw: {
    _id: string;
    name: string;
    description: string;
    status: "active" | "completed" | "cancelled";
    totalEntries: number;
    minimumEntries: number;
    entriesRemaining?: number;
    cycle?: number;
    latestWinner?: {
      entryNumber: number;
      selectedDate: string;
      imageUrl?: string;
      cycle?: number;
    };
    winnerHistory?: Array<{
      entryNumber: number;
      selectedDate: string;
      imageUrl?: string;
      cycle?: number;
    }>;
    prize: {
      name: string;
      description: string;
      value: number;
      images: string[];
      category: string;
    };
  };
}

export default function MiniDrawTabs({ miniDraw }: MiniDrawTabsProps) {
  const [activeTab, setActiveTab] = useState<"details" | "winners" | "rules">("details");

  const minimumEntries = miniDraw.minimumEntries ?? 0;
  const totalEntries = miniDraw.totalEntries ?? 0;
  const computedRemaining = Math.max(minimumEntries - totalEntries, 0);
  const entriesRemaining = miniDraw.entriesRemaining ?? computedRemaining;
  const capacityPercentage = minimumEntries > 0 ? Math.min(100, Math.round((totalEntries / minimumEntries) * 100)) : 0;
  const cycle = miniDraw.cycle ?? 1;
  const latestWinner = miniDraw.latestWinner;
  const winnerHistory = miniDraw.winnerHistory ?? [];
  const isCompleted = miniDraw.status === "completed";
  const isCancelled = miniDraw.status === "cancelled";
  const isSoldOut = !isCancelled && entriesRemaining <= 0;

  return (
    <div className="mt-8 sm:mt-16 bg-gray-50 w-full">
      <div className="w-full px-2 sm:px-4 lg:px-8">
        <div className="border-b border-gray-200">
          <nav className="flex justify-between w-full">
            <button
              onClick={() => setActiveTab("details")}
              className={`flex-1 py-2 sm:py-4 px-2 sm:px-4 border-b-2 font-medium transition-colors text-center text-xs sm:text-base ${
                activeTab === "details"
                  ? "border-[#ee0000] text-[#ee0000]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Prize Details
            </button>
            <button
              onClick={() => setActiveTab("winners")}
              className={`flex-1 py-2 sm:py-4 px-2 sm:px-4 border-b-2 font-medium transition-colors text-center text-xs sm:text-base ${
                activeTab === "winners"
                  ? "border-[#ee0000] text-[#ee0000]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Recent Winners
            </button>
            <button
              onClick={() => setActiveTab("rules")}
              className={`flex-1 py-2 sm:py-4 px-2 sm:px-4 border-b-2 font-medium transition-colors text-center text-xs sm:text-base ${
                activeTab === "rules"
                  ? "border-[#ee0000] text-[#ee0000]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Draw Rules
            </button>
          </nav>
        </div>
        <div className="py-4 sm:py-8">
          {/* Prize Details Tab */}
          {activeTab === "details" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
              <div>
                <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-2 sm:mb-4 flex items-center gap-1 sm:gap-2">
                  <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-[#ee0000]" />
                  Prize Information
                </h3>
                <dl className="space-y-2 sm:space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-xs sm:text-sm text-gray-600">Prize Name</dt>
                    <dd className="text-xs sm:text-sm font-medium text-gray-900">{miniDraw.prize.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-xs sm:text-sm text-gray-600">Prize Value</dt>
                    <dd className="text-xs sm:text-sm font-medium text-gray-900">
                      ${miniDraw.prize.value.toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-xs sm:text-sm text-gray-600">Entries Sold</dt>
                    <dd className="text-xs sm:text-sm font-medium text-gray-900">
                      {totalEntries.toLocaleString()} / {minimumEntries.toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-xs sm:text-sm text-gray-600">
                      {isSoldOut || isCompleted ? "Capacity Status" : "Entries Remaining"}
                    </dt>
                    <dd className="text-xs sm:text-sm font-medium text-gray-900">
                      {isSoldOut || isCompleted ? "Closed" : entriesRemaining.toLocaleString()}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-[10px] sm:text-xs text-gray-500 mb-1">
                    <span>0%</span>
                    <span>{capacityPercentage}%</span>
                    <span>100%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-red-500 to-red-700 transition-all duration-500"
                      style={{ width: `${capacityPercentage}%` }}
                    />
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500">Currently running cycle #{cycle}</div>
              </div>
              <div>
                <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-2 sm:mb-4">Prize Description</h3>
                <div className="prose prose-sm max-w-none">
                  <p className="text-xs sm:text-sm text-gray-600 leading-relaxed mb-4">{miniDraw.prize.description}</p>
                </div>
              </div>
            </div>
          )}

          {/* Winners Tab */}
          {activeTab === "winners" && (
            <div className="space-y-4 sm:space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm sm:text-lg font-semibold text-gray-900 flex items-center gap-1 sm:gap-2">
                  <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-[#ee0000]" />
                  Recent Winners
                </h3>
                <span className="text-xs sm:text-sm text-gray-500">Cycle #{cycle}</span>
              </div>

              {winnerHistory.length > 0 || latestWinner ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[latestWinner, ...winnerHistory]
                    .filter((winner): winner is NonNullable<typeof winner> => Boolean(winner))
                    .slice(0, 4)
                    .map((winner, index) => {
                      const winnerCycle = winner.cycle ?? Math.max(1, cycle - (index === 0 ? 1 : index));
                      return (
                        <div
                          key={`${winner.entryNumber}-${winner.selectedDate}-${index}`}
                          className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm flex flex-col gap-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-red-500 to-red-600 text-white rounded-full flex items-center justify-center font-semibold">
                                #{winner.entryNumber}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-gray-900">Winning Entry</p>
                                <p className="text-xs text-gray-500">
                                  Selected{" "}
                                  {new Date(winner.selectedDate).toLocaleDateString("en-AU", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}
                                </p>
                              </div>
                            </div>
                            <span className="text-xs font-semibold text-gray-500 uppercase">Cycle {winnerCycle}</span>
                          </div>

                          {winner.imageUrl ? (
                            <div className="relative w-full h-40 sm:h-48 rounded-lg overflow-hidden border border-gray-100">
                              <Image
                                src={winner.imageUrl}
                                alt={`Winner cycle ${winnerCycle}`}
                                fill
                                className="object-cover"
                                sizes="(max-width: 640px) 100vw, 50vw"
                              />
                            </div>
                          ) : (
                            <div className="w-full h-32 sm:h-40 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 text-sm border border-dashed border-gray-300">
                              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-[#ee0000] mr-2" />
                              Winner photo coming soon
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="text-center py-10 sm:py-14 bg-white rounded-xl border border-gray-200 shadow-sm">
                  <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-[#ee0000] mx-auto mb-4" />
                  <h4 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
                    Are You Our Next Lucky Winner?
                  </h4>
                  <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto">
                    Secure your entries now and you could be the next name on our winners board. Every entry gets you
                    closer to the prize.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Draw Rules Tab */}
          {activeTab === "rules" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border">
                  <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-2 sm:mb-4 flex items-center gap-1 sm:gap-2">
                    <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-[#ee0000]" />
                    Mini Draw Rules & Terms
                  </h3>
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex items-start gap-2 sm:gap-3">
                      <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-xs sm:text-sm font-medium text-gray-900">Eligibility</div>
                        <div className="text-xs sm:text-sm text-gray-600">
                          Must be 18+ years old and Australian resident
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 sm:gap-3">
                      <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-xs sm:text-sm font-medium text-gray-900">Entry Methods</div>
                        <div className="text-xs sm:text-sm text-gray-600">
                          Purchase entry packages (membership required)
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 sm:gap-3">
                      <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-xs sm:text-sm font-medium text-gray-900">Winner Selection</div>
                        <div className="text-xs sm:text-sm text-gray-600">
                          Random selection using secure random number generator
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 sm:gap-3">
                      <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-xs sm:text-sm font-medium text-gray-900">Prize Claim</div>
                        <div className="text-xs sm:text-sm text-gray-600">
                          Winner has 30 days to claim prize after notification
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border">
                  <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-2 sm:mb-4">Mini Draw Flow</h3>
                  <div className="space-y-3 sm:space-y-4 text-xs sm:text-sm text-gray-600 leading-relaxed">
                    <p>
                      <span className="font-semibold text-gray-900">Open:</span> Once the draw is live, entries can be
                      purchased until the capacity is reached.
                    </p>
                    <p>
                      <span className="font-semibold text-gray-900">Capacity Reached:</span> As soon as we hit the
                      minimum required entries, we close the draw to lock in the prize.
                    </p>
                    <p>
                      <span className="font-semibold text-gray-900">Winner Selection:</span> Winners are drawn shortly
                      after closing using our verified random selection process.
                    </p>
                    {latestWinner && (
                      <p>
                        <span className="font-semibold text-gray-900">Latest Winner:</span> Entry #
                        {latestWinner.entryNumber} selected on{" "}
                        {new Date(latestWinner.selectedDate).toLocaleDateString()} (Cycle #
                        {latestWinner.cycle ?? cycle - 1}).
                      </p>
                    )}
                  </div>
                </div>
                {latestWinner?.imageUrl && (
                  <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border flex flex-col items-center text-center">
                    <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-3">Winner Spotlight</h3>
                    <div className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-xl overflow-hidden border border-gray-200">
                      <Image
                        src={latestWinner.imageUrl}
                        alt="Winner"
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 128px, 160px"
                      />
                    </div>
                    <p className="text-xs sm:text-sm text-gray-500 mt-3">
                      Captured from the most recent cycle #{latestWinner.cycle ?? cycle - 1}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
