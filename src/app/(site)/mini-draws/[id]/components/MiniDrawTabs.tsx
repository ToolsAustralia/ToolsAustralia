"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Trophy,
  FileText,
  CheckCircle,
  Sparkles,
  Crown,
  Shield,
  Clock,
  Users,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { formatWinnerName } from "@/utils/winner-name-formatter";

interface WinnerDisplay {
  _id?: string;
  winnerFirstName: string;
  winnerLastName: string;
  selectedDate: string;
  imageUrl?: string;
}

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
    brandId?: string;
    latestWinner?: WinnerDisplay;
    winnerHistory?: WinnerDisplay[];
    prize: {
      name: string;
      description: string;
      value: number;
      images: string[];
      category: string;
    };
  };
}

const tabs = [
  { id: "winners" as const, label: "Recent Winners", icon: Crown },
  { id: "rules" as const, label: "Draw Rules", icon: Shield },
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function MiniDrawTabs({ miniDraw }: MiniDrawTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("winners");
  const prefersReduced = useReducedMotion();

  const latestWinner = miniDraw.latestWinner;
  const winnerHistory = miniDraw.winnerHistory ?? [];

  const contentVariants = {
    enter: prefersReduced ? {} : { opacity: 0, y: 12 },
    center: { opacity: 1, y: 0 },
    exit: prefersReduced ? {} : { opacity: 0, y: -12 },
  };

  const rules = [
    {
      icon: Users,
      title: "Eligibility",
      desc: "Must be 18+ years old and an Australian resident",
    },
    {
      icon: Trophy,
      title: "Entry Methods",
      desc: "Purchase entry packages (membership required)",
    },
    {
      icon: Sparkles,
      title: "Winner Selection",
      desc: "Random selection using a secure random number generator",
    },
    {
      icon: Clock,
      title: "Prize Claim",
      desc: "Winner has 30 days to claim prize after notification",
    },
  ];

  const flowSteps = [
    {
      label: "Open",
      text: "Once the draw is live, entries can be purchased until capacity is reached.",
    },
    {
      label: "Capacity Reached",
      text: "As soon as we hit the minimum required entries, the draw closes to lock in the prize.",
    },
    {
      label: "Winner Selection",
      text: "Winners are drawn shortly after closing using our verified random selection process.",
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Tab Navigation */}
      <div className="border-b border-gray-100">
        <nav className="flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-1 py-3.5 sm:py-4 flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium transition-colors ${
                  isActive
                    ? "text-[#ee0000]"
                    : "text-gray-500 hover:text-gray-700"
                }`}
                suppressHydrationWarning
              >
                <Icon
                  className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors ${
                    isActive ? "text-[#ee0000]" : "text-gray-400"
                  }`}
                />
                <span>{tab.label}</span>
                {isActive && (
                  <motion.div
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-gradient-to-r from-[#ee0000] to-[#cc0000]"
                    layoutId="tab-indicator"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-4 sm:p-6 lg:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            variants={contentVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: prefersReduced ? 0 : 0.2 }}
          >
            {/* Winners Tab */}
            {activeTab === "winners" && (
              <div className="space-y-5 sm:space-y-6">
                {winnerHistory.length > 0 || latestWinner ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[latestWinner, ...winnerHistory]
                      .filter(
                        (winner): winner is NonNullable<typeof winner> =>
                          Boolean(winner)
                      )
                      .slice(0, 4)
                      .map((winner, index) => {
                        const winnerDisplayName = formatWinnerName(
                          winner.winnerFirstName,
                          winner.winnerLastName
                        );
                        const selectedDateText = new Date(
                          winner.selectedDate
                        ).toLocaleDateString("en-AU", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        });
                        const displayImage =
                          winner.imageUrl ||
                          miniDraw.prize.images?.[0] ||
                          "/images/placeholders/prize-placeholder.png";
                        const isLatest = index === 0;

                        return (
                          <motion.div
                            key={`${winner._id ?? winner.selectedDate}-${index}`}
                            className="relative rounded-xl overflow-hidden border border-gray-100 shadow-sm group"
                            initial={
                              prefersReduced
                                ? {}
                                : { opacity: 0, scale: 0.97 }
                            }
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.1, duration: 0.4 }}
                          >
                            <div className="relative aspect-[4/5]">
                              <Image
                                src={displayImage}
                                alt={`Winner ${winnerDisplayName}`}
                                fill
                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                                sizes="(max-width: 640px) 100vw, 50vw"
                                priority={index === 0}
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

                              {/* Latest winner badge */}
                              {isLatest && (
                                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-gradient-to-r from-[#ee0000] to-[#cc0000] text-white text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-full shadow-lg">
                                  <Crown className="w-3 h-3" />
                                  Latest Winner
                                </div>
                              )}

                              {!winner.imageUrl && (
                                <span className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm text-white/90 text-[10px] sm:text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1">
                                  <Sparkles className="w-3 h-3" />
                                  Photo coming soon
                                </span>
                              )}

                              <div className="absolute bottom-0 left-0 right-0 p-4">
                                <p className="text-base sm:text-lg font-bold text-white drop-shadow-md">
                                  {winnerDisplayName}
                                </p>
                                <p className="text-xs sm:text-sm text-white/80 mt-0.5">
                                  Selected {selectedDateText}
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="text-center py-12 sm:py-16">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-[#ee0000]/10 to-[#cc0000]/5 flex items-center justify-center">
                      <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-[#ee0000]" />
                    </div>
                    <h4 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
                      Are You Our Next Lucky Winner?
                    </h4>
                    <p className="text-sm sm:text-base text-gray-500 max-w-sm mx-auto leading-relaxed">
                      Secure your entries now and you could be the next name on
                      our winners board.
                    </p>
                    <div className="mt-6 inline-flex items-center gap-1.5 text-[#ee0000] text-sm font-semibold">
                      <span>Get your entries</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Draw Rules Tab */}
            {activeTab === "rules" && (
              <div className="space-y-6 sm:space-y-8">
                {/* Rules grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {rules.map((rule, i) => {
                    const RuleIcon = rule.icon;
                    return (
                      <motion.div
                        key={i}
                        className="flex items-start gap-3 p-3 sm:p-4 rounded-xl bg-gray-50/80 border border-gray-100 hover:border-gray-200 transition-colors"
                        initial={prefersReduced ? {} : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08, duration: 0.3 }}
                      >
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-white border border-gray-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                          <RuleIcon className="w-4 h-4 text-[#ee0000]" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-gray-900">
                            {rule.title}
                          </div>
                          <div className="text-xs sm:text-sm text-gray-500 mt-0.5 leading-relaxed">
                            {rule.desc}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Draw Flow */}
                <div className="bg-gradient-to-br from-gray-50 to-gray-50/50 rounded-xl p-4 sm:p-6 border border-gray-100">
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#ee0000]" />
                    How the Draw Works
                  </h3>
                  <div className="space-y-0">
                    {flowSteps.map((step, i) => (
                      <div key={i} className="flex gap-3 sm:gap-4">
                        {/* Timeline */}
                        <div className="flex flex-col items-center">
                          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white border-2 border-[#ee0000]/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] sm:text-xs font-bold text-[#ee0000]">
                              {i + 1}
                            </span>
                          </div>
                          {i < flowSteps.length - 1 && (
                            <div className="w-px h-full bg-gradient-to-b from-[#ee0000]/20 to-transparent min-h-[24px]" />
                          )}
                        </div>
                        <div className="pb-4 sm:pb-5 min-w-0">
                          <span className="text-xs sm:text-sm font-semibold text-gray-900">
                            {step.label}
                          </span>
                          <p className="text-xs sm:text-sm text-gray-500 mt-0.5 leading-relaxed">
                            {step.text}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {latestWinner && (
                    <div className="mt-2 pt-4 border-t border-gray-200/60 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#ee0000] to-[#cc0000] flex items-center justify-center flex-shrink-0">
                        <Crown className="w-4 h-4 text-white" />
                      </div>
                      <div className="text-xs sm:text-sm text-gray-600">
                        <span className="font-semibold text-gray-900">
                          Latest Winner:
                        </span>{" "}
                        {formatWinnerName(
                          latestWinner.winnerFirstName,
                          latestWinner.winnerLastName
                        )}{" "}
                        — selected{" "}
                        {new Date(latestWinner.selectedDate).toLocaleDateString(
                          "en-AU",
                          { month: "short", day: "numeric", year: "numeric" }
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Winner Spotlight */}
                {latestWinner?.imageUrl && (
                  <div className="flex items-center gap-4 sm:gap-5 p-4 sm:p-5 rounded-xl bg-gradient-to-r from-gray-50 to-white border border-gray-100">
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden border border-gray-100 shadow-sm flex-shrink-0">
                      <Image
                        src={latestWinner.imageUrl}
                        alt="Winner"
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 80px, 96px"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] sm:text-xs font-semibold text-[#ee0000] uppercase tracking-wider mb-1">
                        Winner Spotlight
                      </div>
                      <p className="text-sm sm:text-base font-bold text-gray-900">
                        {formatWinnerName(
                          latestWinner.winnerFirstName,
                          latestWinner.winnerLastName
                        )}
                      </p>
                      <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                        Won {miniDraw.prize.name}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
