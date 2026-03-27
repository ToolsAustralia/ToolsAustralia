"use client";

import React, { useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardSection from "./DashboardSection";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";
import { useActivityLogInfinite } from "@/hooks/queries/useAdminQueries";
import { AlertTriangle, Activity, RefreshCw, Loader2 } from "lucide-react";

export default function RecentActivityFeed() {
  const router = useRouter();
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useActivityLogInfinite(15);

  const observerTarget = useRef<HTMLDivElement>(null);

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

  // Same source as Activity Log page (90-day window) — not the capped dashboard preview API
  const allActivities = data?.pages.flatMap((page) => page.activities) ?? [];

  return (
    <DashboardSection
      title="Recent Activity"
      
      action={{
        label: "View All →",
        onClick: () => router.push("/admin/activity-log"),
      }}
      noPadding={false}
    >
      {/* Fixed height scrollable container */}
      <div className="relative max-h-[500px] overflow-y-auto admin-scrollbar pr-2">
        {isLoading && (
          <div className="flex items-center justify-center py-6 sm:py-8 text-gray-500">
            <RefreshCw className="w-6 h-6 sm:w-8 sm:h-8 animate-spin mr-2 shrink-0" />
            <span className="text-xs sm:text-sm">Loading activities…</span>
          </div>
        )}

        {error && (
          <div className="text-center py-6 sm:py-8">
            <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 text-red-500 mx-auto mb-2" />
            <p className="text-xs sm:text-sm text-red-600">Failed to load recent activities</p>
          </div>
        )}

        {!isLoading && !error && allActivities.length === 0 && (
          <div className="text-center py-6 sm:py-8">
            <Activity className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-xs sm:text-sm text-gray-500">No recent activity</p>
          </div>
        )}

        {!isLoading && !error && allActivities.length > 0 && (
          <div className="space-y-3 sm:space-y-4">
            {allActivities.map((activity, index) => (
              <div key={activity.id} className="flex items-start gap-2.5 sm:gap-3 relative">
                {/* Timeline Dot and Line */}
                <div className="relative flex flex-col items-center">
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(activity.status)} flex-shrink-0 mt-1.5`} />
                  {index < allActivities.length - 1 && <div className="w-px h-full bg-gray-200 absolute top-3" />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pb-1">
                  <p className="text-xs sm:text-sm font-medium text-gray-900 leading-snug">
                    {activity.miniDrawId && activity.action.includes('"') ? (
                      <>
                        {activity.action.split('"')[0]}
                        <a
                          href={`/mini-draws/${activity.miniDrawId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-red-600 hover:text-red-700 underline font-semibold"
                        >
                          {activity.action.split('"')[1]}
                        </a>
                        {activity.action.split('"')[2] ?? ""}
                      </>
                    ) : (
                      activity.action
                    )}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 sm:mt-1 flex-wrap">
                    <ClickableUserDisplay
                      displayText={activity.user}
                      userId={activity.userId ?? null}
                      className="text-[10px] sm:text-xs text-gray-500"
                    />
                    <span className="text-[10px] sm:text-xs text-gray-400">•</span>
                    <span className="text-[10px] sm:text-xs text-gray-500">{activity.time}</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Intersection observer target for infinite scroll */}
            <div ref={observerTarget} className="h-4" />

            {/* Loading more indicator */}
            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-3 sm:py-4 text-gray-500">
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin mr-2 shrink-0" />
                <span className="text-xs sm:text-sm">Loading more activities…</span>
              </div>
            )}

            {/* End of list indicator */}
            {!hasNextPage && allActivities.length > 15 && (
              <div className="text-center py-3 sm:py-4 text-[10px] sm:text-xs text-gray-400 border-t border-gray-100 mt-2">
                No more activities to load
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardSection>
  );
}
