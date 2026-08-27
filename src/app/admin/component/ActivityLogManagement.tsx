"use client";

import { useState, useRef, useEffect } from "react";
import { Activity, AlertTriangle, Search, Loader2 } from "lucide-react";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";
import { useActivityLogInfinite } from "@/hooks/queries/useAdminQueries";

export default function ActivityLogManagement() {
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const observerTarget = useRef<HTMLDivElement>(null);

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useActivityLogInfinite(
    25,
    typeFilter || undefined,
    searchTerm || undefined
  );

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Flatten all pages into a single array
  const allActivities = data?.pages.flatMap((page) => page.activities) ?? [];
  const totalActivities = data?.pages[0]?.pagination.total ?? 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-emerald-500";
      case "warning":
        return "bg-amber-500";
      case "error":
        return "bg-red-500";
      case "info":
        return "bg-blue-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 p-3 sm:p-4 lg:p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-2.5 sm:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-neutral-500 w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <input
                type="text"
                placeholder="Search activities..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 text-xs sm:text-sm border border-gray-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="sm:w-48">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 sm:px-4 py-2 text-xs sm:text-sm border border-gray-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
            >
              <option value="">All Types</option>
              <option value="user_signup">User Signups</option>
              <option value="membership_purchase">Membership Purchases</option>
              <option value="one_time_purchase">One-Time Purchases</option>
              <option value="upsell_accepted">Upsells Accepted</option>
              <option value="membership_upgrade">Subscription Changes</option>
              <option value="subscription_past_due">Past Due (Failed Renewal)</option>
              <option value="cancellation_offer_accepted">Cancellation Offers Accepted</option>
              <option value="draw_complete">Draw Completions</option>
              <option value="high_value_order">High-Value Orders</option>
              <option value="shop_order">Shop Orders</option>
              <option value="admin_role_update">Staff Updates</option>
              <option value="affiliate_payout">Affiliate Payouts</option>
            </select>
          </div>
        </div>
      </div>

      {/* Activity List */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 overflow-hidden">
        <div className="p-3 sm:p-4 lg:p-5 border-b border-gray-200 dark:border-neutral-700">
          <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">
            Activity Timeline {totalActivities > 0 && `(${totalActivities.toLocaleString()} total)`}
          </h3>
        </div>

        {/* Fixed height scrollable container */}
        <div className="relative max-h-[600px] overflow-y-auto admin-scrollbar p-3 sm:p-4 lg:p-5">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-gray-500 dark:text-neutral-400">
              <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin mr-2" />
              <span className="text-xs sm:text-sm">Loading activities…</span>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <AlertTriangle className="w-8 h-8 sm:w-12 sm:h-12 text-red-500 mx-auto mb-4" />
              <p className="text-sm sm:text-base text-red-700 dark:text-red-300 font-medium">Failed to load activities</p>
              <p className="text-xs sm:text-sm text-red-600 dark:text-red-400 mt-1">
                {error instanceof Error ? error.message : "Unknown error occurred"}
              </p>
            </div>
          )}

          {!isLoading && !error && allActivities.length === 0 && (
            <div className="text-center py-8">
              <Activity className="w-8 h-8 sm:w-12 sm:h-12 text-gray-400 dark:text-neutral-500 mx-auto mb-4" />
              <p className="text-sm sm:text-base text-gray-600 dark:text-neutral-300 font-medium">No activities found</p>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-neutral-400 mt-1">
                Try adjusting your filters or search term
              </p>
            </div>
          )}

          {!isLoading && !error && allActivities.length > 0 && (
            <div className="space-y-3 sm:space-y-4">
              {allActivities.map((activity, index) => (
                <div key={activity.id} className="flex items-start gap-3 relative">
                  {/* Timeline Dot and Line */}
                  <div className="relative flex flex-col items-center">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(activity.status)} flex-shrink-0 mt-1.5`} />
                    {index < allActivities.length - 1 && (
                      <div className="w-px h-full bg-gray-200 dark:bg-neutral-700 absolute top-3" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pb-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white leading-tight">
                      {activity.miniDrawId && activity.action.includes('"') ? (
                        <>
                          {activity.action.split('"')[0]}
                          <a
                            href={`/mini-draws/${activity.miniDrawId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 underline font-semibold"
                          >
                            {activity.action.split('"')[1]}
                          </a>
                          {activity.action.split('"')[2] ?? ""}
                        </>
                      ) : (
                        activity.action
                      )}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <ClickableUserDisplay
                        displayText={activity.user}
                        userId={activity.userId ?? null}
                        className="text-2xs sm:text-xs text-gray-500 dark:text-neutral-400"
                      />
                      <span className="text-2xs sm:text-xs text-gray-400 dark:text-neutral-500">•</span>
                      <span className="text-2xs sm:text-xs text-gray-500 dark:text-neutral-400">{activity.time}</span>
                      {activity.amount && (
                        <>
                          <span className="text-2xs sm:text-xs text-gray-400 dark:text-neutral-500">•</span>
                          <span className="text-2xs sm:text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            ${activity.amount.toLocaleString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Intersection observer target for infinite scroll */}
              <div ref={observerTarget} className="h-4" />

              {/* Loading more indicator */}
              {isFetchingNextPage && (
                <div className="flex items-center justify-center py-4 text-gray-500 dark:text-neutral-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span className="text-xs sm:text-sm">Loading more activities…</span>
                </div>
              )}

              {/* End of list indicator */}
              {!hasNextPage && allActivities.length > 25 && (
                <div className="text-center py-4 text-xs text-gray-400 dark:text-neutral-500 border-t border-gray-100 dark:border-neutral-700 mt-2">
                  End of activity log
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
