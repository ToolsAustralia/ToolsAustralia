import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

type QueryDefaults = {
  refetchInterval?: number | false | ((query: unknown) => number | false | undefined);
  refetchIntervalInBackground?: boolean;
};

/**
 * Temporarily disables background refetch intervals for hot dashboard queries so
 * optimistic updates are not overwritten by a stale poll during purchase flows.
 */
export function freezeRefetchIntervals(qc: QueryClient, userId: string, ms = 5000): void {
  const keys = [
    queryKeys.majorDraw.current,
    queryKeys.majorDraw.userStats(userId),
    queryKeys.users.account(userId),
  ] as const;

  const restore = keys.map((key) => {
    const prev = qc.getQueryDefaults(key) as QueryDefaults;
    qc.setQueryDefaults(key, {
      ...prev,
      refetchInterval: false,
      refetchIntervalInBackground: false,
    });
    return () => qc.setQueryDefaults(key, prev);
  });

  setTimeout(() => {
    restore.forEach((fn) => fn());
  }, ms);
}
