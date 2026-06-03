"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card, SectionTitle, Segmented } from "@/components/admin/ui";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import { useUpcomingRenewals, type UpcomingRenewalsRange } from "@/hooks/queries/useAdminQueries";

/**
 * Upcoming membership renewals for the admin Overview.
 *
 * Replaces the legacy `RenewalsDashboardSection` "Upcoming schedule" tab.
 * A Today / To 27th toggle (Segmented, size="sm") switches between
 * range=0 (due today) and range=27 (today through the 27th).
 * Each row's name reuses `ClickableUserDisplay` to preserve the
 * click-to-open-user-modal UX (it wraps `useAdminUserModal().openUserModal`).
 */

const RANGE_OPTIONS: { value: UpcomingRenewalsRange; label: string }[] = [
  { value: 0, label: "Today" },
  { value: 27, label: "To 27th" },
];

export default function UpcomingRenewalsCard() {
  const [selectedRange, setSelectedRange] = useState<UpcomingRenewalsRange>(0);
  const { formatCurrency } = useMetricsFormatting();
  const { data } = useUpcomingRenewals(selectedRange, 1, 8);

  const renewals = data?.renewals ?? [];
  const totalRevenue = data?.totalRevenue ?? 0;
  const totalMembers = data?.total ?? 0;
  const rangeLabel = selectedRange === 0 ? "today" : "by the 27th";

  return (
    <Card className="p-5 h-full">
      <SectionTitle
        title="Upcoming renewals"
        subtitle={`${formatCurrency(totalRevenue)} · ${totalMembers.toLocaleString("en-AU")} members · ${rangeLabel}`}
        icon={RefreshCw}
        right={
          <Segmented
            options={RANGE_OPTIONS}
            value={selectedRange}
            onChange={setSelectedRange}
            size="sm"
          />
        }
      />

      {renewals.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-10 text-neutral-400 dark:text-neutral-500">
          <RefreshCw className="w-8 h-8 mb-3 opacity-60" strokeWidth={1.75} />
          <p className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">No upcoming renewals</p>
          <p className="text-2xs mt-1">Nothing due {rangeLabel}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {renewals.map((r) => {
            const displayName = r.customerName?.trim() || r.customerEmail || r.customerId;
            return (
              <div key={r.subscriptionId} className="flex items-center gap-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <ClickableUserDisplay
                    displayText={displayName}
                    userId={r.userId ?? null}
                    className="text-sm font-medium text-neutral-900 dark:text-white truncate block max-w-full"
                  />
                  <p className="text-2xs text-neutral-500 dark:text-neutral-400 num">{r.renewalDateFormatted}</p>
                </div>
                <span className="text-sm text-neutral-900 dark:text-white num font-bold shrink-0">
                  {r.amountFormatted}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
