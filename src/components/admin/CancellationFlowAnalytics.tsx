"use client";

import {
  CANCELLATION_REASONS,
  OFFER_TYPES,
  type CancellationReason,
  type OfferType,
} from "@/models/CancellationFlowEvent";
import { useCancellationFlowAnalytics } from "@/hooks/queries/admin/useCancellationFlowAnalytics";

const REASON_LABELS: Record<CancellationReason, string> = {
  too_expensive: "Too expensive",
  prefer_cheaper: "Prefer a cheaper plan",
  dont_use_benefits: "Don’t use the benefits",
  too_many_messages: "Too many messages",
  joined_for_giveaway: "Joined for a giveaway",
  havent_won: "Haven’t won",
  other: "Other",
};

const OFFER_LABELS: Record<OfferType, string> = {
  pause_30d: "Pause 30 days",
  discount_50_2mo: "50% off for 2 months",
  tier_downgrade: "Tier downgrade",
  unsubscribe_marketing: "Unsubscribe marketing",
  bonus_entries_100: "100 bonus entries",
};

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      {sub ? (
        <div className="mt-1 text-xs text-slate-500 dark:text-neutral-400">{sub}</div>
      ) : null}
    </div>
  );
}

export default function CancellationFlowAnalytics() {
  const { data, isLoading, isError } = useCancellationFlowAnalytics();

  if (isLoading) {
    return <div className="p-4 text-sm text-slate-500">Loading cancellation-flow analytics…</div>;
  }
  if (isError || !data) {
    return (
      <div className="p-4 text-sm text-red-600">Failed to load cancellation-flow analytics.</div>
    );
  }

  const { triggered, byReason, funnel, saveRatePct, byOfferAccepted, retention90 } = data;
  const funnelSteps: Array<{ label: string; value: number }> = [
    { label: "Reached reason", value: funnel.reachedReason },
    { label: "Reached offer (not past-due)", value: funnel.reachedOffer },
    { label: "Accepted (saved)", value: funnel.accepted },
    { label: "Cancelled", value: funnel.cancelled },
    { label: "Abandoned (in-progress >1h)", value: funnel.abandoned },
  ];
  const funnelMax = Math.max(1, ...funnelSteps.map((s) => s.value));

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Cancellation Flow Analytics
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
          Read-only. Defaults to the last 90 days. Offer-conversion denominators exclude past-due
          events ({data.pastDueExcludedFromOfferConversion} excluded in this window).
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Triggered" value={String(triggered)} />
        <StatCard
          label="Overall save rate"
          value={`${saveRatePct}%`}
          sub="accepted ÷ (accepted + cancelled + abandoned)"
        />
        <StatCard
          label="Saved (accepted)"
          value={String(funnel.accepted)}
          sub={`${funnel.cancelled} cancelled · ${funnel.abandoned} abandoned`}
        />
      </div>

      {/* Reason breakdown */}
      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
          Reason breakdown
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-slate-500 dark:border-neutral-700 dark:text-neutral-400">
              <th className="py-2 font-medium">Reason</th>
              <th className="py-2 text-right font-medium">Count</th>
              <th className="py-2 text-right font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            {CANCELLATION_REASONS.map((reason) => (
              <tr
                key={reason}
                className="border-b border-gray-100 last:border-0 dark:border-neutral-800"
              >
                <td className="py-2 text-gray-900 dark:text-neutral-100">
                  {REASON_LABELS[reason]}
                </td>
                <td className="py-2 text-right text-gray-900 dark:text-neutral-100">
                  {byReason[reason].count}
                </td>
                <td className="py-2 text-right text-slate-600 dark:text-neutral-400">
                  {byReason[reason].sharePct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Funnel */}
      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Funnel</h3>
        <div className="space-y-2">
          {funnelSteps.map((step) => (
            <div key={step.label} className="flex items-center gap-3">
              <div className="w-56 shrink-0 text-sm text-slate-600 dark:text-neutral-400">
                {step.label}
              </div>
              <div className="h-5 flex-1 rounded bg-gray-100 dark:bg-neutral-800">
                <div
                  className="h-5 rounded bg-blue-500/70 dark:bg-blue-600/70"
                  style={{ width: `${Math.round((step.value / funnelMax) * 100)}%` }}
                />
              </div>
              <div className="w-12 shrink-0 text-right text-sm font-medium text-gray-900 dark:text-neutral-100">
                {step.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Offers accepted */}
      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
          Offers accepted (saved events)
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-slate-500 dark:border-neutral-700 dark:text-neutral-400">
              <th className="py-2 font-medium">Offer</th>
              <th className="py-2 text-right font-medium">Saved</th>
            </tr>
          </thead>
          <tbody>
            {OFFER_TYPES.map((offer) => (
              <tr
                key={offer}
                className="border-b border-gray-100 last:border-0 dark:border-neutral-800"
              >
                <td className="py-2 text-gray-900 dark:text-neutral-100">{OFFER_LABELS[offer]}</td>
                <td className="py-2 text-right text-gray-900 dark:text-neutral-100">
                  {byOfferAccepted[offer]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Retention 90 */}
      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
          90-day retention (saved events)
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Retained" value={String(retention90.retained)} />
          <StatCard label="Churned" value={String(retention90.churned)} />
          <StatCard label="Pending" value={String(retention90.pending)} />
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-neutral-400">
          Retained/churned are only meaningful once saves mature (90 days after save). Until then
          saved events are counted as <strong>pending</strong>.
        </p>
      </div>
    </section>
  );
}
