"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Trophy,
  FileText,
  Sparkles,
  Crown,
  Shield,
  Clock,
  Users,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { OPEN_MINI_DRAW_PACKS_EVENT } from "@/components/features/MiniDrawPackages";

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
  { id: "winners" as const, label: "Recent winners", icon: Crown },
  { id: "rules" as const, label: "Draw rules", icon: Shield },
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
      desc: "Must be 18+ and an Australian resident",
    },
    {
      // Mini-draw entry is package-only — no membership is required, and the old copy
      // said otherwise. Members get free entries into the MAJOR draws, not these.
      icon: Trophy,
      title: "Entry methods",
      desc: "Buy a mini pack to receive free entries",
    },
    {
      icon: Sparkles,
      title: "Winner selection",
      desc: "Random selection using a secure random number generator",
    },
    {
      icon: Clock,
      title: "Prize claim",
      desc: "Winner has 30 days to claim after notification",
    },
  ];

  const flowSteps = [
    {
      label: "Open",
      text: "Once the draw is live, mini packs can be purchased until capacity is reached.",
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
    <div className="overflow-hidden rounded-[20px] border border-[#EFF0F3] bg-white dark:border-neutral-800 dark:bg-neutral-900">
      {/* Tab Navigation */}
      <div className="border-b border-[#F1F2F5] dark:border-neutral-800">
        <nav className="flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex h-[46px] flex-1 items-center justify-center gap-1.5 text-[12.5px] font-semibold transition-colors sm:h-[62px] sm:gap-2 sm:text-[15px] ${
                  isActive ? "text-red-600 dark:text-red-400" : "text-[#9CA3AF] hover:text-[#6B7280] dark:hover:text-neutral-300"
                }`}
                suppressHydrationWarning
              >
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>{tab.label}</span>
                {isActive && (
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-red-600"
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
      <div className="p-3.5 sm:p-6 lg:p-8">
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
                          "/images/promotion/PrizeHeader/PrizeHeader.webp";
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
                                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-gradient-to-r from-red-600 to-red-675 text-white text-2xs sm:text-xs font-semibold px-2.5 py-1 rounded-full shadow-lg">
                                  <Crown className="w-3 h-3" />
                                  Latest Winner
                                </div>
                              )}

                              {!winner.imageUrl && (
                                <span className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm text-white/90 text-2xs sm:text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1">
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
                  <div className="flex flex-col items-center gap-2 px-5 py-8 text-center sm:py-12">
                    <span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-red-600/[.07] text-red-600 dark:bg-red-950/40 dark:text-red-400">
                      <Trophy className="h-6 w-6" />
                    </span>
                    <h4 className="mt-1 text-[15px] font-extrabold text-[#111827] dark:text-white sm:text-lg">
                      Are you our next lucky winner?
                    </h4>
                    <p className="max-w-[250px] text-[12.5px] leading-[1.5] text-[#6B7280] text-pretty dark:text-neutral-400 sm:max-w-sm sm:text-sm">
                      Secure your entries now and you could be the next name on our winners board.
                    </p>
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new Event(OPEN_MINI_DRAW_PACKS_EVENT))}
                      className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-red-600 transition-colors hover:text-red-675 dark:text-red-400"
                    >
                      Get your entries
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Draw Rules Tab */}
            {activeTab === "rules" && (
              <div className="space-y-6 sm:space-y-8">
                {/* Rules grid */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                  {rules.map((rule, i) => {
                    const RuleIcon = rule.icon;
                    return (
                      <motion.div
                        key={i}
                        className="flex items-start gap-2.5 rounded-[13px] border border-[#F1F2F5] bg-[#FAFAFB] p-[11px] dark:border-neutral-800 dark:bg-neutral-950"
                        initial={prefersReduced ? {} : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08, duration: 0.3 }}
                      >
                        <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[9px] border border-[#EEF0F3] bg-white text-red-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-red-400">
                          <RuleIcon className="h-[15px] w-[15px]" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-bold text-[#111827] dark:text-white">{rule.title}</div>
                          <div className="mt-px text-[12px] leading-[1.45] text-[#6B7280] dark:text-neutral-400">
                            {rule.desc}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Draw Flow */}
                <div className="rounded-2xl border border-[#F1F2F5] bg-[#FAFAFB] p-3.5 sm:p-6 dark:border-neutral-800 dark:bg-neutral-950">
                  <h3 className="mb-3 flex items-center gap-1.5 text-[13px] font-extrabold text-[#111827] dark:text-white sm:text-base">
                    <FileText className="h-[15px] w-[15px] text-red-600 dark:text-red-400" />
                    How the draw works
                  </h3>
                  <div className="space-y-0">
                    {flowSteps.map((step, i) => (
                      <div key={i} className="flex gap-3 sm:gap-4">
                        {/* Timeline */}
                        <div className="flex flex-col items-center">
                          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white border-2 border-red-600/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-2xs sm:text-xs font-bold text-red-600">
                              {i + 1}
                            </span>
                          </div>
                          {i < flowSteps.length - 1 && (
                            <div className="w-px h-full bg-gradient-to-b from-red-600/20 to-transparent min-h-[24px]" />
                          )}
                        </div>
                        <div className="pb-4 sm:pb-5 min-w-0">
                          <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">
                            {step.label}
                          </span>
                          <p className="text-xs sm:text-sm text-gray-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                            {step.text}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {latestWinner && (
                    <div className="mt-2 pt-4 border-t border-gray-200/60 dark:border-neutral-700 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-600 to-red-675 flex items-center justify-center flex-shrink-0">
                        <Crown className="w-4 h-4 text-white" />
                      </div>
                      <div className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400">
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
                  <div className="flex items-center gap-4 sm:gap-5 p-4 sm:p-5 rounded-xl bg-gradient-to-r from-gray-50 to-white dark:from-neutral-800/70 dark:to-neutral-900 border border-gray-100 dark:border-neutral-700">
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden border border-gray-100 dark:border-neutral-700 shadow-sm flex-shrink-0">
                      <Image
                        src={latestWinner.imageUrl}
                        alt="Winner"
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 80px, 96px"
                      />
                    </div>
                    <div>
                      <div className="text-2xs sm:text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">
                        Winner Spotlight
                      </div>
                      <p className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
                        {formatWinnerName(
                          latestWinner.winnerFirstName,
                          latestWinner.winnerLastName
                        )}
                      </p>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-neutral-400 mt-0.5">
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
