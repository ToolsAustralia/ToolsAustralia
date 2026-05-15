"use client";

import { useState } from "react";
import { PROMO_MULTIPLIERS } from "@/types/promo-multiplier";
import {
  useUpsellMultipliersMutation,
  useUpsellMultipliersQuery,
} from "@/hooks/queries/admin/useUpsellMultipliers";
import { UpsellMultiplierPreviewTables } from "./UpsellMultiplierPanel.preview";
import { useEffectiveMultipliers } from "@/hooks/queries/useScheduledPromoQueries";

// ── Active-promo banner ──────────────────────────────────────────────────────

/**
 * Reads from /api/admin/promo/effective so the banner reflects the canonical
 * Scheduled > Toggle > Alternating chain — same source the checkout payment path uses.
 */
function ActivePromoBanner({
  membership,
  oneTime,
  mini,
  isLoading,
}: {
  membership: number | null;
  oneTime: number | null;
  mini: number | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
        Loading active promo data…
      </div>
    );
  }

  const hasAnyActive = membership !== null || oneTime !== null || mini !== null;
  const fmt = (m: number | null) => (m === null ? "—" : `${m}×`);

  return (
    <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <strong>Active promo:</strong>{" "}
      {hasAnyActive ? (
        <span className="ml-1">
          membership&nbsp;{fmt(membership)}
          <span className="mx-2 text-amber-400">·</span>
          one-time&nbsp;{fmt(oneTime)}
          <span className="mx-2 text-amber-400">·</span>
          mini&nbsp;{fmt(mini)}
        </span>
      ) : (
        <span className="ml-1 italic text-amber-700">no active promo</span>
      )}
      <span className="ml-2 text-xs text-amber-600">
        (active promo <strong>stacks</strong> with the upsell category multiplier below — see Entry Preview)
      </span>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<"membership" | "oneTime" | "additional", string> = {
  membership: "Membership",
  oneTime: "One-Time",
  additional: "Additional (Member)",
};

export function UpsellMultiplierPanel() {
  const { data, isLoading, isError } = useUpsellMultipliersQuery();
  const { data: effective, isLoading: isLoadingEffective } = useEffectiveMultipliers();
  const mutation = useUpsellMultipliersMutation();

  const activeMembershipPromo = effective?.["membership-packages"]?.multiplier ?? null;
  const activeOneTimePromo = effective?.["one-time-packages"]?.multiplier ?? null;
  const activeMiniPromo = effective?.["mini-packages"]?.multiplier ?? null;

  const [draft, setDraft] = useState<{
    membership: number;
    oneTime: number;
    additional: number;
  } | null>(null);

  const current =
    draft ??
    (data
      ? { membership: data.membership, oneTime: data.oneTime, additional: data.additional }
      : null);

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-slate-500">Loading upsell multipliers…</div>
    );
  }
  if (isError || !current) {
    return (
      <div className="p-4 text-sm text-red-600">Failed to load upsell multipliers.</div>
    );
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Upsell Multipliers</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
          Sets how many free entries each upsell offers, as a multiplier of the trigger
          pack&apos;s base entries. <strong>Active promo multipliers stack with these values</strong> —
          if a 5× membership promo is live and the Membership upsell multiplier here is 10×, a
          subscriber sees the Apprentice Pack upsell with 5 × 10 × 3 = 150 free entries.
        </p>
      </header>

      <ActivePromoBanner
        membership={activeMembershipPromo}
        oneTime={activeOneTimePromo}
        mini={activeMiniPromo}
        isLoading={isLoadingEffective}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {(["membership", "oneTime", "additional"] as const).map((key) => (
          <label key={key} className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-neutral-300">
              {CATEGORY_LABELS[key]}
            </span>
            <select
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-slate-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
              value={current[key]}
              onChange={(e) =>
                setDraft({ ...current, [key]: Number(e.target.value) })
              }
            >
              {PROMO_MULTIPLIERS.map((m) => (
                <option key={m} value={m}>
                  {m}&times;
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <UpsellMultiplierPreviewTables
        membership={current.membership}
        oneTime={current.oneTime}
        additional={current.additional}
        activeMembershipPromo={activeMembershipPromo}
        activeOneTimePromo={activeOneTimePromo}
        activeMiniPromo={activeMiniPromo}
      />

      <footer className="mt-6 flex items-center justify-end gap-3 border-t border-gray-100 pt-4 dark:border-neutral-700">
        {mutation.isError && (
          <p className="mr-auto text-xs text-red-600">
            Save failed — please try again.
          </p>
        )}
        {draft && (
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-slate-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            onClick={() => setDraft(null)}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          disabled={!draft || mutation.isPending}
          onClick={() =>
            draft &&
            mutation.mutate(draft, {
              onSuccess: () => setDraft(null),
            })
          }
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
      </footer>
    </section>
  );
}
