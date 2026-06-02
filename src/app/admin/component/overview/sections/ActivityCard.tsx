"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { Card, SectionTitle, StatusDot } from "@/components/admin/ui";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";
import { useActivityLogInfinite } from "@/hooks/queries/useAdminQueries";

/**
 * Recent activity timeline for the admin Overview.
 *
 * Ports the legacy `RecentActivityFeed`: same `useActivityLogInfinite(15)`
 * source (90-day window, not the capped preview API), IntersectionObserver
 * infinite scroll, mini-draw link-ification of the action, clickable user
 * (via `ClickableUserDisplay` → `useAdminUserModal().openUserModal`), and the
 * "View all" link to `/admin/activity-log`.
 *
 * Restyled to the redesign timeline: each row uses the emitted `status` field
 * for the `StatusDot` color (never branches on `type`) plus a connector line.
 */
export default function ActivityCard() {
  const router = useRouter();
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useActivityLogInfinite(15);

  const observerTarget = useRef<HTMLDivElement>(null);

  // Infinite scroll observer — identical behavior to the legacy feed.
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

  const allActivities = data?.pages.flatMap((page) => page.activities) ?? [];

  return (
    <Card className="p-5 h-full">
      <SectionTitle
        title="Recent activity"
        subtitle="Live event stream"
        icon={Activity}
        right={
          <button
            type="button"
            onClick={() => router.push("/admin/activity-log")}
            className="inline-flex items-center gap-1 text-2xs font-semibold text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition"
          >
            View all
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        }
      />

      <div className="max-h-[360px] overflow-y-auto admin-scrollbar pr-1">
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-neutral-500 dark:text-neutral-400">
            <RefreshCw className="w-6 h-6 animate-spin mr-2 shrink-0" />
            <span className="text-sm">Loading activities…</span>
          </div>
        )}

        {error && (
          <div className="text-center py-8">
            <AlertTriangle className="w-6 h-6 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-red-600 dark:text-red-400">Failed to load recent activities</p>
          </div>
        )}

        {!isLoading && !error && allActivities.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-10 text-neutral-400 dark:text-neutral-500">
            <Activity className="w-8 h-8 mb-3 opacity-60" strokeWidth={1.75} />
            <p className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">No recent activity</p>
          </div>
        )}

        {!isLoading && !error && allActivities.length > 0 && (
          <div className="space-y-0">
            {allActivities.map((activity, index) => {
              const isLast = index === allActivities.length - 1;
              return (
                <div key={activity.id} className="flex items-start gap-3 relative pb-4">
                  {/* Timeline marker + connector */}
                  <div className="relative flex flex-col items-center pt-1">
                    <StatusDot status={activity.status} />
                    {!isLast && (
                      <span className="absolute top-3.5 w-px h-full bg-neutral-200 dark:bg-neutral-800" />
                    )}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0 -mt-0.5">
                    <p className="text-sm text-neutral-900 dark:text-neutral-100 leading-snug">
                      {activity.miniDrawId && activity.action.includes('"') ? (
                        <>
                          {activity.action.split('"')[0]}
                          <a
                            href={`/mini-draws/${activity.miniDrawId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 underline font-semibold"
                          >
                            {activity.action.split('"')[1]}
                          </a>
                          {activity.action.split('"')[2] ?? ""}
                        </>
                      ) : (
                        activity.action
                      )}
                    </p>
                    <div className="text-2xs text-neutral-500 dark:text-neutral-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <ClickableUserDisplay
                        displayText={activity.user}
                        userId={activity.userId ?? null}
                        className="text-2xs font-medium text-neutral-600 dark:text-neutral-300"
                      />
                      <span className="text-neutral-300 dark:text-neutral-600">·</span>
                      <span>{activity.time}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* IntersectionObserver sentinel for infinite scroll */}
            <div ref={observerTarget} className="h-4" />

            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-3 text-neutral-500 dark:text-neutral-400">
                <Loader2 className="w-4 h-4 animate-spin mr-2 shrink-0" />
                <span className="text-sm">Loading more activities…</span>
              </div>
            )}

            {!hasNextPage && allActivities.length > 15 && (
              <div className="text-center py-3 text-2xs text-neutral-400 dark:text-neutral-500 border-t border-neutral-100 dark:border-neutral-800 mt-2">
                No more activities to load
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
