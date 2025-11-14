"use client";

import { UserData } from "@/hooks/queries/useUserQueries";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  RotateCcw,
  Package,
  Gift,
  ShoppingCart,
  Users,
  Zap,
  CreditCard,
  Award,
} from "lucide-react";
import { rewardsEnabled } from "@/config/featureFlags";
import { rewardsDisabledMessage } from "@/config/rewardsSettings";

interface RewardsHistoryProps {
  user: UserData;
}

interface RewardsTransaction {
  id: string;
  type: "earned" | "redeemed";
  description: string;
  points: number;
  date: Date;
  source: string;
  category: "subscription" | "one-time" | "mini-draw" | "upsell" | "shop" | "redemption" | "referral" | "bonus";
  details?: Record<string, unknown>;
}

interface RewardsSummary {
  currentPoints: number;
  totalPointsEarned: number;
  totalPointsRedeemed: number;
  totalTransactions: number;
}

export default function RewardsHistory({ user }: RewardsHistoryProps) {
  const isRewardsFeatureEnabled = rewardsEnabled();
  const pauseMessage = rewardsDisabledMessage();
  const [history, setHistory] = useState<RewardsTransaction[]>([]);
  const [summary, setSummary] = useState<RewardsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(8); // Start with 8 transactions
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchRewardsHistory = useCallback(async () => {
    if (!isRewardsFeatureEnabled) {
      setLoading(false);
      setHistory([]);
      setSummary(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/rewards/history?userId=${user._id}`);
      const data = await response.json();

      if (data.success) {
        // Convert date strings back to Date objects
        const processedHistory = data.data.history.map((item: RewardsTransaction) => ({
          ...item,
          date: new Date(item.date),
        }));

        setHistory(processedHistory);
        setSummary(data.data.summary);
      } else {
        setError(data.error || "Failed to fetch rewards history");
      }
    } catch (err) {
      console.error("Error fetching rewards history:", err);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user._id, isRewardsFeatureEnabled]);

  useEffect(() => {
    fetchRewardsHistory();
  }, [fetchRewardsHistory]);

  // Infinite scrolling effect
  useEffect(() => {
    const handleScroll = () => {
      if (scrollContainerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

        // Load more when 80% scrolled
        if (scrollPercentage > 0.8 && visibleCount < history.length) {
          setVisibleCount((prev) => Math.min(prev + 8, history.length)); // Add 8 more transactions
        }
      }
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [visibleCount, history.length]);

  // Reset visible count when history changes
  useEffect(() => {
    setVisibleCount(8);
  }, [history.length]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "subscription":
        return <RotateCcw className="w-4 h-4" />;
      case "one-time":
        return <Package className="w-4 h-4" />;
      case "mini-draw":
        return <Award className="w-4 h-4" />;
      case "upsell":
        return <TrendingUp className="w-4 h-4" />;
      case "shop":
        return <ShoppingCart className="w-4 h-4" />;
      case "redemption":
        return <Gift className="w-4 h-4" />;
      case "referral":
        return <Users className="w-4 h-4" />;
      case "bonus":
        return <Zap className="w-4 h-4" />;
      default:
        return <CreditCard className="w-4 h-4" />;
    }
  };

  if (!isRewardsFeatureEnabled) {
    return (
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Rewards History</h2>
          <p className="mt-1 text-sm text-gray-600">We&apos;re upgrading the rewards experience.</p>
        </div>
        <div className="p-6">
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-4 bg-yellow-100 rounded-full flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-yellow-600" />
            </div>
            <p className="text-gray-700 font-medium mb-2">Rewards activity is temporarily unavailable.</p>
            <p className="text-gray-500 text-sm leading-relaxed">{pauseMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Rewards History</h2>
          <p className="mt-1 text-sm text-gray-600">Your recent points activity</p>
        </div>
        <div className="p-6 flex items-center justify-center h-64">
          <div className="flex items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-[#ee0000]" />
            <span className="text-gray-600">Loading your rewards history...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Rewards History</h2>
          <p className="mt-1 text-sm text-gray-600">Your recent points activity</p>
        </div>
        <div className="p-6">
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
            <p className="text-red-600 font-medium mb-2">Unable to load rewards history</p>
            <p className="text-gray-600 text-sm mb-4">{error}</p>
            <button
              onClick={fetchRewardsHistory}
              className="px-4 py-2 bg-[#ee0000] text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Rewards History</h2>
            <p className="mt-1 text-sm text-gray-600">Your recent points activity</p>
          </div>
          {summary && (
            <div className="text-right">
              <div className="text-sm text-gray-500">Current Balance</div>
              <div className="text-2xl font-bold text-[#ee0000]">{summary.currentPoints.toLocaleString()}</div>
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm font-medium">Earned</span>
              </div>
              <div className="text-lg font-bold text-gray-900">{summary.totalPointsEarned.toLocaleString()}</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-red-600 mb-1">
                <TrendingDown className="w-4 h-4" />
                <span className="text-sm font-medium">Redeemed</span>
              </div>
              <div className="text-lg font-bold text-gray-900">{summary.totalPointsRedeemed.toLocaleString()}</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-gray-500 mb-1">Transactions</div>
              <div className="text-lg font-bold text-gray-900">{summary.totalTransactions}</div>
            </div>
          </div>
        )}

        {/* Transaction History */}
        <div
          ref={scrollContainerRef}
          className="h-[320px] overflow-y-auto pr-2 custom-scrollbar"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "#ee0000 #f3f4f6",
          }}
        >
          <div className="space-y-4">
            {history.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-gray-400" />
                </div>
                <p className="text-gray-600 font-medium mb-1">No rewards history yet</p>
                <p className="text-gray-500 text-sm">Start making purchases to earn points!</p>
              </div>
            ) : (
              history.slice(0, visibleCount).map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between py-3 px-4 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          transaction.type === "earned" ? "bg-green-200" : "bg-red-100"
                        }`}
                      >
                        {getCategoryIcon(transaction.category)}
                      </div>
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          transaction.type === "earned" ? "bg-green-100" : "bg-red-50"
                        }`}
                      >
                        {transaction.type === "earned" ? (
                          <TrendingUp className="w-3 h-3 text-green-800" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-red-600" />
                        )}
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{transaction.description}</p>
                      <p className="text-xs text-gray-500">{transaction.source}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-semibold ${
                        transaction.type === "earned" ? "text-green-800" : "text-red-600"
                      }`}
                    >
                      {transaction.type === "earned" ? "+" : ""}
                      {transaction.points.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">{formatDate(transaction.date)}</p>
                  </div>
                </div>
              ))
            )}

            {/* Loading indicator */}
            {visibleCount < history.length && (
              <div className="flex justify-center py-4">
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading more transactions...</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
